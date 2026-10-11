// P482⑨ 最后一米判据：**叫醒之后的履行，必须与"无视"在账本里长得不一样。**
// 运行：node --test test/promise-audit.test.mjs
//
// 缺口（promise.mjs:142 实证）：
//   `if (p.awake && p.awake.expr === expr) continue;`  ← 同一承诺不重复叫（对）
//   但叫醒之后**没有下文**：我做了 → awake 不清；我无视 → 不升级、不计数、不进信号。
//   ⇒ 「履行」与「无视」在账本里状态相同 ⇒ 承诺成了只出声不结账的东西。
//
// 为什么这算"解决最后一米"而不是绕过：
//   我不能改模型（构成性立场），所以"想不想做"不可控；但**"做了没有"可以机械判定**：
//   该题代价是否增长、是否登记过 solve、updatedAt 是否推进 —— 三个都是账本里的现成字段。
//   ⇒ 最后一米的结构解不是"让我更自觉"，而是**让不做留下痕迹、并且会累积、会升级**。
//
// 四条判据（缺一条就等于没做）：
//   ① 履行 ⇒ **清账**（标 done），且**不再重复叫醒**（否则同一条件每轮都叫）
//   ② 无视 ⇒ 满 OVERDUE_ROUNDS 轮 ⇒ 记一次逾期（次数累积、理由可读、进 drift 信号）
//   ③ 反例：**从没被叫醒的题永不被统计**（未叫醒 ≠ 未履行）
//   ④ 反例：**已清账的条目不许再累计逾期**（否则"迟做"会被追认为"没做"）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditAwaken, collectAwaken, OVERDUE_ROUNDS } from '../engine/modules/promise.mjs';

const T0 = 1700000000000;
function mkState(problems, rounds) {
  return { problems: problems, patrol: { rounds: rounds || 3, lastAt: T0, lastReport: '' }, measure: { samples: [], driftSignals: [] }, sediments: [] };
}
const woken = (at, extra) => Object.assign({ at: at, why: '时间已到', expr: 'after:2020-01-01', round: 1 }, extra || {});

test('①履行 ⇒ 清账，且同一承诺不再重复叫醒', () => {
  const st = mkState({
    P1: { id: 'P1', stage: 'S', updatedAt: T0 + 1000, cost: 50, parked: { at: T0 - 9e5, awakenWhen: 'after:2020-01-01' }, awake: woken(T0, { costAt: 40 }) }
  }, 3);
  const r = auditAwaken(st, T0 + 2000, {});
  assert.deepEqual(r.overdue, [], '有推进就不该记逾期');
  assert.equal(r.honored.length, 1, '必须记一次"已履行"：' + JSON.stringify(r));
  assert.equal(st.problems.P1.awake.done, true, '清账：标 done');
  // 不再重复叫醒：同一 expr 已交付
  const again = collectAwaken(st, T0 + 3000, {});
  assert.equal(again.length, 0, '已履行的承诺不许每轮重叫');
});

test('②无视 ⇒ 满 2 轮记一次逾期，理由可读、次数累积', () => {
  const st = mkState({
    P2: { id: 'P2', stage: 'S', updatedAt: T0 - 1000, cost: 40, parked: { at: T0 - 9e5, awakenWhen: 'after:2020-01-01' }, awake: woken(T0, { costAt: 40, round: 1 }) }
  }, 2);   // 轮次 2 − 叫醒轮 1 = 1 < 2 ⇒ 还不算逾期
  const r1 = auditAwaken(st, T0 + 1000, {});
  assert.deepEqual(r1.overdue, [], '未满 ' + OVERDUE_ROUNDS + ' 轮不算逾期（不能冤枉自己）');
  st.patrol.rounds = 3;   // 3 − 1 = 2 ⇒ 逾期
  const r2 = auditAwaken(st, T0 + 2000, {});
  assert.equal(r2.overdue.length, 1, '满轮必须记逾期：' + JSON.stringify(r2));
  assert.match(r2.overdue[0].why, /无推进/);
  assert.equal(st.problems.P2.awake.overdue, 1);
  const r3 = auditAwaken(st, T0 + 3000, {});
  assert.equal(st.problems.P2.awake.overdue, 2, '逾期次数要累积（看得见恶化）');
  assert.equal(r3.overdue[0].times, 2);
});

test('③反例：从没被叫醒的题永不被统计（未叫醒 ≠ 未履行）', () => {
  const st = mkState({
    P3: { id: 'P3', stage: 'S', updatedAt: T0 - 5e6, cost: 10, parked: { at: T0 - 9e5, awakenWhen: 'after:2099-01-01' } }
  }, 99);
  const r = auditAwaken(st, T0, {});
  assert.deepEqual(r.overdue, []);
  assert.deepEqual(r.honored, []);
  assert.equal(r.stats.woken, 0, '没叫醒过就不该出现在履行统计里');
});

test('④反例：已清账的条目不许再累计逾期（迟做 ≠ 没做）', () => {
  const st = mkState({
    P4: { id: 'P4', stage: 'S', updatedAt: T0 + 500, cost: 99, parked: { at: T0 - 9e5, awakenWhen: 'after:2020-01-01' }, awake: woken(T0, { costAt: 40, round: 1, done: true, doneAt: T0 + 500 }) }
  }, 50);
  const r = auditAwaken(st, T0 + 6000, {});
  assert.deepEqual(r.overdue, [], '已履行的不许被追认成逾期');
  assert.equal(r.stats.honored, 0, '已清账的不重复计入履行');
});

test('统计行：已履行/逾期 必须可比（否则"没做"看不见）', () => {
  const st = mkState({
    P5: { id: 'P5', stage: 'S', updatedAt: T0 + 10, cost: 60, parked: { at: 1, awakenWhen: 'after:2020-01-01' }, awake: woken(T0, { costAt: 50, round: 1 }) },
    P6: { id: 'P6', stage: 'S', updatedAt: T0 - 10, cost: 50, parked: { at: 1, awakenWhen: 'after:2020-01-01' }, awake: woken(T0, { costAt: 50, round: 1 }) }
  }, 5);
  const r = auditAwaken(st, T0 + 20, {});
  assert.equal(r.stats.woken, 2);
  assert.equal(r.stats.honoredThisRound, 1);
  assert.equal(r.stats.overdueThisRound, 1);
  assert.ok(r.line.indexOf('已履行 1') >= 0 && r.line.indexOf('逾期 1') >= 0, '快照行要同时给出两边：' + r.line);
});
