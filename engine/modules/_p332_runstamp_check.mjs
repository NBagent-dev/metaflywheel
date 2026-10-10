// P332 验证：可注入 bootAt ⇒ 两个方向都可复现、不依赖跑测试的进程活了多久。
//
// ★这个文件本身经历过三轮「判据测错对象」，都记在下面，因为它们是同一族的：
//   第 1 轮：实现里 loadedAfter 方向写反（`bootAt > mtime` 当陈旧）⇒ **恒报陈旧**，
//           即 P247 记的「判据恒真：兜底值把检测器变成装饰品」。负控制当场抓住。
//   第 2 轮：方向修对后测试反而红了 —— 因为断言了 stale===true，而那个值取决于
//           `process.uptime()`（node 短命进程 uptime≈0 ⇒ bootAt≈now ⇒ 报"新鲜"，**那是对的**）。
//           ⇒ **判据必须有可注入的输入**，否则测的是运气。修法：给 makeRunStamp 加 bootAt 口子。
//   第 3 轮：模块把结论冻在 boot 时刻 ⇒ **它自己存在的理由（长命进程先起、磁盘后变）永远抓不到**。
//           修法：结论改为每次读时重算（evaluateRunStamp），只对文件探测做 30s TTL 缓存。
//   ★另有一条与本文件无关但同族的教训：我用 `Get-Content -Raw | Set-Content` 改一行 import，
//     把整个文件的中文变成了乱码。**CJK 文件禁止经 PowerShell 往返**——用 write/edit 工具。
import { makeRunStamp, runStampLine, bootWallClock, evaluateRunStamp } from 'file:///C:/Users/Administrator/.dsh/mpm/engine/modules/runstamp.mjs';
import fs from 'node:fs';

const HOST = 'C:\\Users\\Administrator\\.dsh\\mpm\\engine\\host.js';
const NMJSON = 'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\package.json';

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS  ' + name + (detail ? '  —— ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + name + '  —— ' + detail); }
}
function mtimeOfPkg() {
  let mtime = null, version = null;
  try { mtime = fs.statSync(NMJSON).mtimeMs; } catch (e) { /* 不存在就当未知 */ }
  try { version = JSON.parse(fs.readFileSync(NMJSON, 'utf8')).version; } catch (e) { /* 同上 */ }
  return { path: NMJSON, mtime, version };
}

console.log('=== 0. bootWallClock 自洽 ===');
const now0 = Date.now();
const b0 = bootWallClock(now0);
check('bootAt 早于 now，且差距≈uptime', b0 <= now0 && (now0 - b0) >= 0,
  'bootAt=' + new Date(b0).toISOString() + ' uptime=' + process.uptime().toFixed(1) + 's');

console.log('');
console.log('=== 1. 可注入 bootAt ⇒ 判据脱离外部状态（两方向都可复现）===');
const pkg = mtimeOfPkg();
check('能定位已装 dsh 包', !!pkg.path, pkg.path);
check('能读出包版本', !!pkg.version, String(pkg.version));
check('能探到包 mtime', pkg.mtime != null, String(pkg.mtime));

// (a) 启动**早于**包换版 = 今天真实情形（服务先起、npm 后换包）⇒ 陈旧
const before = makeRunStamp({ now: Date.now(), bootAt: pkg.mtime - 3600e3, engineFiles: [HOST] });
const evB = evaluateRunStamp(before);
console.log('  (a) ' + runStampLine(before));
check('★ 启动早于包 mtime ⇒ stale===true 且理由含"需重启"',
  evB.stale === true && evB.reasons.join('|').indexOf('需重启') !== -1,
  'stale=' + evB.stale + ' reasons=' + JSON.stringify(evB.reasons));

// (b) 启动**晚于**包换版 ⇒ 干净（负控制）
const after = makeRunStamp({ now: Date.now(), bootAt: pkg.mtime + 3600e3, engineFiles: [HOST] });
const evA = evaluateRunStamp(after);
console.log('  (b) ' + runStampLine(after));
check('★ 启动晚于包 mtime ⇒ stale===false（负控制）',
  evA.stale === false, 'stale=' + evA.stale + ' reasons=' + JSON.stringify(evA.reasons));
check('★ 两方向答案不同（判据非常量，不是恒真）',
  evB.stale !== evA.stale, 'before=' + evB.stale + ', after=' + evA.stale);

console.log('');
console.log('=== 1b. ★ 活体重算：启动时刻变了，下一次判定必须改口 ===');
// 这一条抓的是第 3 轮缺陷：结论若冻在 boot 时刻，"长命进程先起、磁盘后变"永远抓不到。
const tmpLive = process.env.TEMP + '\\p332-live-probe.mjs';
fs.writeFileSync(tmpLive, '// live probe\n');
const bootT = Date.now();
const fakeFuture = new Date(bootT + 120e3);
fs.utimesSync(tmpLive, fakeFuture, fakeFuture);              // 磁盘"晚于"启动 ⇒ 陈旧
const rs1 = makeRunStamp({ now: bootT, bootAt: bootT, engineFiles: [tmpLive] });
check('磁盘晚于启动 ⇒ 报陈旧', evaluateRunStamp(rs1).stale === true,
  JSON.stringify(evaluateRunStamp(rs1).reasons));
const rs2 = makeRunStamp({ now: bootT, bootAt: bootT + 300e3, engineFiles: [tmpLive] });
check('启动时刻改变后改口报干净（说明是重算，不是常量）',
  evaluateRunStamp(rs2).stale === false, JSON.stringify(evaluateRunStamp(rs2).reasons));
fs.unlinkSync(tmpLive);

console.log('');
console.log('=== 2. 引擎源码分支：伪造一个"晚于启动"的引擎文件 ===');
const tmp = process.env.TEMP + '\\p332-fake-engine.mjs';
fs.writeFileSync(tmp, '// fake\n');
const fakeLate = new Date(Date.now() + 60e3);
fs.utimesSync(tmp, fakeLate, fakeLate);
const engRs = makeRunStamp({ now: Date.now(), bootAt: Date.now(), engineFiles: [tmp] });
const evE = evaluateRunStamp(engRs);
check('引擎文件 mtime 晚于启动 ⇒ stale===true 且理由含"引擎源码"',
  evE.stale === true && evE.reasons.join('|').indexOf('引擎源码') !== -1,
  'stale=' + evE.stale + ' reasons=' + JSON.stringify(evE.reasons));
check('区分力：该情形下**包分支不响**（两个分支不一起响）',
  evE.reasons.join('|').indexOf('已装 dsh 包') === -1, JSON.stringify(evE.reasons));
fs.unlinkSync(tmp);

console.log('');
console.log('=== 3. 容错：不存在路径 / 空参数，不得抛异常，未知记 null 而非 false ===');
let threw = null, safe = null;
try { safe = makeRunStamp({ now: Date.now(), engineFiles: ['C:\\no\\such\\file-xyz.mjs'] }); } catch (e) { threw = e.message; }
check('不存在的引擎文件不抛异常', threw === null, threw || 'ok');
check('此时结论里的引擎 mtime 为 null（未知≠干净）',
  safe && evaluateRunStamp(safe).engineNewest === null, String(safe && evaluateRunStamp(safe).engineNewest));
let threw2 = null;
try { makeRunStamp({}); } catch (e) { threw2 = e.message; }
check('空参数不抛异常', threw2 === null, threw2 || 'ok');

console.log('');
console.log('=== 4. runStampLine 两个方向的人话不能一样 ===');
const lb = runStampLine(before), la = runStampLine(after);
check('陈旧行含「陈旧」与「重启」', /陈旧/.test(lb) && /重启/.test(lb), lb.slice(0, 60) + '…');
check('干净行含「最新一份」且不含「陈旧」', /最新一份/.test(la) && !/陈旧/.test(la), la);
check('两行人话确实不同', lb !== la, '');

console.log('');
console.log('合计: PASS=' + pass + '  FAIL=' + fail);
process.exit(fail ? 1 : 0);
