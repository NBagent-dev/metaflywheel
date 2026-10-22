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

// ── ★P607 参数描述（82 个参数，每次调用都在用户眼前）──────────────
// 判据的来源是**真实的**工具数组（makeTools({})），不是从源码正则猜：
// 参数名与 schema 只有一个真相源，猜一次就会漂一次。
const { makeTools } = await import('../engine/modules/tools.mjs');
const { TOOL_PARAM_EN } = await import('../engine/modules/i18n.mjs');
const REAL = makeTools({});

/** 真实参数键：['tool.param', ...]（排序，便于读错误信息） */
function realParamKeys() {
  const keys = [];
  for (const t of REAL) {
    for (const p of Object.keys(t.parameters || {})) keys.push(t.name + '.' + p);
  }
  return keys.sort();
}

test('⑤ ★参数覆盖：每个参数都必须有英文条目（加参数忘加英文 ⇒ 红）', () => {
  const keys = realParamKeys();
  assert.ok(keys.length >= 80, '只抽到 ' + keys.length + ' 个参数，抽取可能坏了（应为 82）');
  const missing = keys.filter(function (k) { return typeof TOOL_PARAM_EN[k] !== 'string'; });
  assert.deepEqual(missing, [], '这些参数没有英文描述：' + missing.join(', '));
});

test('⑥ ★僵尸条目：表里不许有真实工具里不存在的参数键', () => {
  const keys = realParamKeys();
  const extra = Object.keys(TOOL_PARAM_EN).filter(function (k) { return keys.indexOf(k) < 0; });
  assert.deepEqual(extra, [], '参数改名/删除后留下的僵尸条目：' + extra.join(', '));
});

test('⑦ en 下所有参数描述都不含中日韩字符，且 zh 下逐字不动', () => {
  const zh = localizeTools(REAL, 'zh');
  assert.equal(zh, REAL, 'zh 下必须原样返回（连数组都不该换）');
  const en = localizeTools(REAL, 'en');
  const stillZh = [];
  let n = 0;
  for (let i = 0; i < en.length; i++) {
    const ps = en[i].parameters || {};
    for (const k of Object.keys(ps)) {
      n++;
      const d = String(ps[k].description || '');
      if (CJK.test(d)) stillZh.push(en[i].name + '.' + k);
    }
  }
  assert.equal(n, realParamKeys().length, 'en 后参数数量不许变化');
  assert.deepEqual(stillZh, [], '这些参数在 en 下仍是中文：' + stillZh.join(', '));
});

test('⑧ ★负控：换语言不许改动参数结构（type / required 一个都不许变）', () => {
  const en = localizeTools(REAL, 'en');
  for (let i = 0; i < REAL.length; i++) {
    const a = REAL[i].parameters || {};
    const b = en[i].parameters || {};
    assert.deepEqual(Object.keys(b), Object.keys(a), '参数名集合被改变了：' + REAL[i].name);
    for (const k of Object.keys(a)) {
      assert.equal(b[k].type, a[k].type, REAL[i].name + '.' + k + ' 的 type 被改了');
      assert.equal(b[k].required, a[k].required, REAL[i].name + '.' + k + ' 的 required 被改了');
    }
  }
});
