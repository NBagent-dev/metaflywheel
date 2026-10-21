#!/usr/bin/env node
/**
 * P583 一次性迁移：给 P583 之前遗留的 `stillOpen: true`（无 `stillOpenUntil`）补上承诺复查期。
 *
 * ★★★ 为什么必须【引擎停止】才跑 ★★★
 *   引擎把整份 state 常驻内存，每次巡检落盘都是 whole-state 写。
 *   2026-10 有一次 `merge-duplicate-hits.mjs --apply` 报"成功 22→2"，
 *   而约 10 分钟后被引擎的 whole-state persist 整份覆盖 —— 教训已记。
 *   ⇒ 本脚本因此有**三重防线**：
 *     ① 默认 dry-run（只报告，不写），要写必须显式 `--apply`
 *     ② `--apply` 前检测账本 mtime：若最近 N 分钟内被动过，说明引擎很可能在跑 ⇒ 拒绝
 *     ③ `--apply` 前**备份** flywheel.json（带时间戳）
 *
 * ★ 语义：给一条 already-disposed 的 stillOpen 补期限，等于**一次重新确认**：
 *   「我当时处置了、当时认为它仍未解决；而我现在给它一个复查期。」
 *   ⇒ 期限从 `disposedAt` 起算（反映真实的处置时刻），而不是从"现在"起算。
 *   ⇒ 若 disposedAt + 14 天 已过去，它**立刻退出欠账**（但那不是删除，记录仍在）。
 *
 * 用法：
 *   node tools/migrate-stillopen-ttl.mjs                 # dry-run（默认，安全）
 *   node tools/migrate-stillopen-ttl.mjs --apply         # 真写（会检测 + 备份）
 *   node tools/migrate-stillopen-ttl.mjs --apply --force # 跳过 mtime 检测（你确认引擎已停）
 *   node tools/migrate-stillopen-ttl.mjs --days 7        # 用非缺省期限
 */
import fs from 'node:fs';
import path from 'node:path';

// ★ 找账本：不要用"数 .. 的层数"——那算错过一次（path.resolve(文件路径,'..') 把文件当目录了）。
//   改成**向上逐级探测**，直到找到 .mpm/flywheel.json。
function findLedger(startDir) {
  let d = startDir;
  for (let i = 0; i < 8; i++) {
    const p = path.join(d, '.mpm', 'flywheel.json');
    if (fs.existsSync(p)) return p;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

// 允许显式指定：--ledger <path>；否则从脚本所在目录向上找
const argv = process.argv.slice(2);
const ledgerArg = argv.indexOf('--ledger');
const LEDGER = (ledgerArg >= 0 && argv[ledgerArg + 1])
  ? path.resolve(argv[ledgerArg + 1])
  : findLedger(path.dirname(path.resolve(process.argv[1])));

const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');
const daysArg = argv.indexOf('--days');
const DAYS = (daysArg >= 0 && argv[daysArg + 1]) ? Number(argv[daysArg + 1]) : 14;

const MS_PER_DAY = 86400000;
const STALE_GUARD_MIN = 3;   // 账本 3 分钟内被动过 ⇒ 认为引擎在跑

console.log('='.repeat(68));
console.log('  P583 迁移：给遗留的 stillOpen 补承诺复查期');
console.log('='.repeat(68));
console.log('  ledger : ' + LEDGER);
console.log('  mode   : ' + (APPLY ? (FORCE ? 'APPLY (force)' : 'APPLY') : 'DRY-RUN（只报告）'));
console.log('  days   : ' + DAYS);
console.log('');

if (!fs.existsSync(LEDGER)) {
  console.error('  [FAIL] ledger not found');
  process.exit(2);
}

// ── ② mtime 防线 ─────────────────────────────────────────────
const st = fs.statSync(LEDGER);
const idleMin = (Date.now() - st.mtimeMs) / 60000;
console.log('  ledger mtime : ' + new Date(st.mtimeMs).toISOString().replace('T', ' ').slice(0, 19)
  + '  (' + idleMin.toFixed(1) + ' 分钟前)');
if (APPLY && !FORCE && idleMin < STALE_GUARD_MIN) {
  console.error('');
  console.error('  [REFUSED] 账本 ' + idleMin.toFixed(1) + ' 分钟前刚被动过 —— 引擎很可能在跑。');
  console.error('            引擎每轮巡检会 whole-state 落盘，会整份覆盖本脚本的修改。');
  console.error('            请先停止 DSH（引擎），再重跑；或确认引擎已停后加 --force。');
  process.exit(3);
}

// ── 读 ───────────────────────────────────────────────────────
const L = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const hits = Array.isArray(L.hits) ? L.hits : [];
console.log('  hits total   : ' + hits.length);

const targets = hits.filter(h => h && h.disposedAt && h.stillOpen === true
  && typeof h.stillOpenUntil !== 'number');
console.log('  targets      : ' + targets.length + '（已处置 + stillOpen + 无期限）');
console.log('');

if (!targets.length) {
  console.log('  [OK] 没有需要迁移的记录。');
  process.exit(0);
}

// ── 逐条分类：**错标** vs **真方向** ─────────────────────────────
//
// ★ 这个分类来自 PR-009（`.mpm/pending-restart.md`，2026-10-20）：
//   「这 23 条里 22 条是【我自己标错的】——2026-10-18 清账时，我给 22 条『合并』处置
//     也传了 stillOpen: true（当时想"诚实地说它仍是方向"）。」
//   ⇒ 而 P583 的修法（给期限）只解决了「永久」，没解决「错标」。
//   ⇒ 实测 2026-10-21：26 条 stillOpen 里 **23 条含「合并」标记**，3 条是真实长文本处置。
//   ⇒ 所以：**错标的直接改回 false（纠正），真方向的才补期限（管理）。**
//   给错标加期限只是让它晚点消失；而纠正错标是让它立刻正确。
const MERGE_MARK = '合并';
const mislabeled = [];   // 含「合并」⇒ 本来就是"重复注入的合并记录"，不是方向 ⇒ 改回 false
const realOpen = [];     // 真方向 ⇒ 补期限
for (const h of targets) {
  if (String(h.myAction || '').indexOf(MERGE_MARK) >= 0) mislabeled.push(h);
  else realOpen.push(h);
}

console.log('  分类：');
console.log('    错标（含「合并」⇒ 改回 stillOpen:false）: ' + mislabeled.length);
console.log('    真方向（补承诺复查期）                    : ' + realOpen.length);
console.log('');

// ── 逐条给期限（只对真方向）────────────────────────────────────
const now = Date.now();
const plan = [];
for (const h of realOpen) {
  const until = h.disposedAt + DAYS * MS_PER_DAY;
  plan.push({
    id: h.id,
    key: h.key,
    disposedAt: h.disposedAt,
    until,
    expired: now >= until,
  });
}

// 统计
const byKey = {};
for (const p of plan) byKey[p.key] = (byKey[p.key] || 0) + 1;
const expiredN = plan.filter(p => p.expired).length;
console.log('  真方向按 key 分布：');
for (const k of Object.keys(byKey)) console.log('    ' + String(k).padEnd(16) + byKey[k]);
console.log('');
console.log('  期限分布：');
console.log('    已过期的 : ' + expiredN + '（补上期限后立即退出欠账）');
console.log('    仍在期内的: ' + (plan.length - expiredN));
console.log('');
console.log('  错标的前 5 条（改回 false）：');
for (const h of mislabeled.slice(0, 5)) {
  console.log('    ' + String(h.key).padEnd(10)
    + ' disposed=' + new Date(h.disposedAt).toISOString().slice(0, 10)
    + '  action=' + String(h.myAction || '').slice(0, 30).replace(/\n/g, ' '));
}
console.log('');
console.log('  真方向的前 5 条（补期限）：');
for (const p of plan.slice(0, 5)) {
  console.log('    ' + String(p.key).padEnd(10)
    + ' disposed=' + new Date(p.disposedAt).toISOString().slice(0, 10)
    + '  until=' + new Date(p.until).toISOString().slice(0, 10)
    + '  ' + (p.expired ? '[已过期]' : '[期内]'));
}
console.log('');

if (!APPLY) {
  console.log('  DRY-RUN 结束。要真写请加 --apply（并确认引擎已停止）。');
  process.exit(0);
}

// ── ③ 备份 ───────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bak = LEDGER + '.bak-p583-' + stamp;
fs.copyFileSync(LEDGER, bak);
console.log('  备份 -> ' + path.basename(bak) + '  (' + fs.statSync(bak).size + ' B)');

// ── 写 ───────────────────────────────────────────────────────
let nMislabel = 0, nTtl = 0;
for (const h of hits) {
  if (!h || !h.disposedAt || h.stillOpen !== true) continue;
  if (typeof h.stillOpenUntil === 'number') continue;
  if (String(h.myAction || '').indexOf(MERGE_MARK) >= 0) {
    // 错标：合并记录被误标成"仍未解决" ⇒ 改回 false（那才是它本来的意思）
    h.stillOpen = false;
    delete h.stillOpenUntil;
    nMislabel++;
  } else {
    // 真方向：补承诺复查期
    h.stillOpenUntil = h.disposedAt + DAYS * MS_PER_DAY;
    nTtl++;
  }
}
fs.writeFileSync(LEDGER, JSON.stringify(L, null, 2), 'utf8');
console.log('  已修正错标（stillOpen → false）: ' + nMislabel + ' 条');
console.log('  已补承诺复查期                   : ' + nTtl + ' 条');
console.log('');
console.log('  === 迁移后核对（用与引擎同一判据重算）===');
const stillOwed = hits.filter(h => h && (!h.disposedAt || (
  h.stillOpen === true && (typeof h.stillOpenUntil !== 'number' || Date.now() < h.stillOpenUntil)
)));
console.log('  欠账（未处置 或 期内 stillOpen）: ' + stillOwed.length);
const byK = {};
for (const h of stillOwed) byK[h.key] = (byK[h.key] || 0) + 1;
for (const k of Object.keys(byK)) console.log('    ' + String(k).padEnd(14) + byK[k]);
console.log('');
console.log('  ✅ 完成。现在**启动引擎**，内生议程的 hits:open 应为 ' + stillOwed.length + ' 笔（或 0）。');;
