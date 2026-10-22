// P603 判据：输出层可切换语言，而数据层不可翻译
//
// 五条，其中两条是"必须能红"的结构负控：
//   ① 双表键集合必须相等 —— 加了 zh 忘了 en，必须红（缺键会静默显示成 ⟨key⟩）
//   ② 缺键必须可见 —— 不是回退成 key 本身，也不是空串
//   ③ locale 解析：zh-CN→zh · en-US→en · 不认识→zh（不静默变英文）
//   ④ ★迁移不改行为：locale=zh 的输出必须与**迁移前冻结的黄金串逐字节相同**
//   ⑤ ★数据不随 locale 变：同一条记录，两个 locale 下出现的 key/text 一字不差
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, resolveLocale, allKeys, keyDiff, LOCALES, DEFAULT_LOCALE } from '../engine/modules/i18n.mjs';
import { hitsLine } from '../engine/modules/hits.mjs';

// ★黄金：在任何 i18n 改动**之前**从原实现抓取的输出（509 字节），冻结于此。
const NOW = 1792500000000;
const DAY = 86400000;
const LIST = [
  { id: 'A1', key: '愿景', text: 'k-vision', verdict: 'hint', at: NOW - 5 * DAY, disposedAt: NOW - DAY, direction: true, myAction: 'x' },
  { id: 'A2', key: '项目定位', text: 'k-scope', verdict: 'hint', at: NOW - 5 * DAY, disposedAt: NOW - DAY, stillOpen: true, stillOpenUntil: NOW + 10 * DAY, myAction: 'y' },
  { id: 'A3', key: '规则', text: 'k-rule', verdict: 'hint', at: NOW - 5 * DAY }
];
const GOLDEN_ZH = '- 命中回流(P519·**源→行为→记录→源**)：命中 3 次 · **未处置 1 次** · **处置了但仍未解决 1 次** · **方向 1 条（不参与欠账，仍可按 ID 查到）**：「k-vision」(愿景)：「k-vision」(愿景·hint·已处置) · 「k-scope」(项目定位·hint·**处置了但仍未解决**) · 「k-rule」(规则·hint·**未处置**)——**未处置是我欠的账**：命中了却没说清怎么处置，等于没被约束过（用 `mpm_hit action=dispose` 留痕）。';

test('① 双表键集合必须相等（加一条 zh 忘了 en ⇒ 红）', () => {
  assert.ok(allKeys().length >= 11, '表里的键太少，可能整体坏了：' + allKeys().length);
  const d = keyDiff();
  for (const L of LOCALES) {
    assert.deepEqual(d.missing[L], [], '「' + L + '」缺少默认语言的键：' + d.missing[L].join(','));
    assert.deepEqual(d.onlyInLocale[L], [], '「' + L + '」有默认语言没有的键：' + d.onlyInLocale[L].join(','));
  }
});

test('② 缺键必须可见：返回 ⟨key⟩ 而不是 key 本身、也不是空串', () => {
  const s = t('hits.no-such-key', null, 'en');
  assert.equal(s, '⟨hits.no-such-key⟩');
  assert.notEqual(s, 'hits.no-such-key');
  assert.notEqual(s, '');
});

test('③ locale 解析：归一化 + 不认识的落回默认（不静默变英文）', () => {
  assert.equal(resolveLocale('zh-CN'), 'zh');
  assert.equal(resolveLocale('zh_CN'), 'zh');
  assert.equal(resolveLocale('en-US'), 'en');
  assert.equal(resolveLocale('EN'), 'en');
  assert.equal(resolveLocale('fr'), DEFAULT_LOCALE, '不认识的语言必须落回默认，不许猜成英文');
  assert.equal(resolveLocale(undefined), DEFAULT_LOCALE);
  assert.equal(resolveLocale(''), DEFAULT_LOCALE);
});

test('④ ★迁移不改行为：zh 输出与迁移前冻结的黄金串逐字节相同', () => {
  const got = hitsLine({ hits: LIST }, 3, 'zh');
  assert.equal(Buffer.byteLength(got, 'utf8'), Buffer.byteLength(GOLDEN_ZH, 'utf8'), '字节数变了');
  assert.equal(got, GOLDEN_ZH);
});

test('⑤ ★数据不随 locale 变：两个 locale 下 key/text 一字不差，只有文案变', () => {
  const zh = hitsLine({ hits: LIST }, 3, 'zh');
  const en = hitsLine({ hits: LIST }, 3, 'en');
  assert.notEqual(zh, en, 'locale=en 必须真的换语言');
  for (const tok of ['愿景', '项目定位', '规则', 'k-vision', 'k-scope', 'k-rule', 'hint']) {
    assert.ok(zh.includes(tok), 'zh 里丢了数据 token: ' + tok);
    assert.ok(en.includes(tok), 'en 里丢了数据 token（数据被翻译了？）: ' + tok);
  }
  assert.ok(en.includes('directions'), 'en 应出现 directions: ' + en.slice(0, 120));
  assert.ok(zh.includes('方向'), 'zh 应出现 方向');
});
