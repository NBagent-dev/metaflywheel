// P526 判据：**采用**——把"动手前先检索并真的采用"钉住。
// 运行：node --test test/adopt.test.mjs
//
// 立题：账本实测 沉积 442 · 被引用 56 = 12.7% · 零引用 386 = 87.3%。
//   而"检索"早就有（检索小脑 P023-D / 因材施教 M9③ 每天都在快照里给候选）。
//   ⇒ 缺的是【采用】。本判据要钉住四件事：
//     ①三件必填（尤其反事实"没有它我会怎么做"——写不出反事实就不是采用）
//     ②★回环率【只数 adopt，不数 deposit 的 links】——事后补链永远不提高它
//     ③同一 (沉积, 决定) 只计一次（同一采用刷两遍不算两次回环）
//     ④负控：没有采用记录 ⇒ 那一行不显示
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ADOPT_MAX, recordAdopt, adoptsFor, mergeAdopts, adoptRate, adoptLine } from '../engine/modules/adopt.mjs';

const A = (sid, what, without, at) => ({ sedimentId: sid, forWhat: what, withoutIt: without, at: at || 1000 });

test('①三件必填：缺 forWhat 或缺 withoutIt（反事实）⇒ **一律不记**', () => {
  assert.equal(recordAdopt([], A('M1', '', 'x')).entry, null, '缺 forWhat ⇒ 拒绝');
  assert.equal(recordAdopt([], A('M1', 'x', '')).entry, null, '★缺反事实 ⇒ 拒绝（写不出"没有它我会怎么做"，就不是采用）');
  assert.equal(recordAdopt([], A('', 'x', 'y')).entry, null, '缺 sedimentId ⇒ 拒绝');
  const ok = recordAdopt([], A('M1', '决定甲的写法', '我会按老办法写，不加那段判据'));
  assert.ok(ok.entry, '三件齐全 ⇒ 记入');
  assert.equal(ok.entry.sedimentId, 'M1');
});

test('②★回环率**只数 adopt，不数 links**（事后补链永远不提高它）', () => {
  // 10 条沉积，8 条有"关联"（links），但 adopt 只有 1 条
  const seds = [];
  for (let i = 0; i < 10; i++) seds.push({ id: 'M' + i, cites: i < 8 ? 1 : 0, links: i < 8 ? ['M9'] : [] });
  const none = adoptRate({ sediments: seds, adopts: [] });
  assert.equal(none.adopted, 0, '有 8 条 cites>0，但 adopt=0 ⇒ adopted 必须是 0');
  assert.equal(none.rate, 0, '★回环率 = 0%（补链不进这个数）');
  const one = adoptRate({ sediments: seds, adopts: recordAdopt([], A('M3', '决定乙', '我会漏掉那一层')).list });
  assert.equal(one.adopted, 1);
  assert.equal(one.rate, 10, '1/10 = 10%');
});

test('③同一 (沉积, 决定) 只计一次（同一采用刷两遍不算两次回环）', () => {
  const first = recordAdopt([], A('M1', '同一个决定', '反事实甲'));
  assert.ok(first.entry);
  const dup = recordAdopt(first.list, A('M1', '同一个决定', '反事实乙'));
  assert.equal(dup.entry, null, '重复采用 ⇒ 拒绝');
  assert.match(dup.reason, /重复/);
  const other = recordAdopt(first.list, A('M1', '另一个决定', '反事实丙'));
  assert.ok(other.entry, '同一沉积用于**不同决定** ⇒ 应各计一次');
});

test('④负控：没有采用记录 ⇒ 快照那一行必须为空（不许凭空说"我采用了"）', () => {
  assert.equal(adoptLine({ adopts: [] }), '');
  assert.equal(adoptLine({}), '');
  assert.equal(adoptLine({ adopts: null }), '');
});

test('⑤渲染：回环率与"没有它我会怎么做"都必须可见', () => {
  const l = recordAdopt([], A('P521-M438', '写 P526 的设计', '我会把它写成又一条 deposit links')).list;
  const line = adoptLine({ sediments: [{ id: 'P521-M438' }, { id: 'M2' }], adopts: l });
  assert.match(line, /回环率 50%/, line);
  assert.match(line, /没有它：/, '反事实必须显示出来：' + line);
  assert.match(line, /补一条 links 不算回流/, '必须写明与补链的区别');
});

test('⑥归并：并集 + 按 id 去重（恢复纪律）', () => {
  const a = recordAdopt([], A('M1', 'x', 'y', 1000)).list;
  const b = recordAdopt([], A('M2', 'x', 'y', 2000)).list;
  assert.equal(mergeAdopts(a, b).length, 2);
  assert.equal(mergeAdopts(a, a).length, 1);
});

test('⑦有界：超上限丢最旧（防通胀）', () => {
  let l = [];
  for (let i = 0; i < ADOPT_MAX + 5; i++) l = recordAdopt(l, A('M' + i, 'x', 'y', 1000 + i)).list;
  assert.equal(l.length, ADOPT_MAX);
  assert.equal(l[0].sedimentId, 'M5');
});

test('⑧adoptsFor：某条沉积被采用过几次（回环的真相，可逐条查）', () => {
  let l = [];
  l = recordAdopt(l, A('M1', '决定一', 'x')).list;
  l = recordAdopt(l, A('M1', '决定二', 'y')).list;
  l = recordAdopt(l, A('M2', '决定三', 'z')).list;
  assert.equal(adoptsFor(l, 'M1').length, 2);
  assert.equal(adoptsFor(l, 'M2').length, 1);
  assert.equal(adoptsFor(l, 'M9').length, 0);
});

test('⑨★接线判据：state 必须落盘 adopts，且 selfsnap 必须渲染它', () => {
  const STATE = fs.readFileSync(new URL('../engine/modules/state.mjs', import.meta.url), 'utf8');
  assert.match(STATE, /adopts:/, 'state.mjs 的 persist 里必须有 adopts（否则采用跨代即失）');
  assert.match(STATE, /mergeAdopts/, 'restore 必须归并 adopts（不能覆盖）');
  const SNAP = fs.readFileSync(new URL('../engine/modules/selfsnap.mjs', import.meta.url), 'utf8');
  assert.match(SNAP, /import\s*\{[^}]*adoptLine[^}]*\}\s*from\s*['"]\.\/adopt\.mjs['"]/, 'selfsnap 必须引入 adoptLine');
  assert.ok(/if\s*\(\s*al2\s*\)\s*lines\.push\(al2\)/.test(SNAP), '空采用 ⇒ 不 push（负控）');
});
