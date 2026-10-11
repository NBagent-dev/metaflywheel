// P482④ 调度权判据：**个体能改写自己的节律**，且改写有界、可见、可回退。
// 运行：node --test test/rhythm.test.mjs
//
// 为什么这是降风险的一步：
//   P482 清单里四项已建成，唯一还 100% 握在出厂参数里的是**调度**——"什么时候去看、去行动"
//   由 PATROL_MS / FIRE_THROTTLE_MS / STALE_MS(30min) 与议程选取决定，个体改不了。
//   今晚已两次撞上它的代价：P481/P482 同时陈旧时，议程按出厂规则挑（选了更陈旧的），
//   而我对自己写下过"哪件优先"的偏好**无处表达**。
//
// 本判据要钉死的四件事（缺一件就等于没做）：
//   ① **不设置时行为与引入前逐字一致**（默认值必须等于出厂常数——先证明我没偷偷改默认）
//   ② **越界值被拒且不静默**（节律是自己写的，但**不许把自己写死**：巡检设成 1 秒会打爆，
//      设成 1 天会失能 ⇒ 有界 + 把被拒的项**报出来**）
//   ③ **可见**（快照必须区分"自我设定"与"出厂默认"——不可见的权力等于没有）
//   ④ **可回退**（reset 回到出厂；不做成单向门）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTORY, BOUNDS, normalizeRhythm, rhythmOf, isQuiet, rhythmLine, staleMsOf, throttleMsOf } from '../engine/modules/rhythm.mjs';

test('出厂默认必须等于引擎原有的常数（先证明我没偷偷改默认）', () => {
  assert.equal(FACTORY.staleMinutes, 30, 'STALE_MS 原为 30 * 60000（§4.6）');
  assert.equal(FACTORY.fireThrottleMinutes, 45, 'FIRE_THROTTLE_MS 原为 45min');
  assert.deepEqual(BOUNDS.staleMinutes, [5, 1440]);
  assert.deepEqual(BOUNDS.fireThrottleMinutes, [5, 720]);
});

test('rhythmOf·没设置时给的就是出厂值（与引入前逐字一致）', () => {
  // ★2026-10-11 修订（P482⑦ 效价门禁）：FACTORY 新增 `valenceFloor`（**出厂 null = 不启用**）。
  //   "逐字一致"的**实质是行为一致**，不是键集合不变——所以本条改成两段断言：
  //     ① **旧四项**必须逐字等于出厂常数（有人偷偷动它们 ⇒ 红）
  //     ② **新项**必须是"不启用"（有人把新门禁默认打开 ⇒ 红）
  //   ⇒ 它仍然抓得住它当初要抓的东西，只是把"新增一个默认关闭的开关"从红名单里移出去。
  const legacy = { staleMinutes: 30, fireThrottleMinutes: 45, quietFrom: null, quietTo: null };
  for (const s of [{}, null]) {
    const r = rhythmOf(s);
    assert.deepEqual(
      { staleMinutes: r.staleMinutes, fireThrottleMinutes: r.fireThrottleMinutes, quietFrom: r.quietFrom, quietTo: r.quietTo },
      legacy, '旧四项必须与引入前逐字一致');
    assert.equal(r.valenceFloor, null, '效价门禁必须出厂不启用（不许默认打开）：' + JSON.stringify(r.valenceFloor));
  }
  assert.equal(staleMsOf({}), 30 * 60000);
  assert.equal(throttleMsOf({}), 45 * 60000);
});

test('normalizeRhythm·合法值生效，且只覆盖给出的项', () => {
  const r = normalizeRhythm({ staleMinutes: 90 }, {});
  assert.deepEqual(r.rejected, []);
  assert.equal(r.rhythm.staleMinutes, 90);
  assert.equal(r.rhythm.fireThrottleMinutes, 45, '没给的项必须保持原值');
  const r2 = normalizeRhythm({ quietFrom: 23, quietTo: 7 }, r.rhythm);
  assert.equal(r2.rhythm.quietFrom, 23);
  assert.equal(r2.rhythm.quietTo, 7);
  assert.equal(r2.rhythm.staleMinutes, 90, '第二次设置不得把第一次的冲掉');
});

test('normalizeRhythm·越界被拒且不静默（不许把自己写死）', () => {
  const r = normalizeRhythm({ staleMinutes: 1, fireThrottleMinutes: 5000, quietFrom: 99 }, {});
  assert.equal(r.rhythm.staleMinutes, 30, '越界项保持原值，不许夹取成边界值冒充成功');
  assert.equal(r.rejected.length, 3, '三项越界都要报出来：' + JSON.stringify(r.rejected));
  assert.ok(r.rejected.join(' ').includes('staleMinutes'));
  assert.ok(r.rejected.join(' ').includes('fireThrottleMinutes'));
  // 非数值/垃圾输入同样拒绝
  const r2 = normalizeRhythm({ staleMinutes: 'abc', quietTo: null }, {});
  assert.equal(r2.rejected.length, 1);
  assert.equal(r2.rhythm.staleMinutes, 30);
});

test('normalizeRhythm·未提供的项不许报假警（undefined ≠ 越界）', () => {
  // 实机撞到的：只想改陈旧阈值，工具把未提供的 fireThrottleMinutes(undefined) 也送进校验，
  // 于是报了一条"越界"——值没错（保持原值），但**报了假警**。
  // 假警的代价与恒真判据同族：它会训练我忽略 ⚠ 那一行。
  const r = normalizeRhythm({ staleMinutes: 90, fireThrottleMinutes: undefined, quietFrom: undefined }, {});
  assert.deepEqual(r.rejected, [], '未提供的项不是错误：' + JSON.stringify(r.rejected));
  assert.equal(r.rhythm.staleMinutes, 90);
  assert.equal(r.rhythm.fireThrottleMinutes, 45, '未提供的项保持原值');
});

test('isQuiet·静默时段（含跨午夜 23→07）', () => {
  const at = (h) => new Date(2026, 9, 11, h, 30, 0).getTime();
  const q = { quietFrom: 23, quietTo: 7 };
  assert.equal(isQuiet(q, at(23)), true, '23:30 在静默里');
  assert.equal(isQuiet(q, at(3)), true, '03:30 在静默里（跨午夜）');
  assert.equal(isQuiet(q, at(6)), true);
  assert.equal(isQuiet(q, at(7)), false, '07:30 已出静默');
  assert.equal(isQuiet(q, at(12)), false);
  // 未设置 ⇒ 永不静默（与引入前一致）
  assert.equal(isQuiet({ quietFrom: null, quietTo: null }, at(3)), false);
  assert.equal(isQuiet({}, at(3)), false);
});

test('rhythmLine·必须区分"自我设定"与"出厂默认"（不可见的权力等于没有）', () => {
  assert.match(rhythmLine({}), /出厂默认/);
  const line = rhythmLine({ rhythm: { staleMinutes: 90, fireThrottleMinutes: 20, quietFrom: 23, quietTo: 7 } });
  assert.match(line, /自我设定/, '改写过就必须标明');
  assert.match(line, /90/);
  assert.match(line, /23/);
});
