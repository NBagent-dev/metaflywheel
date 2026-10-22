import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { renderSelfSnapshot } from '../engine/modules/selfsnap.mjs';
import { setLocaleOverride } from '../engine/modules/i18n.mjs';

// ★P623 整份快照金标。
// 为什么需要它：366 条判据守的是**结构**（能渲染 / 没降级 / 审计面在不在），
//   而"半迁移（上半身英文、下半身中文）"、"分隔符从；变成。"这类回归全部从结构判据下溜过去，
//   三次都是**用户重启后用肉眼**抓到的。
// 做法：把全部数字归一化成 #（时间、计数、δ/ε 每分钟都在变），其余逐字比对。
//   ⇒ 措辞、标点、行序、行数、行数归零/新增 都会被抓住。
const ROOT = path.resolve(import.meta.dirname, '..');
const GOLDEN_ZH = path.join(ROOT, 'test', 'golden', 'selfsnap.zh.norm.txt');
const GOLDEN_EN = path.join(ROOT, 'test', 'golden', 'selfsnap.en.norm.txt');

const norm = function (s) {
  return s.replace(/[0-9]+(?:\.[0-9]+)?/g, '#');
};

const FIXTURE = function () {
  const T = 1761174000000;   // 固定时刻：2026-10-23T01:00:00+08:00
  const RealNow = Date.now;
  Date.now = function () { return T; };
  return {
    restore: function () { Date.now = RealNow; },
    deps: {
      state: {
        seq: 3,
        problems: {
          P001: { id: 'P001', title: 'ALPHA', stage: 'S', updatedAt: T - 120000, cost: 7, delta: 0.2, epsilon: 0.3, deltaCredit: 0.85 },
          P002: { id: 'P002', title: 'BETA', stage: 'F', updatedAt: T - 60000, cost: 4, delta: 0.3, epsilon: null, parked: { at: T - 30000, awakenWhen: 'cites:P108-M64' } },
          P003: { id: 'P003', title: 'GAMMA', stage: 'C', updatedAt: T - 3000000, cost: 9, delta: 0.1, epsilon: 0.1 }
        },
        sediments: [
          { id: 'M1', title: 'DEP-ONE', tags: ['t'], digest: 'd1', cites: 3, depositedAt: T - 86400000, lastCitedAt: T - 3600000 },
          { id: 'M2', title: 'DEP-TWO', tags: ['t'], digest: 'd2', cites: 0, depositedAt: T - 86400000 * 30 },
          { id: 'M3', title: 'DEP-OLD', tags: ['t'], digest: 'd3', status: 'superseded', supersededBy: 'M1', cites: 0, depositedAt: T - 86400000 }
        ],
        narrations: [{ at: T - 86400000 * 4, text: 'narration line', rt: 58.3, s: 4.87 }],
        measure: { driftSignals: ['sig-a', 'sig-b'], reconcile: { orphans: ['x.md'], ghosts: ['y'] }, promiseStats: { woken: 2, honoredTotal: 1, overdueTotal: 1 } },
        constitution: { autonomy: false, log: [], pending: [{ signal: 'sig-p' }] },
        preAction: { off: false, hint: 4, ask: 0, deny: 1 },
        rhythm: { staleMinutes: 90, fireThrottleMinutes: 45, quietFrom: 23, quietTo: 8 },
        patrol: { rounds: 12, lastAt: T - 180000, lastReport: 'r' },
        valence: { events: [] }
      },
      perception: { lastInboxAt: T - 60000, inboxCount: 5, sessionStarts: 2 },
      outsideCalls: 1,
      drift: { active: true, reason: 'drift-reason' },
      retrievalHits: function () { return [{ text: 'retrieval-a' }]; },
      valenceSummaryLine: function () { return '- valence-line'; },
      directiveText: function () { return 'directive-x'; },
      isParked: function (p) { return !!(p && p.parked); },
      isOpen: function () { return false; },
      BOUNDARY_THRESHOLD: 5,
      runStampLine: function () { return 'runstamp-line'; }
    }
  };
};

const renderNorm = function (locale) {
  setLocaleOverride(locale);
  const f = FIXTURE();
  try {
    return norm(renderSelfSnapshot(f.deps));
  } finally {
    f.restore();
    setLocaleOverride(null);
  }
};

const UPDATE = process.env.UPDATE_GOLDEN === '1';

const check = function (locale, file) {
  const actual = renderNorm(locale);
  if (UPDATE) {
    fs.writeFileSync(file, actual + '\n');
    return actual;
  }
  assert.ok(fs.existsSync(file), '缺少金标文件 ' + path.relative(ROOT, file) + '（用 UPDATE_GOLDEN=1 生成一次并提交）');
  const want = fs.readFileSync(file, 'utf8').replace(/\n$/, '');
  assert.equal(actual, want,
    '快照 ' + locale + ' 与金标不一致。差异行：\n' +
    actual.split('\n').filter(function (l, i) { return l !== want.split('\n')[i]; })
      .map(function (l) { return '  实际: ' + l; }).slice(0, 6).join('\n') + '\n' +
    want.split('\n').filter(function (l, i) { return l !== actual.split('\n')[i]; })
      .map(function (l) { return '  金标: ' + l; }).slice(0, 6).join('\n'));
  return actual;
};

test('① 中文快照与金标逐字一致（数字已归一化）', () => {
  check('zh', GOLDEN_ZH);
});

// ★P624 已知缺口（显式 todo，不是静默通过）：快照的**行内容**有六个模块自己拼中文：
//   agenda / awareness / principal / unknowns / hits / adopt。
//   本条 todo 一旦转正，就说明那六个模块都已词条化。
test('② 英文快照与金标逐字一致（半迁移会在这里现形）', { todo: 'P624: 六个行来源模块尚未词条化' }, () => {
  const en = check('en', GOLDEN_EN);
  assert.doesNotMatch(en, /[\u4e00-\u9fff]/, '英文快照里仍有中文：' + en.split('\n').filter(function (l) { return /[\u4e00-\u9fff]/.test(l); }).slice(0, 3).join(' | '));
});

test('③ 负控：改一个标点，金标必须能发现（说明①②不是恒真）', () => {
  const zh = renderNorm('zh');
  const mutated = zh.replace('；', '。');
  assert.notEqual(mutated, zh, '归一化后找不到「；」，说明夹具没覆盖到列表行');
  assert.notEqual(mutated, renderNorm('zh'), '负控失效：改了标点却仍与"金标"相同');
});

test('④ 负控：删掉一行，金标必须能发现', () => {
  const zh = renderNorm('zh');
  const lines = zh.split('\n');
  const dropped = lines.slice(0, lines.length - 2).join('\n');
  assert.notEqual(dropped, zh);
  assert.notEqual(dropped, renderNorm('zh'));
});
