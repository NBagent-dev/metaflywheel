// P593 · 议程权重的**唯一真源** + 贡献占比诊断
//
// ★ 为什么要有这个模块（2026-10-22）：
//   四个来源的权重原本写死在 `agenda.mjs` 里：`30` · `20 + owed` · `40 + nObj` · `10`。
//   ⇒ **不可见**（没有任何地方告诉你谁在主导）、**不可调**（改它要改代码）、**不可归因**（排序变了不知道为什么）。
//   而 P587 刚刚证明：一个指标的口径错了，它的趋势就会精确反向 —— 权重是同一类风险，
//   只是它的错**不会以"趋势反了"的形式出现**，而是以"总是同一条议程排第一"的形式出现。
//
// ★ 抄自 Taskwarrior 的紧急度多项式（docs/DEVELOPMENT.md §10 路线图②）：
//   十来个可测项加权求和，系数写在配置里；官方明确的警告是
//   **"任何一项都不该主导表达式"**（否则其余项形同虚设）。
//   ⇒ 所以这里不只外置系数，还输出**每一项的贡献占比**，并对 >60% 的单项报警。
//
// ★ 边界（写清楚，免得被当成万能）：
//   ① 它只把"权重"变成可调，不改变"谁能成为议程" —— 那些门槛（HIT_REPEAT_MIN / 14 天 / 负控）
//      仍在 agenda.mjs，且**必须仍在**：调权重是调音量，不是改谁有资格说话。
//   ② 默认值就是原来那四个数，**不调 = 行为不变**（否则这不是外置，是改行为）。
//   ③ 非法输入**回退默认值并报出来**，绝不静默修正（静默修正会让"我调过了"变成错觉）。

export const DEFAULT_AGENDA_WEIGHTS = Object.freeze({
  'unknown':        Object.freeze({ base: 30, per: 0 }),   // 未核清单：挂着就该有机会变成议题
  'hit-repeat':     Object.freeze({ base: 20, per: 1 }),   // 反复命中：base + 欠账条数
  'hit-open':       Object.freeze({ base: 40, per: 1 }),   // 未清账：base + 欠账【对象】数
  'sediment-stale': Object.freeze({ base: 10, per: 0 })    // 零引用沉积
});

/** 单项占比达到它就算"主导"（Taskwarrior 式警告的阈值） */
export const DOMINANT_PCT = 60;

/**
 * 合并外部权重与默认值。**非法值回退默认并记入 problems**，不静默修正。
 * @returns {{weights: object, problems: string[]}}
 */
export function normalizeAgendaWeights(raw) {
  const problems = [];
  const keys = Object.keys(DEFAULT_AGENDA_WEIGHTS);
  const out = {};
  let src = null;
  if (raw == null) {
    src = null;
  } else if (typeof raw === 'object' && !Array.isArray(raw)) {
    src = raw;
  } else {
    problems.push('权重不是普通对象（收到 ' + (Array.isArray(raw) ? 'array' : typeof raw) + '）⇒ 全部回退默认值');
    src = null;
  }
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const d = DEFAULT_AGENDA_WEIGHTS[k];
    const v = src ? src[k] : null;
    if (v == null) { out[k] = { base: d.base, per: d.per }; continue; }
    const okBase = (v.base !== undefined && typeof v.base === 'number' && isFinite(v.base) && v.base >= 0);
    const okPer = (v.per !== undefined && typeof v.per === 'number' && isFinite(v.per) && v.per >= 0);
    if (!okBase) problems.push(k + '.base 非法（需要 ≥0 的有限数），回退 ' + d.base);
    if (!okPer) problems.push(k + '.per 非法（需要 ≥0 的有限数），回退 ' + d.per);
    out[k] = {
      base: okBase ? v.base : d.base,
      per: okPer ? v.per : d.per
    };
  }
  if (src) {
    const extra = Object.keys(src).filter(function (k) { return keys.indexOf(k) < 0; });
    if (extra.length) problems.push('未知来源被忽略：' + extra.join('、') + '（只认 ' + keys.join(' / ') + '）');
  }
  return { weights: out, problems: problems };
}

/** 某来源的权重 = base + per × n。未知 kind ⇒ 0（并让调用方自己决定是否报警）。 */
export function weightOf(kind, n, weights) {
  const W = (weights && weights[kind]) || DEFAULT_AGENDA_WEIGHTS[kind];
  if (!W) return 0;
  const c = (typeof n === 'number' && isFinite(n) && n > 0) ? n : 0;
  return W.base + W.per * c;
}

/**
 * 贡献占比诊断：谁在主导排序？
 * @returns {{rows: Array<{kind,ref,weight,pct}>, total: number, dominant: object|null}}
 */
export function breakdown(items) {
  const list = Array.isArray(items) ? items : [];
  const rows = [];
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const w = (it && typeof it.weight === 'number' && isFinite(it.weight)) ? it.weight : 0;
    if (w <= 0) continue;
    rows.push({ kind: String(it.kind || '?'), ref: String(it.ref || ''), weight: w });
    total += w;
  }
  rows.sort(function (a, b) { return b.weight - a.weight; });
  for (let i = 0; i < rows.length; i++) {
    rows[i].pct = total ? Math.round(rows[i].weight / total * 1000) / 10 : 0;
  }
  let dominant = null;
  if (rows.length && total > 0 && rows[0].pct >= DOMINANT_PCT) dominant = rows[0];
  return { rows: rows, total: Math.round(total * 100) / 100, dominant: dominant };
}

/** 一行报告（给快照/工具用）。 */
export function breakdownLine(items) {
  const b = breakdown(items);
  if (!b.rows.length) return '议程权重贡献：空（没有可加权的东西）';
  const parts = b.rows.slice(0, 5).map(function (r) { return r.kind + ' ' + r.weight + '(' + r.pct + '%)'; });
  const tail = b.dominant
    ? '　★「' + b.dominant.kind + '」占 ' + b.dominant.pct + '% ≥ ' + DOMINANT_PCT + '% —— 单项主导，其余来源等于没投票'
    : '　单项最高 ' + b.rows[0].pct + '% < ' + DOMINANT_PCT + '%（分布健康）';
  return '议程权重贡献：' + parts.join(' · ') + tail;
}
