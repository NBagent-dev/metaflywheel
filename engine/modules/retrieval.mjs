// MetaFlywheel 检索小脑模块（P079 重构第 2 步：从 apply 闭包抽出，参数化 state）
// 双语料：沉积（熵屏障不可变 → 索引缓存，P073 缓存面②）/ 已结账问题（小语料，每查现算）。
// P079 修复：P073 改签名后 problem-corpus 分支 4 参错位静默失效 —— 此处恢复为显式双通道。
import { bigrams } from "./util.mjs";

export const RETRIEVE_TOP_N = 2;
export const RETRIEVE_MIN_SCORE = 0.35; // 与 M9③ 因材施教同阈值（v0）

// ---- 沉积语料缓存面（P073 缓存面②：append-only 内容指纹键）----
let sedCorpusCache = { key: '', dfTitle: {}, dfRet: {}, total: 0, items: [] };
export function sedimentCacheGet(sediments) {
  const key = sediments.length + ':' + (sediments.length ? sediments[sediments.length - 1].id : '');
  if (sedCorpusCache.key === key) return sedCorpusCache;
  const items = [];
  const seenT = {}, seenR = {};
  const dfTitle = {}, dfRet = {};
  for (let i = 0; i < sediments.length; i++) {
    const s = sediments[i];
    const titleSet = bigrams(s.title);
    const retSet = bigrams(s.title + ' ' + (s.tags || []).join(' '));
    items.push({ ref: s, titleSet: titleSet, retSet: retSet });
    for (const g of titleSet) if (!seenT[g]) { seenT[g] = true; dfTitle[g] = (dfTitle[g] || 0) + 1; }
    for (const g of retSet) if (!seenR[g]) { seenR[g] = true; dfRet[g] = (dfRet[g] || 0) + 1; }
  }
  sedCorpusCache = { key: key, dfTitle: dfTitle, dfRet: dfRet, total: items.length, items: items };
  return sedCorpusCache;
}

export function retrieveTop(queryText, topN, minScore, C) {
  try {
    const Q = bigrams(queryText);
    const out = [];
    for (let i = 0; i < C.items.length; i++) {
      const it = C.items[i];
      let inter = 0, eff = 0;
      for (const g of it.retSet) {
        if (C.dfRet[g] && C.total && C.dfRet[g] / C.total > 0.4) continue;
        eff += 1;
        if (Q.has(g)) inter += 1;
      }
      const score = eff ? inter / eff : 0;
      if (score >= minScore && inter >= 2) out.push({ score: Math.round(score * 100) / 100, ref: it.ref });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, topN);
  } catch (e) { return []; }
}

// ---- 一般语料检索（P027/A4：DF>40% 领域通用词过滤 + 有效重叠≥2）----
export function retrieveFromCorpus(queryText, corpus, topN, minScore) {
  try {
    const Q = bigrams(queryText);
    const df = {};
    for (let i = 0; i < corpus.length; i++) {
      const seen = {};
      for (const g of bigrams(corpus[i].text)) { if (!seen[g]) { seen[g] = true; df[g] = (df[g] || 0) + 1; } }
    }
    const total = corpus.length;
    const out = [];
    for (let i = 0; i < corpus.length; i++) {
      const B = bigrams(corpus[i].text);
      let inter = 0, eff = 0;
      for (const g of B) {
        if (df[g] && total && df[g] / total > 0.4) continue;
        eff += 1;
        if (Q.has(g)) inter += 1;
      }
      const score = eff ? inter / eff : 0;
      if (score >= minScore && inter >= 2) out.push({ score: Math.round(score * 100) / 100, ref: corpus[i].ref });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, topN);
  } catch (e) { return []; }
}

export function topActiveProblem(problems) {
  let top = null;
  for (const k in problems) {
    const p = problems[k];
    if ((p.stage === 'S' || p.stage === 'F' || p.stage === 'C') && (!top || p.updatedAt > top.updatedAt)) top = p;
  }
  return top;
}

// 返回 [{text}]——内容行，前缀由调用方决定（快照'- 检索小脑(P023-D)：'/状态视图'[小脑] '）
export function retrievalHits(state) {
  const out = [];
  try {
    const top = topActiveProblem(state.problems);
    if (!top) return out;
    const query = top.title + ' ' + String(top.framing || '');
    // 通道 1：沉积语料（缓存面）
    const C = sedimentCacheGet(state.sediments);
    const sedHits = retrieveTop(query, RETRIEVE_TOP_N, RETRIEVE_MIN_SCORE, C);
    if (sedHits.length) {
      const parts = [];
      for (let i = 0; i < sedHits.length; i++) parts.push(sedHits[i].ref.id + '(' + sedHits[i].score + ')');
      out.push({ text: '与【' + top.id + '】相似的沉积 ' + parts.join('·') + '——全文按需读取（.mpm/deposits/）' });
    }
    // 通道 2：已结账问题语料（P079 修复：P073 签名错位曾令本分支静默失效）
    const probCorpus = [];
    for (const k in state.problems) {
      const p = state.problems[k];
      if (p.id === top.id) continue;
      if (p.stage === 'C' || p.stage === 'D' || p.stage === 'E') probCorpus.push({ text: p.title + ' ' + String(p.framing || '').slice(0, 120), ref: p });
    }
    const probHits = retrieveFromCorpus(query, probCorpus, RETRIEVE_TOP_N, RETRIEVE_MIN_SCORE);
    if (probHits.length) {
      const parts = [];
      for (let i = 0; i < probHits.length; i++) parts.push(probHits[i].ref.id + ' ' + String(probHits[i].ref.title).slice(0, 40) + '(' + probHits[i].score + ')');
      out.push({ text: '与【' + top.id + '】相似的历史经验 ' + parts.join('·') + '——同类 framing/沉积可复用' });
    }
  } catch (e) {}
  return out;
}
