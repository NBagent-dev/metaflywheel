// P594 ④ 沉积的「富化」侧车：让一条旧沉积能被**后来才想到的词**检索到
//
// ★ 病（`P567-M472` 追了五轮的那个数）：489 条沉积里 332 条 >14 天从未被引用。
//   而沉积是**不可变 markdown** ⇒ **写入那一刻没出现的词，永远不会出现在它身上**。
//   ⇒ 所以"短标题的沉积不可比"不是措辞问题，是**结构问题**：它的可检索面在写入瞬间封死了。
//
// ★ 抄自 A-MEM 的 memory evolution（docs/DEVELOPMENT.md §10 路线图④）：
//   新记忆写入时可以**回头更新旧记忆的属性**（contextual description / keywords / tags）。
//   ⇒ 我们只抄这一点，且**不改原文**：原文仍然是不可变证据，富化放在账本里的 `enriched` 侧车。
//
// ★ 为什么先做"侧车"而不是"允许改原文"：
//   原文是判据的基准（diff、引用、审计都读它）。允许改 = 允许悄悄重写历史。
//   ⇒ 侧车只增加**检索面的别名**，不改变正文一个字节。

export const ENRICH_MAX = 12;

function normList(v) {
  if (v == null) return null;
  const arr = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(/[,，;；\s]+/) : null);
  if (!arr) return null;
  const out = [];
  const seen = Object.create(null);
  for (let i = 0; i < arr.length; i++) {
    const t = String(arr[i] || '').trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen[k]) continue;
    seen[k] = 1;
    out.push(t.slice(0, 40));
    if (out.length >= ENRICH_MAX) break;
  }
  return out;
}

/**
 * 合并一次富化（**追加，不覆盖**——重复调用不会丢旧词）。
 * @returns {{ok:boolean, sediment?:object, added?:{keywords:string[],aliases:string[]}, reason?:string}}
 */
export function enrichSediment(sed, patch, at) {
  if (!sed || typeof sed !== 'object' || !sed.id) return { ok: false, reason: 'no-sediment' };
  const kw = normList(patch && patch.keywords);
  const al = normList(patch && patch.aliases);
  if (kw === null && al === null) return { ok: false, reason: 'no-terms（keywords / aliases 至少给一个）' };
  const cur = (sed.enriched && typeof sed.enriched === 'object') ? sed.enriched : {};
  const prevKw = Array.isArray(cur.keywords) ? cur.keywords : [];
  const prevAl = Array.isArray(cur.aliases) ? cur.aliases : [];
  const merge = function (a, b) {
    const out = a.slice();
    const seen = Object.create(null);
    for (let i = 0; i < out.length; i++) seen[String(out[i]).toLowerCase()] = 1;
    let added = 0;
    for (let i = 0; i < b.length; i++) {
      const k = String(b[i]).toLowerCase();
      if (seen[k]) continue;
      seen[k] = 1; out.push(b[i]); added += 1;
    }
    return { list: out.slice(0, ENRICH_MAX), added: added };
  };
  const mk = merge(prevKw, kw || []);
  const ma = merge(prevAl, al || []);
  if (!mk.added && !ma.added) return { ok: false, reason: 'nothing-new（这些词已经有了）' };
  sed.enriched = {
    keywords: mk.list,
    aliases: ma.list,
    at: (typeof at === 'number') ? at : Date.now(),
    reason: String((patch && patch.reason) || '').slice(0, 200)
  };
  return { ok: true, sediment: sed, added: { keywords: mk.added, aliases: ma.added } };
}

/** 检索用的**扩展文本**：标题 + 标签 + 富化词（别名与关键词）。 */
export function enrichTerms(sed) {
  if (!sed || typeof sed !== 'object') return '';
  const parts = [String(sed.title || '')];
  if (Array.isArray(sed.tags) && sed.tags.length) parts.push(sed.tags.join(' '));
  const e = sed.enriched;
  if (e && typeof e === 'object') {
    if (Array.isArray(e.keywords) && e.keywords.length) parts.push(e.keywords.join(' '));
    if (Array.isArray(e.aliases) && e.aliases.length) parts.push(e.aliases.join(' '));
  }
  return parts.filter(Boolean).join(' ');
}

/** 一行摘要（给工具报告用）。 */
export function enrichLine(sed) {
  const e = sed && sed.enriched;
  if (!e || typeof e !== 'object') return '未富化（检索面 = 标题 + 标签）';
  const kw = Array.isArray(e.keywords) ? e.keywords.length : 0;
  const al = Array.isArray(e.aliases) ? e.aliases.length : 0;
  return '已富化：关键词 ' + kw + ' · 别名 ' + al + '（不改原文，只扩检索面）';
}
