// P599 · "记忆腐坏"的正确量法：**按年龄分层的兑现率**
//
// ★ 为什么 S(t) 不行（P598 实测）：S(t) 的 97.6% 来自「过期沉积数 × 0.5」。
//   于是"S 上升"只说明**库房变大**，不说明"我忘得更快"。
//   ⇒ 一个指数如果对"积累"和"腐坏"给出同一个方向，它就分不开这两件事。
//
// ★ 分开它们只需要一个维度：**年龄**。
//   把沉积按 depositedAt 分成年限桶，看每桶里"曾经被兑现过"的比例：
//     · 若老桶比例明显低于新桶 ⇒ **真的在腐坏**（新东西被读到，旧的被埋）
//     · 若各桶比例接近       ⇒ **没有腐坏，只是均匀地没被读**（安静的库房）
//     · 若老桶反而更高       ⇒ 常引的就那几条，其余从未被读（头部效应）
//   ⇒ 这三种在 S(t) 上长得一模一样，在这个曲线上完全不同。
//
// ★ "被兑现过"的口径（写死，免得含糊扩大）：
//   ① `cites > 0`（M9② 的兑现计数：新题引用了它，或标题 bigram 命中 ≥60%）
//   ② 或出现在 `adopts` 里（P526：动手前检索并真的采用）
//   ⇒ 两者都不是"被读过一次"（引擎没有这个信号），而是"被用过"。
//   ⇒ 所以本模块量的是**兑现率**，不是阅读率。写清楚，免得被当成更大的东西。
import { isRetired } from './sediment-status.mjs';

const DAY = 86400000;

/** 默认年龄桶（天）：边界左闭右开；末桶为 `Infinity`。 */
export const DEFAULT_BUCKETS = [0, 7, 14, 30, 60, 120, Infinity];

/**
 * 按年龄分层的兑现率曲线。
 * @param sediments 沉积数组（可含退役项，会被排除并计数）
 * @param now 毫秒时间戳
 * @param opts {buckets, adoptIds:Set|Array, citeOf:fn}
 */
export function cohortCurve(sediments, now, opts) {
  const o = opts || {};
  const buckets = (Array.isArray(o.buckets) && o.buckets.length >= 2) ? o.buckets.slice() : DEFAULT_BUCKETS.slice();
  const adoptSet = (o.adoptIds instanceof Set) ? o.adoptIds : new Set(Array.isArray(o.adoptIds) ? o.adoptIds : []);
  const citeOf = (typeof o.citeOf === 'function') ? o.citeOf : function (s) { return (s && typeof s.cites === 'number') ? s.cites : 0; };
  const t = (typeof now === 'number' && now > 0) ? now : Date.now();

  const rows = [];
  for (let i = 0; i < buckets.length - 1; i++) {
    rows.push({ lo: buckets[i], hi: buckets[i + 1], n: 0, used: 0, rate: 0 });
  }
  let retired = 0, unknown = 0;
  const list = Array.isArray(sediments) ? sediments : [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (isRetired(s)) { retired += 1; continue; }
    const at = (s && typeof s.depositedAt === 'number' && s.depositedAt > 0) ? s.depositedAt : 0;
    if (!at) { unknown += 1; continue; }   // ★ 不许静默丢掉：没有时间的沉积无法归层
    const age = (t - at) / DAY;
    if (age < 0) { unknown += 1; continue; }   // 未来时间戳 = 脏数据，同样计入 unknown
    let idx = -1;
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      // 左闭右开；末桶 hi=Infinity 自然兜住
      if (age >= r.lo && (r.hi === Infinity ? true : age < r.hi)) { idx = j; break; }
    }
    if (idx < 0) { unknown += 1; continue; }
    rows[idx].n += 1;
    const used = (citeOf(s) > 0) || adoptSet.has(String(s && s.id ? s.id : ''));
    if (used) rows[idx].used += 1;
  }
  for (let i = 0; i < rows.length; i++) {
    rows[i].rate = rows[i].n ? Math.round((rows[i].used / rows[i].n) * 1000) / 1000 : null;
  }
  return { rows: rows, retired: retired, unknown: unknown, total: list.length - retired - unknown };
}

/**
 * 判词：比较"最老的有样本桶"与"最新的有样本桶"。
 * ★ 必须给区间，且必须说明这只是**截面**——它分不清"旧的被埋"与"旧的当年就没人用"。
 */
export function rotVerdict(curve, minN) {
  const need = (typeof minN === 'number' && minN > 0) ? minN : 5;
  const ok = (curve && Array.isArray(curve.rows)) ? curve.rows.filter(function (r) { return r.rate !== null && r.n >= need; }) : [];
  if (ok.length < 2) {
    return { verdict: 'insufficient', line: '样本不足（每个年龄桶至少 ' + need + ' 条才判）：可用桶 ' + ok.length + ' 个' };
  }
  const newest = ok[0];
  const oldest = ok[ok.length - 1];
  const gap = Math.round((oldest.rate - newest.rate) * 1000) / 1000;
  let verdict;
  if (gap <= -0.15) verdict = 'rot';
  else if (gap >= 0.15) verdict = 'head-effect';
  else verdict = 'flat';
  const label = verdict === 'rot' ? '老沉积的兑现率明显更低 ⇒ 形如腐坏（但只是截面，见下）'
    : verdict === 'head-effect' ? '老沉积的兑现率反而更高 ⇒ 头部效应，不是腐坏'
    : '各年龄桶兑现率接近 ⇒ 没有腐坏，只是均匀地没被读（安静的库房）';
  const span = '[' + (newest.lo) + '-' + (newest.hi === Infinity ? '∞' : newest.hi) + '天] ' + Math.round(newest.rate * 1000) / 10 + '%'
    + ' vs [' + oldest.lo + '-' + (oldest.hi === Infinity ? '∞' : oldest.hi) + '天] ' + Math.round(oldest.rate * 1000) / 10 + '%'
    + '（差 ' + (gap > 0 ? '+' : '') + Math.round(gap * 1000) / 10 + ' 个百分点）';
  return {
    verdict: verdict, gap: gap, newest: newest, oldest: oldest,
    line: label + '：' + span
      + '。★ 这是**截面**：它分不清"旧的被埋"与"旧的当年就没人用"——要分开需要逐月快照，而账本没有这个历史。'
  };
}

/** 一行摘要（桶明细 + 排除项）。 */
export function rotLine(curve) {
  if (!curve || !Array.isArray(curve.rows)) return '无数据';
  const parts = curve.rows.map(function (r) {
    if (!r.n) return '[' + r.lo + '-' + (r.hi === Infinity ? '∞' : r.hi) + ']无样本';
    return '[' + r.lo + '-' + (r.hi === Infinity ? '∞' : r.hi) + ']' + r.used + '/' + r.n
      + '(' + Math.round(r.rate * 1000) / 10 + '%)';
  });
  return parts.join(' · ') + '　｜ 排除：退役 ' + curve.retired + ' · 无时间戳 ' + curve.unknown;
}
