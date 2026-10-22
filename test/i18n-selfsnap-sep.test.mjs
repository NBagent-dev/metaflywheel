import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { t } from '../engine/modules/i18n.mjs';
import { renderSelfSnapshot } from '../engine/modules/selfsnap.mjs';

const SRC = fs.readFileSync(new URL('../engine/modules/selfsnap.mjs', import.meta.url), 'utf8');

// 这是一条**回归判据**：P621 迁移动词条时，我把 7 处 join('；') 换成了 join(t('snap.period'))，
// 于是列表分隔符从「；」变成「。」——而中文读者在快照首行一眼就看出来了。
// 教训：词条化的对象只有"给人看的整句"，**结构分隔符也是文案**，它得有自己的词条。
function render(problems, extra) {
  const now = Date.now();
  return renderSelfSnapshot({
    state: Object.assign({ seq: 1, problems: problems || {
      PA: { id: 'PA', title: 'A', stage: 'S', updatedAt: now, cost: 1 },
      PB: { id: 'PB', title: 'B', stage: 'S', updatedAt: now, cost: 1 }
    }, sediments: [], patrol: { rounds: 1, lastAt: now }, measure: {},
      constitution: { autonomy: true, log: [] }, valence: { events: [] }, narrations: [] }, extra || {}),
    perception: { lastInboxAt: now - 60000, inboxCount: 1, sessionStarts: 1 },
    outsideCalls: 0, drift: { active: false, reason: '' }, retrievalHits: () => [],
    valenceSummaryLine: () => '', directiveText: () => 'x',
    isParked: () => false, isOpen: () => false, BOUNDARY_THRESHOLD: 5, runStampLine: () => ''
  });
}

test('① 静态：selfsnap 里不许用句号词条作 join 分隔符', () => {
  assert.equal(SRC.split("join(t('snap.period'))").length - 1, 0,
    '有 join 用了 snap.period —— 列表分隔符必须是 snap.semicolon');
});

test('② 词条本身：semicolon 是分号，period 是句号，两者不同', () => {
  assert.equal(t('snap.semicolon', {}, 'zh'), '；');
  assert.equal(t('snap.period', {}, 'zh'), '。');
  assert.notEqual(t('snap.semicolon', {}, 'en'), t('snap.period', {}, 'en'));
});

test('③ 端到端：两题在轮 ⇒ 两个条目之间必须是「；」', () => {
  const line = render().split('\n').find(function (l) { return l.indexOf('在轮身份') >= 0; }) || '';
  assert.ok(line, '没有在轮身份行');
  assert.ok(line.indexOf('PA') >= 0 && line.indexOf('PB') >= 0, '两题都必须在行里：' + line);
  assert.match(line, /PA[^；。]*；/, '两个题之间必须是「；」，实际：' + line.slice(0, 160));
});

test('④ 负控：把 semicolon 临时改成句号，判据必须能发现（说明③不是恒真）', () => {
  const bad = render().replace(/；/g, '。');
  assert.doesNotMatch(bad, /PA[^。]*；/);
});
