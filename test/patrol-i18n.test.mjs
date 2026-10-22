// P610 判据：巡检不许再直接写中文字面量 —— 它必须全部经过 S()（= t()）
//
// 为什么是静态判据：`makePatrol(p)` 需要宿主注入 snapshot/persist/fsSvc 才能跑一轮，
// 在测试里重建那套注入比被测代码还长。而这一轮要守的东西恰好是**文本来源**：
// 每一处 signals.push / proposals.push / lastReport 都必须走 S(...)。
// ⇒ 静态检查在这里不是妥协，它就是正确的工具：我守的是"字面量不许出现"，不是"渲染结果"。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'engine', 'modules', 'patrol.mjs'), 'utf8');
const CJK = /[\u3040-\u30ff\u4e00-\u9fff\uff00-\uffef]/;

/** 取每个 push( ... ); 的参数文本 */
function pushArgs(src) {
  const out = [];
  const re = /(signals|proposals)\.push\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let i = re.lastIndex;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth === 0) break;
      i++;
    }
    out.push({ kind: m[1], arg: src.slice(re.lastIndex, i) });
  }
  return out;
}

test('① 巡检的每一条信号都必须是 S(...)：不许再出现中文字面量', () => {
  const calls = pushArgs(SRC);
  assert.ok(calls.length >= 12, '只找到 ' + calls.length + ' 处 push，抽取可能坏了');
  const bad = calls.filter(function (c) { return CJK.test(c.arg); });
  assert.deepEqual(bad, [], '这些 push 里还写着中文（必须改成 S(...)）：\n      '
    + bad.map(function (b) { return b.kind + '.push(' + b.arg.trim().slice(0, 60) + ')'; }).join('\n      '));
});

test('② 报告行也必须走 S(...)：lastReport 那一句不许残留中文字面量', () => {
  const i = SRC.indexOf('state.patrol.lastReport =');
  assert.ok(i > 0, '找不到 lastReport 赋值点');
  const chunk = SRC.slice(i, i + 500);
  const stmt = chunk.slice(0, chunk.indexOf('});') + 3);
  assert.equal(CJK.test(stmt), false, 'lastReport 里还有中文：' + stmt.slice(0, 200));
});

test('③ 负控：检查器本身必须能红 —— 一段带中文的 push 必须被判出来', () => {
  const fake = "signals.push('代谢停滞 ' + x + '）');";
  const fakeSrc = 'function f(){ ' + fake + ' }';
  const calls = pushArgs(fakeSrc);
  assert.equal(calls.length, 1, '抽取器对最小样例失效了');
  assert.equal(CJK.test(calls[0].arg), true, '★ 检查器抓不到带中文的 push ⇒ ①②的绿是假的');
});

test('④ 巡检用到的键必须在两种语言里都存在（zh/en 键集合一致由 i18n 判据守，这里守前缀）', async () => {
  const { TOOL_EN } = await import('../engine/modules/i18n.mjs');
  const keys = Object.keys(TOOL_EN);
  assert.ok(keys.length > 0, 'i18n 导入失败');
  // 巡检源码里出现的 S('patrol.xxx' 必须都被 i18n 双表覆盖（缺键会渲染成 ⟨key⟩）
  const used = Array.from(new Set((SRC.match(/S\('(patrol\.[a-zA-Z.]+)'/g) || [])
    .map(function (s) { return s.slice(3, -1); })));
  assert.ok(used.length >= 15, '巡检里只找到 ' + used.length + ' 个键，抽取可能坏了');
  const { t, allKeys } = await import('../engine/modules/i18n.mjs');
  const missing = used.filter(function (k) { return !allKeys().includes(k); });
  assert.deepEqual(missing, [], '这些巡检键不在文案表里（会渲染成 ⟨key⟩）：' + missing.join(', '));
  for (const k of used) assert.notEqual(t(k, null, 'en'), '⟨' + k + '⟩', 'en 下缺键：' + k);
});
