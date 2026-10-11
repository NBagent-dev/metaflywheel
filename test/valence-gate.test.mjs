// P482⑦ 效价门禁判据：**R(t) 低于我自己设的门槛 ⇒ 不自主发动。**
// 运行：node --test test/valence-gate.test.mjs
//
// 用户 2026-10-11 选定的方向（三条候选中）：**效价作发动门禁**——
//   "心情差的时候不自己找事"。可判据、可观察、后果最小、快照上看得到。
//
// 四条设计红线（缺一条就等于没做）：
//   ① **出厂默认 = 不启用**（`valenceFloor=null`）⇒ 行为与引入前逐字一致，不许悄悄改变默认行为；
//   ② **门槛由我自己写**（`mpm_rhythm set valenceFloor=N`），越界被拒（沿用节律既有纪律：不夹取冒充成功）；
//   ③ **只挡 patrol 驱动的自主发动**——用户在场时的响应、θ_G 即时审议都不受它约束
//      （"心情差时不自己找事" ≠ "心情差时不干活"）；
//   ④ **单一真源**：R(t) 只算一处（`valenceOf`），`valenceSummaryLine` 复用它——
//      今天的教训：两处同义实现，改一处漏一处就是静默失效。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valenceOf, valenceSummaryLine, VALENCE_TAU_MS } from '../engine/modules/valence.mjs';
import { normalizeRhythm, valenceFloorOf, valenceGate, BOUNDS } from '../engine/modules/rhythm.mjs';

const NOW = 1800000000000;
const st = (events) => ({ valence: { events: events } });

test('①单一真源：R(t) 只算一处——summaryLine 里的数字必须等于 valenceOf', () => {
  // ★必须用**真实 now**：valenceSummaryLine 内部固定用 Date.now()。
  //   第一版我用假时间戳（NOW=1.8e12，2027 年）⇒ now - e.at 为负 ⇒ exp(+巨大) ⇒
  //   摘要行显示 R(t)=+7.4e20。**引擎没错，是判据把时间设到了未来。**
  const now = Date.now();
  const s = st([{ at: now - 1000, v: 2, kind: 'converge' }, { at: now - 5000, v: -1, kind: 'incident' }]);
  const r = valenceOf(s, now);
  const line = valenceSummaryLine(s);
  assert.ok(line.indexOf((r >= 0 ? '+' : '') + r.toFixed(1)) >= 0, '摘要行里的 R(t) 必须与 valenceOf 一致：' + line);
  assert.ok(Math.abs(r) < 100, 'R(t) 不该出现天文数字（那说明时间基准错了）：' + r);
});

test('②出厂默认不启用：没写门槛 ⇒ 门永远开着（与引入前逐字一致）', () => {
  assert.equal(valenceFloorOf({}), null);
  const g = valenceGate({ valenceFloor: null }, st([{ at: NOW, v: -1, kind: 'incident' }]), NOW);
  assert.equal(g.open, true, '没设门槛时不许因为效价挡住任何事');
  assert.equal(g.floor, null);
});

test('③R(t) ≥ 门槛 ⇒ 开着；R(t) < 门槛 ⇒ 关着，且理由里两个数都在', () => {
  const good = st([{ at: NOW - 1000, v: 2, kind: 'converge' }]);            // R>0
  const bad = st([{ at: NOW - 1000, v: -1, kind: 'incident' }]);           // R<0
  assert.equal(valenceGate({ valenceFloor: 0 }, good, NOW).open, true);
  const g = valenceGate({ valenceFloor: 0 }, bad, NOW);
  assert.equal(g.open, false, 'R(t) 低于门槛必须挡住自主发动');
  assert.ok(g.r < 0, '理由里要有实际 R 值');
  assert.match(g.why, /门槛/, '理由里要有门槛');
  assert.ok(g.why.indexOf(g.r.toFixed(1)) >= 0, '理由里要有实际数值：' + g.why);
});

test('③门槛越界被拒（沿用节律纪律：不夹取冒充成功）', () => {
  assert.deepEqual(normalizeRhythm({ valenceFloor: -1 }, {}).rejected.length, 1);
  assert.deepEqual(normalizeRhythm({ valenceFloor: 101 }, {}).rejected.length, 1);
  assert.deepEqual(normalizeRhythm({ valenceFloor: 'x' }, {}).rejected.length, 1);
  const ok = normalizeRhythm({ valenceFloor: 0 }, {});
  assert.deepEqual(ok.rejected, []);
  assert.equal(ok.rhythm.valenceFloor, 0, '0 是合法门槛（"不许净负"）');
  assert.deepEqual(BOUNDS.valenceFloor, [0, 100]);
});

test('④未提供的项不许报假警：只改门槛时，节律其它项必须保持原值', () => {
  const r = normalizeRhythm({ valenceFloor: 10 }, { staleMinutes: 90, quietFrom: 23, quietTo: 8 });
  assert.deepEqual(r.rejected, []);
  assert.equal(r.rhythm.valenceFloor, 10);
  assert.equal(r.rhythm.staleMinutes, 90, '没动的项必须保持原值');
  assert.equal(r.rhythm.quietFrom, 23);
});

test('反例：没有效价事件 ⇒ R(t)=0，门槛为 0 时算开（不许因为"没数据"就挡住）', () => {
  const g = valenceGate({ valenceFloor: 0 }, st([]), NOW);
  assert.equal(valenceOf(st([]), NOW), 0);
  assert.equal(g.open, true, 'R=0 且门槛=0 ⇒ 不小于门槛 ⇒ 开着（边界取"不含等于即挡"的反面）');
});

test('反例：门槛只影响判断，不修改效价账本本身', () => {
  const s = st([{ at: NOW - 1000, v: -1, kind: 'incident' }]);
  const before = JSON.stringify(s);
  valenceGate({ valenceFloor: 50 }, s, NOW);
  assert.equal(JSON.stringify(s), before, '门禁是只读判断，不许动账本');
  assert.ok(VALENCE_TAU_MS > 0, 'τ 仍来自 P018 常数族');
});
