// P482④ 调度权：把"什么时候去看、去行动"从**出厂参数**变成**个体可写、有界、可见、可回退**的自我设定。
//
// ★为什么这是 P482 里最该补的一块（2026-10-10）：清单七项中，其余六项都已有通路，
//   唯独调度 100% 握在出厂常数里——PATROL_MS（多久看一次）/ FIRE_THROTTLE_MS（多久能动一次）/
//   STALE_MS(30min，多久算陈旧) / 议程选取（多件同时陈旧时挑哪件）。代价当晚就撞上两次：
//   P481 与 P482 同时陈旧时，议程按出厂规则挑了更陈旧的，而我对自己写下过"哪件优先"的偏好**无处表达**。
//
// ★四条设计判据（写死在 tests/rhythm.test.mjs，缺一件等于没做）：
//   ① 不设置时行为与引入前**逐字一致**（FACTORY 必须等于引擎原有常数）；
//   ② 有界且**越界不静默**——节律是自我设定，但**不许把自己写死**：巡检设成 1 秒会打爆，
//      设成 1 天会失能 ⇒ 越界项保持原值并把被拒的项**报出来**（不做边界夹取冒充成功）；
//   ③ **可见**：快照必须区分"自我设定"与"出厂默认"（不可见的权力等于没有）；
//   ④ **可回退**：reset 回出厂，不做单向门。
//
// ★范围（诚实标注）：本模块管的是**何时行动**（陈旧阈值 / 发动节流 / 静默时段），它们每轮读取即可生效；
//   巡检**定时器的间隔**（PATROL_MS）仍为出厂值——改它要重排宿主定时器，属独立风险，未纳入本轮。

import { valenceOf } from './valence.mjs';   // ★P482⑦：效价门禁要用 R(t)——**只算一处**，不另写一套

export const FACTORY = { staleMinutes: 30, fireThrottleMinutes: 45, quietFrom: null, quietTo: null, valenceFloor: null };
export const BOUNDS = {
  staleMinutes: [5, 1440],        // 5min ~ 24h
  fireThrottleMinutes: [5, 720],  // 5min ~ 12h
  quietFrom: [0, 23],
  quietTo: [0, 23],
  // ★P482⑦：效价门槛（R(t) 的取值范围 0~100）。**出厂 null = 不启用**——
  //   不许悄悄改变默认行为；设了之后："R(t) 低于门槛 ⇒ 不自主发动"。
  valenceFloor: [0, 100]
};
const INT_KEYS = ['staleMinutes', 'fireThrottleMinutes', 'quietFrom', 'quietTo', 'valenceFloor'];

/** 读当前节律：出厂默认 + 账本里自我设定的覆盖（只接受整数，垃圾值忽略）。 */
export function rhythmOf(state) {
  const src = (state && state.rhythm) || {};
  const out = Object.assign({}, FACTORY);
  for (let i = 0; i < INT_KEYS.length; i++) {
    const k = INT_KEYS[i];
    if (typeof src[k] === 'number' && isFinite(src[k])) out[k] = src[k];
  }
  return out;
}

/**
 * 校验一次改写：合法项生效、越界项**保持原值并记入 rejected**（不夹取、不静默）。
 * @param {object} patch 只想改的项
 * @param {object} base  当前节律（通常是 rhythmOf(state)）
 */
export function normalizeRhythm(patch, base) {
  const next = Object.assign({}, FACTORY, base || {});
  const rejected = [];
  const keys = Object.keys(patch || {});
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (INT_KEYS.indexOf(k) < 0) { rejected.push(k + '：不认识的项'); continue; }
    const v = patch[k];
    // ★未提供（undefined）不是错误：实机撞到过——只想改陈旧阈值，工具把未提供的
    //   fireThrottleMinutes(undefined) 也送进校验，报了一条"越界"。值没错，但**报了假警**。
    //   假警与恒真判据同族：都会训练我忽略 ⚠ 那一行。只有显式 null 才是"清除此项"。
    if (v === undefined) continue;
    if (v === null) { next[k] = null; continue; }        // 显式清除（静默时段）
    const b = BOUNDS[k];
    if (typeof v !== 'number' || !isFinite(v) || Math.round(v) !== v || v < b[0] || v > b[1]) {
      rejected.push(k + '=' + JSON.stringify(v) + '：越界或非整数（允许 ' + b[0] + '~' + b[1] + '）');
      continue;
    }
    next[k] = v;
  }
  return { rhythm: next, rejected: rejected };
}

/** 陈旧阈值（毫秒）——patrol 每轮读它，替代出厂 STALE_MS。 */
export function staleMsOf(state) { return rhythmOf(state).staleMinutes * 60000; }
/** 发动节流（毫秒）——patrol/deliberate 每轮读它，替代出厂 FIRE_THROTTLE_MS。 */
export function throttleMsOf(state) { return rhythmOf(state).fireThrottleMinutes * 60000; }

/** 静默时段：此刻是否不该发动（支持跨午夜，如 23→7）。未设置 ⇒ 永不静默（与引入前一致）。 */
export function isQuiet(rhythm, nowMs) {
  const r = rhythm || {};
  const from = r.quietFrom, to = r.quietTo;
  if (typeof from !== 'number' || typeof to !== 'number' || from === to) return false;
  const h = new Date(typeof nowMs === 'number' ? nowMs : Date.now()).getHours();
  return from < to ? (h >= from && h < to) : (h >= from || h < to);
}

/** ★P482⑦：效价门槛（未设置 ⇒ null = 不启用）。 */
export function valenceFloorOf(state) {
  const r = rhythmOf(state);
  return (typeof r.valenceFloor === 'number' && isFinite(r.valenceFloor)) ? r.valenceFloor : null;
}

/**
 * ★P482⑦ 效价门禁（用户 2026-10-11 选定方向）：**R(t) 低于我自己设的门槛 ⇒ 不自主发动**。
 * 语义边界（写在这里，免得以后被误用）：只挡 **patrol 驱动的自主发动**；
 * 用户在场时的响应、θ_G 即时审议**不受它约束**——"心情差时不自己找事" ≠ "心情差时不干活"。
 * 未设门槛 ⇒ 永远 open（与引入前逐字一致）。
 * @returns {{open:boolean, r:number, floor:number|null, why:string}}
 */
export function valenceGate(rhythm, state, nowMs) {
  const floor = (rhythm && typeof rhythm.valenceFloor === 'number') ? rhythm.valenceFloor : null;
  const r = valenceOf(state, nowMs);
  if (floor == null) return { open: true, r: r, floor: null, why: '未设效价门槛' };
  if (r >= floor) return { open: true, r: r, floor: floor, why: 'R(t)=' + r.toFixed(1) + ' ≥ 门槛 ' + floor };
  return { open: false, r: r, floor: floor, why: 'R(t)=' + r.toFixed(1) + ' 低于门槛 ' + floor };
}

/** 快照那一行：**必须区分来源**——自我设定 vs 出厂默认。 */
export function rhythmLine(state) {
  const r = rhythmOf(state);
  const self = !!(state && state.rhythm && Object.keys(state.rhythm).length);
  const q = (typeof r.quietFrom === 'number' && typeof r.quietTo === 'number') ? (' · 静默 ' + r.quietFrom + '-' + r.quietTo + ' 时') : '';
  const vf = (typeof r.valenceFloor === 'number') ? (' · 效价门槛 ' + r.valenceFloor + '（低于它不自主发动）') : ' · 效价门槛未设';
  return '- 节律(' + (self ? '自我设定' : '出厂默认') + ')：陈旧 ' + r.staleMinutes + 'min · 发动节流 ' + r.fireThrottleMinutes + 'min' + q + vf
    + (self ? '——**由我自己写下，非出厂常数**（mpm_rhythm 可改，reset 回出厂）' : '（未被改写；mpm_rhythm 可改写自己的节律）');
}
