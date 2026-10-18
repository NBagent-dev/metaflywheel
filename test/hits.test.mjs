// P519 判据：**回流**——命中的"处置"必须入账，且**未处置必须可见**。
// 运行：node --test test/hits.test.mjs
//
// 与 P482⑨「承诺的最后一米」同构：写下→叫醒→履行→清账，缺的是**清账**。
// 所以本判据的重点不是"记了没有"，而是：
//   ①无 key/tool 不许记（负控：不许刷量）②空处置不算处置 ③**未处置必须被显示出来**
//   ④同一条命中只处置一次（不许批量"洗白"）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HIT_MAX, recordHit, disposeHit, openHits, mergeHits, hitsLine } from '../engine/modules/hits.mjs';

const H = (at, key, tool, verdict) => ({ at, key, tool, verdict });

test('①无 key 或 tool ⇒ 不记（负控：不许刷量、不许把普通动作写成"命中"）', () => {
  assert.equal(recordHit([], { at: 1, key: '', tool: 'edit' }).entry, null);
  assert.equal(recordHit([], { at: 1, key: '项目定位', tool: '' }).entry, null);
  assert.ok(recordHit([], H(1, '项目定位', 'mpm_solve', 'hint')).entry);
});

test('②处置必须给 myAction —— 空处置不算处置', () => {
  const r = recordHit([], H(1000, '项目定位', 'mpm_solve', 'hint'));
  assert.equal(disposeHit(r.list, r.entry.id, '').disposed.length, 0, '空 myAction ⇒ 拒绝');
  assert.equal(disposeHit(r.list, r.entry.id, '   ').disposed.length, 0);
  const ok = disposeHit(r.list, r.entry.id, '在回复里显式写了"这与你的定位一致"', 2000);
  assert.equal(ok.disposed.length, 1);
  assert.equal(ok.disposed[0].myAction, '在回复里显式写了"这与你的定位一致"');
  assert.equal(ok.disposed[0].disposedAt, 2000);
});

test('③★未处置必须可见 —— 这是"对源负责"的核心，缺了它回流只是台账装饰', () => {
  let l = recordHit([], H(1000, '项目定位', 'mpm_solve', 'hint')).list;
  assert.equal(openHits(l).length, 1, '刚命中 ⇒ 未处置');
  const line1 = hitsLine({ hits: l });
  assert.match(line1, /未处置 1 次/, '未处置必须显示：' + line1);
  assert.match(line1, /未处置是我欠的账/, '必须把"未处置=欠账"说清');
  l = disposeHit(l, '项目定位', '已按它调整了写法').list;
  assert.equal(openHits(l).length, 0);
  const line2 = hitsLine({ hits: l });
  assert.match(line2, /未处置 0 次/);
  assert.match(line2, /全部已处置/);
});

test('④同一条命中只处置一次（不许批量"洗白"）', () => {
  // ★P574：桩改用【不同 key】造两条 —— 因为同一个 key 在未处置期间的连续命中
  //   现在会被合并成一条（那是同一件事被踩了两次，不是两笔欠账）。
  //   而本判据考的是 `disposeHit` 会不会一次洗白【多笔】—— 所以要用真的两笔。
  let l = [];
  l = recordHit(l, H(1000, 'A', 't1', 'hint')).list;
  l = recordHit(l, H(2000, 'B', 't2', 'ask')).list;
  const r = disposeHit(l, 'A', '处置了最新那条');
  assert.equal(r.disposed.length, 1, '按 key 处置只应命中一条');
  assert.equal(openHits(r.list).length, 1, '剩 B 仍未处置');
});

test('④b ★P574：同一 key 未处置期间的连续注入【合并成一条】，处置之后才记新的一条', () => {
  // 这条守的是 P574 本身：它是"提醒次数"与"欠账笔数"能分开的前提。
  let l = [];
  l = recordHit(l, H(1000, 'K', 't', 'hint')).list;
  l = recordHit(l, H(2000, 'K', 't', 'hint')).list;
  l = recordHit(l, H(3000, 'K', 't', 'hint')).list;
  assert.equal(l.length, 1, '未处置期间三次注入 ⇒ 只有一条');
  assert.equal(l[0].count, 3, '而 count=3 记住了"被提醒三次"');
  l = disposeHit(l, 'K', '处置了').list;
  assert.equal(l.length, 1, '处置之后仍然只有一条（处置不新增记录）');
  l = recordHit(l, H(4000, 'K', 't', 'hint')).list;
  assert.equal(l.length, 2, '处置之后再命中 ⇒ 那是新的一次背离，该记第二条');
});

test('⑤负控：没有命中记录 ⇒ 快照那一行必须为空（不许凭空说"命中过"）', () => {
  assert.equal(hitsLine({}), '');
  assert.equal(hitsLine({ hits: [] }), '');
  assert.equal(hitsLine({ hits: null }), '');
});

test('⑥归并：并集 + 按 id 去重（恢复纪律）', () => {
  const a = recordHit([], H(1000, 'K1', 't', 'hint')).list;
  const b = recordHit([], H(2000, 'K2', 't', 'hint')).list;
  assert.equal(mergeHits(a, b).length, 2);
  assert.equal(mergeHits(a, a).length, 1);
});

test('⑦有界：超上限丢最旧（防通胀，与 unknowns 同口径）', () => {
  let l = [];
  for (let i = 0; i < HIT_MAX + 5; i++) l = recordHit(l, H(1000 + i, 'K' + i, 't', 'hint')).list;
  assert.equal(l.length, HIT_MAX);
  assert.equal(l[0].key, 'K5');
});

test('⑨★接线：host 必须记录命中（回流），且**同一判决只许计一次数**（重复计数会让计数虚高）', () => {
  const HOST = fs.readFileSync(new URL('../engine/host.js', import.meta.url), 'utf8');
  const i = HOST.indexOf('consultPrincipal(state.principal');
  assert.ok(i > 0, 'host.js 没有调用 consultPrincipal');
  const block = HOST.slice(i, i + 1200);
  assert.match(block, /recordHit\(/, '命中了却不记录 ⇒ 回流断裂（P519 的立题就是这个）');
  assert.match(block, /state\.hits = r\.list/, '记录后必须写回 state.hits');
  // ★实测过的事故：同一条件 `pc.verdict === 'hint'` 写了两遍 ⇒ 计数被双计（快照显示"提示27"是虚高的）。
  const dup = (block.match(/pc\.verdict === 'hint'/g) || []).length;
  assert.equal(dup, 1, '`pc.verdict === \'hint\'` 出现 ' + dup + " 次 —— 必须恰好 1 次（重复计数 = 计数不可信）");
});

test('⑧判决只允许 hint/ask（deny 永不出现——与 P518 风险②一致）', () => {
  const r = recordHit([], { at: 1, key: 'K', tool: 't', verdict: 'deny' });
  assert.equal(r.entry.verdict, 'hint', 'deny 会被归一化成 hint ⇒ 结构上不可能记录 deny');
  const SRC = fs.readFileSync(new URL('../engine/modules/hits.mjs', import.meta.url), 'utf8');
  assert.ok(!/deny/.test(SRC.replace(/\/\/[^\n]*/g, '')), '实现里不得出现 deny');
});
