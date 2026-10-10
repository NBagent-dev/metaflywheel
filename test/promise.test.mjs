// P482「承诺-履行闭环」判据：个体**自己写下**的唤醒条件必须被求值、被看见、并能叫醒他。
// 运行：node --test test/promise.test.mjs
//
// 为什么这是 P482 的第一块砖：
//   查实（2026-10-10 全引擎 grep）`awakenWhen`（"搁置时的重唤醒条件"）**写入✓ 回显✓ 进快照结构✓
//   求值✗（零处） 渲染✗（快照文本里没有）**，而 `parked` 的语义恰恰是"退出陈旧/停滞/议程触发与指令流"
//   ⇒ **我写下的承诺，自己看不见、想不起、也不会被叫醒**。字段齐备、通路断裂——正是"结构性之合"的活体样本。
//   P021「冷时段的意志：睡眠期意图的延迟交付」的题目就是它自己的病。
//
// 判据里必须有的三件（缺一件就等于没做）：
//   ① **改前会红**：本文件在 promise.mjs 存在之前无法 import（红是它存在的理由）
//   ② **反事实**：清空/不写承诺 ⇒ 不唤醒（行为与引入前逐字一致）
//   ③ **不可机械判定 ≠ 已到期**：自由文本承诺永不唤醒，且必须被标为"未识别"而不是默默算成立
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalAwaken, collectAwaken } from '../engine/modules/promise.mjs';

const NOW = Date.parse('2026-10-11T00:00:00+08:00');
const env = (extra) => Object.assign({ now: NOW, sediments: [], problems: {}, exists: null }, extra || {});

// ── ① 纯求值：四种机械形式 ───────────────────────────────────────────
test('承诺求值·after：到期唤醒、未到期不唤醒', () => {
  assert.equal(evalAwaken('after:2026-10-10', env()).matched, true);
  assert.equal(evalAwaken('after:2026-10-12', env()).matched, false);
  assert.equal(evalAwaken('after:2026/10/10', env()).matched, true, '斜杠日期也要认');
});

test('承诺求值·cites：沉积被引用才算成立，沉积不存在时不得假装成立', () => {
  assert.equal(evalAwaken('cites:P1-M1', env({ sediments: [{ id: 'P1-M1', cites: 2 }] })).matched, true);
  assert.equal(evalAwaken('cites:P1-M1', env({ sediments: [{ id: 'P1-M1', cites: 0 }] })).matched, false);
  const miss = evalAwaken('cites:NOPE-M0', env());
  assert.equal(miss.matched, false, '沉积不存在 ⇒ 不唤醒');
  assert.equal(miss.evaluable, 0, '且应记为"无法判定"，不是"未到期"');
});

test('承诺求值·epsilon：四个比较符都对', () => {
  const e = env({ problems: { P900: { epsilon: 0.2 } } });
  assert.equal(evalAwaken('epsilon:P900<0.3', e).matched, true);
  assert.equal(evalAwaken('epsilon:P900<=0.2', e).matched, true);
  assert.equal(evalAwaken('epsilon:P900>0.3', e).matched, false);
  assert.equal(evalAwaken('epsilon:P900>=0.2', e).matched, true);
  assert.equal(evalAwaken('epsilon:P901<0.3', e).matched, false, '题不存在 ⇒ 不唤醒');
});

test('承诺求值·exists：文件出现才算成立；没有探测器时不假装成立', () => {
  assert.equal(evalAwaken('exists:C:/x/y.md', env({ exists: () => true })).matched, true);
  assert.equal(evalAwaken('exists:C:/x/y.md', env({ exists: () => false })).matched, false);
  assert.equal(evalAwaken('exists:C:/x/y.md', env()).matched, false, '无探测器 ⇒ 不唤醒');
});

test('承诺求值·自由文本永不唤醒（不可机械判定 ≠ 已到期）', () => {
  const r = evalAwaken('等我把手头的事做完再说', env());
  assert.equal(r.matched, false);
  assert.equal(r.evaluable, 0);
  assert.deepEqual(r.unknown, ['等我把手头的事做完再说'], '必须被标为未识别，而不是默默丢掉');
  assert.equal(evalAwaken('', env()).matched, false);
  assert.equal(evalAwaken(null, env()).matched, false);
});

test('承诺求值·多子句是"或"：任一成立即唤醒', () => {
  const r = evalAwaken('after:2026-12-31；cites:P1-M1', env({ sediments: [{ id: 'P1-M1', cites: 1 }] }));
  assert.equal(r.matched, true);
  assert.equal(r.hits.length, 1);
  assert.ok(r.unknown.length === 0);
});

// ── ② collectAwaken：只碰搁置题，且不重复叫 ──────────────────────────
function mkState(problems) { return { problems: problems, sediments: [] }; }
const parkedWith = (expr) => ({ id: 'P900', stage: 'S', epsilon: 0.3, updatedAt: NOW - 3600e3, parked: { at: NOW - 3600e3, awakenWhen: expr } });

test('collectAwaken·未写承诺的搁置题：一个字都不改（与引入前一致）', () => {
  const st = mkState({ P900: parkedWith('') });
  assert.deepEqual(collectAwaken(st, NOW, {}), []);
  assert.equal(st.problems.P900.awake, undefined);
});

test('collectAwaken·自由文本承诺：不唤醒（反例）', () => {
  const st = mkState({ P900: parkedWith('等我有空') });
  assert.deepEqual(collectAwaken(st, NOW, {}), []);
  assert.equal(st.problems.P900.awake, undefined);
});

test('collectAwaken·到期即标记并把溯源写进去；同一承诺不重复叫', () => {
  const st = mkState({ P900: parkedWith('after:2026-10-10') });
  const fired = collectAwaken(st, NOW, {});
  assert.equal(fired.length, 1);
  assert.equal(fired[0].id, 'P900');
  assert.equal(st.problems.P900.awake.expr, 'after:2026-10-10', '溯源要留着原话');
  assert.ok(String(st.problems.P900.awake.why).includes('时间已到'));
  assert.deepEqual(collectAwaken(st, NOW + 60000, {}), [], '已经叫过的不再重复叫');
});

test('collectAwaken·反事实：抹掉承诺 ⇒ 不再唤醒（今晚的判据姿势）', () => {
  const st = mkState({ P900: parkedWith('after:2026-10-10') });
  assert.equal(collectAwaken(st, NOW, {}).length, 1);
  st.problems.P900.awake = undefined;
  st.problems.P900.parked.awakenWhen = '';       // 抹掉那条自我承诺
  assert.deepEqual(collectAwaken(st, NOW, {}), [], '抹掉承诺后该行动不再发生');
});

test('collectAwaken·改写承诺要重新求值（旧 awake 不得冒充新承诺）', () => {
  const st = mkState({ P900: parkedWith('after:2030-01-01') });
  st.problems.P900.awake = { at: NOW - 999, why: '旧的', expr: 'after:2020-01-01' };
  assert.deepEqual(collectAwaken(st, NOW, {}), [], '新承诺未到期 ⇒ 不许沿用旧 awake');
  assert.equal(st.problems.P900.awake, null, '旧标记应被清掉');
});

test('collectAwaken·不碰未搁置的题（承诺只在搁置语境下有意义）', () => {
  const st = mkState({ P900: { id: 'P900', stage: 'S', parked: null, awakenWhen: 'after:2020-01-01' } });
  assert.deepEqual(collectAwaken(st, NOW, {}), []);
});

// ── ③ user: 形式（"用户给出答复时"这一族的机械形式）────────────────
// 成因（2026-10-10 实测）：12 条自由文本承诺里最多的一族就是「用户给出答复时」
// （P413/P472/P355/P076/P025/P050）。而引擎**本来就在观测用户消息**
// （perception.lastInboxAt / inboxCount）⇒ 这一族的"写不出来"不是能力问题，是没人把它接上。
test('承诺求值·user:reply：我写下承诺之后用户回过话才算成立', () => {
  const r0 = evalAwaken('user:reply', env());
  assert.equal(r0.matched, false, '没有 perception ⇒ 不唤醒');
  assert.equal(r0.evaluable, 0, '且记为无法判定，不是"未到期"');

  const st = mkState({ P900: parkedWith('user:reply') });      // parked.at = NOW-3600e3
  assert.deepEqual(collectAwaken(st, NOW, { perception: { lastInboxAt: NOW - 7200e3 } }), [],
    '用户在我写下承诺**之前**说过话 ⇒ 不算成立');
  const fired = collectAwaken(st, NOW, { perception: { lastInboxAt: NOW - 600e3 } });
  assert.equal(fired.length, 1, '用户在我写下承诺**之后**说过话 ⇒ 成立');
  assert.ok(String(st.problems.P900.awake.why).includes('用户'), '溯源要写明是用户回过话');
});

test('承诺求值·user: 只认 reply 这一种写法，别的算未识别（不许猜）', () => {
  const r = evalAwaken('user:count>=3', env({ perception: { lastInboxAt: NOW } }));
  assert.equal(r.matched, false);
  assert.equal(r.evaluable, 0);
});

test('collectAwaken·每轮最多叫醒 2 条（最老的承诺优先），其余下轮——防承诺炮', () => {
  const mk = (i, at) => ({ id: 'P80' + i, stage: 'S', updatedAt: at, parked: { at: at, awakenWhen: 'after:2020-01-01' } });
  const st = mkState({ P800: mk(0, NOW - 5e6), P801: mk(1, NOW - 4e6), P802: mk(2, NOW - 3e6) });
  const fired = collectAwaken(st, NOW, {});
  assert.equal(fired.length, 2, '本轮只叫醒 2 条');
  assert.equal(fired[0].id, 'P800', '最老的承诺优先');
  assert.equal(fired.deferred, 1, '其余条数要报出来，不能悄悄吞掉');
  assert.equal(st.problems.P802.awake, undefined, '未叫醒的不许先打标记（否则下轮就叫不动了）');
  const next = collectAwaken(st, NOW + 1000, {});
  assert.equal(next.length, 1, '下一轮接着叫');
  assert.equal(next[0].id, 'P802');
});
