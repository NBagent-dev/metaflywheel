// P552 判据：意识代理指标面板的七项 —— 每一项都必须【能选红】，且【退化 ≠ 缺口】。
// 运行：node --test test/awareness-panel.test.mjs
//
// ★ 这个模块的成立条件（frame 里写的）：
//   ①七项各自有【可核对的出处】（实测过字段名，不是猜的：adopts/constitution.log/principal/unknowns/narrations）
//   ②每一项都有"退化 ⇒ 该红"的验证方式
//   ③"退化"（以前有、现在少了）与"缺口"（从来没有，且已知）**必须分开**——
//     混在一起就是 P544「议程不分层」的翻版
//   ④面板不回答"它有没有意识"（P512：原则上不可判定）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { awarenessPanel, renderPanel, ITEMS } from '../engine/modules/awareness.mjs';

const ROOT = 'C:/Users/Administrator/Desktop/daima/XIN';
const realLedger = () => JSON.parse(fs.readFileSync(ROOT + '/.mpm/flywheel.json', 'utf8'));
const DAY = 86400000;

test('① 真实账本上七项全部算得出来，且每项都有出处', () => {
  const p = awarenessPanel(realLedger());
  assert.equal(p.items.length, 7, '★七项，不多不少（不许靠加项数显得更接近意识）');
  for (const i of p.items) {
    assert.ok(i.id && i.name, '每项必须有 id 与 name');
    assert.ok(typeof i.source === 'string' && i.source.length, '★每项必须有可核对的出处（P487-M405：最后一米在调用点）');
    assert.ok('value' in i, '每项必须有 value（允许 null，但不许缺字段）');
  }
  const ids = p.items.map(i => i.id).join(',');
  assert.equal(ids, 'A1,A2,A3,A4,A5,A6,A7');
});

test('② 退化能被选中：清空 adopts ⇒ A1 进 degraded（不是静默）', () => {
  const base = realLedger();
  assert.ok((base.adopts || []).length > 0, '前提：真实账本里 adopt 非空');
  const baseline = { A1: (base.adopts || []).length };
  // ★ 注入退化：把 adopts 清空（模拟"账本再也没约束过它"）
  const broken = { ...base, adopts: [] };
  const p = awarenessPanel(broken, { baseline });
  assert.ok(p.degraded.includes('A1'), '★ A1 必须进 degraded —— 否则这个面板不会红，它就是装饰');
});

test('③ 静止能被选中：narrations 超过阈值 ⇒ A7 进 stale（用真实数据，不注入）', () => {
  const base = realLedger();
  const narr = base.narrations || [];
  assert.ok(narr.length > 0, '前提：真实账本里有 narrations');
  // ★ 用真实数据：以"最后一条叙述之后 4 天"作为 now ⇒ 必然超过 3 天阈值
  const lastAt = Math.max(...narr.map(n => n.at || 0));
  const p = awarenessPanel(base, { now: lastAt + 4 * DAY, staleDays: 3 });
  assert.ok(p.stale.includes('A7'), '★ A7 必须进 stale —— 不可审计面静止必须被看见');
  // 负控：把 now 拉回到"最后一条之后 1 天" ⇒ 不许 stale（否则恒真）
  const p2 = awarenessPanel(base, { now: lastAt + 1 * DAY, staleDays: 3 });
  assert.ok(!p2.stale.includes('A7'), '★ 负控：未超阈值时不许报 stale（否则判据恒真）');
});

test('④ 缺口 ≠ 退化：A6（无字段）必须在 gaps，绝不在 degraded', () => {
  const p = awarenessPanel(realLedger(), { baseline: { A1: 1, A2: 1, A3: 1, A4: 1, A7: 1 } });
  const a6 = p.items.find(i => i.id === 'A6');
  assert.equal(a6.value, false, 'A6 的值是 false —— 当前最诚实的天花板（P521：停在 L2）');
  assert.equal(a6.kind, 'absent');
  assert.ok(p.gaps.includes('A6'), '★ A6 属于"已知缺口"');
  assert.ok(!p.degraded.includes('A6'), '★★ A6 绝不许进 degraded —— 缺口不是退化（P544 的分级）');
});

test('⑤ A5 故意不可量化：value 必须是 null，且进 gaps 不进 degraded', () => {
  const p = awarenessPanel(realLedger());
  const a5 = p.items.find(i => i.id === 'A5');
  assert.equal(a5.value, null, '★ "会在错误后纠正"没有独立数据源 ⇒ 诚实地 null，不编数');
  assert.equal(a5.kind, 'unmeasurable');
  assert.ok(p.gaps.includes('A5'), '★ 它属于"已知缺口"（不是退化，也不是通过）');
});

test('⑥ 退化与缺口不许互相污染', () => {
  const base = realLedger();
  const broken = { ...base, adopts: [], narrations: [] };
  const p = awarenessPanel(broken, { baseline: { A1: 7, A7: 8 } });
  for (const id of p.degraded) {
    const it = p.items.find(i => i.id === id);
    assert.ok(it.kind === 'auditable', '★ degraded 里只能有可审计项，id=' + id);
  }
  for (const id of p.gaps) {
    const it = p.items.find(i => i.id === id);
    assert.ok(it.kind === 'absent' || it.kind === 'unmeasurable', '★ gaps 里只能有缺口项，id=' + id);
  }
  assert.notDeepEqual(p.degraded.sort(), p.gaps.sort(), '★ 两个集合不许相等（那说明分级没生效）');
});

test('⑦ 渲染：缺口(⚫/⚪) 与 退化(🔴) 分开显示，且必须附上"不回答有没有意识"', () => {
  const txt = renderPanel(awarenessPanel(realLedger(), { baseline: { A1: 99 } }));
  assert.ok(txt.includes('A1'), '渲染必须列出 A1');
  assert.ok(/⚫|⚪/.test(txt), '★ 缺口标记必须出现在渲染里');
  assert.ok(txt.includes('🔴'), '★ 退化区必须出现（即使为空也要有标题）');
  assert.ok(/不回答.*有没有意识/.test(txt), '★★ 面板必须自陈边界（P512）——否则它会被读成"它更有意识了"');
});
