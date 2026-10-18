// P543-M469 落地判据：动作级触发器
// 运行：node --test test/triggers.test.mjs
//
// ★ 它的存在理由是 P543-M469：纪律性知识在结构上不会被"开工前检索"命中，
//   因为它描述的是"我正在做的事的每一步"。所以索引键必须是【动作】，不是主题。
// ★ 而它必须遵守 P117-M71：判据要能失败（缺 evidence / 重复 trigger / 猜的 ID 都要红）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadTriggers, lookUp, renderTrigger, validateTriggers } from '../engine/modules/triggers.mjs';

const TJSON = 'C:/Users/Administrator/Desktop/daima/XIN/.mpm/triggers.json';
const LEDGER = 'C:/Users/Administrator/Desktop/daima/XIN/.mpm/flywheel.json';
const load = () => loadTriggers(TJSON);

test('① 表能加载，且有 7 条真实失败的触发器', () => {
  const t = load();
  assert.ok(t.length >= 7, '至少 7 条（每条都来自今天真的失败过的动作）');
  assert.equal(validateTriggers(t).length, 0, '整张表必须无错：' + validateTriggers(t).join(' / '));
});

test('② 查得到：edit-blocked → P027-M17（今晚真被拒过两次的那个动作）', () => {
  const r = lookUp(load(), 'edit-blocked');
  assert.equal(r.found, true);
  assert.equal(r.list[0].sedimentId, 'P027-M17');
  const s = renderTrigger('edit-blocked', r);
  assert.ok(s.includes('read 的逐字输出'), '提示里必须出现那条纪律本身');
  assert.ok(s.includes('P027-M17'), '必须标出处');
});

test('③ ★ 负控：查一个不存在的动作 ⇒ found=false 且【必须沉默】', () => {
  const r = lookUp(load(), '这是一个没发生过的动作');
  assert.equal(r.found, false, '找不到就是找不到，不许假装');
  assert.equal(renderTrigger('这是一个没发生过的动作', r), '', '★ 沉默是对的：动作没失败时不需要提醒，否则提示会变噪声');
});

test('④ 判据要能失败：缺 evidence 的条目必须被拒（没有失败证据的条目是编的）', () => {
  const bad = [{ trigger: 'x', sedimentId: 'P001-M1', lesson: '某条纪律' }];
  const errs = validateTriggers(bad);
  assert.ok(errs.length > 0, '★ 缺 evidence 必须红');
  assert.ok(errs.join(' ').includes('evidence'));
});

test('⑤ 判据要能失败：同一动作有两个纪律必须被拒（否则不知道听哪个）', () => {
  const bad = [
    { trigger: 'dup', sedimentId: 'P001-M1', lesson: 'A', evidence: 'e1' },
    { trigger: 'dup', sedimentId: 'P002-M2', lesson: 'B', evidence: 'e2' }
  ];
  const errs = validateTriggers(bad);
  assert.ok(errs.join(' ').includes('重复'), '★ trigger 重复必须红');
});

test('⑥ 判据要能失败：缺 trigger/sedimentId/lesson 都要红', () => {
  assert.ok(validateTriggers([{ sedimentId: 'P001-M1', lesson: 'x', evidence: 'e' }]).length > 0);
  assert.ok(validateTriggers([{ trigger: 't', lesson: 'x', evidence: 'e' }]).length > 0);
  assert.ok(validateTriggers([{ trigger: 't', sedimentId: 'P001-M1', evidence: 'e' }]).length > 0);
});

test('⑦ ★★ 每条 sedimentId 必须在账本里【真实存在】——这条防的就是"猜 ID"', () => {
  const t = load();
  const st = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  const ids = new Set((st.sediments || []).map(s => s.id));
  for (const x of t) {
    assert.ok(ids.has(x.sedimentId), '★ ' + x.sedimentId + ' 不在账本里 —— 猜的 ID 会让引用静默失效（今晚刚被引擎拒过一次）');
  }
});

test('⑧ 每条 lesson 必须能单独读懂（不是"详见原文"）', () => {
  for (const x of load()) {
    assert.ok(x.lesson.length >= 10, x.trigger + ' 的 lesson 太短，读不出做法');
    assert.ok(!/详见|见原文|参见/.test(x.lesson), x.trigger + ' 的 lesson 不许只写"详见"——那样它就不是一条可执行的纪律');
  }
});
