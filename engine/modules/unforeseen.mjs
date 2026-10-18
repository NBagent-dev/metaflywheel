// P553-M465 的「类型账」· P554 第 ② 项
//
// 为什么需要它：
//   P553-M465 证明「设计者无法在设计时枚举设计的全部后果」⇒ 所以"设计之后才出现的
//   未预见后果"是**唯一可累积、不靠自陈、不靠噪声**的那一半（愿景的可推进面）。
//
// ★★★ 而它的核心不是【数量】而是【类型分布】：
//   · 数量必然 > 0（系统一直在跑，总会有未预见的后果）⇒ 无信息
//   · 类型在变 ⇒ 在长；**类型固定 ⇒ 长停了**（退化形态是"类型固定"，不是"数量少"）
//
// ★★★ 而有一条设计细节必须钉死（否则这个账会自己失效）：
//   `isOldType` **必须在记录时固化**，不能在读取时重算。
//   因为"旧类型"是【当时】已出现过的集合；若读取时用【现在的全部类型】重算，
//   那每条都会是"旧"的 ⇒ 判据恒真 ⇒ 账变成装饰。
//   ⇒ **只有把"当时是否新"固化下来，才能看出"现在还在不在长"。**
//
// ★ 与 P546「豁免必须写成规则不能写成名单」的关系：
//   **类型不许预设**。若先定义一套分类法再把事塞进去，那就是白名单。
//   `category` 是**事后**打的标签，而"是否新"由**当时的标注集合**判定 ⇒ 类型从数据里涌现。
//
// ★ 空数据不许报"停"（A7 的教训，P554-M466）：
//   没有记录 ≠ 停止了长。但也【不许静默】——必须说"从未记录"。

export const DATA_VERSION = 1;

/**
 * 从 entries 算类型账。
 * @param {Array} entries [{at, what, category, isOldType, note}]
 * @param {object} opts { recentN?:number }
 * @returns {{ total, categories:Array, recentN, recentNew, stalled, asOf }}
 */
export function typeLedger(entries, opts) {
  const o = opts || {};
  const recentN = typeof o.recentN === 'number' && o.recentN > 0 ? o.recentN : 5;
  const list = Array.isArray(entries) ? entries.filter(function (e) { return e && e.category; }) : [];

  // 类型按【首次出现顺序】排列 —— 顺序本身携带信息（先长出来的是什么）
  const cats = [];
  const seen = Object.create(null);
  for (const e of list) {
    if (!seen[e.category]) { seen[e.category] = 1; cats.push(e.category); }
  }

  const tail = list.slice(-recentN);
  const recentNew = tail.filter(function (e) { return e.isOldType === false; }).length;

  // ★ 判"长停了"：只有当【有足够样本】且【最近 N 条全落在旧类型】时才成立
  //   —— 空数据 / 样本不足 N 条时不许报停（那会是"没数据 = 停"的假象）
  const enoughSample = list.length >= recentN;
  const stalled = enoughSample && tail.length === recentN && recentNew === 0;

  return {
    total: list.length,
    categories: cats,
    categoryCount: cats.length,
    recentN: recentN,
    recentNew: recentNew,
    enoughSample: enoughSample,
    stalled: stalled,
    asOf: new Date().toISOString()
  };
}

/**
 * 快照里的一行。
 * ★ 与 awarenessLine 同类：**没事也要说**（"从未记录"必须显式，不许静默）。
 * @returns {string} 永远非空
 */
export function ledgerLine(entries, opts) {
  const t = typeLedger(entries, opts);
  if (!t.total) {
    // ★ 空数据：不许报"停"，但必须说出来（"没有记录"与"停止了长"是两件事）
    return '- 类型账：**从未记录**（未预见的后果一条都没进账 ⇒ 而这不等于"没停"，只等于"没在看"）。';
  }
  const head = t.stalled ? '⚠ 类型账（长停）' : '类型账';
  return '- ' + head + '：' + t.total + ' 条 · ' + t.categoryCount + ' 类 · 最近 '
    + Math.min(t.recentN, t.total) + ' 条里新类型 ' + t.recentNew + ' 条'
    + (t.stalled
        ? ' ⇒ ⚠ **最近 ' + t.recentN + ' 条全部落在旧类型里：类型开始固定 ⇒ 长停了**'
        : (t.enoughSample ? '（类型还在变 ⇒ 在长）' : '（样本不足 ' + t.recentN + ' 条，暂不判）'))
    + '。';
}
