// P327 验收器①：MPM 订阅的宿主事件名必须全部存在于运行中的 dsh 0.1.7-rc.2 事件目录里。
//
// 为什么需要它：cordis@4.0.4 的 `on()` 实现是 `const hooks = this._hooks[name] ||= []`——
// **不校验事件名**。所以订阅一个宿主已经删掉/改名的事件，既不会抛也不会崩，
// 只是永不触发。这是静默失效，任何日志都不会指向它。
//
// ★负控怎么做的（2026-09-26 修订）：**不依赖任何 .bak 文件**。
//   第一版把负控写成"读同目录的 events.mjs.bak-p327-before-0.1.7"，结果这份验收器
//   一进仓库就挂在负控上（仓库里没有 .bak，也不该有）。
//   现在改为**注入破坏**：把出货源码里的 `agent/created` 替回旧名，写到临时文件后按同一套
//   判定去跑。每处注入都断言**命中恰好一次**；命中数 ≠ 1 直接 FAIL 并说明"负控无效"。
//   验证对象仍是出货文件的派生（明确标注是注入破坏，不是手抄副本）。
//
// 宿主事件目录来源：Host Event Inspect Provider `listEvents`，2026-09-26 对
// 运行中的 dsh 0.1.7-rc.2（桌面端 PID 2316 @19387）实测目录，非文档抄录。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachEventFaces } from './events.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHIPPED = path.join(HERE, 'events.mjs');

const HOST_EVENTS_0_1_7 = new Set([
  'agent-loop/config-start-failed', 'agent-preset/selected', 'agent/assistant-stream',
  'agent/created', 'agent/disposed', 'agent/error', 'agent/inbox/claimed',
  'agent/inbox/discarded', 'agent/inbox/inserted', 'agent/pre-step', 'agent/request',
  'agent/request-error', 'agent/status', 'agent/turn-stopping',
  'api-session/activity', 'api-session/added', 'api-session/error', 'api-session/removed',
  'api-session/status', 'app-boot/config-reload', 'approval/request', 'authorization/settled',
  'commands/change', 'compaction/summary-error', 'connection/request',
  'credentials/record-updated', 'credentials/reference-updated',
  'deepseek-account/model-sign-in-required', 'deepseek-account/session-expired',
  'deepseek-account/signed-out', 'domain/changed', 'feedback/committed',
  'fs/edit-intent', 'fs/observed', 'fs/write-intent',
  'goal/activation-changed', 'goal/changed', 'hmr/change', 'hmr/reload',
  'llm/adapters-updated', 'llm/stream', 'permission-presets/catalog-changed',
  'plugin-manager/changed', 'plugin-manager/install-log', 'plugin-manager/install-state',
  'schedule/changed', 'session-telemetry/record', 'session/created', 'session/disposed',
  'session/event', 'session/flush', 'settings/document-updated', 'skills/change',
  'subagent/end', 'subagent/provider-added', 'subagent/provider-removed', 'subagent/start',
  'system-prompt/assemble', 'system-prompt/change', 'tools/change', 'tools/execute',
  'tools/post-execute', 'tools/pre-execute', 'tools/ptc-dispatch-log', 'tools/result',
  'user-questions/request', 'webserver/index-inject',
  'workflow/agent-end', 'workflow/agent-start', 'workflow/end', 'workflow/log',
  'workflow/phase', 'workflow/start', 'workspace/session-activity', 'workspace/session-stop',
]);

let fails = 0;
function chk(label, cond) {
  if (cond) { console.log('PASS  ' + label); } else { console.log('FAIL  ' + label); fails += 1; }
}

// 只替换一次；命中数 != 1 时返回 null（调用方必须 FAIL，不许静默跳过）
function injectOnce(src, from, to) {
  const parts = src.split(from);
  if (parts.length !== 2) return null;
  return parts.join(to);
}

// ---- 静态面：从源码里抽出所有 ctx.on('...') 的名字 -------------------------------
function extractNames(file) {
  const text = fs.readFileSync(file, 'utf8');
  const names = new Set();
  const re = /ctx\.on\(\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(text)) !== null) names.add(m[1]);
  return names;
}

function staticProblems(file) {
  const names = extractNames(file);
  const unknown = [...names].filter((n) => !HOST_EVENTS_0_1_7.has(n));
  return { names, unknown };
}

// ---- 运行面：拿桩 ctx 真的跑一次 attachEventFaces，记录它订阅了什么 ---------------
function runtimeRun(opts) {
  const subs = [];
  const handlers = {};
  const deliberateCalls = [];
  const perception = { sessionStarts: 0, lastSessionStartAt: 0, lastInboxAt: 0, inboxCount: 0 };
  const lastActive = { agentId: null, at: 0 };
  const ctx = {
    on(name, fn) { subs.push(name); handlers[name] = fn; return () => {}; },
    // 故意不提供 timeout/interval：避免测试里真的起巡检定时器
  };
  const state = {
    problems: {},
    constitution: { autonomy: opts.autonomy, pending: opts.pending },
  };
  attachEventFaces({
    ctx, state,
    isParked: () => false,
    drift: { consecutiveErrors: 0, signatureRepeat: 0, active: false, reason: '', lastSignature: null },
    perception,
    lastActive,
    deliberate: (sigs, at) => deliberateCalls.push({ sigs, at }),
    getOutsideCalls: () => 0,
    setOutsideCalls: () => {},
    bumpSnapRev: () => {},
    patrol: () => {},
    PATROL_MS: 1000,
  });
  return { subs, handlers, deliberateCalls, state, perception, lastActive };
}

// ---- 判定 -----------------------------------------------------------------------
console.log('== 1. 静态面：出货文件订阅的事件名 ==');
const shippedStatic = staticProblems(SHIPPED);
console.log('   订阅: ' + [...shippedStatic.names].join(', '));
chk('出货文件里没有不在 0.1.7 事件目录中的名字', shippedStatic.unknown.length === 0);
if (shippedStatic.unknown.length) console.log('   未知事件名: ' + shippedStatic.unknown.join(', '));
chk('出货文件不再订阅 agent/session-start', !shippedStatic.names.has('agent/session-start'));
chk('出货文件订阅了 agent/created', shippedStatic.names.has('agent/created'));

console.log('');
console.log('== 2. 运行面：桩 ctx 实跑，订阅集合必须与静态面一致 ==');
const live = runtimeRun({ autonomy: true, pending: [{ signal: 'YANSHOU-TEST-SIGNAL' }] });
console.log('   实跑订阅: ' + live.subs.join(', '));
const same = live.subs.length === shippedStatic.names.size
  && live.subs.every((n) => shippedStatic.names.has(n));
chk('静态读到的名字 == 运行时真正订阅的名字（两边不许有分歧）', same);

console.log('');
console.log('== 3. 正控：agent/created 触发时，P021 睡眠期挂账必须被交付 ==');
const createdFn = live.handlers['agent/created'];
chk('agent/created 有处理器', typeof createdFn === 'function');
if (typeof createdFn === 'function') createdFn({ agent: { id: 'probe' }, source: 'initial' });
chk('deliberate 被调用一次', live.deliberateCalls.length === 1);
const firstSig = live.deliberateCalls[0] && live.deliberateCalls[0].sigs[0];
chk('挂账署名正确（睡眠期挂账·<signal>）', firstSig === '\u7761\u7720\u671f\u6302\u8d26\u00b7YANSHOU-TEST-SIGNAL');
chk('perception.sessionStarts 被计到 1', live.perception.sessionStarts === 1);
chk('perception.lastSessionStartAt 被写入非零时间戳', live.perception.lastSessionStartAt > 0);
chk('lastActive 记录了 payload.agent.id', live.lastActive.agentId === 'probe');
console.log('   实际收到: ' + JSON.stringify(live.deliberateCalls));

console.log('');
console.log('== 4. 负控 A：关掉 autonomy，同一处理器必须不再交付（证明第 3 步不是恒真）==');
const live2 = runtimeRun({ autonomy: false, pending: [{ signal: 'YANSHOU-TEST-SIGNAL' }] });
live2.handlers['agent/created']({ agent: { id: 'probe' }, source: 'initial' });
chk('autonomy=false 时 deliberate 未被调用', live2.deliberateCalls.length === 0);

console.log('');
console.log('== 5. 负控 B：把出货源码注入成旧事件名，第 1 步判定必须报红 ==');
const TMP = path.join(HERE, '_p327_injected_old_events.mjs');
let injectOk = false;
let injectedStatic = null;
try {
  const src = fs.readFileSync(SHIPPED, 'utf8');
  const broken = injectOnce(src, "ctx.on('agent/created'", "ctx.on('agent/session-start'");
  if (broken === null) {
    console.log("   !! 注入未命中（找不到 \"ctx.on('agent/created'\"，或命中不止一次）——负控无效");
  } else {
    // 只做静态面判定，不 import 注入版（避免把同一个模块注册两遍）
    fs.writeFileSync(TMP, broken);
    injectOk = true;
    injectedStatic = staticProblems(TMP);
    console.log('   注入版订阅: ' + [...injectedStatic.names].join(', '));
  }
} catch (e) {
  console.log('   注入过程异常: ' + (e && e.message));
} finally {
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
}
const injectedBad = !!(injectedStatic
  && (injectedStatic.unknown.length > 0 || injectedStatic.names.has('agent/session-start')));
chk('注入命中恰好一次（否则负控无效，本判据不作数）', injectOk);
chk('旧事件名在本次判定下 FAIL（否则本检查器恒真、无效）', injectedBad);

console.log('');
console.log(fails === 0 ? 'ALL PASS (fails=' + fails + ')' : 'HAS FAILURES (fails=' + fails + ')');
process.exit(fails === 0 ? 0 : 1);
