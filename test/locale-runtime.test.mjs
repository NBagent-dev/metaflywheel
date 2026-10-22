// P604 判据：语言必须能在**不重启**的情况下切换，而优先级不许被文件悄悄改写
//
// 为什么需要这条：`MPM_LOCALE` 只有进程启动时设一次。一个发布给全球用户的插件，
// 让用户"改环境变量再重启整个宿主"才换语言是荒唐的。所以加了运行时覆盖
// （引擎读 <root>/.mpm/locale 后调用 setLocaleOverride）。
//
// 而"能切"还不够 —— 优先级错了会让运维的决定被一个文件无声盖掉。所以钉住四条：
//   ① 覆盖生效且**立刻**影响渲染（不需要任何重启/重载）
//   ② 非法值被忽略，落回默认（不是报错，也不是变成空语言）
//   ③ 清空覆盖 ⇒ 回默认
//   ④ ★负控：环境变量存在时，覆盖值**不许**盖过它（运维 > 文件）
//   ⑤ 显式参数 > 一切（"这一次调用要什么"）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocale, setLocaleOverride, getLocaleOverride } from '../engine/modules/i18n.mjs';
import { hitsLine } from '../engine/modules/hits.mjs';

const NOW = 1792500000000;
const DAY = 86400000;
const LIST = [
  { id: 'A1', key: '愿景', text: 'k-vision', verdict: 'hint', at: NOW - 5 * DAY, disposedAt: NOW - DAY, direction: true },
  { id: 'A2', key: '规则', text: 'k-rule', verdict: 'hint', at: NOW - 5 * DAY }
];

/** 每个用例自己收拾现场：环境变量与覆盖都清空，避免互相污染。 */
function clean() {
  delete process.env.MPM_LOCALE;
  delete process.env.DSH_MPM_LOCALE;
  setLocaleOverride('');
}

test('① 覆盖立即生效：不需要重启就能改变渲染', () => {
  clean();
  assert.equal(resolveLocale(), 'zh', '前置：默认是 zh');
  assert.ok(hitsLine({ hits: LIST }, 3).includes('命中回流'), '前置：zh 渲染');
  setLocaleOverride('en');
  assert.equal(getLocaleOverride(), 'en');
  assert.equal(resolveLocale(), 'en');
  const en = hitsLine({ hits: LIST }, 3);
  assert.ok(en.includes('Hit feedback loop'), '覆盖为 en 后必须立刻输出英文：' + en.slice(0, 80));
  assert.ok(!en.includes('命中回流'), '不允许中英混排');
  clean();
});

test('② 非法值被忽略：落回默认，而不是报错或变成空语言', () => {
  clean();
  setLocaleOverride('klingon');
  assert.equal(getLocaleOverride(), 'klingon', '覆盖值原样保存（未归一化）');
  assert.equal(resolveLocale(), 'zh', '不认识的语言必须落回默认');
  clean();
});

test('③ 清空覆盖 ⇒ 回默认', () => {
  clean();
  setLocaleOverride('en');
  assert.equal(resolveLocale(), 'en');
  setLocaleOverride('');
  assert.equal(resolveLocale(), 'zh');
  setLocaleOverride(null);
  assert.equal(resolveLocale(), 'zh');
  clean();
});

test('④ ★负控：环境变量存在时，覆盖值不许盖过它（运维 > 文件）', () => {
  clean();
  process.env.MPM_LOCALE = 'zh';
  setLocaleOverride('en');
  assert.equal(resolveLocale(), 'zh', '环境变量代表运维决定，文件不许悄悄改写它');
  clean();
  process.env.MPM_LOCALE = 'en';
  setLocaleOverride('zh');
  assert.equal(resolveLocale(), 'en', '反向也必须成立（否则是"文件优先"而非"环境优先"）');
  clean();
});

test('⑤ 显式参数 > 环境变量 > 覆盖：这一次调用说了算', () => {
  clean();
  setLocaleOverride('en');
  process.env.MPM_LOCALE = 'en';
  assert.equal(resolveLocale('zh'), 'zh', '显式参数必须胜出');
  assert.ok(hitsLine({ hits: LIST }, 3, 'zh').includes('命中回流'), '显式 zh 时渲染必须仍是中文');
  clean();
});

// ── 接线判据（static）────────────────────────────────────────────
// ★为什么是静态检查而不是运行它：`<root>/.mpm/locale` 的读取发生在引擎 restore 内部，
//   需要宿主注入 fsSvc 才能执行 —— 在测试里重建那套注入比被测代码还长。
//   而"能算出 ≠ 会被调用"是这个仓库反复踩的坑（P514/P517/P519 同族），
//   所以至少把"调用点存在 + 读失败不会拦住加载"钉住；真实生效由下一次重启人工验一次。
const fs = await import('node:fs');
const path = await import('node:path');
const STATE_SRC = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'engine', 'modules', 'state.mjs'), 'utf8');

test('⑥ ★接线：state.mjs 必须在确定沉积根之后读取 .mpm/locale 并调用 setLocaleOverride', () => {
  assert.ok(STATE_SRC.includes("from './i18n.mjs'"), 'state.mjs 必须 import i18n（否则覆盖永远设不上）');
  assert.ok(STATE_SRC.includes('setLocaleOverride('), 'state.mjs 必须真的调用 setLocaleOverride');
  assert.ok(STATE_SRC.includes('/.mpm/locale'), '必须读的是 .mpm/locale 这个路径');
});

test('⑦ ★负控：读 locale 文件必须在 try/catch 里（缺文件不许拦住加载）', () => {
  // ★第一版这条判据红在自己身上：它用 indexOf('/.mpm/locale') 定位，
  //   而第一处出现在**文件顶部的注释**里（"读 <root>/.mpm/locale"），
  //   于是它检查了注释周围有没有 try/catch —— 锚点选错，判据就测了一段注释。
  //   ⇒ 改成锚在**真正的调用点** `setLocaleOverride(String(txt)` 上。
  const i = STATE_SRC.indexOf('setLocaleOverride(String(txt)');
  assert.ok(i > 0, '找不到调用点 ⇒ ⑥ 应该已经红了（或调用被改写，本判据需同步）');
  const around = STATE_SRC.slice(Math.max(0, i - 700), i + 400);
  assert.ok(/try\s*\{/.test(around), '读取必须包在 try 里：没有 locale 文件是正常情形，不许抛');
  assert.ok(/catch\s*\(/.test(around), '必须有 catch：否则缺文件会让整个 restore 失败');
  // 而且 catch 里不许把错误升级成失败返回（保持"可选配置"的语义）
  assert.ok(!/catch[^}]{0,200}return\s*\{[^}]*ok:\s*false/.test(around),
    '缺 locale 文件不是失败，catch 里不许返回 ok:false');
});

