// P537 判据：**未清账本身必须成为议程来源**——"可见 ≠ 会被推动"。
// 运行：node --test test/hit-open.test.mjs
//
// 现场（2026-10-11 自主发动）：快照连续四轮显示「未处置 4 次」，而我连续四轮没清它。
//   根因：`agenda.mjs` 的三个来源里，"欠账"只是 hit-repeat 的**门槛**——
//     for (const k of Object.keys(total)) {
//       if (total[k] < HIT_REPEAT_MIN) continue;   // ★门槛在【总命中数】上
//       if (!owed[k]) continue;
//     }
//   ⇒ **单笔欠账永远不会变成议程**（除非同一件事欠够 3 次）。
//
// ★P519 做到了「未处置必须可见」（快照每轮显示未处置数），
//   但「可见」不等于「会被推动」——它需要一个**议程来源**才能把欠账摆到面前。
//   ⇒ 本判据钉住第四个来源 `hit-open`：条件只看"有没有欠账"，与命中次数无关。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { innerAgenda, HIT_REPEAT_MIN } from '../engine/modules/agenda.mjs';
import { recordHit, disposeHit } from '../engine/modules/hits.mjs';

const mk = (key, at) => ({ key, tool: 't', verdict: 'hint', text: 'T', at });
const st = (hits) => ({ hits, unknowns: [], sediments: [] });
const kindOf = (s, k) => innerAgenda(s, 1e12).filter(function (i) { return i.kind === k; });

test('①★单一笔欠账（总命中数 < 阈值）也必须产出 hit-open', () => {
  // 这正是现场：33 次命中里 4 笔未处置——但它们各自"总次数"不足 3 ⇒ 旧逻辑永不报
  const l = recordHit([], mk('K', 1)).list;               // 只命中 1 次
  assert.equal(kindOf(st(l), 'hit-repeat').length, 0, '负控：1 次不该触发 hit-repeat');
  const open = kindOf(st(l), 'hit-open');
  assert.equal(open.length, 1,
    '★总命中数 < ' + HIT_REPEAT_MIN + ' 也要报——欠账是【硬的】，不取决于它被提醒过几次');
  assert.equal(open[0].ref, 'hits:open');
});

test('②负控：全部已处置且无 stillOpen ⇒ 不产出 hit-open', () => {
  let l = recordHit([], mk('K', 1)).list;
  l = disposeHit(l, l[0].id, '处置了', 2).list;
  assert.equal(kindOf(st(l), 'hit-open').length, 0, '没有欠账就不许报（负控：不许凭空生成议题）');
});

test('③stillOpen=true 也算欠账 ⇒ 必须产出（处置 ≠ 解决）', () => {
  let l = recordHit([], mk('K', 1)).list;
  l = disposeHit(l, l[0].id, '处置了但它还挂着', 2, true).list;
  assert.equal(kindOf(st(l), 'hit-open').length, 1,
    '处置了但标了"仍未解决" ⇒ 仍是欠账（这是 P523 引入 stillOpen 的全部目的）');
});

test('④多条欠账 ⇒ 文本写出笔数，且 key 去重列出', () => {
  // ★P574：桩改用【三个不同 key】表达"三笔欠账"。
  //   因为同一个 key 在未处置期间的连续命中会合并成一条 —— 那是同一件事被踩两次，
  //   不是两笔独立的欠账。**而"欠三笔"这个说法必须有三个不同的洞支撑。**
  let l = [];
  l = recordHit(l, mk('A', 1)).list;
  l = recordHit(l, mk('B', 2)).list;
  l = recordHit(l, mk('C', 3)).list;                       // A/B/C 各欠一笔
  const open = kindOf(st(l), 'hit-open');
  assert.equal(open.length, 1, '只报一条（一条议程覆盖全部欠账，不是每条一笔）');
  assert.match(open[0].text, /3\s*笔/, '必须写出欠账笔数：' + open[0].text);
  assert.match(open[0].text, /A/);
  assert.match(open[0].text, /B/, '去重后列出 key：' + open[0].text);
});

test('⑤权重必须高于 hit-repeat —— 欠账比"反复出现"更硬', () => {
  // 造同 key：欠 3 笔（既够 hit-repeat 又够 hit-open）
  let l = [];
  for (let i = 0; i < 3; i++) l = recordHit(l, mk('K', 10 + i)).list;
  const items = innerAgenda(st(l), 1e12);
  const hr = items.filter(i => i.kind === 'hit-repeat')[0];
  const ho = items.filter(i => i.kind === 'hit-open')[0];
  assert.ok(hr && ho, '两个来源都该触发');
  assert.ok(ho.weight > hr.weight,
    '★欠账权重必须更高（' + ho.weight + ' > ' + hr.weight + '）——否则"反复出现"会盖过"真的欠着"');
});

test('⑥because 必须指向可核对的事实，且给出清偿入口', () => {
  const l = recordHit([], mk('K', 1)).list;
  const it = kindOf(st(l), 'hit-open')[0];
  assert.match(it.because, /未处置|未解决/, '要说清"欠"在哪：' + it.because);
  assert.match(it.because, /mpm_hit/, '必须给出清偿入口（否则知道欠着也不知道怎么还）');
});

test('⑦账本干净 ⇒ 议题为空（总负控：不许为了显得"自发"而造题）', () => {
  assert.equal(innerAgenda({ hits: [], unknowns: [], sediments: [] }, 1e12).length, 0);
});
