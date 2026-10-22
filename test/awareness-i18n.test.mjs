// P605 判据：意识代理指标那一行必须双语，且 zh 输出**逐字节不变**
//
// 为什么先做这一行：它每一轮都在提示里出现（"退化 无 · 静止 无 · 可量 5/7"），
// 是全球用户看得最多的一行中文。而它同时带着一条重要语义：**这个数不回答"有没有意识"**。
//
// 三条：
//   ① ★迁移不改行为：zh 输出与**改代码之前**冻结的黄金串逐字节相同（132 字节）
//   ② en 下整行不含中日韩字符，且保住那两个语义点：degraded/static 分开 + gaps 不是失败
//   ③ 显式 locale 压过全局覆盖（同一条判据在别处也要成立）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awarenessLine } from '../engine/modules/awareness.mjs';
import { setLocaleOverride } from '../engine/modules/i18n.mjs';

// 空 state：没有采用、没有发动、没有改主意、没有未核、没有叙述
// ⇒ 面板最"干净"的形态，且**不含任何随时间变化的数字**（无 ageDays）⇒ 可做黄金。
const STATE = { adopts: [], constitution: { log: [] }, principal: [], unknowns: [], narrations: [] };

const GOLDEN_ZH = '- 意识代理指标：退化 无 · 静止 A7（从未叙述） · 可量 5/7（A5/A6 无数据源或无字段，不是失败）。';
const CJK = /[\u3040-\u30ff\u4e00-\u9fff\uff00-\uffef]/;

test('① ★迁移不改行为：zh 输出与迁移前冻结的黄金串逐字节相同', () => {
  const got = awarenessLine(STATE, {}, 'zh');
  assert.equal(Buffer.byteLength(got, 'utf8'), 132, '字节数变了');
  assert.equal(got, GOLDEN_ZH);
});

test('② en 下不含中日韩字符，且语义点都在（degraded/static 分开、gaps 不是失败）', () => {
  const en = awarenessLine(STATE, {}, 'en');
  assert.ok(en.length > 0, 'en 输出不许为空');
  assert.equal(CJK.test(en), false, 'en 输出里仍有中日韩字符：' + en);
  assert.ok(/awareness proxies/.test(en), '缺少标题：' + en);
  assert.ok(/degraded/.test(en) && /static/.test(en), '退化与静止必须分开出现：' + en);
  assert.ok(/not a failure/.test(en), 'gaps 必须说明"不是失败"（这是语义，不是措辞）：' + en);
});

test('③ 显式 locale 压过全局覆盖：全局设了 en，显式 zh 仍必须是中文', () => {
  setLocaleOverride('en');
  try {
    const zh = awarenessLine(STATE, {}, 'zh');
    assert.equal(zh, GOLDEN_ZH, '显式 zh 必须压过全局覆盖');
  } finally {
    setLocaleOverride('');
  }
});

test('④ 负控：面板本身不能因为换语言而消失（两种 locale 都必须非空）', () => {
  for (const L of ['zh', 'en']) {
    const s = awarenessLine(STATE, {}, L);
    assert.ok(typeof s === 'string' && s.length > 10, 'locale=' + L + ' 输出为空或过短：' + JSON.stringify(s));
  }
});
