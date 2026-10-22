// P599 判据：这个"腐坏曲线"必须先自证三件事，否则它只是个更复杂的 S(t)
//   ① 桶边界左闭右开，且每个沉积**恰好落进一个桶**（不然合计会对不上总数）
//   ② **三种形态必须能分开**：腐坏 / 头部效应 / 持平 —— 这三种在 S(t) 上长得一样
//   ③ 退役与无时间戳必须被数出来，不许静默消失
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cohortCurve, rotVerdict, rotLine, DEFAULT_BUCKETS } from '../engine/modules/rot-metrics.mjs';

const DAY = 86400000;
const now = 1792500000000;   // 固定时刻：确定性是硬要求
const mk = (id, daysAgo, cites, extra) => Object.assign({
  id, title: 't' + id, cites: cites || 0, depositedAt: now - daysAgo * DAY
}, extra || {});

test('① 桶边界左闭右开：每个沉积恰好落进一个桶，合计 = 总数', () => {
  const list = [
    mk('A', 0), mk('B', 6.99),      // [0,7)
    mk('C', 7), mk('D', 13.9),      // [7,14)
    mk('E', 14), mk('F', 29.9),     // [14,30)
    mk('G', 30), mk('H', 59.9),     // [30,60)
    mk('I', 60), mk('J', 119.9),    // [60,120)
    mk('K', 120)                    // [120,∞)
  ];
  const c = cohortCurve(list, now, {});
  assert.equal(c.rows.length, DEFAULT_BUCKETS.length - 1);
  const sum = c.rows.reduce((a, r) => a + r.n, 0);
  assert.equal(sum, list.length, '各桶合计必须等于总数，实得 ' + sum + ' vs ' + list.length);
  assert.deepEqual(c.rows.map(r => r.n), [2, 2, 2, 2, 2, 1], '各桶条数，实得 ' + JSON.stringify(c.rows.map(r => r.n)));
  assert.equal(c.unknown, 0);
  assert.equal(c.retired, 0);
});

test('② ★三种形态必须能分开（这是本模块存在的全部理由）', () => {
  const mkCohort = (prefix, days, cited) => {
    const out = [];
    for (let i = 0; i < 6; i++) out.push(mk(prefix + i, days, cited ? 1 : 0));
    return out;
  };
  // (a) 腐坏：新的全被用过，旧的全没有
  const a = cohortCurve(mkCohort('N', 3, true).concat(mkCohort('O', 200, false)), now, {});
  assert.equal(rotVerdict(a, 5).verdict, 'rot', '新 100% / 老 0% 必须判 rot，实得 ' + rotVerdict(a, 5).verdict);
  // (b) 头部效应：老的反而全被用过
  const b = cohortCurve(mkCohort('N', 3, false).concat(mkCohort('O', 200, true)), now, {});
  assert.equal(rotVerdict(b, 5).verdict, 'head-effect');
  // (c) 持平：两桶比例一样 ⇒ 安静的库房，不是腐坏
  const c = cohortCurve(mkCohort('N', 3, false).concat(mkCohort('O', 200, false)), now, {});
  assert.equal(rotVerdict(c, 5).verdict, 'flat', '全零必须判 flat —— 否则"没人读"会被误报成"越读越少"');
  assert.match(rotVerdict(c, 5).line, /没有腐坏|安静的库房/);
});

test('③ 退役与无时间戳必须被数出来，且不进任何桶', () => {
  const list = [
    mk('A', 3), mk('B', 3),
    mk('R', 3, 0, { status: 'superseded' }),        // 退役：排除
    { id: 'X', cites: 0 },                          // 无 depositedAt：计入 unknown
    mk('Y', -5)                                     // 未来时间戳（脏数据）：计入 unknown
  ];
  const c = cohortCurve(list, now, {});
  assert.equal(c.retired, 1, '退役数，实得 ' + c.retired);
  assert.equal(c.unknown, 2, '无时间戳/未来时间戳都要计入 unknown，实得 ' + c.unknown);
  assert.equal(c.rows.reduce((a, r) => a + r.n, 0), 2, '只有两条可归层');
  assert.match(rotLine(c), /退役 1 · 无时间戳 2/);
});

test('④ adopt（真采用）也算兑现过 —— 与 cites 是两条独立通道', () => {
  const list = [mk('A', 3, 0), mk('B', 3, 0), mk('C', 3, 1), mk('D', 3, 0)];
  const noAdopt = cohortCurve(list, now, {});
  assert.equal(noAdopt.rows[0].used, 1, '只有 C 有 cites');
  const withAdopt = cohortCurve(list, now, { adoptIds: ['A', 'D'] });
  assert.equal(withAdopt.rows[0].used, 3, 'C(cites) + A,D(adopt) = 3，实得 ' + withAdopt.rows[0].used);
  assert.equal(withAdopt.rows[0].rate, 0.75);
});

test('⑤ ★负控：样本太少的桶不许参与判词（否则 1/1 会被当 100%）', () => {
  const list = [mk('A', 3, 1), mk('B', 200, 0)];   // 两个桶各 1 条
  const c = cohortCurve(list, now, {});
  const v = rotVerdict(c, 5);
  assert.equal(v.verdict, 'insufficient', '每桶 <5 条时必须 insufficient，实得 ' + v.verdict);
  assert.match(v.line, /样本不足/);
  // 放宽门槛到 1 条则应当能判（证明是门槛在起作用，不是逻辑坏了）
  assert.notEqual(rotVerdict(c, 1).verdict, 'insufficient');
});
