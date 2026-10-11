// P526 **采用**（adopt）：把"动手前先检索并真的采用"变成一个可记录的入口。
//
// 缺口（2026-10-11 实测，从账本取的数）：
//   沉积 442 条 · 被引用过 56 条 = 12.7% · **零引用 386 条 = 87.3%** · 引用总数 86
//   而"检索"这一半【已经有了】：检索小脑(P023-D) 与 因材施教(M9③) 每天都在快照里给出候选。
//   ⇒ 缺的是【采用】：检索到了、没采用、也没留痕。
//
// ★★ 与 `mpm_deposit` 的 `links` 的区别（这条是全部要点）：
//   · `links`（沉积时写）= **事后补链**：我写完了才想起来"哦它和那条有关"
//   · `adopt`（动手前写）= **动手前采用**：我在做决定之前检索了它，并且它**改变了我的做法**
//   ⇒ 所以回环率**只数 adopt**，不数 links。事后补链不算回流。
//
// ★★★ 反事实是这条机制的判据核心：
//   每条采用必须回答「**没有它我会怎么做**」（`withoutIt`）。
//   若那件事与实际做法相同 ⇒ 其实没采用（它没改变任何东西）。
//   ⇒ 这样，"历史有没有因果力"不必等"删掉历史看行为是否不同"的对照实验——
//      **每一次采用都自带一次反事实**。
//
// 诚实边界（与 P519 的清账同族）：`withoutIt` 只校验**非空**，
//   它是不是真的不同，无法机械判定——但**必须留痕、可被未来对质**。

export const ADOPT_MAX = 300;

function mkId(at) { return 'A' + String(at); }

/** 归一化。**三件必填**：sedimentId（采用哪条）/ forWhat（用于哪个决定）/ withoutIt（没有它我会怎么做）。 */
export function normalizeAdopt(e) {
  if (!e || typeof e !== 'object') return null;
  const sedimentId = String(e.sedimentId || '').trim();
  const forWhat = String(e.forWhat || '').trim();
  const withoutIt = String(e.withoutIt || '').trim();
  if (!sedimentId || !forWhat || !withoutIt) return null;
  const at = (typeof e.at === 'number') ? e.at : Date.now();
  return {
    id: String(e.id || mkId(at)),
    at: at,
    sedimentId: sedimentId,
    forWhat: forWhat,
    withoutIt: withoutIt
  };
}

/** 记一次采用。缺件 ⇒ 不记（负控）；同一 (sedimentId, forWhat) 只计一次（防同一采用刷两遍）。有界。 */
export function recordAdopt(list, entry) {
  const arr = Array.isArray(list) ? list.slice() : [];
  const rec = normalizeAdopt(entry);
  if (!rec) return { list: arr, entry: null, reason: '缺件：sedimentId / forWhat / withoutIt 三件必填（尤其"没有它我会怎么做"——写不出反事实，就不是采用）' };
  if (arr.some(function (e) { return e && e.sedimentId === rec.sedimentId && e.forWhat === rec.forWhat; })) {
    return { list: arr, entry: null, reason: '重复：同一 (沉积, 决定) 只计一次——同一采用刷两遍不算两次回环' };
  }
  arr.push(rec);
  return { list: arr.length > ADOPT_MAX ? arr.slice(-ADOPT_MAX) : arr, entry: rec, reason: '' };
}

/** 某条沉积被采用过几次（回环的真相）。 */
export function adoptsFor(list, sedimentId) {
  return (Array.isArray(list) ? list : []).filter(function (e) { return e && e.sedimentId === sedimentId; });
}

/** 归并（恢复纪律：并集 + 按 id 去重）。 */
export function mergeAdopts(a, b) {
  const out = [], seen = Object.create(null);
  const push = function (e) {
    const r = normalizeAdopt(e);
    if (!r || seen[r.id]) return;
    seen[r.id] = 1; out.push(r);
  };
  for (const e of (Array.isArray(a) ? a : [])) push(e);
  for (const e of (Array.isArray(b) ? b : [])) push(e);
  out.sort(function (x, y) { return (x.at || 0) - (y.at || 0); });
  return out.length > ADOPT_MAX ? out.slice(-ADOPT_MAX) : out;
}

/**
 * ★**回环率**——只数 adopt，**不数 deposit 的 links**。
 * 这是与"事后补链"在数据上分开的地方：补链永远不会提高这个数。
 */
export function adoptRate(state) {
  const seds = (state && Array.isArray(state.sediments)) ? state.sediments : [];
  const ads = (state && Array.isArray(state.adopts)) ? state.adopts : [];
  const total = seds.length;
  const adoptedIds = Object.create(null);
  for (const a of ads) if (a && a.sedimentId) adoptedIds[a.sedimentId] = 1;
  const adopted = Object.keys(adoptedIds).length;
  return {
    total: total,
    adopted: adopted,
    rate: total ? Math.round(1000 * adopted / total) / 10 : 0,
    additions: ads.length
  };
}

/** 快照/报告里那一段。**没有采用记录 ⇒ 空串**（负控：不许凭空说"我采用了"）。 */
export function adoptLine(state, limit) {
  const ads = (state && Array.isArray(state.adopts)) ? state.adopts : [];
  if (!ads.length) return '';
  const r = adoptRate(state);
  const n = (typeof limit === 'number' && limit > 0) ? limit : 3;
  const recent = ads.slice(-n).map(function (e) {
    return '「' + e.sedimentId + '」用于「' + String(e.forWhat).slice(0, 24) + '」（没有它：' + String(e.withoutIt).slice(0, 28) + '）';
  });
  return '- 采用回流(P526·**动手前检索并真的采用**)：**回环率 ' + r.rate + '%**（' + r.adopted + '/' + r.total
    + ' 条沉积被真采用 · 共 ' + r.additions + ' 次）'
    + (recent.length ? '：' + recent.join(' · ') : '')
    + '——**只有"动手前用它改变了做法"才计数；沉积时补一条 links 不算回流**（那是事后补链）。';
}
