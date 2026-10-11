// MetaFlywheel 效价账本模块（P079 重构第 5 步：R1 在线效价信号 → 参数化 state）
// P023 工程半降维件①：事件→效价映射，R(t)=指数衰减和；τ=48h（P018 常数族 v0，待测量史导出退役）。
// 映射 v1 诚实注记：搁置(parked)与生命周期门禁拒绝是合法生命周期动作，不罚——
// 罚分会惩罚智慧；负效价只计真实失真与违规。落盘搭 persist() 顺风车（记账不阻塞主流程）。
export const VALENCE_TAU_MS = 48 * 3600 * 1000;
export const VALENCE_KINDS = { converge: 2, cite: 1, incident: -1, misframe: -1, reject: -1 };

export function valenceRecord(state, kind) {
  try {
    const v = VALENCE_KINDS[kind];
    if (v == null) return;
    if (!state.valence || !Array.isArray(state.valence.events)) state.valence = { events: [] };
    state.valence.events.push({ at: Date.now(), kind: kind, v: v });
    if (state.valence.events.length > 200) state.valence.events.splice(0, state.valence.events.length - 200);
  } catch (e) { /* 效价记账永不阻断主流程 */ }
}

/**
 * ★P482⑦：R(t) 的**唯一实现**（指数衰减和）。
 * 抽出来的理由：效价门禁要读数，而"两处同义实现、改一处漏一处"是今天已经踩过的坑
 * （prio 只加到了 clauseKind ⇒ 求值器不认 ⇒ 整条承诺永不唤醒）。
 * ⇒ 宁可在这里抽一层，也不让 R(t) 有第二个算法。
 * @param {object} state 账本
 * @param {number} [nowMs] 基准时刻（判据要可控时间，故允许传入）
 */
export function valenceOf(state, nowMs) {
  try {
    const evs = (state && state.valence && Array.isArray(state.valence.events)) ? state.valence.events : [];
    const now = (typeof nowMs === 'number') ? nowMs : Date.now();
    let rt = 0;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      rt += e.v * Math.exp(-(now - e.at) / VALENCE_TAU_MS);
    }
    return Math.round(rt * 10) / 10;
  } catch (e) { return 0; }
}

export function valenceSummaryLine(state) {
  try {
    const evs = state.valence && Array.isArray(state.valence.events) ? state.valence.events : [];
    if (!evs.length) return '';
    const now = Date.now();
    let win = 0, pos = 0, neg = 0;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (now - e.at <= VALENCE_TAU_MS) { win += 1; if (e.v > 0) pos += 1; else if (e.v < 0) neg += 1; }
    }
    const rt = valenceOf(state, now);   // ★单一真源：数字只能从这里来
    return '- 效价：R(t)=' + (rt >= 0 ? '+' : '') + rt.toFixed(1) + '（近48h ' + win + ' 事件：正 ' + pos + ' · 负 ' + neg + '）——R1 效价账本 v1（P023），提示级强化数据源。';
  } catch (e) { return ''; }
}


// ★P507 验收探针(13:48:04 重打，可删)：只为改变 mtime —— 验证实例是否在监视【旧清单之外】的模块。
