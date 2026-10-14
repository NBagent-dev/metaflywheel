// P521 判据：**内生议程** —— 从账本状态算出"该做什么"，且**不许冒充"想要"**。
// 运行：node --test test/agenda.test.mjs
//
// 立题背景：自主发动此前只有一条议程来源（在轮题陈旧=时钟到点 ⇒ L0）。
// 本判据要钉住三件事：①每条议题**必须带出处**（不许凭空生成）
//   ②账本干净 ⇒ **不许发议题**（负控：不许为了显得"自发"而造题）
//   ③**分级诚实**：只产出 L2，且渲染文本里必须写明"不是 L3/想要"（结构上不可能冒充）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AGENDA_MAX, HIT_REPEAT_MIN, STALE_DEPOSIT_DAYS, LEVEL, innerAgenda, levelNote, agendaLine } from '../engine/modules/agenda.mjs';

const DAY = 24 * 3600 * 1000;
const unk = (id, at, key, until) => ({ id, at, key, text: 'T' + id, until, resolvedAt: null });
const hit = (at, key) => ({ id: 'H' + at, at, key, tool: 't', verdict: 'hint', disposedAt: at + 1 });

test('①未核条目 ⇒ 一条带**出处 id** 的议题（且必须转述退役条件）', () => {
  const st = { unknowns: [unk('U1', 1000, 'P472', '拿到 45 格样本')] };
  const a = innerAgenda(st, 2000);
  assert.equal(a.length, 1);
  assert.equal(a[0].kind, 'unknown');
  assert.equal(a[0].ref, 'U1', '必须带出处（约束③：不许凭空生成议题）');
  assert.match(a[0].because, /拿到 45 格样本/, '必须带上退役条件——否则分不清"未核"与"没想清楚"');
});

test('②已核销的未核 ⇒ **不再提**（核销过的东西不许反复来烦）', () => {
  const st = { unknowns: [{ id: 'U1', at: 1, key: 'K', text: 'T', until: 'x', resolvedAt: 500, resolvedBy: 'e' }] };
  assert.equal(innerAgenda(st, 2000).length, 0);
});

test('③反复命中：同一 key ≥' + HIT_REPEAT_MIN + ' 次【且仍有欠账】⇒ 提；2 次 ⇒ **负控不提**', () => {
  // ★★2026-10-11 修订（P523）：旧夹具用的是 `hit()`（`disposedAt: at + 1` ⇒ **全部已处置、无 stillOpen**），
  //   而**那恰恰是"它只是我的工作主题"那一类**——现场：28 次全部已处置，内生议程却报「…而是没被解决」= 误报。
  //   ⇒ 触发条件补上【存在欠账】：`未处置` 或 `stillOpen === true`。
  //   ⇒ 本判据改用**未处置**的命中来考"≥3 次 ⇒ 提"的原意；
  //      "全部已处置 ⇒ 不提"由 test/hit-discriminator.test.mjs 判据① 看守（两条判据各管一半）。
  const hitOpen = (at, key) => ({ id: 'H' + at, at, key, tool: 't', verdict: 'hint', disposedAt: null });
  const two = { hits: [hitOpen(1, 'K'), hitOpen(2, 'K')] };
  assert.equal(innerAgenda(two, 3000).filter(i => i.kind === 'hit-repeat').length, 0, '2 次不到阈值，不许提（负控）');
  const three = { hits: [hitOpen(1, 'K'), hitOpen(2, 'K'), hitOpen(3, 'K')] };
  // ★★2026-10-14 再修订（P537）：本判据考的是 hit-repeat【这一类】议题在不在，
  //   而 P537 新增了 hit-open（欠账）来源且权重更高 ⇒ 断言必须【筛选出 hit-repeat】再看，
  //   不能断言"总数 === 1"或"第一条是它"——那是断言范围大于它真正要测的东西。
  const hr = innerAgenda(three, 4000).filter(i => i.kind === 'hit-repeat');
  assert.equal(hr.length, 1);
  assert.equal(hr[0].ref, 'hits:K');
  assert.match(hr[0].because, /未处置|仍未解决/, '理由必须指向账本里可核对的事实，不许是"通常…而是…"这类格言');
  // ★负控（新增）：全部已处置且无 stillOpen ⇒ **不得产出 hit-repeat**（也不得产出 hit-open）
  const threeDisposed = { hits: [hit(1, 'K'), hit(2, 'K'), hit(3, 'K')] };
  const none = innerAgenda(threeDisposed, 4000);
  assert.equal(none.filter(i => i.kind === 'hit-repeat').length, 0,
    '★现场复现：28 次全部已处置且无 stillOpen ⇒ 不产出——那是我这一轮的工作主题，不是欠账');
  assert.equal(none.filter(i => i.kind === 'hit-open').length, 0, '无欠账 ⇒ 也不许产出 hit-open（负控）');
});

test('④零引用沉积：>=' + STALE_DEPOSIT_DAYS + ' 天才提；新的不提（负控）', () => {
  const now = 100 * DAY;
  const fresh = { sediments: [{ id: 'M1', at: now - 2 * DAY, cites: 0 }] };
  assert.equal(innerAgenda(fresh, now).length, 0, '刚写的沉积不许被当成"没人用"');
  const stale = { sediments: [{ id: 'M1', at: now - 20 * DAY, cites: 0 }] };
  assert.equal(innerAgenda(stale, now).length, 1);
  const cited = { sediments: [{ id: 'M1', at: now - 20 * DAY, cites: 3 }] };
  assert.equal(innerAgenda(cited, now).length, 0, '被引用过的沉积不算零引用');
});

test('⑤★负控：账本干净 ⇒ **一条都不许提**（不许为了显得"自发"而造题）', () => {
  assert.deepEqual(innerAgenda({}, 1000), []);
  assert.deepEqual(innerAgenda({ unknowns: [], hits: [], sediments: [] }, 1000), []);
  assert.equal(agendaLine({}, 1000), '');
});

test('⑥有界：议题再多也只提 ' + AGENDA_MAX + ' 条', () => {
  const unks = [];
  for (let i = 0; i < 10; i++) unks.push(unk('U' + i, i, 'K' + i, 'until' + i));
  assert.equal(innerAgenda({ unknowns: unks }, 100000).length, AGENDA_MAX);
});

test('⑦★分级诚实：只产出 L2，且渲染文本**必须写明"不是想要"**（结构上不可能冒充 L3）', () => {
  const st = { unknowns: [unk('U1', 1000, 'P472', 'x')] };
  const a = innerAgenda(st, 2000);
  assert.equal(a[0].level, LEVEL);
  assert.equal(LEVEL, 'L2', '本模块只允许产出 L2');
  assert.match(levelNote(), /不是"我想要"/, '必须自陈不是 L3');
  const line = agendaLine(st, 2000);
  assert.match(line, /L2 内生议程/, line);
  assert.match(line, /不是"我想要"/, '渲染里必须带分级自陈：' + line);
  assert.match(line, /出处 U1/, '渲染里必须带出处');
});

test('⑧实现里不得出现把 L2 说成 L3 的措辞（源码级扫描）', () => {
  const SRC = fs.readFileSync(new URL('../engine/modules/agenda.mjs', import.meta.url), 'utf8');
  const code = SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // ★修正（2026-10-11）：本判据第一版直接扫 `/我想要/`，结果把**否定式**（`不是"我想要"`）也判红了。
  //   这是 P424-M362 说的「判据量的是代理词，不是病」——**病是"把 L2 自述成 L3"，不是"想要"这两个字**。
  //   所以：**允许否定式**（"不是…想要"是分级诚实的一部分，必须允许），**禁止肯定式**。
  const bare = code
    .replace(/不是\s*["'「]?\s*我想要\s*["'」]?/g, 'X')
    .replace(/不是\s*["'「]?\s*想要\s*["'」]?/g, 'X');
  assert.ok(!/我想要/.test(bare), '实现里不得出现"我想要"这种**肯定式**自述（否定式"不是想要"允许）');
  assert.ok(!/L3['"］]?\s*[:=]\s*['"]?L3/.test(code), '不许产出 L3');
});

test('⑨★接线：selfsnap 必须渲染内生议程（**能算出 ≠ 会被看见**）', () => {
  const SRC = fs.readFileSync(new URL('../engine/modules/selfsnap.mjs', import.meta.url), 'utf8');
  assert.match(SRC, /import\s*\{[^}]*agendaLine[^}]*\}\s*from\s*['"]\.\/agenda\.mjs['"]/, 'selfsnap 必须引入 agendaLine');
  assert.ok(/agendaLine\(state\)/.test(SRC), 'selfsnap 必须真的调用 agendaLine(state)');
  assert.ok(/if\s*\(\s*al\s*\)\s*lines\.push\(al\)/.test(SRC), '空议程 ⇒ 不 push（负控）');
});

test('⑩★接线：patrol 必须让内生议题**成为一次自主发动的信号**（带出处 + 分级自陈 + 位置正确）', () => {
  const SRC = fs.readFileSync(new URL('../engine/modules/patrol.mjs', import.meta.url), 'utf8');
  assert.match(SRC, /import\s*\{[^}]*innerAgenda[^}]*\}\s*from\s*['"]\.\/agenda\.mjs['"]/, 'patrol 必须引入 innerAgenda');
  // ★锚点用**结构化前缀**（"内生议程(出处 " 按字面），不用"名字"——今天已栽过两次（见 ⑧ 与假警复盘）。
  assert.ok(/signals\.push\('内生议程\(出处 ' \+/.test(SRC), '必须把内生议题 push 成发动信号，且带"出处"前缀');
  assert.match(SRC, /不是"我想要"/, '发动信号里必须自陈不是 L3');
  assert.match(SRC, /L2 内生议程——规则触发/, '必须写明级别与触发源');
  // ★约束④：**在轮题优先，内生议程只作附加项** ⇒ 必须排在"议程推进"之后。
  const iAg = SRC.indexOf("signals.push('内生议程(出处 '");
  const iStale = SRC.indexOf("signals.push('议程推进 '");
  assert.ok(iStale > 0 && iAg > iStale, '内生议程必须排在"议程推进"之后（P521 约束④）');
  // ★P484：装饰件不得成为单点故障。
  assert.match(SRC, /catch \(e\) \{ \/\* 内生议程永不阻断巡检 \*\/ \}/, '必须 fail-open');
});
