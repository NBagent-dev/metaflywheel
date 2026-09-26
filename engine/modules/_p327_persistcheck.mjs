// P327 验收器②：persist 的返回值必须等于事实。
//
// 为什么需要它：旧实现把异常 catch 掉后 `return undefined`，于是
//   ① 巡检用 `canPersist = !!(fsSvc && root.current)`（只问服务在不在）冒充"已落盘"；
//   ② 六处 `await d.persist()` 全部无从判断。
// 结果：写盘失败三轮，每一轮都打印"（已落盘）"，台账 mtime 纹丝不动，
//       P327 随一次重启直接蒸发。**报告成功而不是成功，是本会话反复出现的那个病。**
//
// ★负控怎么做的（2026-09-26 修订）：**不依赖任何 .bak 文件**。
//   第一版把负控写成"读同目录的 state.mjs.bak-p327-before-persistfix"，结果这份验收器
//   一进仓库就挂在负控上（仓库里没有 .bak，也不该有）。
//   现在改为**注入破坏**：把出货源码里的一处关键 return 替换成旧行为，写到临时文件后 import。
//   每处注入都断言**命中恰好一次**；命中数 ≠ 1 直接 FAIL 并说明"负控无效"。
//   验证对象仍是出货文件的派生（明确标注是注入破坏，不是手抄副本）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHIPPED = path.join(HERE, 'state.mjs');

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

function makeDeps(writeFails) {
  return {
    fsSvc: {
      resolve: async (p) => p,
      readText: async () => '',
      writeText: async () => { if (writeFails) throw new Error('EACCES: sandbox mode is read-only'); },
    },
    root: { current: 'C:/nonexistent-root-for-test' },
    policy: { workspaceRoot: 'C:/nonexistent-root-for-test' },
    state: {
      seq: 1, problems: {}, sediments: [], patrol: { rounds: 0 }, measure: {},
      constitution: { autonomy: false, grantedAt: 0, log: [], lastFireAt: 0 },
      valence: { events: [] }, narrations: [],
    },
    bumpSnapRev: () => {},
    gainOf: () => 0,
    adopted: {}, diag: {},
    ctx: { get: () => undefined, on: () => () => {}, timeout: () => {}, interval: () => {} },
  };
}

async function probe(modPath, writeFails) {
  const mod = await import(pathToFileURL(modPath).href);
  const sm = mod.makeStateMachine(makeDeps(writeFails));
  return await sm.persist();
}

// ---- 出货文件 ---------------------------------------------------------------
console.log('== 1. 出货文件：写盘失败时，persist 必须如实返回失败 ==');
const bad = await probe(SHIPPED, true);
console.log('   写盘失败 -> 返回 ' + JSON.stringify(bad));
chk('返回值不是 undefined（调用方拿得到事实）', bad !== undefined && bad !== null);
chk('返回 ok === false', !!(bad && bad.ok === false));
chk('带可读的失败原因', !!(bad && typeof bad.reason === 'string' && bad.reason.length > 0));

console.log('');
console.log('== 2. 出货文件：写盘成功时，persist 必须返回成功 ==');
const good = await probe(SHIPPED, false);
console.log('   写盘成功 -> 返回 ' + JSON.stringify(good));
chk('返回 ok === true', !!(good && good.ok === true));
chk('带落盘目标路径', !!(good && typeof good.target === 'string' && good.target.length > 0));

// ---- 负控：注入破坏（不依赖 .bak）-------------------------------------------
console.log('');
console.log('== 3. 负控：把出货源码注入成"旧行为"（成功也返回 undefined），本判定必须报红 ==');
const TMP = path.join(HERE, '_p327_injected_old_state.mjs');
let injectOk = false;
let oldGood;
try {
  const src = fs.readFileSync(SHIPPED, 'utf8');
  const broken = injectOnce(src, 'return { ok: true, target };', 'return;');
  if (broken === null) {
    console.log('   !! 注入未命中（找不到 "return { ok: true, target };"，或命中不止一次）——负控无效');
  } else {
    fs.writeFileSync(TMP, broken);
    injectOk = true;
    oldGood = await probe(TMP, false);
    console.log('   注入版 写盘成功 -> 返回 ' + JSON.stringify(oldGood));
  }
} catch (e) {
  console.log('   注入过程异常: ' + (e && e.message));
} finally {
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
}
chk('注入命中恰好一次（否则负控无效，本判据不作数）', injectOk);
chk('旧行为在本判定下 FAIL（返回的不是 {ok:true}）', injectOk && !(oldGood && oldGood.ok === true));

console.log('');
console.log(fails === 0 ? 'ALL PASS (fails=' + fails + ')' : 'HAS FAILURES (fails=' + fails + ')');
process.exit(fails === 0 ? 0 : 1);
