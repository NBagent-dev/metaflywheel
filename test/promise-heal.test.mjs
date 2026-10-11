// P482⑨ 自愈判据：**账本的聚合数字必须能从原始事实重算，不能只靠累加器。**
// 运行：node --test test/promise-heal.test.mjs
//
// 为什么立这条判据（2026-10-11 实机）：
//   快照显示「已叫醒 1 · 已履行 0」，而上一轮明明是「已履行 1」。
//   查下来：`honoredTotal` 是**累加器**，12:13 那次因"白名单重建"把 measure.promiseStats 擦成 0
//   ⇒ 之后每次审计都是 `0 + 0` ⇒ **聚合数字永久失真**。而事实（P021 的 `awake.done`）明明还在。
//   ⇒ 原则：**累加器可以被擦，事实不能；所以聚合量必须能从事实重算。**
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditAwaken } from '../engine/modules/promise.mjs';

const T0 = 1700000000000;
function mk(problems, rounds) {
  return { problems: problems, patrol: { rounds: rounds || 5, lastAt: T0, lastReport: '' }, measure: { samples: [], driftSignals: [] } };
}

test('累加器被擦成 0 ⇒ 下次审计从事实重建（自愈）', () => {
  const s = mk({
    P1: { id: 'P1', stage: 'S', updatedAt: T0 + 1, cost: 10, parked: { at: 1, awakenWhen: 'after:2020-01-01' },
      awake: { at: T0, why: 'x', expr: 'after:2020-01-01', done: true, doneAt: T0 + 1 } }
  }, 5);
  s.measure.promiseStats = { honoredTotal: 0, overdueTotal: 0 };      // 被擦过的累加器
  const r = auditAwaken(s, T0 + 10, {});
  assert.ok(r.stats.honoredTotal >= 1, '事实里有一条 done ⇒ 必须重算出来：' + JSON.stringify(r.stats));
});

test('累加器比事实大 ⇒ 取较大值（历史不倒退）', () => {
  const s = mk({}, 5);
  s.measure.promiseStats = { honoredTotal: 7, overdueTotal: 3 };
  const r = auditAwaken(s, T0 + 10, {});
  assert.equal(r.stats.honoredTotal, 7, '没有事实可重算时不该把历史抹掉');
  assert.equal(r.stats.overdueTotal, 3);
});

test('逾期同样能从事实重算（awake.overdue 累加）', () => {
  const s = mk({
    P2: { id: 'P2', stage: 'S', updatedAt: T0 - 999, cost: 1, parked: { at: 1, awakenWhen: 'after:2020-01-01' },
      awake: { at: T0, why: 'x', expr: 'after:2020-01-01', round: 1, costAt: 1, overdue: 4 } }
  }, 5);
  s.measure.promiseStats = { honoredTotal: 0, overdueTotal: 0 };
  const r = auditAwaken(s, T0 + 10, {});
  assert.ok(r.stats.overdueTotal >= 4, '事实里 overdue=4 ⇒ 必须重算：' + JSON.stringify(r.stats));
});

test('反例：没有任何 awake ⇒ 不自造数字（0 就是 0）', () => {
  const s = mk({ P3: { id: 'P3', stage: 'S', updatedAt: T0, cost: 1 } }, 5);
  const r = auditAwaken(s, T0 + 10, {});
  assert.equal(r.stats.honoredTotal, 0);
  assert.equal(r.stats.overdueTotal, 0);
  assert.equal(r.stats.woken, 0);
});
