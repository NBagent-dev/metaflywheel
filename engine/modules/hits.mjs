// P519 **回流**：命中的"处置"必须入账——否则闭环只通前半。
//
// 缺口的形状（2026-10-11 实测）：
//   `consultPrincipal` 接进 pre-execute 后，**源能影响行为**了（命中 0 → 7 → 10 → 11），
//   但只有 `state.preAction.hint/ask/deny` **三个整数**：
//     · 不知道**哪一条**命中了
//     · 不知道命中后**我做了什么**
//     · 而且这三个整数**不在 persist 的 plain 里** ⇒ 跨重启归零
//   ⇒ 一句话：**"我被他提醒了 11 次，但明天没有任何人知道我当时是怎么处置的。"**
//
// ★这一条与 P482⑨「承诺的最后一米」同构：写下→叫醒→履行→清账 四段，缺的是**清账**。
//   所以本模块的核心判据不是"记了没有"，而是：**未处置必须可见**。
//   否则回流只是台账装饰——"我没违反"永远无法被检验。
//
// 边界：只记**事实**（哪条命中、什么判决、我如何处置），不记辩护。
//   处置留痕（`myAction`）由调用方给出，**必须可被下一次观测校验**。

export const HIT_MAX = 300;

function mkId(at) { return 'H' + String(at); }

/** 归一化一条命中记录。`key` 与 `tool` 必填——不知道命中哪条、什么动作触发的，不许进表。 */
export function normalizeHit(e) {
  if (!e || typeof e !== 'object') return null;
  const key = String(e.key || '').trim();
  const tool = String(e.tool || '').trim();
  if (!key || !tool) return null;
  const at = (typeof e.at === 'number') ? e.at : Date.now();
  return {
    id: String(e.id || mkId(at)),
    at: at, key: key, tool: tool,
    verdict: (e.verdict === 'ask' || e.verdict === 'hint') ? e.verdict : 'hint',
    text: String(e.text || '').trim(),
    entryId: String(e.entryId || '').trim(),
    myAction: String(e.myAction || '').trim(),
    disposedAt: (typeof e.disposedAt === 'number') ? e.disposedAt : null
  };
}

/** 记一次命中。**无 key/tool ⇒ 不记**（负控：不许刷量）。有界：超限丢最旧。 */
export function recordHit(list, hit) {
  const arr = Array.isArray(list) ? list.slice() : [];
  const rec = normalizeHit(hit);
  if (!rec) return { list: arr, entry: null };
  // 同一时刻同一 key 同一工具只记一次（防重复计数污染）
  if (arr.some(function (e) { return e && e.id === rec.id; })) return { list: arr, entry: null };
  arr.push(rec);
  return { list: arr.length > HIT_MAX ? arr.slice(-HIT_MAX) : arr, entry: rec };
}

/** 处置留痕（"我如何处置"）。**必须给 myAction** —— 空处置不算处置。 */
export function disposeHit(list, idOrKey, myAction, at) {
  const act = String(myAction || '').trim();
  const arr = Array.isArray(list) ? list.slice() : [];
  if (!act) return { list: arr, disposed: [] };
  const now = (typeof at === 'number') ? at : Date.now();
  const disposed = [];
  for (let i = arr.length - 1; i >= 0; i--) {          // 从最新往前，命中即停（一次处置一条）
    const e = arr[i];
    if (!e || e.disposedAt) continue;
    if (e.id === idOrKey || e.key === idOrKey) {
      arr[i] = Object.assign({}, e, { myAction: act, disposedAt: now });
      disposed.push(arr[i]);
      break;
    }
  }
  return { list: arr, disposed: disposed };
}

/** 未处置的命中（**回流的核心可见面**）。 */
export function openHits(list) {
  return (Array.isArray(list) ? list : []).filter(function (e) { return e && !e.disposedAt; });
}

/** 归并（恢复纪律：并集 + 按 id 去重，沿用 P514/P517/P519 同一条）。 */
export function mergeHits(a, b) {
  const out = [], seen = Object.create(null);
  const push = function (e) {
    const r = normalizeHit(e);
    if (!r || seen[r.id]) return;
    seen[r.id] = 1; out.push(r);
  };
  for (const e of (Array.isArray(a) ? a : [])) push(e);
  for (const e of (Array.isArray(b) ? b : [])) push(e);
  out.sort(function (x, y) { return (x.at || 0) - (y.at || 0); });
  return out.length > HIT_MAX ? out.slice(-HIT_MAX) : out;
}

/**
 * 快照那一行。**没有命中记录 ⇒ 空串**（负控：不许凭空说"命中过"）。
 * ★关键：**未处置数必须显示出来**——这就是"对源负责"的可见面。
 */
export function hitsLine(state, limit) {
  const all = (state && Array.isArray(state.hits)) ? state.hits : [];
  if (!all.length) return '';
  const open = openHits(all);
  const n = (typeof limit === 'number' && limit > 0) ? limit : 3;
  const recent = all.slice(-n).map(function (e) {
    const mark = e.disposedAt ? '已处置' : '**未处置**';
    return '「' + String(e.text || e.key).slice(0, 30) + '」(' + e.key + '·' + e.verdict + '·' + mark + ')';
  });
  return '- 命中回流(P519·**源→行为→记录→源**)：命中 ' + all.length + ' 次 · **未处置 ' + open.length + ' 次**'
    + (recent.length ? '：' + recent.join(' · ') : '')
    + (open.length
      ? '——**未处置是我欠的账**：命中了却没说清怎么处置，等于没被约束过（用 `mpm_hit action=dispose` 留痕）。'
      : '——全部已处置（每次命中都留下了"我如何处置"）。');
}
