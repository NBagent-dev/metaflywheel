// 接线判据：**模块解构了一个依赖，宿主就必须传给它。**
// 运行：node --test test/wiring.test.mjs
//
// 动机（2026-10-11 实机事故）：`patrol.mjs` 解构 `perception`，而 `host.js` 的
// `makePatrol({…})` 没传 ⇒ `p.perception === undefined` ⇒ **`user:reply` 形式的承诺永远
// 落入 unknown、永不唤醒**——不报错、不降级、不留痕。
// 代价：我用"巡检跑在用户消息到达之前（时机未到）"解释了**三次**，而真因是**接线漏了一个依赖**。
// ⇒ 教训：**"没反应"的第一嫌疑应当是被解构却没被传入的参数**（undefined 是静默的），
//    而不是时序。这条判据把这个嫌疑变成机械检查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const PATROL = fs.readFileSync(new URL('../engine/modules/patrol.mjs', import.meta.url), 'utf8');
const HOST = fs.readFileSync(new URL('../engine/host.js', import.meta.url), 'utf8');

/** patrol 从 p 里解构出来的键。 */
function destructured(src) {
  const m = /export function makePatrol\(p\)\s*\{\s*const \{([^}]*)\} = p;/.exec(src);
  assert.ok(m, '找不到 makePatrol 的解构行——判据锚点失效（实现改了，判据没跟上）');
  return m[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

/** 宿主调用 makePatrol({…}) 时传入的键（同时认 `k: v` 与简写 `k,`）。 */
function passed(src) {
  const i = src.indexOf('makePatrol({');
  assert.ok(i > 0, '找不到 makePatrol 的调用——判据锚点失效');
  const block = src.slice(i, src.indexOf('});', i));
  const out = new Set();
  let m;
  const re1 = /(\w+)\s*:/g;
  while ((m = re1.exec(block)) !== null) out.add(m[1]);
  const re2 = /[,{]\s*(\w+)\s*(?=[,}])/g;
  while ((m = re2.exec(block)) !== null) out.add(m[1]);
  return out;
}

test('makePatrol：被解构的依赖必须被传入（漏一个 ⇒ 静默 undefined ⇒ 功能永不生效）', () => {
  const need = destructured(PATROL);
  const have = passed(HOST);
  assert.ok(need.length >= 8, '解构解析失败：' + JSON.stringify(need));
  const missing = need.filter(function (k) { return !have.has(k); });
  assert.deepEqual(missing, [], '这些依赖被 patrol 解构，但宿主没传（它们会是 undefined）：' + missing.join('、')
    + '\n解构：' + need.join('、') + '\n传入：' + Array.from(have).join('、'));
});

test('判据自证：把 perception 从宿主调用里删掉 ⇒ 本判据必须变红（故障注入）', () => {
  assert.ok(HOST.indexOf('perception: perception') >= 0, '找不到 perception 传参——注入锚点失效');
  const mutated = HOST.replace('perception: perception,', '').replace('perception: perception', '');
  const missing = destructured(PATROL).filter(function (k) { return !passed(mutated).has(k); });
  assert.deepEqual(missing, ['perception'], '注入后必须且只报 perception：' + JSON.stringify(missing));
});
