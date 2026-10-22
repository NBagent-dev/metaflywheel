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
import { resolveLocale, setLocaleOverride, getLocaleOverride, setLocaleFile } from '../engine/modules/i18n.mjs';
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

// ── 接线判据（static + 一处真跑）────────────────────────────────
// ★P606 更正：上一版这里写着"读取发生在 restore 内部，需要宿主注入 fsSvc 才能执行"——
//   而那正是**错的设计**：读在启动时 ⇒ 写文件仍要重启。现在 i18n 每次现读，
//   于是"不重启就生效"可以直接**真跑**，不必再靠静态检查替它作证。
const fs = await import('node:fs');
const path = await import('node:path');
const os = await import('node:os');
const STATE_SRC = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'engine', 'modules', 'state.mjs'), 'utf8');

test('⑥ ★接线：state.mjs 必须把语言文件路径交给 i18n（不是自己读一次）', () => {
  assert.ok(STATE_SRC.includes("from './i18n.mjs'"), 'state.mjs 必须 import i18n');
  assert.ok(STATE_SRC.includes('setLocaleFile('), 'state.mjs 必须调用 setLocaleFile 交出路径');
  assert.ok(STATE_SRC.includes('/.mpm/locale'), '交出去的必须是 .mpm/locale 这个路径');
  // ★负控：不许再在 restore 里"读一次内容然后覆盖"——那会让文件变成启动期设置
  assert.equal(STATE_SRC.includes('setLocaleOverride('), false,
    'restore 里不许再有 setLocaleOverride（那是 P604 的错误设计：文件变启动期设置）');
});

test('⑦ ★★不重启就生效：改文件后下一次调用必须立刻换语言（无需任何重载）', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpm-loc-'));
  const f = path.join(tmp, 'locale');
  const savedEnv = process.env.MPM_LOCALE;
  delete process.env.MPM_LOCALE;
  try {
    setLocaleOverride('');
    fs.writeFileSync(f, 'en');
    setLocaleFile(f);
    assert.equal(resolveLocale(), 'en', '写 en 后必须立刻是 en');
    assert.ok(hitsLine({ hits: LIST }, 3).includes('Hit feedback loop'), '渲染必须立刻变英文');
    fs.writeFileSync(f, 'zh');
    assert.equal(resolveLocale(), 'zh', '★同一进程内改成 zh 必须立刻回落 —— 这就是"不重启"');
    // 文件被删掉 ⇒ 回默认，不抛
    fs.unlinkSync(f);
    assert.equal(resolveLocale(), 'zh', '文件消失必须落回默认，不许抛');
  } finally {
    setLocaleFile('');
    setLocaleOverride('');
    if (savedEnv != null) process.env.MPM_LOCALE = savedEnv;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* 清理失败不影响结论 */ }
  }
});

