// P600 判据：首尾比较会吞掉中间的低谷 —— 而那个低谷恰恰是唯一有信息的部分
//
// ★ 为什么单列一条：真账本第一次跑就抓到我这个缺陷。
//   曲线是 [0-7]20% · [7-14]18.6% · [14-30]**5.3%** · [30-60]22.5%
//   ⇒ 首尾只差 +2.5pp ⇒ 旧函数判 'flat'（"均匀地没被读"）
//   ⇒ 而真相是**某一年龄段被整段跳过**（152 条里只有 8 条被用过），
//     且兑现率最高的是**最老的桶** ⇒ 既不是腐坏，也不是均匀。
//
// ★ 因此要钉三件事：
//   ① 中间有低谷 ⇒ 判 'structured'，且 trough 字段必须指出是哪一桶；
//   ② ★负控：**均匀低**（各桶都 0）不许被判成 structured —— 否则"没人读"会被误报成结构；
//   ③ ★负控：低谷不显著（只低一点点）也不许报 —— 阈值必须真的在起作用。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cohortCurve, rotVerdict } from '../engine/modules/rot-metrics.mjs';

const DAY = 86400000;
const now = 1792500000000;
const mk = (id, daysAgo, cites) => ({ id, title: 't' + id, cites: cites ? 1 : 0, depositedAt: now - daysAgo * DAY });

// 6 条/桶：避免落进 minN 以下的"样本不足"
const cohort = (prefix, days, usedCount, total) => {
  const out = [];
  for (let i = 0; i < total; i++) out.push(mk(prefix + i, days, i < usedCount));
  return out;
};

test('① 中间低谷必须被判成 structured，并指出是哪一桶（真账本形态）', () => {
  // [0-7] 高 · [7-14] 高 · [14-30] 极低 · [30-60] 高   —— 与真账本同形
  const list = []
    .concat(cohort('A', 3, 2, 10))     // 20%
    .concat(cohort('B', 10, 2, 10))    // 20%
    .concat(cohort('C', 20, 0, 10))    // 0%  ← 低谷
    .concat(cohort('D', 40, 2, 10));   // 20%
  const c = cohortCurve(list, now, {});
  const v = rotVerdict(c, 5);
  assert.equal(v.verdict, 'structured', '中间塌一格必须判 structured，实得 ' + v.verdict);
  assert.ok(v.trough, 'trough 字段必须存在');
  assert.equal(v.trough.lo, 14, '低谷必须是 [14-30] 那一桶，实得 ' + v.trough.lo);
  assert.match(v.line, /低谷/);
});

test('② ★负控：均匀低（全 0）不许被判成 structured', () => {
  const list = []
    .concat(cohort('A', 3, 0, 10))
    .concat(cohort('B', 10, 0, 10))
    .concat(cohort('C', 20, 0, 10))
    .concat(cohort('D', 40, 0, 10));
  const v = rotVerdict(cohortCurve(list, now, {}), 5);
  assert.equal(v.verdict, 'flat', '全零必须仍是 flat —— 否则"没人读"会被误报成结构，实得 ' + v.verdict);
  assert.equal(v.trough, null, '全零时不该有 trough');
});

test('③ ★负控：低谷不显著（只低一点点）不许报，阈值必须真在起作用', () => {
  const list = []
    .concat(cohort('A', 3, 5, 10))     // 50%
    .concat(cohort('B', 10, 5, 10))    // 50%
    .concat(cohort('C', 20, 4, 10))    // 40%  ← 只低 20%，不到 0.6 倍
    .concat(cohort('D', 40, 5, 10));   // 50%
  const v = rotVerdict(cohortCurve(list, now, {}), 5);
  assert.equal(v.verdict, 'flat', '40% vs 50% 不算结构性低谷，实得 ' + v.verdict);
  assert.equal(v.trough, null);
});
