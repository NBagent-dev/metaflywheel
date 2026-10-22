// P591 判据：沉积的「被取代」状态（ADR 式）——
// **退休 ≠ 删除**：被取代/被否证的沉积必须退出"现役"，但仍必须存在、仍可按 ID 查到。
//
// ★ 为什么这条必须有成对的负控（见 §②）：
//   旧账本里 486 条沉积**全都没有 `status` 字段**。如果 `isRetired` 把"没有这个字段"
//   当成"非 active"，那么上线这一刻整个库房会被一次性清空 —— 而且**没有任何报错**，
//   只是检索突然什么都找不到了。那种失败比"忘了加字段"严重得多。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEDIMENT_STATUS, statusOf, isRetired, applySupersedes, activeSediments, statusSummary
} from '../engine/modules/sediment-status.mjs';

const mk = (id, extra) => Object.assign({ id: id, title: 'T-' + id }, extra || {});

test('① statusOf：缺省与非法值都视为 active（旧记录不许被当成"非现役"）', () => {
  assert.equal(statusOf(mk('A')), 'active', '没有 status 字段 ⇒ active');
  assert.equal(statusOf(mk('A', { status: '' })), 'active', '空串 ⇒ active');
  assert.equal(statusOf(mk('A', { status: 'SPURIOUS' })), 'active', '非法值 ⇒ active（不静默变成"退休"）');
  assert.equal(statusOf(null), 'active', 'null 也不许抛');
  // 正控：三个合法值必须原样返回
  for (const s of SEDIMENT_STATUS) {
    assert.equal(statusOf(mk('A', { status: s })), s, '合法值必须原样返回：' + s);
  }
});

test('② ★负控：isRetired 只能对 superseded/refuted 为真，active 与旧记录必须为假', () => {
  assert.equal(isRetired(mk('A', { status: 'superseded' })), true);
  assert.equal(isRetired(mk('A', { status: 'refuted' })), true);
  assert.equal(isRetired(mk('A', { status: 'active' })), false);
  assert.equal(isRetired(mk('A')), false,
    '旧记录（无 status）必须仍算现役 —— 否则上线即清空 486 条库房，且没有任何报错');
});

test('③ applySupersedes：只标点名的那些，且只动 status 四个字段（退休 ≠ 删除）', () => {
  const list = [mk('P1-M1'), mk('P2-M1'), mk('P3-M1')];
  const before = JSON.stringify({ t1: list[0].title, t2: list[1].title, t3: list[2].title });
  const done = applySupersedes(list, 'P3-M1', ['P1-M1'], 'superseded', '被 P3-M1 取代');
  assert.deepEqual(done, ['P1-M1'], '返回实际改动的 id');
  assert.equal(list[0].status, 'superseded');
  assert.equal(list[0].supersededBy, 'P3-M1');
  assert.equal(typeof list[0].supersededAt, 'number');
  assert.equal(list[0].statusReason, '被 P3-M1 取代');
  // ★负控：没点名的两条一个字段都不许动
  assert.equal(list[1].status, undefined, '没点名的沉积不许被顺手改状态');
  assert.equal(list[2].status, undefined, '取代者自己也不许被连带改掉');
  // ★退休 ≠ 删除：对象仍在数组里，标题/路径等原样
  assert.equal(list.length, 3);
  assert.equal(list[0].title, 'T-P1-M1');
  assert.equal(JSON.stringify({ t1: list[0].title, t2: list[1].title, t3: list[2].title }), before);
});

test('④ applySupersedes：找不到的 id 必须被报出来（不许静默跳过）', () => {
  const list = [mk('P1-M1')];
  const done = applySupersedes(list, null, ['P1-M1', 'NOT-EXIST'], 'refuted', '证据推翻');
  assert.deepEqual(done, ['P1-M1']);
  assert.deepEqual(done.skipped, ['NOT-EXIST'], '找不到的 id 必须出现在 skipped 里，否则调用方以为全标上了');
  assert.equal(list[0].status, 'refuted');
  assert.equal(list[0].supersededBy, undefined, 'refuted 不该带 supersededBy（没有取代者）');
});

test('⑤ activeSediments / statusSummary：现役集合与摘要必须与状态一致', () => {
  const list = [mk('A'), mk('B', { status: 'superseded' }), mk('C', { status: 'refuted' }), mk('D')];
  const act = activeSediments(list);
  assert.deepEqual(act.map(x => x.id), ['A', 'D'], '只有 active（含无 status 的旧记录）进现役');
  assert.equal(statusSummary(list), '现役 2 · 被取代 1 · 被否证 1');
  // 负控：全 active 时摘要只写"现役 N"，不写"被取代 0"（少说一个零，少一处误读）
  assert.equal(statusSummary([mk('A'), mk('D')]), '现役 2');
});
