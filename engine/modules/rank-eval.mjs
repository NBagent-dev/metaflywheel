// P596 · ⑤ 的度量：三项加权到底有没有把"该被想起的那条"排上来
//
// ★ 为什么先造度量、再改排序（P595 留下的那一句）：
//   改 `retrieveTop` 的排序 = 改变每轮注进去的内容，而"注入变了"没法用单元测试
//   证明是好是坏。⇒ 先有一个能回答"换排序后命中是否更好"的度量，否则就是凭手感改。
//
// ★ 用什么当"真值"：账本里已有的 **adopt（采用）** 记录 ——
//   每条 adopt 都是"某条沉积在某个决定里真的起了作用"的**事后证据**。
//   于是问题变成可算的：
//     对每一条 adopt，拿它的 `forWhat`（当时的决定）当查询，
//     看那条被采用的沉积在【纯相关排序】与【三项加权排序】里分别排第几。
//   ⇒ 加权更好 = 被采用的那条**排得更靠前**；这与"人工标注"无关，是账本自己产生的标签。
//
// ★ 诚实的边界（写死在这里，免得被当成结论）：
//   ① 样本只有十几条（当前 11）⇒ 只能看方向，不能看显著；
//   ② adopt 是"我事后承认用过它"，**不是"引擎当年把它排上来了"** ——
//      它可能是被别的线索触发、然后我回头找到的。所以这个度量测的是
//      「三项加权是否更接近我实际认为有用」，不是「召回率」。
//   ③ 纯相关分数的算法**复制**了 retrieve.mjs 的公式（它只返回 topN，不返回全量）。
//      ⇒ 因此本文件带一条**交叉核验判据**：同一语料同一查询，
//        这里的分数必须与 `retrieveTop` 给出的分数一致（否则两套公式会悄悄分叉）。
import { bigrams } from './util.mjs';
import { retrieveTop } from './retrieval.mjs';
import { scoreFactors, DEFAULT_RETRIEVAL_WEIGHTS } from './retrieval-weights.mjs';

/** 与 retrieve.mjs 同公式，但返回**全量**（含被 minScore 挡掉的那些）。 */
export function relevanceAll(queryText, C) {
  const out = [];
  try {
    const Q = bigrams(queryText);
    const items = (C && Array.isArray(C.items)) ? C.items : [];
    const dfRet = (C && C.dfRet) || {};
    const total = (C && C.total) || 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let inter = 0, eff = 0;
      for (const g of it.retSet) {
        if (dfRet[g] && total && dfRet[g] / total > 0.4) continue;
        eff += 1;
        if (Q.has(g)) inter += 1;
      }
      const score = eff ? inter / eff : 0;
      out.push({ ref: it.ref, score: Math.round(score * 100) / 100, inter: inter });
    }
  } catch (e) { /* 与 retrieveTop 同：出错返回空，不抛 */ }
  out.sort(function (a, b) { return b.score - a.score; });
  return out;
}

/**
 * 评估：把每条 adopt 的目标沉积，在两种排序下各排第几。
 * @param samples [{query, targetId}]
 * @param C 语料（sedimentCacheGet 的返回）
 * @param weights 三项权重
 * @param now 当前时刻
 */
export function evaluateRetrieval(samples, C, weights, now) {
  const W = weights || DEFAULT_RETRIEVAL_WEIGHTS;
  const list = Array.isArray(samples) ? samples : [];
  const rows = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const targetId = String((s && s.targetId) || '');
    const query = String((s && s.query) || '');
    if (!targetId) continue;
    const rel = relevanceAll(query, C);
    const total = rel.length;
    const at = rel.findIndex(function (x) { return x.ref && x.ref.id === targetId; });
    if (at < 0) { rows.push({ targetId: targetId, missing: true }); continue; }
    // 纯相关名次（1-based；同分按出现顺序，与 retrieveTop 的排序口径一致）
    const rankRel = at + 1;
    // 三项加权名次：对全量做 scoreFactors 再排序（收窄范围时用同一批）
    const scored = rel.map(function (x) {
      const f = scoreFactors({ relevance: x.score, depositedAt: x.ref.depositedAt, cites: x.ref.cites }, W, now, 0);
      return { id: x.ref.id, score: x.score, totalScore: f.total, factors: f.weighted };
    });
    // 同分必须**沿用纯相关的原序**（稳定排序，返回 0）——否则权重退化时两套名次会分叉。
    //   ★这正是负控③抓到的：只按相关加权时，两边给同分却按不同规则破平，名次从 1 变成 3。
    scored.sort(function (a, b) { return (b.totalScore - a.totalScore) || 0; });
    const atW = scored.findIndex(function (x) { return x.id === targetId; });
    const rankW = atW + 1;
    rows.push({ targetId: targetId, total: total, rankRel: rankRel, rankWeighted: rankW, delta: rankRel - rankW });
  }
  const ok = rows.filter(function (r) { return !r.missing; });
  const improved = ok.filter(function (r) { return r.delta > 0; }).length;
  const worse = ok.filter(function (r) { return r.delta < 0; }).length;
  const same = ok.filter(function (r) { return r.delta === 0; }).length;
  const avgRel = ok.length ? ok.reduce(function (a, r) { return a + r.rankRel; }, 0) / ok.length : 0;
  const avgW = ok.length ? ok.reduce(function (a, r) { return a + r.rankWeighted; }, 0) / ok.length : 0;
  return {
    n: ok.length,
    missing: rows.filter(function (r) { return r.missing; }).length,
    improved: improved, worse: worse, same: same,
    avgRankRel: Math.round(avgRel * 100) / 100,
    avgRankWeighted: Math.round(avgW * 100) / 100,
    verdict: (!ok.length) ? 'no-samples' : (improved > worse ? 'weighting-helps' : improved < worse ? 'weighting-hurts' : 'tie'),
    rows: rows
  };
}

/** 一行结论（**必须把 N、"方向不是显著"、以及"均值与计数可能不一致"一起说出来**）。 */
export function evalLine(r) {
  if (!r || !r.n) return '无可评估样本（adopt 记录为空或目标沉积不在语料里）';
  const head = '样本 ' + r.n + ' 条（缺失 ' + r.missing + '）：改善 ' + r.improved
    + ' · 恶化 ' + r.worse + ' · 不变 ' + r.same;
  const verdict = ' ⇒ ' + (r.verdict === 'weighting-helps' ? '加权使目标更靠前（方向有利，N 太小不足以称显著）'
    : r.verdict === 'weighting-hurts' ? '加权使目标更靠后（方向不利：先别上线）'
    : '方向持平（加权没有可测的好处）');
  // ★P596：均值会被离群值拖动（实测：改善 4 / 恶化 7，而均值反而变小），
  //   所以均值只作参考、并**明说它可能误导**；结论以"多数样本朝哪边变"为准。
  const tail = '。平均名次 ' + r.avgRankRel + ' → ' + r.avgRankWeighted
    + '（均值易被少数大变动拖动，以计数为准）';
  return head + verdict + tail;
}

/** 自证：本文件的公式必须与 retrieveTop 一致（否则两套公式会悄悄分叉）。 */
export function crossCheck(queryText, C, topN, minScore) {
  const mine = relevanceAll(queryText, C).filter(function (x) { return x.score >= minScore && x.inter >= 2; }).slice(0, topN);
  const theirs = retrieveTop(queryText, topN, minScore, C);
  const a = mine.map(function (x) { return x.ref.id + ':' + x.score; }).join(',');
  const b = theirs.map(function (x) { return x.ref.id + ':' + x.score; }).join(',');
  return { ok: a === b, mine: a, theirs: b };
}
