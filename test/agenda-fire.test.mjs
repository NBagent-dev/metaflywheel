// P521 判据⑪（**实例级探针**，不是源码扫描）：直接调 `runPatrol`，
// 看它到底往 `deliberate`（发动函数）里送了什么。
//
// ★为什么要有这一条：`agenda.test.mjs ⑩` 只是**源码扫描**——它证明"代码里写着要 push"，
//   不证明"跑起来真的 push 了"。P509 的判据分类：**静态文本 < 同源函数调用 < 实例级探针**。
//   而 `runPatrol` 是**纯依赖注入**（makePatrol(p)）⇒ 我可以**自己造这场相遇**，
//   **不必等重启**（今天的原话：能自己安排的相遇，就别等下一次）。
//
// 立题：P521 判据①要求"至少一次真实内生议题"——本判据把它的**信号层**当场兑现；
//   仍差"真的发动过一次"（那需要温热+节流+agent 可用），那是重启后的验收。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePatrol } from '../engine/modules/patrol.mjs';

const DAY = 24 * 3600 * 1000;

function fixture(over) {
  const now = Date.now();
  return Object.assign({
    seq: 1,
    problems: { P900: { id: 'P900', stage: 'S', updatedAt: now - 5 * 60000, cost: 1, delta: 0.2, epsilon: 0.2 } },
    sediments: [],
    unknowns: [{ id: 'U1', at: now - 1000, key: 'P472', text: 'P472 的单位口径未验', until: '拿到 45 格样本', resolvedAt: null }],
    hits: [
      { id: 'H1', at: now - 3000, key: '项目定位', tool: 't', verdict: 'hint', disposedAt: now - 2000 },
      { id: 'H2', at: now - 2000, key: '项目定位', tool: 't', verdict: 'hint', disposedAt: now - 1000 },
      { id: 'H3', at: now - 1000, key: '项目定位', tool: 't', verdict: 'hint', disposedAt: null }
    ],
    principal: [],
    narrations: [],
    measure: { samples: [] },                     // ★契约：patrol 会 `state.measure.samples.push(...)`（漏了它 ⇒ reading 'push' of undefined）
    rhythm: {},                                   // 出厂节律（陈旧30min/节流45min/不静默）
    valence: { events: [] },
    patrol: { rounds: 0, lastAt: 0, lastReport: '', log: [] },
    constitution: { autonomy: true, grantedAt: 0, log: [], lastFireAt: 0, pending: [] }
  }, over || {});
}

async function runWith(state, now) {
  const captured = [];
  const runPatrol = makePatrol({
    state: state,
    isParked: function () { return false; },
    isOpen: function () { return false; },
    ensureLoaded: async function () { },
    snapshot: function () { return { stats: { gain: 0 } }; },
    persist: async function () { return { ok: true }; },
    deliberate: function (sigs) { if (Array.isArray(sigs)) captured.push.apply(captured, sigs); },
    fsSvc: null, root: { current: null },
    PATROL_MS: 20 * 60000, FIRE_THROTTLE_MS: 45 * 60000,
    perception: { inboxCount: 1, sessionStarts: 1, lastInboxAt: now }
  });
  await runPatrol(now);
  return captured;
}

test('⑪★实例级探针：runPatrol 真的把内生议题送进了 deliberate（带出处 + L2 自陈）', async () => {
  const now = Date.now();
  const got = await runWith(fixture(), now);
  const ags = got.filter(function (s) { return s.indexOf('内生议程(出处 ') === 0; });
  assert.ok(ags.length >= 1, 'runPatrol 没有把内生议题送进发动函数。实收信号：' + JSON.stringify(got, null, 1));
  assert.match(ags[0], /出处 hits:项目定位|出处 U1/, '必须带出处：' + ags[0]);
  assert.match(ags[0], /不是"我想要"/, '必须自陈不是 L3：' + ags[0]);
  assert.match(ags[0], /L2 内生议程——规则触发/, '必须写明级别与触发源');
  // ★约束④：在轮题优先 ⇒ "议程推进"若出现，必须排在内生议程之前。
  const iStale = got.findIndex(function (s) { return s.indexOf('议程推进 ') === 0; });
  const iAg = got.findIndex(function (s) { return s.indexOf('内生议程(出处 ') === 0; });
  if (iStale >= 0) assert.ok(iStale < iAg, '内生议程必须排在"议程推进"之后（P521 约束④）');
});

test('⑫★负控：账本干净 ⇒ runPatrol 不得送出任何内生议题（不许为了显得"自发"而造题）', async () => {
  const now = Date.now();
  const got = await runWith(fixture({ unknowns: [], hits: [], sediments: [] }), now);
  assert.equal(got.filter(function (s) { return s.indexOf('内生议程') >= 0; }).length, 0,
    '账本干净却出现了内生议程信号：' + JSON.stringify(got, null, 1));
});

test('⑬★负控：未核已核销 + 命中不足阈值 + 沉积有引用 ⇒ 也不许送出内生议题', async () => {
  const now = Date.now();
  const got = await runWith(fixture({
    unknowns: [{ id: 'U1', at: now - 1000, key: 'K', text: 'T', until: 'x', resolvedAt: now, resolvedBy: 'ev' }],
    hits: [{ id: 'H1', at: now - 1000, key: 'K', tool: 't', verdict: 'hint', disposedAt: now }],
    sediments: [{ id: 'M1', at: now - 20 * DAY, cites: 3 }]
  }), now);
  assert.equal(got.filter(function (s) { return s.indexOf('内生议程') >= 0; }).length, 0,
    '不该出现内生议程信号（核销过/未达阈/有引用都不算未决）：' + JSON.stringify(got, null, 1));
});
