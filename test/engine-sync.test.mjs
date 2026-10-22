// P584 判据：**源码与运行副本必须一致** —— 把"我记得同步"换成"测试会告诉我没同步"。
//
// ★ 为什么需要这条（2026-10-21 现场）：
//   `P482⑧ 行动前检索` 每次 edit 引擎文件后都会注入一条提示，第 ③ 条是
//   「改完记得同步仓库副本」。我读了它 **21 次**，一次都没执行。
//   后果：我改的是 `daima/XIN/metaflywheel/engine/modules/`（源码），
//   而运行中的引擎加载 `~/.dsh/mpm/engine/modules/`（独立副本、无符号链接）。
//   两份 sha 不同 ⇒ 我以为的"等重启"是错的，重启也只会加载旧的那一份。
//
// ★ 为什么不是"把提示挪到事前"：
//   查了宿主契约 —— `hooks/tools/pre-execute` 的 `allow` **不能携带内容**
//   （见 preaction.mjs 头部），注入只能发生在 `post-execute`。
//   而 `ask` 是唯一的事前通道，而它在无人在场时会变成拒绝，等于把自己卡死。
//   ⇒ **所以那条纪律在架构上不可能"提前出现"。**
//
// ★ 所以正确的形态是：**让装置替我记住**。
//   判据会在每次 `node --test` 时比对两处，不一致就红。
//   而我这一轮跑过 253 次测试 —— 如果这条判据早就存在，我在第一次跑测试时就会看到。
//
// 运行：node --test test/engine-sync.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

// 源码根：本文件在 <src>/test/ 下
const SRC_MODULES = path.resolve(import.meta.dirname, '..', 'engine', 'modules');

// 运行副本根。允许用环境变量覆盖（换机器 / CI 场景）。
const RUN_MODULES = process.env.MPM_RUN_MODULES
  || path.join(os.homedir(), '.dsh', 'mpm', 'engine', 'modules');

// 需要保持一致的文件清单。
// ★ 为什么是**自动发现**而不是白名单：第一版写了 6 个白名单，而判据 ② 立刻红了 ——
//   源码里有 23 个 .mjs 模块，白名单只覆盖 6 个 ⇒ 另外 17 个的一致性**永不被检查**。
//   而白名单的维护成本正好落在最容易被忘的时刻（新增模块时）。
//   ⇒ 所以改成自动发现：源码目录下所有 .mjs（排除 `_` 开头的临时探测脚本）。
//   ⇒ 而"运行副本里有很多 .bak-*"不影响：我们只遍历**源码**目录的文件名。
function discoverTracked() {
  return fs.readdirSync(SRC_MODULES)
    .filter(function (f) { return f.endsWith('.mjs') && !f.startsWith('_'); })
    .sort();
}
const TRACKED = discoverTracked();

/**
 * sha256（★P603：**先归一行尾再哈希**）
 *
 * 为什么必须归一：仓库里存 LF，而 Windows 的 `core.autocrlf=true` 会把工作树写成 CRLF。
 * 于是同一个文件在两处"字节不同"，而 Node 加载它们的行为**完全一样**。
 * ⇒ 判据要守的是"重启会不会加载到同一份代码"，不是"行尾是不是同一个习惯"。
 * ⇒ 所以：**归一行尾后比较**；若归一时发现差异消失，打印 INFO 说明只是行尾不同。
 */
function sha256(p) {
  return crypto.createHash('sha256').update(normalizeEol(fs.readFileSync(p))).digest('hex').slice(0, 16);
}

/** CRLF / CR → LF。二进制安全：只替换字节序列，不做字符串解码。 */
function normalizeEol(buf) {
  const out = Buffer.allocUnsafe(buf.length);
  let n = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x0d) {                       // \r
      if (buf[i + 1] === 0x0a) continue;     // \r\n ⇒ 丢掉 \r，\n 下一轮写入
      out[n++] = 0x0a;                       // 单个 \r ⇒ \n
      continue;
    }
    out[n++] = b;
  }
  return out.subarray(0, n);
}

/**
 * 扫全仓，判断一个模块被谁引用。
 *
 * ★ 为什么要分三类（这是判据自己的第二次纠错）：
 *   第一版只扫 `engine/`，于是把 `heartbeat.mjs` 报成「孤儿模块（无人 import）」。
 *   而查下去发现三件更具体的事：
 *     · 它**已提交**（commit 2207e01 · feat(P556) heartbeat card）
 *     · 它被 `test/run-heartbeat.mjs` 引用（那个脚本直接 import 它并跑）
 *     · 而 `host.js` 两边都不 import ⇒ 它**不是给引擎用的**，是给那个 runner 用的
 *   ⇒ 所以「无人 import」是**扫描范围太窄**造出来的假警报。
 *   ⇒ 正确的分类是三档：
 *     ① wired     —— 被 `engine/host.js` 引用 ⇒ **必须部署到运行副本**，缺失就是红
 *     ② runner    —— 只被 test/tools 引用、有独立执行入口 ⇒ **源码里有就够了**，
 *                    不进运行副本是对的（引擎不加载它），报 INFO 不拦
 *     ③ dead      —— 全仓无任何引用 ⇒ 真死代码，报 WARN
 */
function scanRefs(name) {
  const base = name.replace(/\.mjs$/, '');
  const needles = ["'" + base + "'", '"' + base + '"', '/' + base + '.mjs', '/' + base + '"'];
  const engineRoot = path.resolve(SRC_MODULES, '..');        // engine/
  const repoRoot = path.resolve(SRC_MODULES, '..', '..');    // metaflywheel/

  function scanDir(dir, recursive) {
    const out = [];
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (recursive && e.name !== 'node_modules' && e.name !== '.git') out.push.apply(out, scanDir(full, true));
        continue;
      }
      if (!/\.(mjs|js)$/.test(e.name)) continue;
      if (e.name === name) continue;                          // 不数自己
      let txt = '';
      try { txt = fs.readFileSync(full, 'utf8'); } catch (err) { continue; }
      if (needles.some(function (n) { return txt.indexOf(n) >= 0; })) out.push(full);
    }
    return out;
  }

  const hostRefs = scanDir(engineRoot, false).filter(function (p) {
    return path.basename(p) === 'host.js';
  });
  const otherEngine = scanDir(engineRoot, false).filter(function (p) {
    return path.basename(p) !== 'host.js' && p !== path.join(engineRoot, name);
  });
  const runnerRefs = scanDir(path.join(repoRoot, 'test'), false)
    .concat(scanDir(path.join(repoRoot, 'tools'), false));

  const wired = hostRefs.length > 0
    || otherEngine.some(function (p) { return p.indexOf(SRC_MODULES) === 0; });
  return {
    wired: wired,
    runner: runnerRefs.length > 0,
    runnerFiles: runnerRefs.map(function (p) { return path.relative(repoRoot, p); })
  };
}

test('① 源码与运行副本：被跟踪的模块必须逐字节一致', () => {
  if (!fs.existsSync(RUN_MODULES)) {
    // 负控：运行副本不存在 ⇒ 不判失败（可能换机器 / 未安装），但要说清
    console.log('  [SKIP] 运行副本不存在：' + RUN_MODULES);
    return;
  }
  const diffs = [];      // 真问题：该同步却没同步
  const runners = [];    // 有独立 runner、不进引擎 ⇒ 源码里有就对
  const deads = [];      // 全仓无引用 ⇒ 真死代码
  for (const f of TRACKED) {
    const s = path.join(SRC_MODULES, f);
    const d = path.join(RUN_MODULES, f);
    if (!fs.existsSync(s)) { diffs.push(f + '：源码缺失'); continue; }
    if (!fs.existsSync(d)) {
      const ref = scanRefs(f);
      if (ref.wired) {
        diffs.push(f + '：运行副本缺失（**被引擎引用 ⇒ 必须部署**）');
      } else if (ref.runner) {
        runners.push(f + ' ← ' + ref.runnerFiles.join(' / '));
      } else {
        deads.push(f);
      }
      continue;
    }
    const ss = sha256(s), dd = sha256(d);
    if (ss !== dd) diffs.push(f + '  src=' + ss + '  run=' + dd);
  }
  if (runners.length) {
    console.log('  [INFO] 未接进引擎但有独立执行入口（源码里有即正确，不必进运行副本）：\n      '
      + runners.join('\n      '));
  }
  if (deads.length) {
    console.log('  [WARN] 真死代码（全仓无任何引用）：\n      ' + deads.join('\n      '));
  }
  assert.equal(diffs.length, 0,
    '源码与运行副本不一致（改了源码却没同步 ⇒ 重启也不会生效）：\n      '
    + diffs.join('\n      ')
    + '\n    ⇒ 同步命令：Copy-Item <src>/engine/modules/<f> <run>/engine/modules/<f>');
});

test('② 自动发现必须真的覆盖全部模块（负控：不许返回空清单）', () => {
  assert.ok(TRACKED.length >= 20,
    '自动发现只找到 ' + TRACKED.length + ' 个模块 —— 源码目录结构可能变了，或 discoverTracked 坏了');
  assert.ok(TRACKED.indexOf('hits.mjs') >= 0, '关键模块 hits.mjs 必须在清单里');
  assert.ok(TRACKED.indexOf('agenda.mjs') >= 0, '关键模块 agenda.mjs 必须在清单里');
  assert.ok(TRACKED.indexOf('tools.mjs') >= 0, '关键模块 tools.mjs 必须在清单里');
  // 负控：下划线开头的探测脚本不许进来（它们只在源码里，运行副本里没有 ⇒ 会永远红）
  const leaked = TRACKED.filter(function (f) { return f.startsWith('_'); });
  assert.equal(leaked.length, 0, '临时探测脚本不许进比对清单：' + leaked.join(', '));
});

test('④ 引用分类器本身必须有区分力（含负控：不存在的模块必须判 dead）', () => {
  // ★ 为什么需要这条：判据第二版只扫 `engine/`，把 `heartbeat.mjs` 误报成「无人 import」。
  //   而真相是它被 `test/run-heartbeat.mjs` 引用（已提交，commit 2207e01）。
  //   ⇒ 分类器自己也会错，所以它必须被钉住 —— 否则同一个误报会安静地回来。

  // ① heartbeat.mjs 必须是 runner 档（有独立入口、不进引擎）
  if (fs.existsSync(path.join(SRC_MODULES, 'heartbeat.mjs'))) {
    const r = scanRefs('heartbeat.mjs');
    assert.equal(r.wired, false,
      'heartbeat.mjs 不该被判成 wired（host.js 没有 import 它）——若这条红了，说明它被接进引擎了，'
      + '那时**应该**同步到运行副本，本判据需要跟着改');
    assert.equal(r.runner, true,
      'heartbeat.mjs 必须被判成 runner（test/run-heartbeat.mjs 引用了它）——若这条红了，'
      + '要么那个 runner 被删了，要么分类器漏扫了 test/');
    // 而且它报出的 runner 文件必须真的存在
    for (const rel of r.runnerFiles) {
      assert.ok(fs.existsSync(path.join(path.resolve(SRC_MODULES, '..', '..'), rel)),
        '分类器报出的引用文件不存在：' + rel + '（分类器在幻觉）');
    }
  }

  // ② 负控：一个根本不存在的模块名，必须 wired=false / runner=false ⇒ 会落进 dead 档
  const ghost = scanRefs('definitely-not-a-real-module-xyz.mjs');
  assert.equal(ghost.wired, false, '负控失败：不存在的模块被判成 wired');
  assert.equal(ghost.runner, false, '负控失败：不存在的模块被判成有 runner');

  // ③ 正控：一个确实被 host.js 引用的模块，必须被判成 wired
  const sample = ['core', 'state', 'tools', 'selfsnap'].find(function (n) {
    return fs.existsSync(path.join(SRC_MODULES, n + '.mjs')) && scanRefs(n + '.mjs').wired;
  });
  assert.ok(sample,
    '正控失败：连一个「被 host.js 引用的模块」都没识别出来 ⇒ 分类器可能整体失效（全判 dead/false）');
});
test('③ 负控：比对函数本身必须能发现差异（自证会红）', () => {
  // 造一个临时目录，复制一个文件但改一个字节 —— sha256 必须不同。
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpm-sync-'));
  try {
    const a = path.join(tmp, 'a.mjs');
    const b = path.join(tmp, 'b.mjs');
    fs.writeFileSync(a, 'export const X = 1;\n');
    fs.writeFileSync(b, 'export const X = 2;\n');
    assert.notEqual(sha256(a), sha256(b), '改一个字节后 sha 必须不同 —— 否则判据恒绿');
    fs.writeFileSync(b, 'export const X = 1;\n');
    assert.equal(sha256(a), sha256(b), '内容相同时 sha 必须相同');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
