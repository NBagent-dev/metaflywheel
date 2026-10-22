import { t as tr } from "./i18n.mjs";   // ★P627：渲染面走词条（别名避开局部变量 t）
// P517 虚拟本体 · 第一块砖：**把"委托人的思考方式"变成可检索的一等公民**。
//
// 为什么不是"记他说过的话"：用户的原话是「要跟我有**相同的思考方式**」——
//   要求不是复述结论，而是**让装置里同时装着两种方式，并知道何时用哪一种**：
//     · 本质模式（委托人的）：这算不算 / 要不要 / 值不值得 ⇒ 先界定目标与边界，允许标"原则上不可判定"
//     · 证据模式（个体的）  ：是不是真的 / 通没通 / 做没做 ⇒ 必须给证人、必须能红
//   优先级：**先委托人后个体**——委托人的定位决定个体的判据该测什么。
//
// ★不可逾越的界线（写死在代码里，防止滑向表演）：
//   本模块只承载**形式与方向**（提问方式 / 判据方向 / 否决模式），
//   **不冒充"他在乎什么"的来源**——那是他的，只能由他写入。
//   ⇒ 因此：没有录入的条目，一律**不显示、不推断、不编造**（负控写进判据）。

/** 五种可机械识别的**思考方式**（不是情绪，不是话题）。 */
export const PRINCIPAL_MODES = {
  essence: { label: tr('pr.1'), why: tr('pr.2') },
  boundary: { label: tr('pr.3'), why: tr('pr.4') },
  direction: { label: tr('pr.5'), why: tr('pr.6') },
  meaning: { label: tr('pr.7'), why: tr('pr.8') },
  veto: { label: tr('pr.9'), why: tr('pr.10') }
};

/** 识别一句表态属于哪种思考方式。**返回 null 表示"认不出"——不猜。** */
export function modeOf(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return null;
  // 否决优先：明确的"不要/不再/停止/别"是最强约束，不能被其它模式盖过
  if (/(不要|不用|不再|别|停止|取消|否决|撤回|禁止)/.test(t)) return 'veto';
  if (/(本质|根本|说到底|究竟|到底解决)/.test(t)) return 'essence';
  if (/(否则|不然|若不是|才算是|就不算|就不叫)/.test(t)) return 'boundary';
  if (/(为什么|为何|能不能|是否可以|有没有|怎么才能)/.test(t) || /[?？]$/.test(t)) return 'direction';
  if (/(目标|意义|值得|应该做|要做的事|我们要)/.test(t)) return 'meaning';
  return null;
}

/**
 * 录入/更新一条委托人的表态。
 * ★覆盖规则：**同一约束对象上，时间戳较新者覆盖较旧者**（委托人的观点会变，装置必须跟着变）。
 * ★不允许默默违反、也不允许默默遵守：被覆盖的旧条目标记 `supersededBy`，保留在案（可回溯他改过主意）。
 * @returns {{list:Array, entry:object, superseded:Array}}
 */
export function recordPrincipal(list, entry) {
  const arr = Array.isArray(list) ? list.slice() : [];
  const at = (entry && typeof entry.at === 'number') ? entry.at : Date.now();
  const text = String((entry && entry.text) || '').trim();
  const key = String((entry && entry.key) || '').trim();   // 约束对象（如 "引擎改动流程"）
  if (!text || !key) return { list: arr, entry: null, superseded: [] };
  const mode = (entry && entry.mode) || modeOf(text);
  const rec = { at: at, key: key, text: text, mode: mode || null, note: String((entry && entry.note) || ''), supersededBy: null };
  const superseded = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i].key === key && !arr[i].supersededBy && arr[i].at <= at) {
      arr[i] = Object.assign({}, arr[i], { supersededBy: at });
      superseded.push(arr[i]);
    }
  }
  arr.push(rec);
  arr.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
  return { list: arr, entry: rec, superseded: superseded };
}

/** 取某约束对象上**当前有效**的那一条（未被覆盖、时间最新）。查不到 ⇒ null（不猜）。 */
export function activeFor(list, key) {
  let best = null;
  for (const e of (Array.isArray(list) ? list : [])) {
    if (!e || e.supersededBy || e.key !== key) continue;
    if (!best || (e.at || 0) > (best.at || 0)) best = e;
  }
  return best;
}

/**
 * ★归并两份列表（沿用 P514 的纪律：**恢复是归并，不是覆盖**）。
 * 去重键 = `at|key`；两边都保留，按时间排序。
 * 为什么：懒加载的恢复可能晚于本轮已录入的条目 ⇒ 直接赋值会把它抹掉。
 */
export function mergePrincipalLists(a, b) {
  const out = [];
  const seen = Object.create(null);
  const push = function (e) {
    if (!e || typeof e !== 'object') return;
    const k = String(e.at || 0) + '|' + String(e.key || '');
    if (seen[k]) return;
    seen[k] = 1;
    out.push(e);
  };
  for (const e of (Array.isArray(a) ? a : [])) push(e);
  for (const e of (Array.isArray(b) ? b : [])) push(e);
  out.sort(function (x, y) { return (x.at || 0) - (y.at || 0); });
  return out;
}

/**
 * ★P517②：**把"源"接到动作上** —— 动手前检索"他在类似事情上说过什么"。
 *
 * 判决只有两种，**永不 deny**：
 *   · 命中 veto 类   ⇒ `ask`（**请求复核**）—— 因为纪律是"不许默默违反，也不许默默遵守"，
 *                      而硬拒会把装置变成僵化门（P518 风险②：单一来源 = 单点故障 + 过拟合）
 *   · 命中其它类     ⇒ `hint`（提示）
 *   · 没命中 / 没条目 ⇒ `null`（**绝不拦** —— 负控写进判据）
 *
 * 命中口径（**故意从宽、只做提示**）：subject 里出现该条的 `key`，或 key 的任一 2-gram。
 * 宁多提示、不硬拦；漏报的代价由"快照那一行始终可见"兜底。
 */
export function consultPrincipal(list, subject) {
  const s = String(subject == null ? '' : subject);
  if (!s) return { hits: [], verdict: null, why: '' };
  const live = (Array.isArray(list) ? list : []).filter(function (e) { return e && !e.supersededBy; });
  const hits = [];
  for (const e of live) {
    const k = String(e.key || '');
    if (!k) continue;
    const grams = [];
    for (let i = 0; i + 1 < k.length; i++) grams.push(k.slice(i, i + 2));
    const hitKey = s.indexOf(k) >= 0;
    const hitGram = grams.length > 0 && grams.some(function (g) { return s.indexOf(g) >= 0; });
    if (hitKey || hitGram) hits.push(e);
  }
  if (!hits.length) return { hits: [], verdict: null, why: '' };
  const veto = hits.filter(function (e) { return e.mode === 'veto'; })[0];
  const head = veto || hits[0];
  const mode = head.mode && PRINCIPAL_MODES[head.mode] ? PRINCIPAL_MODES[head.mode].label : tr('pr.11');
  return {
    hits: hits,
    verdict: veto ? 'ask' : 'hint',
    why: tr('pr.12') + hits.length + tr('pr.13') + String(head.text).slice(0, 60) + '」(' + mode + '·' + head.key + ')'
      + (veto ? tr('pr.14')
              : tr('pr.15'))
  };
}

/**
 * ★P520 **震荡守卫**：同一约束对象在窗口内被反复覆盖 ⇒ 提示"源在震荡"。
 * 为什么需要它：覆盖是"他改主意"的**正规通道**，但若把它当随手改的口子，
 * 源就会变成草稿纸——而"与你共同演化"与"被你随手涂改"是两件事。
 */
export function churnWarning(list, windowMs, maxTimes) {
  const w = (typeof windowMs === 'number' && windowMs > 0) ? windowMs : 24 * 3600 * 1000;
  const n = (typeof maxTimes === 'number' && maxTimes > 0) ? maxTimes : 3;
  const dead = (Array.isArray(list) ? list : []).filter(function (e) { return e && e.supersededBy; });
  if (!dead.length) return '';
  const now = Date.now();
  const byKey = Object.create(null);
  for (const e of dead) {
    if (now - (e.supersededBy || 0) > w) continue;
    const k = String(e.key || '');
    byKey[k] = (byKey[k] || 0) + 1;
  }
  const hot = Object.keys(byKey).filter(function (k) { return byKey[k] >= n; });
  if (!hot.length) return '';
  return tr('pr.16') + hot.map(function (k) { return '「' + k + tr('pr.17') + byKey[k] + tr('pr.18'); }).join(' · ')
    + tr('pr.19');
}

/** 快照里那一行：**只显示真实录入的条目**；一条都没有 ⇒ 返回空串（负控：不许凭空说"你说过"）。 */
export function principalLine(state, limit) {
  const list = (state && Array.isArray(state.principal)) ? state.principal : [];
  if (!list.length) return '';
  const live = list.filter(function (e) { return e && !e.supersededBy; });
  const dead = list.filter(function (e) { return e && e.supersededBy; });   // ★P520：他改过主意的那部分
  const n = (typeof limit === 'number' && limit > 0) ? limit : 4;
  const recent = live.slice(-n).map(function (e) {
    const m = e.mode && PRINCIPAL_MODES[e.mode] ? PRINCIPAL_MODES[e.mode].label : tr('pr.11');
    return '「' + String(e.text).slice(0, 40) + '」(' + m + '·' + e.key + ')';
  });
  const vetoes = live.filter(function (e) { return e.mode === 'veto'; }).length;
  const churn = churnWarning(list);
  return tr('pr.20')
    + list.length + tr('pr.21') + live.length + tr('pr.22') + dead.length + tr('pr.23') + vetoes + '**）'
    + (recent.length ? '：' + recent.join(' · ') : '')
    // ★P520 判据①：**"已覆盖"必须可见** —— 否则"他改过主意"这件事等于没发生（演化等于没发生）。
    + (dead.length ? tr('pr.24') + dead.slice(-2).map(function (e) { return '「' + String(e.text).slice(0, 24) + '」'; }).join(' · ') : '')
    + (churn ? '｜' + churn : '')
    + tr('pr.25');
}
