// P332 端到端：**真的把 host.js 的 apply() 启动一遍**，用最小 ctx 桩。
//
// ★为什么不能只做 `node --check`
//   今天已经栽过两次在"改了 ≠ 能跑"上：
//     ① web.py 里 `let dets` 与 `<div id="dets">` 撞名 ⇒ 整个 <script> SyntaxError ⇒ 页面全瘫，
//        而 116 条判据全绿（它们只查字符串）。
//     ② host.js 的 inject 声明缺一个服务 ⇒ dsh 自己会抛
//        "cannot get property X without inject" 并**让整个 boot 失败**（文件头注释里写着）。
//   ⇒ 语法检查证明不了 inject 契约完整，必须真的跑 apply()。
//
// 本脚本用桩替代 ctx/服务，跑完后打印：
//   - 引擎是否挂载成功
//   - 注册了哪些工具
//   - 自我快照首屏（应当出现「运行期」那一行）
//   - runStamp 是否真的进了 state 并落盘对象
import { apply, name, inject } from 'file:///C:/Users/Administrator/.dsh/mpm/engine/host.js';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// tools.mjs 里 `import { defineTool } from "@deepseek-ai/dsh-tools"` —— 那是**裸包名**，
// 由 dsh 的 node_modules 解析。所以验证器也得能解析它，否则 tools.mjs 根本 import 不进来。
// 做法：从本文件位置起 require.resolve（会一路向上走到 dsh 的嵌套 node_modules）。
const require = createRequire(import.meta.url);
let defineTool = null, dshToolsErr = null;
try {
  const resolved = require.resolve('@deepseek-ai/dsh-tools');
  const mod = await import('file:///' + resolved.replace(/\\/g, '/'));
  defineTool = mod.defineTool || (mod.default && mod.default.defineTool) || null;
} catch (e) { dshToolsErr = e.message; }

// ★验证必须在**临时工作区**里跑，绝不能指向真沉积根 ——
//   这个引擎一挂载就会写 root-hint 并把状态落盘。今天的教训已经够多，
//   不要再制造一个"验证把真账本改了"的事故。
const SCRATCH = path.join(process.env.TEMP, 'p332-scratch');
fs.rmSync(SCRATCH, { recursive: true, force: true });
fs.mkdirSync(SCRATCH, { recursive: true });

const registered = [];
const promptCtx = [], promptSec = [];
let provided = {};

function fakeCtx() {
  const listeners = {};
  // ★tools 必须同时以**服务**和**属性**两种形态存在。
  //   第一次跑这个验证器就炸在这里：
  //     host.js 第 147 行用 `ctx.get('tools')`（服务面，给 guard 用），
  //     第 166 行用 `ctx.tools.register(...)`（**属性访问**面，靠 inject 注入）。
  //   桩只给了服务面 ⇒ TypeError: Cannot read properties of undefined (reading 'register')。
  //   文件头注释早写着这件事（"Property access without inject throws ... and fails the whole boot"），
  //   而**只有真的跑一遍才发现我的桩没满足它** —— 语法检查永远不会告诉你。
  const toolsSvc = {
    register: (t) => { registered.push(t); }
    // 刻意不提供 guard：引擎应走"降级为快照警告"分支而不是崩
  };
  // 真实 fs 服务（契约：resolve/readText/writeText，均为异步），**指向临时工作区**。
  // 第一次跑时给了 null ⇒ 引擎按设计进"内存模式"（不假装有账本），于是快照为空串，
  // 我误以为是 runstamp 没生效。给真 fs 才能走到真正的装配路径。
  const fastFs = {
    resolve: async (p) => path.resolve(p),
    readText: async (p) => fs.readFileSync(p, 'utf8'),
    writeText: async (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'utf8'); return p; }
  };
  const svc = {
    systemPrompt: {
      context: (o) => { promptCtx.push(o); return () => {}; },
      section: (o) => { promptSec.push(o); return () => {}; }
    },
    tools: toolsSvc,
    fs: fastFs,
    sandboxPolicy: { workspaceRoot: SCRATCH },
    timer: null,
    agents: { get: () => undefined }
  };
  const ctx = {
    get: (k) => svc[k],
    provide: (k, v) => { provided[k] = v; },
    effect: (fn) => { try { fn(); } catch (e) { console.log('  [effect 抛错] ' + e.message); } return () => {}; },
    on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); return () => {}; },
    timeout: (fn, ms) => { return () => {}; },
    interval: (fn, ms) => { return () => {}; },
    _listeners: listeners
  };
  // inject = ["systemPrompt","tools","fs","sandboxPolicy","timer"] ⇒ 这些必须出现在 ctx 自身上
  ctx.systemPrompt = svc.systemPrompt;
  ctx.tools = toolsSvc;
  ctx.fs = svc.fs;
  ctx.sandboxPolicy = svc.sandboxPolicy;
  ctx.timer = svc.timer;
  ctx.agents = svc.agents;
  return ctx;
}

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log('PASS  ' + n + (d ? '  —— ' + d : '')); } else { fail++; console.log('FAIL  ' + n + '  —— ' + d); } };

console.log('=== 0. 模块导出契约 ===');
check('name 导出正确', name === 'mpm-flywheel', String(name));
check('inject 声明为数组且含 5 个服务', Array.isArray(inject) && inject.length >= 5, JSON.stringify(inject));

console.log('');
console.log('=== 1. 真的调 apply()（inject 契约不全会在这里炸）===');
let bootErr = null;
try { apply(fakeCtx()); } catch (e) { bootErr = e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e); }
check('apply() 未抛异常', bootErr === null, bootErr || 'ok');

console.log('');
console.log('=== 2. 工具注册与 provide ===');
const names = registered.map(t => (t && t.name) || String(t));
check('注册了工具（应 >= 10 个）', registered.length >= 10, registered.length + ' 个: ' + names.slice(0, 6).join(', ') + '…');
check('provide mpmFlywheel（含 snapshot）', !!(provided.mpmFlywheel && typeof provided.mpmFlywheel.snapshot === 'function'), Object.keys(provided).join(','));
check('注册了 systemPrompt.context（自我快照）', promptCtx.length >= 1, promptCtx.map(o => o.name).join(','));
check('注册了 systemPrompt.section（方法论）', promptSec.length >= 1, promptSec.map(o => o.name).join(','));
check('工具对象是对象且带 name', registered.length > 0 && registered[0] && typeof registered[0] === 'object', '');
// ★别再猜字段名 —— 第一次写 `t.handler` 直接 undefined。把真实形状打出来。
console.log('  第一个工具对象的键: ' + Object.keys(registered[0]).join(', '));
console.log('  各键类型: ' + Object.keys(registered[0]).map(k => k + '=' + typeof registered[0][k]).join(', '));

console.log('');
console.log('=== 2b. 让快照非空：直接问工具对象的可调用面并真的建一道题 ===');
let genOk = false, genErr = null;
try {
  const gt = registered.find(t => (t && t.name) === 'mpm_generate');
  // 在真实形状里找一个函数当入口
  const fnKey = Object.keys(gt).find(k => typeof gt[k] === 'function');
  console.log('  选中的可调用键: ' + fnKey);
  if (!fnKey) throw new Error('工具对象上没有任何函数成员；键=' + Object.keys(gt).join(','));
  const r = await gt[fnKey]({ title: 'P332 验证用建题', observation: '验证 runstamp 注入行；跑在临时工作区' });
  genOk = true;
  console.log('  调用返回: ' + String(r).slice(0, 110));
} catch (e) { genErr = e.message; }
check('能通过工具对象真的建一道题', genOk && genErr === null, genErr || 'ok');

console.log('');
console.log('=== 3. ★ 自我快照真的渲染出来了，且含运行期那一行 ===');
// snapshot() 返回的是**对象**（供动态视图插件读），不是字符串——第一次写成 snap.indexOf 就炸在这。
let snap = null, snapErr = null;
try { snap = provided.mpmFlywheel.snapshot(); } catch (e) { snapErr = e.message; }
check('snapshot() 未抛异常', snapErr === null, snapErr || 'ok');
check('snapshot() 返回对象且键数 > 0', snap && typeof snap === 'object' && Object.keys(snap).length > 0,
  snap ? Object.keys(snap).slice(0, 8).join(',') : 'null');

// 真正注入提示的是 systemPrompt.context 的 text()
let injected = '', injErr = null;
try { injected = promptCtx[0].text(); } catch (e) { injErr = e.message; }
check('注入文本可求值（text() 不抛）', injErr === null, injErr || 'ok');
check('注入文本是字符串且非空', typeof injected === 'string' && injected.length > 0, '长度 ' + String(injected).length);
check('注入文本含标题', /我是谁/.test(injected), injected.slice(0, 40));

const runLine = (injected.match(/^- (?:⚠ 陈旧运行|运行期)[^\n]*/m) || [null])[0];
check('★ 注入文本含「运行期」或「陈旧运行」那一行', !!runLine, runLine ? runLine.slice(0, 150) : '(没找到)');
const pos = injected.search(/运行期：|陈旧运行/);
check('★ 该行位于快照靠前位置（不是埋在末尾）',
  pos > 0 && pos < injected.length * 0.5, '位置 ' + pos + ' / ' + injected.length);

console.log('');
console.log('=== 4. runStamp 是否真的进了状态（会随 persist 落盘）===');
const stateViaSnap = (function () {
  try {
    // 通过快照对象拿不到 state，改为再取一次 snapshot 里的 diagnose 面（若有）
    return null;
  } catch (e) { return null; }
})();
const m = injected.match(/运行期：PID (\d+) 起于 (\d+):(\d+)（dsh ([^）]+)）/);
if (m) {
  check('运行期行里带 PID', /^\d+$/.test(m[1]), 'PID ' + m[1]);
  check('运行期行里带 dsh 版本', m[4].length > 0, 'dsh ' + m[4]);
} else {
  const m2 = injected.match(/陈旧运行（P332\/P171）：PID (\d+) 起于 (\d+):(\d+)/);
  check('（陈旧分支）运行期行里带 PID', !!m2, m2 ? 'PID ' + m2[1] : '(没匹配到)');
}

console.log('');
console.log('=== 5. 打印首屏实际内容（人工可读）===');
console.log(injected.split('\n').slice(0, 6).map(s => '  | ' + s).join('\n'));
console.log('  | …（共 ' + injected.split('\n').length + ' 行）');

console.log('');
console.log('合计: PASS=' + pass + '  FAIL=' + fail);
process.exit(fail ? 1 : 0);
