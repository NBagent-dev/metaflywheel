// P507 判据：**陈旧探测必须盯住整个引擎，不许手写清单。**
// 运行：node --test test/enginelist.test.mjs
//
// 实证（2026-10-11 自主发动那一轮）：快照首行说「磁盘未变，跑的就是最新一份」，
//   而我在启动之后改了 5 个引擎文件（valence/rhythm/patrol/tools/promise）——
//   因为 ENGINE_FILES 是**手写两行清单**（host.js + modules/selfsnap.mjs），
//   其它 18 个模块的 mtime 根本不在监视范围内。
//   ⇒ **它是"我跑的是不是旧代码"的唯一提示者，却在最需要它的那一刻撒了谎。**
//
// 三条判据：
//   ① 静态：host.js 里必须出现自动发现（readdirSync），不许退回手写清单；
//   ② 行为：按 host.js 的规则算出的清单必须覆盖**全部**非探针模块；
//   ③ ★反例（这条最要紧）：改动一个**曾经不在清单里**的模块的 mtime
//      ⇒ 陈旧判定必须为 true（P507 的场景必须红）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeRunStamp, evaluateRunStamp, discoverEngineFiles } from '../engine/modules/runstamp.mjs';

const ENGINE = path.resolve(new URL('../engine', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const HOST = path.join(ENGINE, 'host.js');
const SRC = fs.readFileSync(HOST, 'utf8');

/** ★只调引擎自己的那一份实现。上一版在这里**复刻**了发现逻辑（测试自带 fs）——
 *  于是 host.js 缺 import fs 那个致命 bug 被判据完美地漏掉了。**复刻 = 两处同义代码。** */
function discovered() {
  return discoverEngineFiles(ENGINE.replace(/\\/g, '/') + '/');
}

test('①静态：host.js 必须调引擎自己的发现函数，且**不许直接使用 fs**', () => {
  // ★这条是 P507 复发的克星。为什么前两条判据都漏了？
  //   旧①是静态检查"源码里有没有 readdirSync" ⇒ 有，绿；而 host.js 没有 import fs，
  //   `fs.readdirSync` 运行时抛 ReferenceError，**被 try/catch 静默吞掉**，清单退化成 [host.js]。
  //   旧②在测试里复刻了逻辑（测试自己有 fs）⇒ 15 个文件，也绿。
  //   ⇒ 结构上不可能发现。现在：发现逻辑只有一份（runstamp.mjs），并禁止 host.js 直接碰 fs。
  assert.ok(/import\s*\{[^}]*discoverEngineFiles[^}]*\}\s*from\s*["']\.\/modules\/runstamp\.mjs["']/.test(SRC),
    'host.js 必须从 runstamp.mjs 导入 discoverEngineFiles');
  // ★口径要精确：只看 ENGINE_FILES 那一段，不要扫全文——
  //   第一版扫全文找 `fs.` ⇒ 撞上别处的合法提及 ⇒ 假警（今天第四次口径问题）。
  const at = SRC.indexOf('const ENGINE_FILES');
  assert.ok(at > 0, 'host.js 里找不到 ENGINE_FILES 的构造');
  const block = SRC.slice(at, at + 700);
  assert.ok(block.indexOf('discoverEngineFiles(') >= 0, 'ENGINE_FILES 必须由 discoverEngineFiles 构造');
  assert.ok(!/\bfs\s*\./.test(block),
    'ENGINE_FILES 那一段不许直接碰 fs（host.js 没有 import fs ⇒ fs.* 会抛 ReferenceError 并被 catch 吞掉）');
});

test('②行为：清单必须覆盖全部非探针模块（不许只盯一两个）', () => {
  const list = discovered();
  // ★口径统一：discoverEngineFiles 返回的是**正斜杠**路径，别拿 path.dirname 去比反斜杠
  //   （第一版这么比 ⇒ 模块数算成 0 ⇒ 假警。今天第四次口径问题。）
  const norm = (p) => p.replace(/\\/g, '/');
  const mods = list.filter((p) => norm(p).indexOf(norm(ENGINE) + '/modules/') === 0);
  assert.equal(list.length, mods.length + 1, '清单必须含 host.js 本身且不漏不多（模块 ' + mods.length + ' 个）');
  assert.ok(mods.length >= 5, '引擎模块数至少应有几个（实得 ' + mods.length + '）——判据锚点可能失效');
  for (const must of ['valence.mjs', 'rhythm.mjs', 'patrol.mjs', 'tools.mjs', 'promise.mjs', 'selfsnap.mjs']) {
    assert.ok(list.some((p) => norm(p).endsWith(must)), must + ' 必须在监视范围内（P507 漏的正是这一族）');
  }
});

test('③★反例：改动一个曾不在清单里的模块 ⇒ 陈旧判定必须为 true', () => {
  // ★用**受控夹具**（临时文件 + 指定 mtime），不拿真实引擎文件当夹具——
  //   第一版用真 valence.mjs 的 mtime，结果依赖"这些文件恰好什么时候被改过"，
  //   测的是运气而不是判据（P332 的教训：判据要有可注入的输入）。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p507-'));
  const watched = path.join(dir, 'watched.mjs');   // 旧清单里"被盯"的那个
  const moduleF = path.join(dir, 'some-module.mjs'); // 旧清单漏掉的模块
  const now = Date.now();
  const tOld = now - 10 * 60000, tNew = now - 60000, bootAt = now - 5 * 60000;
  fs.writeFileSync(watched, '// x'); fs.writeFileSync(moduleF, '// y');
  fs.utimesSync(watched, new Date(tOld), new Date(tOld));
  fs.utimesSync(moduleF, new Date(tNew), new Date(tNew));

  // 旧清单（只盯 watched）⇒ **谎报"没变"**：这正是 P507 那一刻
  // ★注意 API：`makeRunStamp()` **不设 `.stale`**（它只给 boot 时刻的对照字段，
  //   见 runstamp.mjs:183 的注释）——**权威结论在 `evaluateRunStamp(rs)`**。
  //   我第一版断言了 `rs.stale`（不存在的字段）⇒ 恒 falsy ⇒ 判据假红。
  //
  // ★★2026-10-11 修（今日第三次"判据量错对象"，也是最隐蔽的一次）：
  //   `evaluateRunStamp` 有【两路】陈旧来源——`engineFiles`（本夹具控制得住）与
  //   **`pkgMtime`（真实世界的读数，夹具管不着）**。上一版断言 `oldEv.stale === false`
  //   （= 两路的并集）⇒ 只要跑测试时 dsh 包最近被动过，这条就【必然红】——
  //   **测的又是运气**（正是它自己注释里自省过的那个病，只是换了入口）。
  //   ⇒ 铁律：**判据的断言范围不许大于夹具的控制范围**。所以这里只断言【引擎源码这一路】。
  const oldEv = evaluateRunStamp(makeRunStamp({ now: now, bootAt: bootAt, engineFiles: [watched] }), now);
  const oldReasons = (oldEv.reasons || []).join('；');
  assert.ok(oldReasons.indexOf('引擎源码') < 0,
    '旧清单确实会谎报：它【不报】"引擎源码"这一路（场景复现，不是要求）。实收理由：' + oldReasons);

  // 新清单（自动发现，含那个模块）⇒ 必须报陈旧
  const newEv = evaluateRunStamp(makeRunStamp({ now: now, bootAt: bootAt, engineFiles: [watched, moduleF] }), now);
  assert.equal(newEv.stale, true, '自动发现后必须抓到"模块比启动新"：' + JSON.stringify(newEv).slice(0, 200));
  assert.match((newEv.reasons || []).join('；'), /引擎源码/, '理由里要指出是引擎源码过期');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('③反例的另一面：启动晚于所有 mtime ⇒ 不陈旧（别恒报陈旧）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p507b-'));
  const f = path.join(dir, 'a.mjs');
  const now = Date.now(), t = now - 10 * 60000;
  fs.writeFileSync(f, '// z');
  fs.utimesSync(f, new Date(t), new Date(t));
  const ev = evaluateRunStamp(makeRunStamp({ now: now, bootAt: now - 60000, engineFiles: [f] }), now);
  assert.equal(ev.stale, false, '启动晚于全部 mtime 却报陈旧 ⇒ 假警（P332 的老毛病）');
  fs.rmSync(dir, { recursive: true, force: true });
});
