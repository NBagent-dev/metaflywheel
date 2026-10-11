// P482⑧ 行动前检索（pre-action recall）判据：**动手前/动手后，让过去出现在眼前**。
// 运行：node --test test/preaction.test.mjs
//
// 用户的设计判断：**回合开始时我知道什么 ≠ 我动手那一刻我知道什么。**
// 今晚所有事故都落在这条缝里：写测试桩用错契约（P488）、改渲染层没有判据（当场炸）、
// edit 连撞守卫 8 次（引擎事后才报）、6 条判据全是我手写（因为这条路不存在）。
//
// ★宿主契约（先读契约再写实现，P488 的教训）：
//   'tools/pre-execute'(exec, next) → PreToolDecision = allow | deny{reason} | cancel | ask{reason}
//        ⇒ **allow 不能携带内容** ⇒ 这里只能做「拦」（档2 ask / 档3 deny）
//   'tools/post-execute'(exec, result, next) → PostToolDecision = accept{content?, additionalContexts?} | …
//        ⇒ 注入在这里（档1：把教训挂到结果上 / 带进下一轮上下文）
//
// ★三档（规则表驱动，而不是模糊检索——先让它**确定**，模糊检索留到有证据时再加）：
//   档1 hint：不拦，只提示（"你上次在这个位置翻过车：…"）
//   档2 ask ：高风险动作要求确认
//   档3 deny：明确可判定的失效模式直接拒绝
//
// ★安全边界（全局钩子，一个 bug 会让整个宿主不可用）：
//   ① **fail-open**：钩子内部任何异常 ⇒ 一律 allow 并计数（绝不因为我的钩子坏掉而卡住工具）；
//   ② **kill switch**：`preAction.off === true` ⇒ 立即完全停用；
//   ③ 坏规则表 ⇒ 当成空表（不是当成拒绝）；
//   ④ 档3 只认**显式写在规则里**的 deny，不做自动推断。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, hintFor, normalizeRules } from '../engine/modules/preaction.mjs';

const RULES = normalizeRules([
  { tool: 'edit', contains: 'selfsnap.mjs', action: 'hint', text: '改渲染层后：提交前直接渲染一次（今晚炸过两次）' },
  { tool: 'pwsh', contains: 'git commit', action: 'ask', text: '提交前先跑全套：测试退出码非 0 不许提交' },
  { tool: 'pwsh', contains: 'rm -rf', action: 'deny', text: '禁止递归删除' }
]);

test('档1 hint：命中不拦，只给提示（allow + hint）', () => {
  const d = decide(RULES, { tool: 'edit', args: { file_path: 'C:/x/selfsnap.mjs' } });
  assert.equal(d.kind, 'allow');
  assert.match(d.hint, /提交前直接渲染一次/);
});

test('档2 ask：高风险动作要求确认', () => {
  const d = decide(RULES, { tool: 'pwsh', args: { command: 'git commit -m x' } });
  assert.equal(d.kind, 'ask');
  assert.match(d.reason, /测试退出码非 0/);
});

test('档3 deny：明确失效模式直接拒绝', () => {
  const d = decide(RULES, { tool: 'pwsh', args: { command: 'rm -rf /tmp/x' } });
  assert.equal(d.kind, 'deny');
  assert.match(d.reason, /递归删除/);
});

test('优先级：deny > ask > hint（同一调用命中多条时取最强者）', () => {
  const multi = normalizeRules([
    { tool: 'pwsh', contains: 'git', action: 'hint', text: 'h' },
    { tool: 'pwsh', contains: 'git', action: 'ask', text: 'a' },
    { tool: 'pwsh', contains: 'git', action: 'deny', text: 'd' }
  ]);
  assert.equal(decide(multi, { tool: 'pwsh', args: { command: 'git status' } }).kind, 'deny');
});

test('未命中 ⇒ allow 且无 hint（与引入前逐字一致）', () => {
  const d = decide(RULES, { tool: 'read', args: { file_path: 'C:/x/y.md' } });
  assert.equal(d.kind, 'allow');
  assert.equal(d.hint, undefined);
  assert.equal(hintFor(RULES, { tool: 'read', args: {} }), null);
});

test('kill switch：off ⇒ 立即完全停用（不回 hint、不 ask、不 deny）', () => {
  const d = decide(RULES, { tool: 'pwsh', args: { command: 'rm -rf /' } }, { off: true });
  assert.equal(d.kind, 'allow');
  assert.equal(d.hint, undefined);
});

test('fail-open：钩子异常一律 allow（绝不因为我的钩子坏掉而卡住工具）', () => {
  const boom = { get length() { throw new Error('bad rules'); } };   // 伪装成规则表的炸弹
  const d = decide(boom, { tool: 'pwsh', args: { command: 'rm -rf /' } });
  assert.equal(d.kind, 'allow', '坏规则表 ⇒ 当成空表，而不是当成拒绝');
});

test('normalizeRules·坏输入不炸：非数组/缺字段/未知 action 都被丢掉', () => {
  assert.deepEqual(normalizeRules(null), []);
  assert.deepEqual(normalizeRules('nope'), []);
  const r = normalizeRules([
    { tool: 'edit', action: 'hint', text: 'ok' },          // 无 contains ⇒ contains='' 匹配一切？→ 见下
    { action: 'hint', text: 'no tool' },
    { tool: 'edit', action: 'wat', text: 'x' },
    { tool: 'edit', action: 'deny', text: '' }
  ]);
  assert.ok(r.length <= 2, '缺 tool / 未知 action / 空 text 一律丢弃：' + JSON.stringify(r));
  assert.ok(r.every((x) => x.tool && x.text && ['hint', 'ask', 'deny'].includes(x.action)));
});
