// P596 判据：⑤ 的度量本身必须先可信，才能用它决定要不要改排序
//
// ★ 三条要钉的：
//   ① **公式不自作主张**：本文件复制了 retrieve.mjs 的相关性公式（因为它不返回全量），
//      所以必须有交叉核验 —— 同一语料同一查询，两边给出的 (id:score) 序列必须一致。
//      没有这条，"两套公式悄悄分叉"会让整个度量变成自说自话。
//   ② **负控**：只在"相关"一项上加权（其余为 0）时，名次必须与纯相关**完全相同**
//      ⇒ 否则说明名次计算本身有偏，后面的结论都不算。
//   ③ **结论必须带样本量**，且样本缺失要被数出来（不许静默丢弃）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relevanceAll, evaluateRetrieval, evalLine, crossCheck } from '../engine/modules/rank-eval.mjs';
import { sedimentCacheGet } from '../engine/modules/retrieval.mjs';
import { normalizeRetrievalWeights } from '../engine/modules/retrieval-weights.mjs';

const DAY = 86400000;
const now = Date.now();
const mk = (id, title, extra) => Object.assign({ id, title, tags: [], depositedAt: now, cites: 0 }, extra || {});
const fillers = () => {
  const out = [];
  for (let i = 0; i < 10; i++) out.push(mk('F' + i, 'zz' + i + 'qq' + (i * 7)));   // 造 DF 背景
  return out;
};

test('① 交叉核验：本文件的公式必须与 retrieveTop 给出完全相同的 (id:score) 序列', () => {
  const q = '安静库房的引用率';
  const list = fillers().concat([
    mk('A', '安静库房的引用率'),
    mk('B', '安静库房'),
    mk('C', '引用率与库房', { status: 'superseded' })   // 退役的不该出现（P592 口径）
  ]);
  const C = sedimentCacheGet(list);
  const cc = crossCheck(q, C, 3, 0.3);
  assert.equal(cc.ok, true, '两套公式必须一致。mine=' + cc.mine + ' theirs=' + cc.theirs);
  const mine = relevanceAll(q, C);
  assert.ok(mine.length >= 3, '必须返回全量（含低于 minScore 的），实得 ' + mine.length);
  assert.ok(mine.some(x => x.ref.id === 'A'));
});

test('② 正控：目标相关不高但被引次数高时，三项加权必须把它排上来', () => {
  const q = '安静库房的引用率';
  const weak = mk('W', '安静库房', { cites: 0, depositedAt: now - 200 * DAY });   // 相关弱、旧、无引用
  const strong = mk('S', '完全无关的话题', { cites: 9, depositedAt: now });        // 相关 0，但常引且新
  const list = fillers().concat([weak, strong]);
  const C = sedimentCacheGet(list);
  const W = normalizeRetrievalWeights({ relevance: 0.2, recency: 0.4, importance: 0.4 }).weights;
  const r = evaluateRetrieval([{ query: q, targetId: 'S' }], C, W, now);
  assert.equal(r.n, 1);
  assert.equal(r.missing, 0);
  assert.equal(r.rows[0].rankRel, r.rows[0].total, '纯相关下，零相关的目标必须排在最后');
  assert.ok(r.rows[0].rankWeighted < r.rows[0].rankRel, '加权后必须更靠前，实得相关=' + r.rows[0].rankRel + ' 加权=' + r.rows[0].rankWeighted);
  assert.equal(r.verdict, 'weighting-helps');
  assert.match(evalLine(r), /方向有利|N 太小/);
});

test('③ ★负控：只在"相关"上加权时，名次必须与纯相关完全相同（否则名次计算有偏）', () => {
  const q = '安静库房的引用率';
  const target = mk('T', '安静库房', { cites: 0, depositedAt: now - 100 * DAY });
  const list = fillers().concat([target, mk('A', '安静库房的引用率'), mk('B', '引用率')]);
  const C = sedimentCacheGet(list);
  const W = normalizeRetrievalWeights({ relevance: 1, recency: 0, importance: 0 }).weights;
  const r = evaluateRetrieval([{ query: q, targetId: 'T' }], C, W, now);
  assert.equal(r.rows[0].rankWeighted, r.rows[0].rankRel,
    '只按相关加权时两套名次必须相同，实得 相关=' + r.rows[0].rankRel + ' 加权=' + r.rows[0].rankWeighted);
  assert.equal(r.verdict, 'tie');
  assert.match(evalLine(r), /持平/);
});

test('④ 样本缺失必须被数出来（不许静默丢弃），空样本不许抛', () => {
  const C = sedimentCacheGet(fillers().concat([mk('A', '安静库房')]));
  const r = evaluateRetrieval([
    { query: '安静库房', targetId: 'A' },
    { query: '安静库房', targetId: 'NOT-EXIST' },
    { query: '安静库房', targetId: '' }
  ], C, null, now);
  assert.equal(r.n, 1, '只有一条可用样本');
  assert.equal(r.missing, 1, '找不到的目标必须计入 missing，实得 ' + r.missing);
  const empty = evaluateRetrieval([], C, null, now);
  assert.equal(empty.verdict, 'no-samples');
  assert.match(evalLine(empty), /无可评估样本/);
  assert.equal(evalLine(null).indexOf('无可评估样本'), 0);
});
