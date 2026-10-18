// P521/P523 判据：**hit-repeat 的区分器**——"反复出现"不等于"没被解决"。
// 运行：node --test test/hit-discriminator.test.mjs
//
// 现场（2026-10-11 自主发动）：内生议程报「同一件事被提醒了 28 次：「项目定位」——
//   反复命中的东西通常不是'提醒不够'，而是**没被解决**」。
//   而核对后：**28 次全部已处置**，处置文本里也没有一处说"仍未解决" ⇒ **这是误报**。
//   真因：命中口径 = 「工具名 + 参数 JSON 含该 key」 ⇒ 我这一整轮都在写关于它的东西，
//   所以它反复命中是因为**它就是我这一轮的工作主题**，不是因为"没被解决"。
//
// ★修法（结构化，不猜文本——今天已栽过三次"量代理词"）：
//   欠账 = `未处置` **OR** `stillOpen === true`（处置时明确勾选"我处置了，但这件事仍未解决"）
//   同一 key 命中 ≥ HIT_REPEAT_MIN 且**存在欠账** ⇒ 才产出 hit-repeat。
//   ⇒ 全部已处置且无 stillOpen ⇒ **不得产出**（负控）。
//
// ★另一条同样重要：`because` 从句必须**说事实**，不许是格言。
//   旧：「反复命中的东西通常不是"提醒不够"，而是**没被解决**」（这是**猜测**）
//   新：「其中 M 次被处置时明确标了'仍未解决'，或尚未处置」（这是**账本里的事实**）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { innerAgenda, HIT_REPEAT_MIN } from '../engine/modules/agenda.mjs';
import { recordHit, disposeHit, outstandingHits } from '../engine/modules/hits.mjs';

const KEY = '项目定位';
const mk = (key, at) => ({ key, tool: 't', verdict: 'hint', text: '他在类似事情上说过什么', at });

/** 造 n 条已处置的命中（无 stillOpen）。
 *  ★P574：处置要遍历【它实际拿到的每一条】，而不是假设"造 n 条就有 n 条"。
 *    因为 `recordHit` 现在会把【同一 key 未处置期间的连续注入】合并成一条 `count: n`
 *    ⇒ 造 28 次可能只得到 1 条。而"处置一次就够"在语义上正是对的：
 *    同一句话被注入 28 次，欠的仍然是**一次处置**。 */
function disposedAll(n, startAt) {
  let l = [];
  for (let i = 0; i < n; i++) l = recordHit(l, mk(KEY, (startAt || 1000) + i)).list;
  for (const h of l.slice()) l = disposeHit(l, h.id, '处置了').list;
  return l;
}
const stateOf = (hits) => ({ hits, unknowns: [], sediments: [] });
const repeats = (st) => innerAgenda(st, 1e12).filter(function (i) { return i.kind === 'hit-repeat'; });

test('①★负控：同一 key 命中 ≥3 但【全部已处置且无 stillOpen】⇒ 不得产出 hit-repeat', () => {
  const st = stateOf(disposedAll(HIT_REPEAT_MIN + 25));   // 复现现场的 28 次
  assert.equal(repeats(st).length, 0,
    '这正是 2026-10-11 的误报现场：28 次全部已处置、无人说"仍未解决" ⇒ 它只是我的工作主题，不是欠账');
});

test('②正例：存在【未处置】的命中 ⇒ 必须产出，且文本要写明欠账数', () => {
  const l = disposedAll(5);
  const l2 = recordHit(l, mk(KEY, 9999)).list;            // 留一条未处置
  const r = repeats(stateOf(l2));
  assert.equal(r.length, 1, '有未处置的命中 ⇒ 这是真欠账，必须产出');
  assert.match(r[0].text, /仍未解决|未处置/, '文本必须写出欠账数：' + r[0].text);
});

test('③正例：全部已处置，但其中一条标了 stillOpen=true ⇒ 必须产出', () => {
  const l = disposedAll(3);
  // ★P574：用【它实际拿到的最后一条】，而不是硬编码的下标 ——
  //   因为 `recordHit` 现在会把同 key 的连续注入合并，3 次可能只得到 1 条。
  assert.ok(l.length >= 1, '桩必须至少产出一条');
  const last = l.length - 1;
  l[last] = Object.assign({}, l[last], { stillOpen: true });
  const r = repeats(stateOf(l));
  assert.equal(r.length, 1, '全部已处置但标了 stillOpen ⇒ 仍是欠账，必须产出');
});

test('④负控：命中数 < HIT_REPEAT_MIN ⇒ 不产出（2 次不提）', () => {
  assert.equal(repeats(stateOf(disposedAll(HIT_REPEAT_MIN - 1))).length, 0);
});

test('⑤outstandingHits：未处置 与 stillOpen 都算欠账；已处置且未标 ⇒ 不算', () => {
  let l = [];
  l = recordHit(l, mk('A', 1)).list;                       // 未处置 ⇒ 欠账
  l = recordHit(l, mk('B', 2)).list;
  l = disposeHit(l, l[1].id, '处置了', 3, false).list;      // 已处置未标 ⇒ 不欠
  l = recordHit(l, mk('C', 4)).list;
  l = disposeHit(l, l[2].id, '处置了但它还挂着', 5, true).list; // 已处置 + stillOpen ⇒ 欠账
  const out = outstandingHits(l);
  assert.equal(out.length, 2, '欠账 = 未处置 或 stillOpen：' + JSON.stringify(out.map(x => x.key)));
  assert.deepEqual(out.map(x => x.key).sort(), ['A', 'C']);
});

test('⑥because 从句必须【说事实】，不许是格言（"通常不是…而是…"）', () => {
  const l = disposedAll(4);
  l[0] = Object.assign({}, l[0], { stillOpen: true });
  const r = repeats(stateOf(l));
  assert.equal(r.length, 1);
  assert.ok(!/通常不是/.test(r[0].because),
    '★"反复命中的东西通常不是…而是…"是一句【猜测】，不是账本里的事实 ⇒ 不许再出现在 because 里');
  assert.match(r[0].because, /仍未解决|未处置/, 'because 必须指向账本里可核对的字段：' + r[0].because);
});

test('⑦disposeHit 的 stillOpen 可跨代存活（归并后仍在）', async () => {
  const { mergeHits } = await import('../engine/modules/hits.mjs');
  let l = recordHit([], mk('X', 1)).list;
  l = disposeHit(l, l[0].id, '处置了，但没解决', 2, true).list;
  const merged = mergeHits([], l);
  assert.equal(merged[0].stillOpen, true, 'stillOpen 必须在归并后仍然存在（否则跨重启即失）');
});
