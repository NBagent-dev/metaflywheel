// P594 判据：③事件日志 ④富化侧车 ⑤三项加权 ⑥离线索引
//
// ★ 这一批的共同点：每件都是"**看起来能跑**"很容易、而"**真的在起作用**"需要证据的改动。
//   ⇒ 所以每条判据都尽量落在"世界因此不同了"上，而不是"模块返回了对象"。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, diffSummary, formatEventLine, parseEvents, appendEventLine } from '../engine/modules/events-log.mjs';
import { enrichSediment, enrichTerms, enrichLine } from '../engine/modules/sediment-enrich.mjs';
import { DEFAULT_RETRIEVAL_WEIGHTS, normalizeRetrievalWeights, recencyFactor, importanceFactor, rankFactors } from '../engine/modules/retrieval-weights.mjs';
import { buildIndex, indexJson, sameIndex, indexLine, termsOf } from '../engine/modules/sediment-index.mjs';
import { sedimentCacheGet, retrieveTop } from '../engine/modules/retrieval.mjs';

const DAY = 86400000;
const now = Date.now();
const mk = (id, extra) => Object.assign({ id, title: 'T-' + id, tags: [], depositedAt: now, cites: 0 }, extra || {});

// ─────────── ③ 事件日志 ───────────
test('③a summarize：未核/未处置/退役 三个"仍然欠着"的量必须分别数对', () => {
  const s = {
    seq: 7,
    problems: { P1: {}, P2: {} },
    sediments: [mk('S1'), mk('S2', { status: 'superseded' }), mk('S3', { status: 'refuted' })],
    hits: [{ key: 'k', disposedAt: 1 }, { key: 'k' }],
    unknowns: [{ text: 'x', resolvedAt: null }, { text: 'y', resolvedAt: 2 }],
    adopts: [{}]
  };
  const r = summarize(s);
  assert.equal(r.problems, 2);
  assert.equal(r.sediments, 3);
  assert.equal(r.retired, 2, '被取代/被否证都要计入退役');
  assert.equal(r.owedHits, 1, '未处置才算欠账');
  assert.equal(r.unknowns, 1, '只有没核销的才算未核');
  assert.equal(r.adopts, 1);
});

test('③b formatEventLine：首行无 changed，第二行必须有；且必须是可解析的 JSON', () => {
  const a = { state: { seq: 1, problems: {}, sediments: [], hits: [], unknowns: [], adopts: [] } };
  const b = { state: { seq: 2, problems: { P1: {} }, sediments: [], hits: [], unknowns: [], adopts: [] } };
  const l1 = formatEventLine(null, a, now, { via: 'persist', bytes: 10 });
  const l2 = formatEventLine(a, b, now + 1000, { via: 'tools' });
  const o1 = JSON.parse(l1);
  const o2 = JSON.parse(l2);
  assert.equal(o1.at, now);
  assert.ok(o1.iso, '必须带 iso 便于人读');
  assert.equal(o1.via, 'persist');
  assert.equal(o2.via, 'tools');
  assert.equal(o2.changed.problems, '0→1', '必须报出变化的键与前后值，实得：' + JSON.stringify(o2.changed));
  assert.equal(JSON.stringify(diffSummary({ a: 1, b: 2 }, { a: 1, b: 3 })), '{"b":"2→3"}', '只报变了的键');
});

test('③c parseEvents：坏行必须被跳过并计数，不许拖垮整个日志', () => {
  const text = '{"at":1}\n\nNOT-JSON\n{"at":2}\n';
  const r = parseEvents(text);
  assert.equal(r.events.length, 2, '两条好行必须都留下');
  assert.equal(r.bad, 1, '坏行必须被计数（静默跳过会让日志损坏不可见）');
});

test('③d appendEventLine：没有 writer 必须明说失败，不许假装成功', async () => {
  assert.equal((await appendEventLine(null, 'x')).ok, false);
  const buf = [];
  const w = { append: async (s) => { buf.push(s); } };
  const r = await appendEventLine(w, '{"at":1}');
  assert.equal(r.ok, true);
  assert.equal(buf[0], '{"at":1}\n', '必须带换行（否则下一条会接在同一行）');
  const bad = { append: async () => { throw new Error('EACCES'); } };
  const r2 = await appendEventLine(bad, 'x');
  assert.equal(r2.ok, false, '写失败必须如实报失败');
  assert.match(r2.reason, /EACCES/);
});

// ─────────── ④ 富化侧车 ───────────
test('④a enrichSediment：只能追加，不能覆盖；重复词必须被拒但不报错', () => {
  const s = mk('E1', { title: '安静库房' });
  const r1 = enrichSediment(s, { keywords: ['引用率', '库房'], aliases: '沉默不是失败' }, now);
  assert.equal(r1.ok, true);
  assert.deepEqual(s.enriched.keywords, ['引用率', '库房']);
  assert.deepEqual(s.enriched.aliases, ['沉默不是失败']);
  const r2 = enrichSediment(s, { keywords: ['新词'] }, now);
  assert.equal(r2.ok, true);
  assert.deepEqual(s.enriched.keywords, ['引用率', '库房', '新词'], '必须追加而不是覆盖');
  const r3 = enrichSediment(s, { keywords: ['新词'] }, now);
  assert.equal(r3.ok, false, '全是重复词必须如实说"没有新东西"');
  assert.match(r3.reason, /nothing-new/);
  assert.equal(s.title, '安静库房', '原文一个字都不许改');
});

test('④b ★端到端：一条"标题里没有那个词"的沉积，必须靠别名才能被检索到', () => {
  const fillers = [];
  for (let i = 0; i < 10; i++) fillers.push(mk('F' + i, { title: 'zz' + i + 'qq' + (i * 7) }));
  const s = mk('Z1', { title: '安静库房' });
  // 富化前：florida 搜不到
  const before = retrieveTop('沉默不是失败', 5, 0.3, sedimentCacheGet(fillers.concat([s])));
  assert.equal(before.length, 0, '富化前不该命中（这正是"写入时刻没出现的词永远不会在它身上"）');
  enrichSediment(s, { aliases: ['沉默不是失败'] }, now);
  // 注意：retrieval 的语料缓存只按账本变化失效；这里换了数组对象，故会重算
  const after = retrieveTop('沉默不是失败', 5, 0.3, sedimentCacheGet(fillers.concat([s])));
  assert.ok(after.some((h) => h.ref.id === 'Z1'), '富化后必须能被别名检索到。实得：' + JSON.stringify(after.map(h => h.ref.id)));
  assert.match(enrichLine(s), /已富化/);
});

// ─────────── ⑤ 三项加权 ───────────
test('⑤a 默认权重/归一：非法值回退并报出，合法输入不报', () => {
  const d = normalizeRetrievalWeights(null);
  assert.equal(d.problems.length, 0);
  assert.deepEqual(d.weights, Object.assign({}, DEFAULT_RETRIEVAL_WEIGHTS));
  const bad = normalizeRetrievalWeights({ relevance: -1, recency: 'x' });
  assert.equal(bad.weights.relevance, DEFAULT_RETRIEVAL_WEIGHTS.relevance);
  assert.equal(bad.weights.recency, DEFAULT_RETRIEVAL_WEIGHTS.recency);
  assert.equal(bad.problems.length, 2);
  const ok = normalizeRetrievalWeights({ recency: 0 });
  assert.equal(ok.problems.length, 0);
  assert.equal(ok.weights.recency, 0);
});

test('⑤b 新近度/重要性：半衰期处 ≈0.5；缺 depositedAt 不许被当成"很旧"', () => {
  assert.ok(Math.abs(recencyFactor(now - 30 * DAY, now, 30) - 0.5) < 1e-9);
  assert.equal(recencyFactor(undefined, now), 0.5, '缺字段时中性 0.5（不许当很旧）');
  assert.equal(importanceFactor(0), 0);
  assert.ok(importanceFactor(5, 5) > importanceFactor(1, 5));
  assert.ok(importanceFactor(5, 5) <= 1);
});

test('⑤c ★负控：把"新近度"权重置 0 后，排序必须变化（否则那一项是死的）', () => {
  const items = [
    { id: 'A', relevance: 1, depositedAt: now - 90 * DAY, cites: 0 },  // 旧
    { id: 'B', relevance: 1, depositedAt: now, cites: 0 }              // 新
  ];
  const withRec = rankFactors(items, normalizeRetrievalWeights(null).weights, now);
  assert.equal(withRec.rows[0].id, 'B', '开着新近度时，新的必须排前');
  const off = normalizeRetrievalWeights({ recency: 0, importance: 0 }).weights;
  const noRec = rankFactors(items, off, now);
  assert.notEqual(noRec.rows[0].id, 'B', '关掉新近度后排序必须变（同分按 id 升序 ⇒ A 应在前）。实得：' + JSON.stringify(noRec.rows.map(r => r.id)));
  // 三项必须分别给出，不能只给总分
  const f = withRec.rows[0].factors;
  assert.ok(typeof f.relevance === 'number' && typeof f.recency === 'number' && typeof f.importance === 'number');
});

// ─────────── ⑥ 离线索引 ───────────
test('⑥a buildIndex：必须排除退役、必须确定性（同输入 ⇒ 同字节）', () => {
  const list = [mk('S2', { title: '乙沉积' }), mk('S1', { title: '甲沉积' }), mk('S3', { title: '丙', status: 'superseded' })];
  const a = buildIndex(list, 1000);
  const b = buildIndex(list, 9999);          // 不同 builtAt
  assert.equal(a.count, 2, '退役的必须被跳过');
  assert.equal(a.retired, 1);
  assert.equal(sameIndex(a, b), true, 'builtAt 不同也要判等价（否则"可重建"无法被验证）');
  assert.equal(indexJson(a).indexOf('builtAt'), -1, '稳定序列化不许含 builtAt');
  assert.equal(JSON.parse(indexJson(a)).entries[0].id, 'S1', '条目必须按 id 排序');
  assert.match(indexLine(a), /离线索引/);
});

test('⑥b termsOf：中文必须产出二元组，英文按词；空输入不许抛', () => {
  const t = termsOf('安静库房的引用率 abc');
  assert.ok(t.indexOf('库房') >= 0, '中文二元组必须出现，实得：' + JSON.stringify(t));
  assert.ok(t.indexOf('abc') >= 0);
  assert.deepEqual(termsOf(''), []);
  assert.deepEqual(termsOf(null), []);
});

test('⑥c 索引必须吃富化词：富化之后同一份沉积的索引内容必须变化', () => {
  const s = mk('Y1', { title: '安静库房' });
  const before = indexJson(buildIndex([s], 1));
  enrichSediment(s, { aliases: ['沉默不是失败'] }, now);
  const after = indexJson(buildIndex([s], 1));
  assert.notEqual(before, after, '富化必须进入索引（否则富化对离线检索无效）');
  assert.ok(after.indexOf('沉默不是失败') >= 0 || after.indexOf('失败') >= 0);
});
