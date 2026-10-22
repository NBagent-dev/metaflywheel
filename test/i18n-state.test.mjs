import test from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../engine/modules/i18n.mjs';

// 冻结金标：这些字符串在 P620 之前是 state.mjs 里的字面量，逐字节抄在这里。
// 改造只许"搬家"，不许改字 —— 所以这条判据在改造前后必须都能通过。
const ZH_GOLDEN = [
  [['state.persist.none', {}], '\n（本轮未发生落盘）'],
  [['state.persist.ok', { mode: 'service-atomic', backup: ' · 上一版 2466339 字符 → flywheel.json.bak' }],
   '\n（账本已落盘 · service-atomic · 上一版 2466339 字符 → flywheel.json.bak）'],
  [['state.persist.ok', { mode: 'failed', backup: '' }], '\n（账本已落盘 · failed）'],
  [['state.persist.fail', { why: '未知原因' }],
   '\n⚠ **账本未落盘**：未知原因（改动只在内存里，重启即失——不要当作已记账）'],
  [['state.restore', { root: 'C:/w', fr: 3, n: 2 }], '已加载最新状态 C:/w (freshness 3，扫描 2 个候选根)'],
  [['state.backup.none', {}], '未提供写前内容'],
  [['state.backup.first', {}], '首写，无上一版'],
  [['state.backup.prev', { n: 12, suffix: '.bak' }], '上一版 12 字符 → flywheel.json.bak'],
  [['state.reconcile.nofs', {}], 'skipped(无 fsSvc 或沉积根未定)']
];

test('① 冻结金标：zh 输出与搬迁前逐字节相同', () => {
  for (const [args, want] of ZH_GOLDEN) {
    assert.equal(t(args[0], args[1], 'zh'), want, '词条 ' + args[0] + ' 的 zh 文案被改动了');
  }
});

// ★判据自身的一处错，被它自己抓住了：最初这里把 zh 文案当参数传给 en 渲染
//   （backup = ' · 上一版 … 字符 → flywheel.json.bak'），于是 en 输出里当然有中文。
//   这不是词条漏译，是**夹具把中英混在一起**。参数也必须是英文。
const EN_PARAMS = {
  backup: ' · previous version 2466339 chars → flywheel.json.bak',
  why: 'unknown reason',
  root: 'C:/w'
};

test('② en：同一批词条必须是英文（不含 CJK）', () => {
  for (const [args] of ZH_GOLDEN) {
    const p = Object.assign({}, args[1], EN_PARAMS);
    const s = t(args[0], p, 'en');
    assert.doesNotMatch(s, /[\u4e00-\u9fff]/, '词条 ' + args[0] + ' 的 en 版本仍含中文：' + s);
    assert.notEqual(s, t(args[0], args[1], 'zh'), '词条 ' + args[0] + ' 的 en 与 zh 完全相同（多半是漏译）');
  }
});

test('③ 负控：缺失词条必须显形（⟨key⟩），不许静默回退成中文', () => {
  const s = t('state.does.not.exist', {}, 'en');
  assert.match(s, /state\.does\.not\.exist/);
  assert.doesNotMatch(s, /[\u4e00-\u9fff]/);
});
