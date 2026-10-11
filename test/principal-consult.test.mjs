// P517② 判据：**把"源"接到动作上** —— 动手前检索"他在类似事情上说过什么"。
// 运行：node --test test/principal-consult.test.mjs
//
// 为什么这条判据最要紧（2026-10-11 的实证）：
//   `principal` 曾经**写入✓ 恢复✓ 显示✓ 但消费✗** —— 全引擎 grep 只有三处读它（显示/录入/落盘），
//   而 `activeFor()` 定义了**零调用点**。⇒ 它当时只是"记录体"，不是"约束"。
//   这条判据就是给"消费"这一环上锁。
//
// ★纪律（写死在判据里）：**永不 deny**。命中 veto 只能 ⇒ ask（请求复核）。
//   因为装置自己写下的纪律是"不许默默违反，也不许默默遵守"；
//   硬拒会把它变成僵化门（P518 风险②：单一来源 = 单点故障 + 过拟合）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { consultPrincipal, recordPrincipal } from '../engine/modules/principal.mjs';

const mk = (key, text, mode) => {
  const r = recordPrincipal([], { at: 1000, key, text, mode });
  return r.list;
};

test('①命中 veto ⇒ ask（请求复核）——这是"不默默违反"的一侧', () => {
  const list = mk('模型边界', '我们并不修改模型', 'veto');
  const c = consultPrincipal(list, 'edit 文件：engine/modules/state.mjs 模型边界相关');
  assert.equal(c.verdict, 'ask', JSON.stringify(c));
  assert.match(c.why, /请先复核/);
  assert.match(c.why, /不许默默违反也不许默默遵守/);
});

test('②命中非 veto ⇒ hint（提示，不拦）', () => {
  const list = mk('项目定位', '插件要做的事，就是形成用户', 'meaning');
  const c = consultPrincipal(list, '写 README：项目定位那一节');
  assert.equal(c.verdict, 'hint');
  assert.match(c.why, /考虑进去/);
});

test('③★负控：没有条目 / 没命中 / 空 subject ⇒ verdict 必须为 null（绝不拦）', () => {
  assert.equal(consultPrincipal([], '任何动作').verdict, null);
  assert.equal(consultPrincipal(null, '任何动作').verdict, null);
  assert.equal(consultPrincipal(mk('模型边界', '不要改模型', 'veto'), 'pwsh：列目录').verdict, null, '不相关动作不许被拦');
  assert.equal(consultPrincipal(mk('模型边界', '不要改模型', 'veto'), '').verdict, null);
});

test('④被覆盖的条目不参与判决（他会改主意，装置跟着变）', () => {
  let l = recordPrincipal([], { at: 1000, key: '模型边界', text: '不要改模型', mode: 'veto' }).list;
  l = recordPrincipal(l, { at: 2000, key: '模型边界', text: '可以改绑定层，但不动权重', mode: 'boundary' }).list;
  const c = consultPrincipal(l, '模型边界相关改动');
  assert.equal(c.verdict, 'hint', '旧 veto 已被覆盖 ⇒ 不该再报"请求复核"：' + JSON.stringify(c));
});

test('⑤★纪律判据：源码里 consult 的结果**不得**出现 deny', () => {
  const HOST = fs.readFileSync(new URL('../engine/host.js', import.meta.url), 'utf8');
  const i = HOST.indexOf('consultPrincipal(state.principal');
  assert.ok(i > 0, 'host.js 没有调用 consultPrincipal ⇒ 源仍然只写不读（消费✗）');
  // ★锚点从"魔法数字 700"改成**按结构定位**（P487-M405：负控的锚点会随实现漂移）。
  //   事故：`hit` 与回流记录加进这一段后，代码长度超过 700 字符 ⇒ 窗口里看不到 `catch` ⇒ **假警**。
  //   现在从调用点一直切到包含它的 `} catch (` 为止 —— 实现变长不会让它失明。
  const end = HOST.indexOf('} catch (', i);
  const block = HOST.slice(i, end > i ? end + 40 : HOST.length);
  assert.ok(!/kind:\s*'deny'/.test(block), 'principal 的判决里出现了 deny：它只能 ask/hint —— 硬拒会变成僵化门');
  assert.match(block, /kind:\s*'ask'/, 'veto 必须落到 ask（请求复核）');
});

test('⑥接线：host.js 必须 import 它，且失败时 fail-open（不许拖垮宿主）', () => {
  const HOST = fs.readFileSync(new URL('../engine/host.js', import.meta.url), 'utf8');
  assert.match(HOST, /import\s*\{[^}]*consultPrincipal[^}]*\}\s*from\s*['"]\.\/modules\/principal\.mjs['"]/);
  const i = HOST.indexOf('consultPrincipal(state.principal');
  const end = HOST.indexOf('} catch (', i);            // ★按结构定位，不用魔法数字（见上）
  const block = HOST.slice(i, end > i ? end + 40 : HOST.length);
  assert.match(block, /catch\s*\(/, '这一层必须自带 try/catch（全局钩子坏掉会拖垮整个宿主）');
});
