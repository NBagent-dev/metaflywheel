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

export function valenceSummaryLine(state) {
  try {
    const evs = state.valence && Array.isArray(state.valence.events) ? state.valence.events : [];
    if (!evs.length) return '';
    const now = Date.now();
    let rt = 0, win = 0, pos = 0, neg = 0;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      rt += e.v * Math.exp(-(now - e.at) / VALENCE_TAU_MS);
      if (now - e.at <= VALENCE_TAU_MS) { win += 1; if (e.v > 0) pos += 1; else if (e.v < 0) neg += 1; }
    }
    rt = Math.round(rt * 10) / 10;
    return '- 效价：R(t)=' + (rt >= 0 ? '+' : '') + rt.toFixed(1) + '（近48h ' + win + ' 事件：正 ' + pos + ' · 负 ' + neg + '）——R1 效价账本 v1（P023），提示级强化数据源。';
  } catch (e) { return ''; }
}
