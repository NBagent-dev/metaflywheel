// P019/M14 级判据：**能自己决定，就必须能被看见地决定**（用户 2026-10-11 定为项目目标）。
// 运行：node --test test/selfdecision.test.mjs
//
// 为什么这条判据必须存在（而且必须对自己成立）：
//   如果"能自己决定就必须能被看见地决定"是目标，那么**这条目标本身必须每次都被看得见**。
//   否则它只是一句我们都会点头的话，而不是一个会红的东西。
//
// 判据三件：
//   ① 快照里必须有一行"自我决定"审计面（且标明自我设定 vs 出厂默认）
//   ② 它必须**从 state 推导**：改了节律/停用了检索 ⇒ 那一行必须跟着变（不许手写常量）
//   ③ 必须写出**否决路径**——不写否决路径的"可否决"只是一句话
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSelfSnapshot } from '../engine/modules/selfsnap.mjs';
import { t } from '../engine/modules/i18n.mjs';

const SRC = fs.readFileSync(new URL('../engine/modules/selfsnap.mjs', import.meta.url), 'utf8');

function render(stateExtra, problems) {
  const now = Date.now();
  // ★必须喂至少一个题：自我快照在**空态**（无题无沉积）时按设计返回 ''（"装配层自动省略"）。
  //   本判据第一版没喂 ⇒ 渲染出空串 ⇒ 五条断言全红，而错的**是测试不是实现**
  //   （教训：判据红了先问"我喂的东西对不对"，再问"实现错没错"）。
  const ps = problems || { PD: { id: 'PD', title: '占位题', stage: 'S', updatedAt: now, cost: 1 } };
  return renderSelfSnapshot({
    state: Object.assign({
      seq: 1, problems: ps, sediments: [],
      patrol: { rounds: 1, lastAt: now, lastReport: 'x' }, measure: {},
      constitution: { autonomy: true, grantedAt: 0, log: [], lastFireAt: 0 },
      valence: { events: [] }, narrations: []
    }, stateExtra || {}),
    perception: { lastInboxAt: now - 60000, inboxCount: 1, sessionStarts: 1 },
    outsideCalls: 0, drift: { active: false, reason: '' }, retrievalHits: () => [],
    valenceSummaryLine: () => '', directiveText: () => 'x',
    isParked: (p) => !!(p && p.parked), isOpen: (p) => !!(p && p.open),
    BOUNDARY_THRESHOLD: 5, runStampLine: () => ''
  });
}
const lineOf = (txt) => txt.split('\n').find((l) => l.indexOf('自我决定(') >= 0) || '';

// ★P621 修：这条判据原来锚在 selfsnap.mjs 的**字面量**上。P621 把那行文字搬进 i18n 词条后，
//   判据随之变红——但它红的原因是"字被搬走了"，不是"审计面消失了"。
//   **一个锚在字面量上的判据，字面量一搬家它就停止守卫。** 所以改锚到"两处都在"：
//   渲染器必须引用那个词条 key，词条里必须有那句审计面文案。任一处丢了都会红。
test('判据源存在：渲染器必须引用 snap.selfDetHead，且词条里必须有这句审计面', () => {
  assert.ok(SRC.indexOf("t('snap.selfDetHead')") >= 0,
    '渲染器不再引用 snap.selfDetHead —— 快照里没有"自我决定"审计面，那这条目标就只是嘴上说的');
  const zh = t('snap.selfDetHead', {}, 'zh');
  assert.ok(zh.indexOf('自我决定(') >= 0, '词条 snap.selfDetHead 丢了"自我决定("这半句：' + zh);
  assert.ok(zh.indexOf('能自己决定就必须能被看见地决定') >= 0, '词条丢了那句目标本身：' + zh);
});

test('①未改写任何东西 ⇒ 必须显示"出厂默认"（不许把默认冒充成我的决定）', () => {
  const l = lineOf(render({}));
  assert.ok(l, '没有自我决定行');
  assert.match(l, /节律出厂默认/);
  assert.match(l, /行动前检索/);
});

test('②它必须从 state 推导：改了节律 ⇒ 那一行跟着变（不许手写常量）', () => {
  const l = lineOf(render({ rhythm: { staleMinutes: 90, fireThrottleMinutes: 45, quietFrom: 23, quietTo: 8 } }));
  assert.match(l, /节律\*\*自我设定\*\*\(90min\/静默23-8\)/, '改写的节律必须出现在审计面里：' + l);
});

test('②停用检索 ⇒ 必须显示"已停用"（状态要可分辨）', () => {
  const l = lineOf(render({ preAction: { off: true, hint: 0, ask: 0, deny: 0 } }));
  assert.match(l, /行动前检索\*\*已停用\*\*/);
});

test('②承诺条数必须实数（可机械求值的才算）', () => {
  const now = Date.now();
  const mk = (id, expr) => ({ id, stage: 'S', updatedAt: now, cost: 1, parked: { at: now, awakenWhen: expr } });
  const l = lineOf(render({}, {
    P1: mk('P1', 'after:2099-01-01'),
    P2: mk('P2', 'user:reply'),
    P3: mk('P3', '等用户确认（自由文本，不是承诺）')
  }));
  assert.match(l, /可机械求值的承诺 2 条/, '两条机械 + 一条自由文本 ⇒ 应报 2：' + l);
});

test('③必须写出否决路径（不写路径的"可否决"只是一句话）', () => {
  const l = lineOf(render({}));
  assert.match(l, /否决路径/);
  assert.match(l, /mpm_rhythm reset/);
  assert.match(l, /preaction\.rules\.json/);
  assert.match(l, /mpm_grant revoke/);
});
