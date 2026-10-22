// P594 ③ 事件日志：让"整份覆盖写"留下可回放的增量
//
// ★ 病（今天亲历两次）：`.mpm/flywheel.json` 是 3.7 MB **整份覆盖写**，
//   外部脚本改账本 ≈10 分钟后被 whole-state persist 无声吞掉；`.bak` 只有一代。
//   ⇒ 于是"账本变了"这件事**没有历史**：只剩最终状态，与一份可能已经被覆盖的备份。
//
// ★ 为什么先做"增量日志"而不是直接换存储：
//   换存储（SQLite / 事件溯源）要改所有读写路径，风险高、且会破坏"一个 JSON 可读"的现有优势。
//   ⇒ 所以 v1 只做**旁路**：每次写盘前追加一行摘要到 `events.jsonl`。
//     它不改变主存储，只让"什么时候、变了多少"变成可回放的。
//
// ★ 它不能做什么（写清楚，免得被当成审计）：
//   ① 不记录**逐字段** diff（只记各集合的条数变化与变化的顶层键）；
//   ② 不能还原任意历史版本（要用 `flywheel.json.bak*`）；
//   ③ 不保证 dedupe：同一秒多次写就是多行。
//   ⇒ 它的用途是"回答'刚才那次 persist 改了什么'"，不是"穿越回去"。

/** 一行事件的摘要（纯函数，好测）。 */
export function summarize(state) {
  const s = state || {};
  const problems = s.problems && typeof s.problems === 'object' ? Object.keys(s.problems).length : 0;
  const sediments = Array.isArray(s.sediments) ? s.sediments.length : 0;
  const hits = Array.isArray(s.hits) ? s.hits.length : 0;
  const unknowns = Array.isArray(s.unknowns) ? s.unknowns.length : 0;
  const adopts = Array.isArray(s.adopts) ? s.adopts.length : 0;
  const uns = Array.isArray(s.unknowns) ? s.unknowns.filter(function (u) { return u && !u.resolvedAt; }).length : 0;
  const owed = Array.isArray(s.hits) ? s.hits.filter(function (h) { return h && !h.disposedAt; }).length : 0;
  let retired = 0;
  if (Array.isArray(s.sediments)) {
    for (let i = 0; i < s.sediments.length; i++) {
      const x = s.sediments[i];
      const st = x && x.status ? String(x.status) : 'active';
      if (st !== 'active') retired += 1;
    }
  }
  return { seq: (typeof s.seq === 'number') ? s.seq : 0, problems, sediments, retired, hits, owedHits: owed, unknowns: uns, adopts };
}

/** 两个摘要之间的差异（只报"变了的键"，没变就不出现）。 */
export function diffSummary(prev, next) {
  const a = prev || {};
  const b = next || {};
  const keys = Object.keys(b);
  const changed = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (a[k] !== b[k]) changed[k] = (typeof a[k] === 'number' ? a[k] : null) + '→' + b[k];
  }
  return changed;
}

/**
 * 一行事件（JSON 字符串，不含换行）。
 * @param prev 上一次摘要（可为 null ⇒ 首次）
 * @param next 本次摘要
 * @param extra 额外字段（如 {via:'tools', bytes, sha}）
 */
export function formatEventLine(prev, next, at, extra) {
  const rec = {
    at: (typeof at === 'number') ? at : Date.now(),
    iso: new Date((typeof at === 'number') ? at : Date.now()).toISOString(),
    state: summarize(next && next.state ? next.state : {}),
    via: (extra && extra.via) ? String(extra.via) : 'persist'
  };
  if (prev && prev.state) rec.changed = diffSummary(summarize(prev.state), rec.state);
  if (extra && typeof extra.bytes === 'number') rec.bytes = extra.bytes;
  if (extra && extra.sha) rec.sha = String(extra.sha).slice(0, 16);
  return JSON.stringify(rec);
}

/** 把一行追加到 events.jsonl（调用方给 fs 写接口，便于测试注入内存实现）。 */
export async function appendEventLine(writer, line) {
  if (!writer || typeof writer.append !== 'function') return { ok: false, reason: 'no-writer' };
  try {
    await writer.append(String(line) + '\n');
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e && e.message) ? e.message : 'append-failed' };
  }
}

/**
 * 有界滚动拼接：把一行接到文本末尾，**只保留最后 max 行**。
 * ★ 为什么要有界：`fsSvc` 没有 append，只能「读—拼—写」；若事件文件无界增长，
 *   每次 persist 都在搬一个越来越大的字符串，最终把一次落盘变成 O(n) 的搬运 ——
 *   那是把「可审计」换成了「越来越慢」。
 * ★ 为什么保留**最后** N 行：最近的才是「刚才那次写盘改了什么」。
 */
export function trimEventLines(prevText, line, max) {
  const cap = (typeof max === 'number' && max > 0) ? Math.floor(max) : 500;
  const old = String(prevText == null ? '' : prevText).split(/\r?\n/).filter(function (x) { return x && x.trim(); });
  const add = String(line == null ? '' : line).trim();
  const all = add ? old.concat([add]) : old;
  const kept = all.slice(-cap);
  return { text: kept.length ? (kept.join('\n') + '\n') : '', kept: kept.length, dropped: all.length - kept.length };
}

/** 解析 events.jsonl 内容（坏行跳过并计数——日志损坏不许拖垮加载）。 */
export function parseEvents(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let bad = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    try { const o = JSON.parse(t); if (o && typeof o === 'object') out.push(o); else bad += 1; }
    catch (e) { bad += 1; }
  }
  return { events: out, bad: bad };
}
