// P593 判据：议程权重外置 + 贡献占比诊断
//
// ★ 这条判据要证明的不是"新模块能算权重"，而是三件更难的事：
//   ① **不调 = 行为不变**（默认值必须等于原来写死的那四个数，否则这不是外置而是改行为）；
//   ② **调了真的变**（改一个系数，议程的排序必须真的翻转 —— 否则外置只是个摆设，
//      而"新模块在旁边正确运行"是最容易骗过人的假进展）；
//   ③ **主导会报警，分布均衡不报警**（负控：一个恒报警的实现也能通过 ①）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AGENDA_WEIGHTS, DOMINANT_PCT, normalizeAgendaWeights, weightOf, breakdown, breakdownLine
} from '../engine/modules/agenda-weights.mjs';
import { innerAgenda } from '../engine/modules/agenda.mjs';

const DAY = 24 * 3600 * 1000;

/** 一个同时含"未核"与"零引用沉积"的最小状态（两种来源各一条，好比较它们的相对位置）。 */
function fixture() {
  const now = Date.now();
  return {
    now: now,
    state: {
      unknowns: [{ id: 'U1', at: now - 1000, key: 'K', text: '单位口径未验', until: '拿到样本', resolvedAt: null }],
      sediments: [{ id: 'S1', title: '旧沉积', cites: 0, depositedAt: now - 20 * DAY }],
      hits: [],
      problems: {}
    }
  };
}

const kindsOf = (items) => items.map(function (x) { return x.kind; });

test('① 默认值必须等于原来写死的那四个数（不调 = 行为不变）', () => {
  assert.equal(DEFAULT_AGENDA_WEIGHTS['unknown'].base, 30);
  assert.equal(DEFAULT_AGENDA_WEIGHTS['hit-repeat'].base, 20);
  assert.equal(DEFAULT_AGENDA_WEIGHTS['hit-repeat'].per, 1);
  assert.equal(DEFAULT_AGENDA_WEIGHTS['hit-open'].base, 40);
  assert.equal(DEFAULT_AGENDA_WEIGHTS['hit-open'].per, 1);
  assert.equal(DEFAULT_AGENDA_WEIGHTS['sediment-stale'].base, 10);
  // 代入原表达式必须逐字相等：20 + owed / 40 + nObj
  assert.equal(20 + 3, weightOf('hit-repeat', 3, null));
  assert.equal(40 + 2, weightOf('hit-open', 2, null));
  assert.equal(30, weightOf('unknown', 1, null));
  assert.equal(10, weightOf('sediment-stale', 1, null));
});

test('② ★调了真的变：把零引用沉积的系数抬高，排序必须翻转', () => {
  const f = fixture();
  const base = innerAgenda(f.state, f.now);
  assert.deepEqual(kindsOf(base), ['unknown', 'sediment-stale'],
    '默认权重下 未核(30) 应排在 零引用沉积(10) 前面。实得：' + JSON.stringify(base.map(x => [x.kind, x.weight])));

  const W = normalizeAgendaWeights({ 'sediment-stale': { base: 99, per: 0 } }).weights;
  const tuned = innerAgenda(Object.assign({}, f.state, { agendaWeights: W }), f.now);
  assert.deepEqual(kindsOf(tuned), ['sediment-stale', 'unknown'],
    '抬高系数后排序必须翻转（否则"外置"只是个摆设）。实得：' + JSON.stringify(tuned.map(x => [x.kind, x.weight])));
  assert.equal(tuned[0].weight, 99, '权重必须真的用上了外部值');
});

test('③ ★负控：非法权重回退默认并报出来（不静默修正）', () => {
  const a = normalizeAgendaWeights({ 'hit-open': { base: -5, per: 'x' } });
  assert.equal(a.weights['hit-open'].base, DEFAULT_AGENDA_WEIGHTS['hit-open'].base, '负 base 必须回退默认');
  assert.equal(a.weights['hit-open'].per, DEFAULT_AGENDA_WEIGHTS['hit-open'].per, '非数字 per 必须回退默认');
  assert.ok(a.problems.length >= 2, '两个非法值都必须报出来，实得：' + JSON.stringify(a.problems));
  // 负控的反面：完全合法的输入不该产生"问题"
  const b = normalizeAgendaWeights({ 'hit-open': { base: 50, per: 2 } });
  assert.equal(b.problems.length, 0, '合法输入不许报问题（否则警告会变成噪音）');
  assert.equal(b.weights['hit-open'].base, 50);
  // 未知来源被忽略但必须报
  const c = normalizeAgendaWeights({ 'no-such-kind': { base: 1, per: 1 } });
  assert.equal(c.problems.length, 1);
  assert.match(c.problems[0], /no-such-kind/);
});

test('④ 贡献占比：百分比之和≈100，且主导会报警 / 均衡不报警', () => {
  const single = breakdown([{ kind: 'a', weight: 100 }]);
  assert.equal(single.rows[0].pct, 100);
  assert.ok(single.dominant, '单一来源 100% 必须被判为主导');

  const balanced = breakdown([
    { kind: 'a', weight: 30 }, { kind: 'b', weight: 25 },
    { kind: 'c', weight: 25 }, { kind: 'd', weight: 20 }
  ]);
  assert.equal(balanced.dominant, null, '四项均衡（最高 30% < ' + DOMINANT_PCT + '%）不许报警');
  assert.equal(balanced.total, 100);
  const sum = balanced.rows.reduce(function (s, r) { return s + r.pct; }, 0);
  assert.ok(Math.abs(sum - 100) < 0.5, '百分比之和应≈100，实得 ' + sum);

  const top = breakdown([{ kind: 'a', weight: 80 }, { kind: 'b', weight: 20 }]);
  assert.ok(top.dominant, '80% 必须被判为主导');
  assert.match(breakdownLine([{ kind: 'a', weight: 80 }, { kind: 'b', weight: 20 }]), /单项主导/);
  assert.match(breakdownLine([{ kind: 'a', weight: 1 }]), /分布健康|单项最|主导/);
});

test('⑤ 边界：空议程、零权重、缺字段都不许抛', () => {
  assert.equal(breakdown([]).rows.length, 0);
  assert.equal(breakdown([]).dominant, null);
  assert.match(breakdownLine([]), /空/);
  assert.equal(breakdown([{ kind: 'a', weight: 0 }]).rows.length, 0, '零权重不该进占比（否则会多出一行 0%）');
  assert.equal(breakdown([null, undefined, { kind: 'a', weight: 5 }]).rows.length, 1, '脏条目必须被跳过而不是抛');
  assert.equal(weightOf('no-such-kind', 1, null), 0, '未知来源权重为 0，不许抛');
});
