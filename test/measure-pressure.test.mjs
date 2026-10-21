// P587 判据：**S(t) 压力计不许把"做完的题"记成"积压"**。
//
// ★ 现场（2026-10-21）：快照报「⚠ 漂移指标v0：S(t) 连续递增（5.09→5.1→5.11）」，
//   而查定义：`S(t) = ln(1 + 在轮题数 + 2×陈旧题数 + 0.5×陈旧沉积数)`（patrol.mjs）。
//   再查口径，发现两处不一致：
//     · `core.mjs` L79：C 阶段 + `p.deposit` ⇒ 退出【指令流】（不再当待办）
//     · `patrol.mjs` L97：只有 `parked / open / settled` ⇒ 已沉积的 C 题**仍进压力计**
//   而 stage 没有"C 之后"的终态 ⇒ **每做完一道题，S(t) 就永久涨一点**。
//   ⇒ 于是这个"积压压力"量的是**累计完成量**，而它的用途是提示"该收敛/该停手" —— 方向正好相反。
//
// ★ 为什么这条判据必须有负控（②）：如果只写"已沉积的 C 题不算压力"，
//   那么一个"什么都不算"的实现也能让它通过。所以必须同时钉住：
//   **C 但没有 deposit 的题仍然算压力** —— 因为指令流还在问它"判定复用价值"，
//   那是真的未结清，把它也算没了就等于把待办藏起来。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePatrol } from '../engine/modules/patrol.mjs';

/** 跑一次 patrol，返回最后一个样本的 activeIds（压力计里收进了哪些题）。 */
async function runOnce(state, now) {
  const runPatrol = makePatrol({
    state: state,
    isParked: function () { return false; },
    isOpen: function () { return false; },
    ensureLoaded: async function () { },
    snapshot: function () { return { stats: { gain: 0 } }; },
    persist: async function () { return { ok: true }; },
    deliberate: function () { /* 本判据不关心发动 */ },
    fsSvc: null, root: { current: null },
    PATROL_MS: 20 * 60000, FIRE_THROTTLE_MS: 45 * 60000,
    perception: { inboxCount: 0, sessionStarts: 0, lastInboxAt: 0 }
  });
  await runPatrol(now);
  const samples = state.measure.samples;
  assert.ok(samples.length >= 1, 'patrol 必须至少落一个样本（否则本判据什么都没测到）');
  return samples[samples.length - 1].active.map(function (x) { return x.id; });
}

function fixture(problems) {
  return {
    seq: 1,
    problems: problems,
    sediments: [],
    unknowns: [],
    hits: [],
    principal: [],
    narrations: [],
    measure: { samples: [] },
    rhythm: {},
    valence: { events: [] },
    patrol: { rounds: 0, lastAt: 0, lastReport: '', log: [] },
    constitution: { autonomy: true, grantedAt: 0, log: [], lastFireAt: 0, pending: [] }
  };
}

const NOW = Date.now();
const fresh = function (extra) {
  return Object.assign({ stage: 'S', updatedAt: NOW - 5 * 60000, cost: 1, delta: 0.2, epsilon: 0.2 }, extra || {});
};

test('① 已沉积的 C 题必须退出压力计（做完 ≠ 积压）', async () => {
  const active = await runOnce(fixture({
    P900: fresh({ id: 'P900', stage: 'C', deposit: 'P900-M1' }),
    P901: fresh({ id: 'P901', stage: 'S' })
  }), NOW);
  assert.ok(active.indexOf('P901') >= 0, '未完成的 S 题必须在压力计里：' + JSON.stringify(active));
  assert.equal(active.indexOf('P900'), -1,
    '已沉积的 C 题（deposit=P900-M1）不该再算积压 —— 它是做完的，不是待办的：' + JSON.stringify(active));
});

test('② ★负控：C 但没有 deposit 的题必须【仍然算】压力（那是真的未结清）', async () => {
  const active = await runOnce(fixture({
    P910: fresh({ id: 'P910', stage: 'C' })            // 已收敛但还没判定复用价值
  }), NOW);
  assert.ok(active.indexOf('P910') >= 0,
    'C 但没有 deposit 的题必须留在压力计里 —— 指令流还在问它"判定复用价值"，'
    + '把它也算没了就是把待办藏起来。实收：' + JSON.stringify(active));
});

test('③ 负控：搁置题必须退出压力计（这是原有行为，不许被本改动弄坏）', async () => {
  const st = fixture({
    P920: fresh({ id: 'P920', stage: 'S', parked: true }),
    P921: fresh({ id: 'P921', stage: 'S' })
  });
  const runPatrol = makePatrol({
    state: st,
    // 搁置判定按状态字段走（与引擎真实实现同义）
    isParked: function (p) { return !!(p && p.parked); },
    isOpen: function () { return false; },
    ensureLoaded: async function () { },
    snapshot: function () { return { stats: { gain: 0 } }; },
    persist: async function () { return { ok: true }; },
    deliberate: function () { },
    fsSvc: null, root: { current: null },
    PATROL_MS: 20 * 60000, FIRE_THROTTLE_MS: 45 * 60000,
    perception: { inboxCount: 0, sessionStarts: 0, lastInboxAt: 0 }
  });
  await runPatrol(NOW);
  const active = st.measure.samples[st.measure.samples.length - 1].active.map(function (x) { return x.id; });
  assert.equal(active.indexOf('P920'), -1, '搁置题必须退出压力计：' + JSON.stringify(active));
  assert.ok(active.indexOf('P921') >= 0, '未搁置的对照题必须在：' + JSON.stringify(active));
});
