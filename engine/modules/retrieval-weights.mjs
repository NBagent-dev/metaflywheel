// P594 ⑤ 检索三项加权：相关性 / 新近度 / 重要性
//
// ★ 病：注入与检索只按"字面相关"排序 ⇒ **"昨天刚写的"和"三个月前的支柱"在打分上无区别**。
//   而我们的库房 489 条、跨 50 天：新近度与重要性早就该分开计。
//
// ★ 抄自 Generative Agents 的检索分（relevance / recency / importance 三项加权）。
//   ⚠ 诚实标注：该文原文我抓取时被 403 挡过（见 docs/DEVELOPMENT.md §10 路线图⑤），
//     三项的**结构**是公开转述里一致的，权重默认值是我自己定的 v0 —— 不是论文值。
//
// ★ 判据（唯一能证明"三项真的在起作用"）：把某一项权重置 0，**排序必须变化**。
//   如果不变 ⇒ 那一项是死的（算了但没参与），而"算了"很容易看起来像"参与了"。

export const DEFAULT_RETRIEVAL_WEIGHTS = Object.freeze({
  relevance: 1.0,    // 字面相关（现有 bigram 分数）
  recency: 0.3,      // 越新越靠前
  importance: 0.2    // 被引用过越多次越靠前
});

/** 半衰期（天）：30 天前的沉积，新近度因子 ≈ 0.5。v0 常数。 */
export const RECENCY_HALF_LIFE_DAYS = 30;

export function normalizeRetrievalWeights(raw) {
  const problems = [];
  const out = {};
  const keys = Object.keys(DEFAULT_RETRIEVAL_WEIGHTS);
  let src = null;
  if (raw == null) src = null;
  else if (typeof raw === 'object' && !Array.isArray(raw)) src = raw;
  else { problems.push('权重不是普通对象 ⇒ 全部回退默认'); }
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const d = DEFAULT_RETRIEVAL_WEIGHTS[k];
    const v = src ? src[k] : null;
    if (v == null) { out[k] = d; continue; }
    if (typeof v === 'number' && isFinite(v) && v >= 0) out[k] = v;
    else { problems.push(k + ' 非法（需要 ≥0 的有限数），回退 ' + d); out[k] = d; }
  }
  if (src) {
    const extra = Object.keys(src).filter(function (k) { return keys.indexOf(k) < 0; });
    if (extra.length) problems.push('未知项被忽略：' + extra.join('、'));
  }
  return { weights: out, problems: problems };
}

/** 新近度：指数半衰（0~1）。depositedAt 缺失 ⇒ 0.5（不奖不罚，不许因缺字段就当"很旧"）。 */
export function recencyFactor(depositedAt, now, halfLifeDays) {
  const t = (typeof now === 'number') ? now : Date.now();
  const hl = (typeof halfLifeDays === 'number' && halfLifeDays > 0) ? halfLifeDays : RECENCY_HALF_LIFE_DAYS;
  if (typeof depositedAt !== 'number' || !isFinite(depositedAt) || depositedAt <= 0) return 0.5;
  const days = Math.max(0, (t - depositedAt) / 86400000);
  return Math.pow(0.5, days / hl);
}

/** 重要性：被引用次数的对数压缩（0~1）。cites=0 ⇒ 0；cites 越大越接近 1。 */
export function importanceFactor(cites, maxCites) {
  const c = (typeof cites === 'number' && cites > 0) ? cites : 0;
  if (!c) return 0;
  const m = (typeof maxCites === 'number' && maxCites > 0) ? maxCites : c;
  return Math.min(1, Math.log(1 + c) / Math.log(1 + Math.max(1, m)));
}

/**
 * 单项加权分与三因子明细（**三项分别给出**，便于打印与归因）。
 * @returns {{relevance:number, recency:number, importance:number, weighted:object, total:number}}
 */
export function scoreFactors(item, weights, now, maxCites) {
  const W = weights || DEFAULT_RETRIEVAL_WEIGHTS;
  const rel = (item && typeof item.relevance === 'number' && isFinite(item.relevance)) ? item.relevance : 0;
  const rec = recencyFactor(item && item.depositedAt, now);
  const imp = importanceFactor(item && item.cites, maxCites);
  const weighted = {
    relevance: Math.round(rel * W.relevance * 1000) / 1000,
    recency: Math.round(rec * W.recency * 1000) / 1000,
    importance: Math.round(imp * W.importance * 1000) / 1000
  };
  const total = Math.round((weighted.relevance + weighted.recency + weighted.importance) * 1000) / 1000;
  return { relevance: Math.round(rel * 1000) / 1000, recency: Math.round(rec * 1000) / 1000, importance: Math.round(imp * 1000) / 1000, weighted: weighted, total: total };
}

/** 批量排序（稳定：同分按 id 升序，避免顺序随输入抖动）。 */
export function rankFactors(items, weights, now) {
  const list = Array.isArray(items) ? items : [];
  let maxCites = 0;
  for (let i = 0; i < list.length; i++) {
    const c = (list[i] && typeof list[i].cites === 'number') ? list[i].cites : 0;
    if (c > maxCites) maxCites = c;
  }
  const rows = [];
  for (let i = 0; i < list.length; i++) {
    const it = list[i] || {};
    const f = scoreFactors(it, weights, now, maxCites);
    rows.push({ id: String(it.id || ''), factors: f, total: f.total });
  }
  rows.sort(function (a, b) { return (b.total - a.total) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
  return { rows: rows, maxCites: maxCites };
}

/** 一行明细（给工具/快照用）：三项分别列出，不只给总分。 */
export function factorsLine(row) {
  if (!row || !row.factors) return '';
  const f = row.factors;
  return '相关 ' + f.relevance + '×w + 新近 ' + f.recency + '×w + 重要 ' + f.importance + '×w = ' + row.total;
}
