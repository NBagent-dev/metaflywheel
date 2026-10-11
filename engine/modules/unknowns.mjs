// P517③ **未核清单**：让"我不知道的东西"也跨代活着。
//
// 与 principal 正好配成一对：
//   · `principal`  记**我知道的**（他说过什么、怎么想的）—— 用于"动手前别违背他的方式"
//   · `unknowns`   记**我不知道的**（我标注过"未核"但没验的事）—— 用于"开工前先想起自己没查什么"
//
// ★三条防"未核通胀"的硬约束（熵屏障；否则这张表会变成垃圾场）：
//   ① 每条**必须**写 `until`（退役条件）—— 写不出退役条件，说明它不是"未核"，是"没想清楚"
//   ② 解决时必须**带证据**（`evidence`）—— 不许把"我后来觉得没事了"当解决
//   ③ 展示只给最近 N 条 + 总数；`consultUnknowns` 只提示、**永不拦**（不知道的东西不许挡路）
//
// 语义边界（写死在零件里）：`unknowns` 是**我自己标注过的未核**，
//   不是"世界上所有我不知道的事"——后者不可枚举，声称能记它才是真的通胀。

export const UNKNOWN_MAX = 200;

function mkId(at) { return 'U' + String(at); }

/** 归一化一条未核记录（缺字段就是缺，不臆造）。 */
export function normalizeUnknown(e) {
  if (!e || typeof e !== 'object') return null;
  const text = String(e.text || '').trim();
  const key = String(e.key || '').trim();
  const until = String(e.until || '').trim();
  const at = (typeof e.at === 'number') ? e.at : Date.now();
  if (!text || !key || !until) return null;      // ★三件必填：写不清退役条件的，不许进表
  return {
    id: String(e.id || mkId(at)),
    at: at, key: key, text: text, why: String(e.why || '').trim(),
    until: until, source: String(e.source || '').trim(),
    resolvedAt: (typeof e.resolvedAt === 'number') ? e.resolvedAt : null,
    resolvedBy: String(e.resolvedBy || '').trim()
  };
}

/** 新增一条。**拒绝**缺 text/key/until 的输入（返回 entry:null，让调用方显式失败）。 */
export function addUnknown(list, entry) {
  const arr = Array.isArray(list) ? list.slice() : [];
  const rec = normalizeUnknown(entry);
  if (!rec) return { list: arr, entry: null };
  if (arr.some(function (e) { return e && e.id === rec.id; })) return { list: arr, entry: null };
  arr.push(rec);
  if (arr.length > UNKNOWN_MAX) arr.shift();     // 有界：超限丢最旧（并可在报告里说明）
  return { list: arr, entry: rec };
}

/** 结掉一条（按 id 或 key）。**必须给证据** —— 否则拒绝（不许"我觉得没事了"）。 */
export function resolveUnknown(list, idOrKey, evidence, at) {
  const ev = String(evidence || '').trim();
  const arr = Array.isArray(list) ? list.slice() : [];
  if (!ev) return { list: arr, resolved: [] };
  const now = (typeof at === 'number') ? at : Date.now();
  const resolved = [];
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!e || e.resolvedAt) continue;
    if (e.id === idOrKey || e.key === idOrKey) {
      arr[i] = Object.assign({}, e, { resolvedAt: now, resolvedBy: ev });
      resolved.push(arr[i]);
    }
  }
  return { list: arr, resolved: resolved };
}

/** 归并（恢复纪律：取并集、按 id 去重、不覆盖——沿用 P514/P517）。 */
export function mergeUnknowns(a, b) {
  const out = [], seen = Object.create(null);
  const push = function (e) {
    const r = normalizeUnknown(e);
    if (!r || seen[r.id]) return;
    seen[r.id] = 1; out.push(r);
  };
  for (const e of (Array.isArray(a) ? a : [])) push(e);
  for (const e of (Array.isArray(b) ? b : [])) push(e);
  out.sort(function (x, y) { return (x.at || 0) - (y.at || 0); });
  return out.length > UNKNOWN_MAX ? out.slice(-UNKNOWN_MAX) : out;
}

/** 尚未核掉的条目。 */
export function openUnknowns(list) {
  return (Array.isArray(list) ? list : []).filter(function (e) { return e && !e.resolvedAt; });
}

/**
 * ★"在相关题开工前主动浮现"：给定我要做的事，找出相关的未核条目。
 * **只产生 hint，永不 ask/deny** —— 不知道的东西不许挡路，只许提醒。
 */
export function consultUnknowns(list, subject) {
  const s = String(subject == null ? '' : subject);
  if (!s) return { hits: [], verdict: null, why: '' };
  const hits = openUnknowns(list).filter(function (e) {
    const k = String(e.key || '');
    if (!k) return false;
    if (s.indexOf(k) >= 0) return true;
    const grams = [];
    for (let i = 0; i + 1 < k.length; i++) grams.push(k.slice(i, i + 2));
    return grams.length > 0 && grams.some(function (g) { return s.indexOf(g) >= 0; });
  });
  if (!hits.length) return { hits: [], verdict: null, why: '' };
  return {
    hits: hits,
    verdict: 'hint',   // ★永不 ask/deny
    why: '未核清单(P517③·命中 ' + hits.length + ' 条)：'
      + hits.slice(0, 3).map(function (e) { return '「' + String(e.text).slice(0, 40) + '」(退役条件：' + String(e.until).slice(0, 30) + ')'; }).join(' · ')
      + '——**这些是我自己标注过"没验"的**，动手前先想起它们。'
  };
}

/** 快照那一行：没有未核条目 ⇒ 返回空串（负控：不许凭空说"我没验过"）。 */
export function unknownLine(state, limit) {
  const all = (state && Array.isArray(state.unknowns)) ? state.unknowns : [];
  if (!all.length) return '';
  const open = openUnknowns(all);
  const done = all.length - open.length;
  const n = (typeof limit === 'number' && limit > 0) ? limit : 3;
  const recent = open.slice(-n).map(function (e) { return '「' + String(e.text).slice(0, 36) + '」(' + e.key + ')'; });
  return '- 未核清单(P517③·**我知道自己没验的东西，也要跨代活着**)：未核 ' + open.length + ' 条 · 已核销 ' + done + ' 条'
    + (recent.length ? '：' + recent.join(' · ') : '')
    + '——**这些是"未核"不是"没问题"**；动手前先检索，核销时必须带证据（`mpm_unknown action=resolve`）。';
}
