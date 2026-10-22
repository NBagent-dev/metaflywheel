// P591 · 沉积的「被取代」状态（ADR 式 status/supersedes）——**纯函数，不碰 state**
//
// ★ 为什么要它（2026-10-22 的判断）：
//   沉积是"不可逆"的，但**会过时**。没有这个字段时，同一件事的三代沉积并列存在
//   （实测：`P583-M477` 已经部分取代 `P572-M473`，而账本里无处表达这件事），
//   于是检索与注入都不知道谁作废了 —— 而"作废的结论被当作现役引用"是最危险的污染。
//
// ★ 为什么抄 ADR 而不是自己发明（见 docs/DEVELOPMENT.md §10 路线图①）：
//   ADR（Architecture Decision Records）的标准做法就是：记录不可变，但带 `status`
//   与 `superseded by` 指针。它的关键约束正好是我们需要的 ——
//   **退休 ≠ 删除**：被取代的记录仍然存在、仍然可按 ID 查到，只是不再参与当前判断。
//
// ★ 三个状态（不做第四个；多一个状态就多一处要解释的分支）：
//   active     仍然成立（缺省）
//   superseded 被新沉积取代（supersededBy 指向它）
//   refuted    被证据否证（没有取代者，但它不再成立）
//
// ★ 判据必须成对（见 test/sediment-status.test.mjs）：
//   ① 排除 superseded/refuted（正控）
//   ② **不许误伤 active 与"没这个字段"的旧记录**（负控）——旧账本里 486 条都没有 status，
//      若把它们当成"非 active"排除掉，等于一夜之间清空了整个库房。

export const SEDIMENT_STATUS = ['active', 'superseded', 'refuted'];

/** 缺省视为 active —— 旧记录没有 status 字段，不许因此被当成"非现役"。 */
export function statusOf(sed) {
  const s = sed && typeof sed === 'object' ? String(sed.status || '').trim() : '';
  return SEDIMENT_STATUS.indexOf(s) >= 0 ? s : 'active';
}

/** 是否已退出"现役"（注入/检索应当跳过它，但仍可按 ID 查到）。 */
export function isRetired(sed) {
  return statusOf(sed) !== 'active';
}

/**
 * 把 ids 里的沉积标记为 status（默认 superseded），并写上取代者与理由。
 * **只改 status / supersededBy / supersededAt / statusReason 四个字段**，别的一概不动。
 * @returns {string[]} 实际被改动的沉积 id（找不到的 id 会被**跳过并计入 skipped**）
 */
export function applySupersedes(sediments, bySedimentId, ids, status, reason) {
  const list = Array.isArray(sediments) ? sediments : [];
  const st = SEDIMENT_STATUS.indexOf(String(status || '').trim()) >= 0 ? String(status).trim() : 'superseded';
  const want = (Array.isArray(ids) ? ids : []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
  const done = [];
  const skipped = [];
  for (let i = 0; i < want.length; i++) {
    const id = want[i];
    let hit = null;
    for (let j = 0; j < list.length; j++) {
      if (list[j] && list[j].id === id) { hit = list[j]; break; }
    }
    if (!hit) { skipped.push(id); continue; }
    hit.status = st;
    if (st === 'superseded') {
      if (bySedimentId) hit.supersededBy = String(bySedimentId);
    } else {
      delete hit.supersededBy;
    }
    hit.supersededAt = Date.now();
    if (reason) hit.statusReason = String(reason).slice(0, 200);
    done.push(id);
  }
  // 把"找不到"也交出去 —— 静默跳过会让调用方以为全标上了
  Object.defineProperty(done, 'skipped', { value: skipped, enumerable: false });
  return done;
}

/** 现役沉积（注入/检索该用的那一批）。 */
export function activeSediments(sediments) {
  const list = Array.isArray(sediments) ? sediments : [];
  return list.filter(function (s) { return !isRetired(s); });
}

/** 一行摘要：N 条现役 · M 条被取代 · K 条被否证（**没有它，"退休"是不可见的**）。 */
export function statusSummary(sediments) {
  const list = Array.isArray(sediments) ? sediments : [];
  let a = 0, s = 0, r = 0;
  for (let i = 0; i < list.length; i++) {
    const st = statusOf(list[i]);
    if (st === 'active') a++; else if (st === 'superseded') s++; else r++;
  }
  const parts = ['现役 ' + a];
  if (s) parts.push('被取代 ' + s);
  if (r) parts.push('被否证 ' + r);
  return parts.join(' · ');
}
