// P517③ 判据：**未核清单**——"我不知道的东西也要跨代活着"。
// 运行：node --test test/unknowns.test.mjs
//
// 与 principal（我知道的）配成一对。这一条判据要防的是**未核通胀**：
//   一张无限膨胀的"待查清单"不是记忆，是垃圾场。所以三条硬约束都写进判据：
//   ①每条必须写退役条件 `until` ②核销必须带证据 ③只提示、永不拦。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { UNKNOWN_MAX, addUnknown, resolveUnknown, mergeUnknowns, openUnknowns, consultUnknowns, unknownLine } from '../engine/modules/unknowns.mjs';

const A = (at, key, text, until) => ({ at, key, text, until });

test('①三件必填：text / key / **until（退役条件）** —— 写不出退役条件的，不许进表', () => {
  assert.equal(addUnknown([], A(1000, 'P472', '没验过门语在 45 格上的表现')).entry, null, '缺 until ⇒ 拒绝');
  assert.equal(addUnknown([], A(1000, '', '有 text 没 key')).entry, null);
  assert.equal(addUnknown([], A(1000, 'P472', '   ', '拿到 45 格样本')).entry, null);
  assert.ok(addUnknown([], A(1000, 'P472', '没验过门语在 45 格上的表现', '拿到 45 格样本')).entry);
});

test('②核销必须带证据 —— "我后来觉得没事了"不算解决', () => {
  const r = addUnknown([], A(1000, 'P472', '未验 X', '拿到样本'));
  assert.equal(resolveUnknown(r.list, r.entry.id, '').resolved.length, 0, '空证据 ⇒ 拒绝核销');
  assert.equal(resolveUnknown(r.list, r.entry.id, '  ').resolved.length, 0);
  const ok = resolveUnknown(r.list, r.entry.id, '实测 45 格跑通，日志见 test/xxx', 2000);
  assert.equal(ok.resolved.length, 1);
  assert.equal(ok.resolved[0].resolvedBy, '实测 45 格跑通，日志见 test/xxx');
  assert.equal(ok.resolved[0].resolvedAt, 2000);
  assert.equal(openUnknowns(ok.list).length, 0, '核销后不再出现在未核里');
});

test('③★只提示、永不拦：consultUnknowns 的判决只能是 hint 或 null', () => {
  const l = addUnknown([], A(1000, 'P472', '未验门语', '拿到样本')).list;
  const hit = consultUnknowns(l, '继续推进 P472 第四十五格');
  assert.equal(hit.verdict, 'hint', JSON.stringify(hit));
  assert.match(hit.why, /未核/);
  const miss = consultUnknowns(l, 'pwsh：列目录');
  assert.equal(miss.verdict, null);
  assert.equal(consultUnknowns(l, '').verdict, null);
});

test('④负控：没有条目 ⇒ 快照那一行必须为空（不许凭空说"我没验过"）', () => {
  assert.equal(unknownLine({}), '');
  assert.equal(unknownLine({ unknowns: [] }), '');
  assert.equal(unknownLine({ unknowns: null }), '');
});

test('⑤归并：取并集、按 id 去重、不覆盖（恢复纪律，沿用 P514/P517）', () => {
  const a = addUnknown([], A(1000, 'K1', 'T1', 'U1')).list;
  const b = addUnknown([], A(2000, 'K2', 'T2', 'U2')).list;
  const m = mergeUnknowns(a, b);
  assert.equal(m.length, 2);
  assert.equal(mergeUnknowns(a, a).length, 1, '同一份归并两次不该翻倍');
});

test('⑥有界：超过上限丢最旧（防通胀）', () => {
  let l = [];
  for (let i = 0; i < UNKNOWN_MAX + 5; i++) l = addUnknown(l, A(1000 + i, 'K' + i, 'T' + i, 'U' + i)).list;
  assert.equal(l.length, UNKNOWN_MAX);
  assert.equal(l[0].key, 'K5', '最旧的被丢掉了');
});

test('⑦退役条件写不出 ⇒ 判据把它挡在表外（本判据的存在理由）', () => {
  // 反向证明：如果允许 until 为空，这张表就会退化成"待办清单"，而不是"未核清单"
  const r = addUnknown([], { at: 1, key: 'X', text: '不知道 Y 行不行' });
  assert.equal(r.entry, null);
  assert.equal(r.list.length, 0, '一条都不许进');
});
