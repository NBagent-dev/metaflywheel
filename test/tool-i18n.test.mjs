// P603② 判据：工具描述必须双语，且**加工具忘加英文必红**
//
// 为什么单独一条判据：工具描述是全球用户在"还没跑任何东西之前"唯一读到的东西。
// 而它是 21 份长文案，最容易在新增工具时被忘掉一半 —— 所以钉住"覆盖"而不是"翻译质量"。
//
// 四条：
//   ① 源码里的工具名集合 与 TOOL_EN 键集合 **必须完全相等**（多一个少一个都红）
//   ② zh 下 localizeTools 必须**原样返回**（一个字节都不动）
//   ③ en 下每条 description 都必须换掉，且**不再含中日韩字符**（否则是半翻译上线）
//   ④ 负控：表里没有的工具必须回退中文而不是崩、也不是变空 —— 运行时宽容，发布严格
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TOOL_EN, localizeTools } from '../engine/modules/i18n.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'engine', 'modules', 'tools.mjs');
const CJK = /[\u3040-\u30ff\u4e00-\u9fff\uff00-\uffef]/;

/** ★来源唯一：工具名从源码抽（`mkTool(\n  'name'`），而不是从 TOOL_EN 反推。 */
function toolNamesFromSource() {
  const txt = fs.readFileSync(SRC, 'utf8');
  const re = /mkTool\(\s*'([a-z0-9_]+)'/g;
  const out = new Set();
  let m;
  while ((m = re.exec(txt)) !== null) out.add(m[1]);
  return Array.from(out).sort();
}

const NAMES = toolNamesFromSource();

test('① 源码里的工具名 与 TOOL_EN 的键 必须完全相等（加工具忘加英文 ⇒ 红）', () => {
  assert.ok(NAMES.length >= 20, '从源码只抽到 ' + NAMES.length + ' 个工具名，抽取可能坏了');
  const keys = Object.keys(TOOL_EN).sort();
  const missing = NAMES.filter(function (n) { return keys.indexOf(n) < 0; });
  const extra = keys.filter(function (k) { return NAMES.indexOf(k) < 0; });
  assert.deepEqual(missing, [], '这些工具没有英文描述：' + missing.join(', '));
  assert.deepEqual(extra, [], 'TOOL_EN 里有源码中不存在的工具（改名后留下的僵尸条目）：' + extra.join(', '));
});

test('② zh 下必须原样返回（迁移不改行为）', () => {
  const tools = NAMES.map(function (n) { return { name: n, description: '中文原文-' + n }; });
  const zh = localizeTools(tools, 'zh');
  assert.equal(zh.length, tools.length);
  for (let i = 0; i < tools.length; i++) {
    assert.equal(zh[i].description, tools[i].description, 'zh 下不许改动 description：' + tools[i].name);
  }
  assert.equal(localizeTools(tools, undefined), tools, 'locale 缺省时必须原样返回（连数组都不该换）');
});

test('③ en 下每条都要换掉，且不再含中日韩字符', () => {
  const tools = NAMES.map(function (n) { return { name: n, description: '中文原文-' + n }; });
  const en = localizeTools(tools, 'en');
  const stillZh = [];
  for (let i = 0; i < en.length; i++) {
    const d = String(en[i].description || '');
    assert.notEqual(d, tools[i].description, 'en 下没换掉描述：' + tools[i].name);
    if (CJK.test(d)) stillZh.push(tools[i].name);
  }
  assert.deepEqual(stillZh, [], '这些工具的英文描述里还含中日韩字符（半翻译）：' + stillZh.join(', '));
  assert.equal(localizeTools(tools, 'en-US').length, tools.length, 'en-US 必须归一成 en 并生效');
});

test('④ 负控：表里没有的工具回退中文（不崩、不变空）', () => {
  const ghost = [{ name: 'mpm_not_registered_xyz', description: '中文原文' }];
  const en = localizeTools(ghost, 'en');
  assert.equal(en[0].description, '中文原文', '缺条目必须回退原文；若这条红了，说明回退路径被改成丢弃');
  // 且它确实会被判据①抓住（这就是"运行时宽容、发布严格"的分工）
  assert.ok(Object.keys(TOOL_EN).indexOf('mpm_not_registered_xyz') < 0, '幽灵工具不该在表里');
});
