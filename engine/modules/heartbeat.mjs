// P556 · 「生命体征卡」——把散在各模块里的量合成一张卡
//
// ★ 这是"做一个能跑的小玩意"的产物，而它的判据被两条 adopted 沉积钉死了：
//   ① P526-M443「看起来能跑 ≠ 真的能跑」⇒ 必须有可核对的执行输出，不许"写完就说做好了"
//   ② P117-M71「判据不许永远为真（无区分力）」⇒ 判据必须**能被失败**：
//      喂坏数据 ⇒ 必须报错，不许静默显示 0
//
// ★ 为什么它值得做（不是玩具）：这些量现在散在
//   `awareness.mjs` / `unforeseen.mjs` / 账本顶层字段 / 快照十几行里，
//   而没有任何一处能**一眼看完**。这张卡就是那个"一处"。
//
// ★ 设计原则（与今天的教训一致）：
//   · **缺数据必须显式说"缺"**，不许显示 0（0 与"没有"是两件事）
//   · **每项带出处**（P487-M405：最后一米在调用点）
//   · **不回答"有没有意识"**（P512）

import { awarenessPanel } from './awareness.mjs';
import { typeLedger } from './unforeseen.mjs';

export const VITALS_VERSION = 1;

/** 严格取数：缺字段必须是 null（不是 0），且记一条"缺什么" */
function pick(obj, path) {
  let cur = obj;
  for (const k of String(path).split('.')) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[k];
  }
  return cur === undefined ? null : cur;
}

/**
 * 算生命体征。
 * @param {object} state 账本
 * @param {Array}  unforeseenEntries 类型账的 entries
 * @returns {{ ok:boolean, error?:string, items?:Array, missing?:Array, asOf?:string }}
 *   ★ 注意：**失败时返回 ok:false 而不是抛** —— 因为它是给"看一眼"用的，
 *     抛异常会让卡片整个消失（那正是 P484 保险丝的理由）。但**绝不静默成功**。
 */
export function vitals(state, unforeseenEntries) {
  // ★ 判据②：坏数据必须被认出来（而不是显示一排 0）
  if (state == null || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, error: '账本不是一个对象（收到 ' + (Array.isArray(state) ? 'array' : typeof state) + '）' };
  }
  // 判据②的第二层：连最基本的字段都没有 ⇒ 这不是一份账本
  const anchors = ['sediments', 'problems', 'hits'];
  const missingAnchors = anchors.filter(function (k) { return !(k in state); });
  if (missingAnchors.length === anchors.length) {
    return { ok: false, error: '不像一份账本：sediments / problems / hits 一个都没有' };
  }

  const items = [];
  const missing = [];
  const add = function (label, value, source, note) {
    if (value === null) { missing.push(label); }
    items.push({ label: label, value: value, source: source, note: note || '' });
  };

  // ── 规模 ──
  add('题', pick(state, 'seq'), 'state.seq');
  add('沉积', Array.isArray(state.sediments) ? state.sediments.length : null, 'state.sediments.length');
  add('真采用', Array.isArray(state.adopts) ? state.adopts.length : null, 'state.adopts.length');
  add('命中', Array.isArray(state.hits) ? state.hits.length : null, 'state.hits.length');
  const hits = Array.isArray(state.hits) ? state.hits : [];
  add('未处置', hits.filter(function (h) { return h && !h.disposedAt; }).length, 'state.hits.filter(!disposedAt)');
  add('叙述', Array.isArray(state.narrations) ? state.narrations.length : null, 'state.narrations.length');

  // ── 回环率（一个数，且它随沉积增长会掉——这是它的诚实之处）──
  const seds = Array.isArray(state.sediments) ? state.sediments.length : 0;
  const adopts = Array.isArray(state.adopts) ? state.adopts.length : 0;
  const loopRate = seds > 0 ? +(adopts / seds * 100).toFixed(1) : null;
  add('回环率', loopRate === null ? null : loopRate + '%', 'adopts / sediments', '★ 分母会随沉积增长 ⇒ 多写一条没被用的，这个数就往下掉');

  // ── 七项（复用 awareness，而它自己已经有"缺口/退化/静止"三档）──
  let aw = null;
  try { aw = awarenessPanel(state); } catch (e) { aw = null; }
  if (aw && Array.isArray(aw.items)) {
    const measurable = aw.items.filter(function (i) { return i.kind === 'auditable'; }).length;
    add('可量指标', measurable + '/' + aw.items.length, 'awarenessPanel', '退化 ' + (aw.degraded.length ? aw.degraded.join(',') : '无') + ' · 静止 ' + (aw.stale.length ? aw.stale.join(',') : '无'));
  } else {
    add('可量指标', null, 'awarenessPanel', 'awareness 模块算不出来');
  }

  // ── 类型账 ──
  let tl = null;
  try { tl = typeLedger(unforeseenEntries); } catch (e) { tl = null; }
  add('未预见后果', tl ? tl.total : null, 'unforeseen.json', tl && tl.total ? (tl.categoryCount + ' 类 · ' + (tl.stalled ? '⚠ 长停了' : '类型还在变')) : '（从未记录）');

  return { ok: true, items: items, missing: missing, asOf: new Date().toISOString() };
}

/**
 * 渲染成一张文本卡（终端里能看，也用来做"真的跑起来"的证据）。
 * ★ 缺数据时必须显示「—（缺）」而不是 0 —— 这是 P117-M71 的直接落实：
 *   若缺数据显示 0，那这个卡就"永远看起来正常"，判据无区分力。
 */
export function renderVitals(v) {
  if (!v || !v.ok) {
    return ['╔══ 生命体征 ══╗', '║ ⚠ 算不出来：' + (v && v.error ? v.error : '未知错误'), '╚══════════════╝'].join('\n');
  }
  const out = [];
  out.push('╔══ MPM 生命体征 ═══════════════════════════╗');
  for (const it of v.items) {
    const val = it.value === null ? '—（缺）' : String(it.value);
    out.push('║ ' + it.label.padEnd(10) + val.padEnd(12) + '[' + it.source + ']');
    if (it.note) out.push('║   ' + it.note);
  }
  out.push('╟──────────────────────────────────────────╢');
  out.push('║ 缺 ' + v.missing.length + ' 项' + (v.missing.length ? '：' + v.missing.join('、') : '') + '  （★ 缺不许显示成 0）');
  out.push('║ ' + v.asOf.slice(0, 19).replace('T', ' '));
  out.push('╚══════════════════════════════════════════╝');
  return out.join('\n');
}
