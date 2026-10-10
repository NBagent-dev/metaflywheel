// P332 / P171 落地：运行期自陈（run stamp）。
//
// ★为什么需要这个文件
//   P171（2026-09-13）已经写出了正确判据：
//     「验证重启是否生效，不能问版本号，要问归属——服务端口的 PID + 该 PID 的启动时间」
//   但 2026-09-28 需要它的那一刻，它没到场：我用 `dsh --version` 组了一张"装前/装后"对照表，
//   向用户断言"重启后生效"，**从未查端口属主**；残留目录 .dsh-pucHFuGV / EPERM on koffi.node
//   也原封不动重演。量化：272 条沉积里 190 条纯散文，仅 32 条含具体可跑命令，
//   而提到端口属主判据的**只有 P171 这一条** —— 唯一自带可执行判据的沉积，
//   恰恰是唯一没能到场的那条。
//   ⇒ 失效不在"记录不清"，在**沉积只存了事实与散文，没有把判据变成会在触发时刻自己跑的东西**。
//
// ★本模块的取舍（重要，别把它做成"读心术"）
//   它**不假装知道用户在跑哪个端口**。运行中的进程能确知的是关于它自己的事实：
//   我是谁、我加载的脚本是哪一份、那份脚本最后被改于何时、**我这次启动是在它之后还是之前**。
//   最后一条就是"我跑的是不是旧代码"的机械答案，不需要任何人记得去查。
//
// ★零依赖、零子进程
//   只用 node:fs / node:path 与自有进程事实（process.pid / process.uptime / process.argv[1]）。
//   今天已经被子进程（job runner 退出码、ExecutionPolicy 挡住 .ps1）咬过两次，
//   所以这里**一个子进程都不起**。
//
// ★探测是懒的、只读的、容错的
//   启动只记 bootAt/pid/argv1（纯本地量，不可能失败）；真正的文件探测在第一次读到时做，
//   结果缓存。任何一步失败都降级成 unknown，**绝不让本模块把引擎启动搞崩**。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** 进程启动的墙钟时刻。process.uptime() 是纯本地量，不会因权限/路径失败。 */
export function bootWallClock(nowMs) {
  const up = typeof process.uptime === 'function' ? process.uptime() : 0;
  return Math.round((nowMs == null ? Date.now() : nowMs) - up * 1000);
}

function mtimeOf(p) {
  try { return fs.statSync(p).mtimeMs; } catch (e) { return null; }
}

/**
 * 语义（★方向写反过一次，这里把话钉死）：
 *   `bootAt > mtime`  ⇒ **我启动的时候，这个文件还没被改成现在这样** ⇒ 加载的就是最新一份 ⇒ 不陈旧
 *   `bootAt < mtime`  ⇒ 文件在我启动**之后**又被改过 ⇒ 我加载的是旧的一份 ⇒ 陈旧
 * 第一次实现写成 `bootAt > mtime` 当陈旧，方向反了 ⇒ 恒报陈旧。
 * 那不是"检测太灵敏"，是**判据恒真**（P247：兜底值把检测器变成装饰品）。
 * 负控制当场抓住它——这正是不许省负控制的理由。
 */
function loadedAfter(bootAt, mtimeMs) {
  return mtimeMs == null ? null : bootAt > mtimeMs;
}

/** 文件在本次启动**之后**被改过 ⇒ 运行中的那份已过时。 */
function staleAfterBoot(bootAt, mtimeMs) {
  return mtimeMs == null ? null : mtimeMs > bootAt;
}

/**
 * ★P486：包 mtime 的启动宽限（v0 常数，待测量史校准）。
 *
 * 病灶（2026-10-10 实测）：DSH 桌面端**启动时会写自己的包清单**，落盘时刻天然比进程启动
 * 晚几十~几百毫秒 —— bootAt 21:35:08.171 vs 包 mtime 21:35:08.267，**差 96 毫秒**。
 * 而判据是「包 mtime > bootAt」⇒ **每次重启都恒真**，每轮都在喊"需重启才生效"，
 * 把真正有用的那一支（引擎源码 mtime > bootAt）淹在同一行里。
 *
 * 这是同一族的第五次换形态：前四次是"判据恒真 / 兜底值把检测器变成装饰品"
 * （P247、P332 的四次复发）；这次不是方向写反，是**参照物被自己的启动动作碰了**。
 *
 * 宽限之后真实情形照样抓得到：进程活着的时候装了新版，差距是**分钟级**，不是毫秒级。
 * 复现判据：test_runstamp.mjs 用例①②（先在未修代码上自证会红）。
 */
const PKG_BOOT_GRACE_MS = 60 * 1000;

function resolveDshPackageJson() {
  const cands = [];
  try {
    if (process.argv[1]) {
      // …/@deepseek-ai/dsh/lib/bin.js → 向上找 package.json
      let d = path.dirname(path.resolve(process.argv[1]));
      for (let i = 0; i < 4 && d && d !== path.dirname(d); i++) {
        cands.push(path.join(d, 'package.json'));
        d = path.dirname(d);
      }
    }
  } catch (e) { /* 忽略 */ }
  // 约定路径兜底（本机 npm 全局根）
  const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  cands.push(path.join(appdata, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'));
  for (const c of cands) {
    try { if (fs.existsSync(c)) return c; } catch (e) { /* 忽略 */ }
  }
  return null;
}

function versionFrom(pkgPath) {
  try {
    const j = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return j && j.version ? String(j.version) : null;
  } catch (e) { return null; }
}

/**
 * ★这里踩过一次「探测做在启动、结论冻在启动」——模块因此抓不到它自己存在的理由。
 *   第一版：makeRunStamp 在 boot 时算一次 reasons 就存进 state。
 *   后果：**真实情形（长命进程先起、磁盘后变）永远抓不到** —— 启动时文件还没改，
 *   那次探测当然报"干净"，之后再没重算过。
 *   修法：bootAt 只记一次（进程常量），**mtime 探测带短 TTL 缓存、结论每次重算**。
 *   语义依旧干净：bootAt 是"我开始运行时"的忠实记录，mtime 是"现在磁盘上是什么"，
 *   两者比较就是"我加载的是不是现在这一份"。
 */
const PROBE_TTL_MS = 30 * 1000;
let probeCache = { at: 0, key: '', engineNewest: null, engineNewestFile: null, pkgPath: null, pkgMtime: null, pkgVersion: null };

function probe(engineFiles, now) {
  // ★缓存键必须含 engineFiles。第一版只按时间判缓存新鲜度，
  //   于是换了被探测的文件、却拿到上一批文件的结果 —— 实测表现为
  //   "造一个晚于启动的假文件，判据报干净"，即**缓存把判据变成了常量**。
  //   同一族：P247「兜底值把检测器变成装饰品」、以及"判据必须有可注入输入"。
  const key = (engineFiles || []).join('|');
  if (probeCache.at && probeCache.key === key && (now - probeCache.at) < PROBE_TTL_MS) return probeCache;
  let engineNewest = null, engineNewestFile = null;
  for (const f of (engineFiles || [])) {
    const m = mtimeOf(f);
    if (m == null) continue;
    if (engineNewest == null || m > engineNewest) { engineNewest = m; engineNewestFile = f; }
  }
  const pkgPath = resolveDshPackageJson();
  probeCache = {
    at: now,
    key,
    engineNewest,
    engineNewestFile,
    pkgPath,
    pkgMtime: pkgPath ? mtimeOf(pkgPath) : null,
    pkgVersion: pkgPath ? versionFrom(pkgPath) : null
  };
  return probeCache;
}

/** 按需推导陈旧结论（每次调用都基于**当前** mtime）。 */
export function evaluateRunStamp(rs, nowMs) {
  if (!rs) return { stale: false, reasons: [] };
  const now = nowMs == null ? Date.now() : nowMs;
  const pr = probe(rs.engineFiles || [], now);
  const reasons = [];
  if (staleAfterBoot(rs.bootAt, pr.engineNewest) === true) {
    reasons.push('引擎源码 mtime(' + new Date(pr.engineNewest).toISOString() +
      ') 晚于本次启动 → 运行中的引擎是旧的一份');
  }
  if (staleAfterBoot(rs.bootAt + PKG_BOOT_GRACE_MS, pr.pkgMtime) === true) {
    reasons.push('已装 dsh 包 mtime(' + new Date(pr.pkgMtime).toISOString() +
      ') 晚于本次启动 ' + (PKG_BOOT_GRACE_MS / 1000) + 's 以上 → 磁盘已更新，本进程仍是旧代码，需重启才生效');
  }
  return { stale: reasons.length > 0, reasons, engineNewest: pr.engineNewest, pkgMtime: pr.pkgMtime, pkgVersion: pr.pkgVersion };
}

/**
 * 建一次运行期自陈。返回对象可安全序列化（写入 state 后会落进 flywheel.json）。
 *
 * ★`bootAt` 可显式注入（P332 复盘：第一版没有这个口子）：
 *   判据的正确性必须能被**独立于被观测对象**地检验。第一版把 bootAt 硬绑 process.uptime()，
 *   导致测试只能断言"某个真实文件现在是否陈旧"——而那取决于跑测试的进程活了多久。
 *   结果是：方向修对之后，测试反而红了，红的原因却是"那次 node 跑得太快"。
 *   ⇒ 判据要有可注入的输入，否则测的是运气。
 * @param {object} o { now, bootAt, engineFiles }
 */
export function makeRunStamp(o) {
  const now = (o && o.now) || Date.now();
  const bootAt = (o && typeof o.bootAt === 'number') ? o.bootAt : bootWallClock(now);
  const engineFiles = (o && o.engineFiles) || [];
  const pr = probe(engineFiles, now);

  return {
    bootAt,
    bootAtISO: new Date(bootAt).toISOString(),
    pid: process.pid,
    argv1: (function () { try { return process.argv[1] ? path.resolve(process.argv[1]) : null; } catch (e) { return null; } })(),
    node: process.version,
    // engineFiles 必须留在里面：evaluateRunStamp 之后要靠它重探
    engineFiles,
    // 下面这些是 boot 时刻的快照（给人看的"当时是什么"），**结论不要用它们**
    engineNewestAtBoot: pr.engineNewest,
    pkgVersionAtBoot: pr.pkgVersion,
    // 便捷字段：boot 时刻的判断（可能已过期，仅供对照，权威结论走 evaluateRunStamp）
    engineLoadedAfterDisk: loadedAfter(bootAt, pr.engineNewest),
    dshPackageLoadedAfterDisk: loadedAfter(bootAt, pr.pkgMtime)
  };
}

/** 给自我快照用的一行。陈旧时**必须显眼**——这个模块存在的全部理由就是它会被看见。 */
export function runStampLine(rs) {
  if (!rs) return '';
  // ★结论**每次重算**（不读 rs 里那个 boot 时刻的旧值）——否则长命进程永远看不到后来的磁盘变化。
  const ev = evaluateRunStamp(rs);
  const t = new Date(rs.bootAt);
  const hhmm = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
  const ver = ev.pkgVersion ? 'dsh ' + ev.pkgVersion : 'dsh 版本未知';
  if (!ev.stale) {
    return '运行期：PID ' + rs.pid + ' 起于 ' + hhmm + '（' + ver + '）· 磁盘未变，跑的就是最新一份';
  }
  return '⚠ 陈旧运行（P332/P171）：PID ' + rs.pid + ' 起于 ' + hhmm + '，但 ' + ev.reasons.join('；') +
    ' ⇒ **本次改动要重启才生效，别拿版本号当运行版本**';
}
