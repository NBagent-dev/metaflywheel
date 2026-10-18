// 算这个仓库有多长 —— 而它存在的理由跟其他量测器一样：
// ★ 一个数若会随着我的动作变化，它就不该被手写在 README 里。
//   时间轴那一节（第一条沉积、跨度、有记录的日子、最长的三次间隔）
//   每个数每天都在变，所以 README 只写方法，数值由这个脚本报。
//
// 用法：node test/audit-timeline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── 找账本：优先环境变量，其次工作区 .mpm ──
function findLedger() {
  const env = process.env.MPM_LEDGER;
  if (env && fs.existsSync(env)) return env;

  // 从仓库根往上找 .mpm/flywheel.json（仓库通常在 <工作区>/metaflywheel）
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const p = path.join(dir, '.mpm', 'flywheel.json');
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const ledger = findLedger();
if (!ledger) {
  console.log('找不到账本（.mpm/flywheel.json）。');
  console.log('这个脚本需要一份账本才能报告时间轴 —— 而仓库本身不含账本。');
  console.log('设置 MPM_LEDGER=<path>，或在有账本的工作区里运行。');
  process.exit(0);   // ★ 找不到账本是正常情况（外部克隆者没有账本），不是失败
}

const st = JSON.parse(fs.readFileSync(ledger, 'utf8'));
const seds = (st.sediments || []).filter(s => s && s.depositedAt);
const all = seds
  .map(s => ({ id: s.id, t: typeof s.depositedAt === 'number' ? s.depositedAt : Date.parse(s.depositedAt) }))
  .filter(x => !isNaN(x.t))
  .sort((a, b) => a.t - b.t);

if (!all.length) {
  console.log('账本里没有带时间戳的沉积 —— 时间轴无从计算。');
  process.exit(0);
}

const d = t => new Date(t).toISOString().slice(0, 10);
const first = all[0], last = all[all.length - 1];
const spanDays = (last.t - first.t) / 86400000;

const byDay = {};
for (const x of all) { const k = d(x.t); byDay[k] = (byDay[k] || 0) + 1; }
const activeDays = Object.keys(byDay).length;

const gaps = [];
for (let i = 1; i < all.length; i++) {
  const h = (all[i].t - all[i - 1].t) / 3600000;
  if (h > 60) gaps.push({ from: d(all[i - 1].t), to: d(all[i].t), h: Math.round(h) });
}
gaps.sort((a, b) => b.h - a.h);

console.log('时间轴（从账本算出，不是手写）');
console.log('  第一条沉积      : ' + d(first.t) + '  ' + first.id);
console.log('  最后一条沉积    : ' + d(last.t) + '  ' + last.id);
console.log('  总跨度          : ' + spanDays.toFixed(1) + ' 天');
console.log('  有记录的日子    : ' + activeDays + ' 天');
console.log('  最长间隔        : ' + (gaps.length ? gaps.slice(0, 3).map(g => g.h + ' 小时（' + g.from + ' → ' + g.to + '）').join(' · ') : '无（没有超过 60 小时的间隔）'));

console.log('');
console.log('★ 这些数每天都在变，所以 README 不写它们，只写怎么算（就是这条命令）。');
