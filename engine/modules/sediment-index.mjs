// P594 ⑥ 离线索引：把"巡检的空转时间"变成一次可重建的索引构建
//
// ★ 病：`patrol` 每 20 分钟的"睡眠"只算标量陈旧，而 `P587` 已经证明那个标量的
//   主成分（81%）是"未引用沉积"。⇒ 巡检在算一个**语义可疑的量**，而没有做真正
//   能在"需要时省时间"的事：预先建好检索用的词面。
//
// ★ 抄自 HippoRAG 的"睡眠期离线整合"（docs/DEVELOPMENT.md §10 路线图⑥）：
//   海马体在离线时把经历**重整成可索引的结构**，而不是再算一遍"有多旧"。
//
// ★ 这一版的范围（诚实标注，不许被当成完成品）：
//   只做**词面索引**（每条沉积 → 去重词/二元组集合），不抽实体关系。
//   理由：实体抽取要 LLM 或词典，两者都会引入不可判定的错误；而词面索引
//   **可重建、可 diff、零外部依赖**，先把它做成事实标准，再谈实体。
//
// ★ 三条硬约束（判据会钉它们）：
//   ① **确定性**：同样的沉积 ⇒ 同样的字节（否则"重建"无法被验证）。
//   ② **可重建**：删掉索引文件能从账本重新生成，且与上次字节一致。
//   ③ **不含退役**：已退休的沉积不进索引（与 P592 同一口径）。

import { enrichTerms } from './sediment-enrich.mjs';
import { isRetired } from './sediment-status.mjs';

export const INDEX_VERSION = 1;

/** 词面切分：按非字母数字/汉字切，并保留长度≥2 的片段；中文另取二元组。 */
export function termsOf(text) {
  const s = String(text || '');
  const out = Object.create(null);
  const chunks = s.split(/[^0-9A-Za-z\u4e00-\u9fa5]+/);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (!c) continue;
    if (c.length >= 2) out[c.toLowerCase()] = 1;
    // 中文二元组（长度≥2 的中文串才有意义）
    if (/^[\u4e00-\u9fa5]+$/.test(c) && c.length >= 2) {
      for (let j = 0; j + 2 <= c.length; j++) out[c.slice(j, j + 2)] = 1;
    }
  }
  return Object.keys(out).sort();
}

/**
 * 构建索引（**确定性**：条目按 id 排序，词按字典序排序）。
 * @returns {{version:number, builtAt:number, count:number, retired:number, entries:Array}}
 */
export function buildIndex(sediments, at) {
  const list = Array.isArray(sediments) ? sediments : [];
  const entries = [];
  let retired = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s || !s.id) continue;
    if (isRetired(s)) { retired += 1; continue; }
    entries.push({ id: String(s.id), terms: termsOf(enrichTerms(s)) });
  }
  entries.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  return { version: INDEX_VERSION, builtAt: (typeof at === 'number') ? at : Date.now(), count: entries.length, retired: retired, entries: entries };
}

/**
 * 稳定序列化：**不含 builtAt**（否则每次重建字节都不同，判据②就没法钉）。
 * @returns {string}
 */
export function indexJson(idx) {
  const e = (idx && Array.isArray(idx.entries)) ? idx.entries : [];
  return JSON.stringify({ version: (idx && idx.version) || INDEX_VERSION, count: e.length, entries: e });
}

/** 两次构建是否等价（判据②的核心：可重建 = 内容等价）。 */
export function sameIndex(a, b) {
  return indexJson(a) === indexJson(b);
}

/** 一行统计（给工具报告用）。 */
export function indexLine(idx) {
  const e = (idx && Array.isArray(idx.entries)) ? idx.entries : [];
  let terms = 0;
  const seen = Object.create(null);
  for (let i = 0; i < e.length; i++) {
    const t = e[i].terms || [];
    terms += t.length;
    for (let j = 0; j < t.length; j++) seen[t[j]] = 1;
  }
  return '离线索引 v' + ((idx && idx.version) || INDEX_VERSION) + '：' + e.length + ' 条 · 词面 ' + terms
    + ' 个（去重 ' + Object.keys(seen).length + '）· 已跳过退役 ' + ((idx && idx.retired) || 0) + ' 条'
    + '（纯词面，未抽实体）';
}
