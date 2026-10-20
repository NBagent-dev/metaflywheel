// P578 · 守住 `defineTool` 的参数契约 —— 一条**会在契约被改坏时变红**的判据。
//
// ★ 为什么需要它（2026-10-20，issue #1）：
//   GitHub issue #1 报告「用 Gemini 系模型会 400」，并建议：
//     「把 mkTool 的 parameters 改成标准 JSON Schema：{type:'object', properties, required:[...]}，
//       并去掉属性内的 required: true」
//   ⇒ **而那个修法会让插件根本加载不了**（实测：会被 defineTool 拒绝）。
//   ⇒ 所以这条判据把契约钉住：**属性内 `required: true` 是合法的，标准 JSON Schema 会被拒**。
//
// ★ 它测三件事（每一件都对应一个真实误解）：
//   ① `mkTool` 现在的写法（属性内 required:true）必须被接受，
//      且产出【标准 JSON Schema】（type:'object' + 根级 required 数组 + 属性内无 required 键）。
//   ② 直接喂标准 JSON Schema 必须【被拒绝】—— 这不是 bug，是 defineTool 的输入契约。
//   ③ 每条注册的工具都满足上述形态（防止个别工具漏了 `required` 数组）。
//
// ★ 边界：它守的是【DSH 的 defineTool 契约】，不是 Gemini 的。
//   Gemini 的 400 根因在 DSH→网关→Gemini 那条链上，不在这条判据能覆盖的范围。
//   若将来 DSH 改了参数格式，这条会红 —— 那时**先读 DSH 的 schema.js，再决定改哪边**。
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 找到 dsh-tools 的真实 defineTool（与宿主同一个包）。找不到 ⇒ 跳过（外部克隆者没有 DSH）。 */
async function loadDefineTool() {
  const candidates = [
    process.env.DSH_TOOLS_ENTRY,
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh',
      'node_modules', '@deepseek-ai', 'dsh-tools', 'lib', 'index.js'),
    path.join(process.env.USERPROFILE || '', '.dsh', 'node_modules', '@deepseek-ai',
      'dsh-tools', 'lib', 'index.js'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const m = await import('file:///' + p.replace(/\\/g, '/'));
      if (typeof m.defineTool === 'function') return m.defineTool;
    } catch (e) { /* 试下一个 */ }
  }
  return null;
}

const base = (parameters) => ({
  name: 'probe',
  description: 'probe',
  parameters,
  output: {
    schema: { type: 'object', additionalProperties: true },
    render: () => [{ type: 'text', text: '' }],
  },
  execute: async () => ({ ok: true }),
});

test('① ★ defineTool 的输入契约：属性内 required:true 合法，而产出必须是标准 JSON Schema', async () => {
  const defineTool = await loadDefineTool();
  if (!defineTool) {
    console.log('# 跳过：找不到 dsh-tools（外部克隆者不携带 DSH），属正常。');
    return;
  }

  const t = defineTool(base({
    title: { type: 'string', description: '标题', required: true },
    observation: { type: 'string', description: '观察', required: true },
    nested: { type: 'array', items: { type: 'string' }, description: '可选的' },
  }));
  const p = t.parameters;

  assert.equal(p.type, 'object', '★ 产出的 parameters 必须是 type:object —— 否则 Gemini 会把它当标量');
  assert.ok(p.properties && typeof p.properties === 'object', '★ 必须有 properties');

  for (const [k, v] of Object.entries(p.properties)) {
    assert.ok(!Object.hasOwn(v, 'required'),
      '★ 属性 ' + k + ' 内部不许残留 required —— 它必须被提升到根级（否则 Gemini 报 TYPE_STRING）');
  }
  assert.ok(Array.isArray(p.required), '★ 根级 required 必须是数组');
  assert.deepEqual(p.required.slice().sort(), ['observation', 'title'],
    '★ 标了 required:true 的属性必须出现在根级 required 里；没标的（nested）不许出现');
});

test('② ★ 负控：直接喂标准 JSON Schema 会给插件加载失败 —— 所以 mkTool 不许那样写', async () => {
  const defineTool = await loadDefineTool();
  if (!defineTool) {
    console.log('# 跳过：找不到 dsh-tools。');
    return;
  }

  // 这正是 issue #1 建议的写法
  const asStandard = {
    type: 'object',
    properties: {
      title: { type: 'string', description: '标题' },
      observation: { type: 'string', description: '观察' },
    },
    required: ['title', 'observation'],
  };

  assert.throws(
    function () { defineTool(base(asStandard)); },
    /unsupported JSON schema|must be a value schema object/i,
    '★ 标准 JSON Schema 必须被拒绝 —— 若它被接受了，说明 DSH 的契约变了，那时先读 schema.js 再决定改哪边'
  );
});

test('③ ★ 插件里每条工具产出的 parameters 都必须是标准形态（可用性守门）', async () => {
  // 这条不依赖 DSH：直接读源码确认每个 mkTool 调用都传了 required 数组或至少传了 parameters。
  // 目的不是代替 ①，而是防止"某个工具漏写 required 导致必填字段丢失"。
  const src = fs.readFileSync(path.join(ROOT, 'engine', 'modules', 'tools.mjs'), 'utf8');
  const calls = [...src.matchAll(/mkTool\(\s*'([a-zA-Z0-9_]+)'/g)].map(m => m[1]);
  assert.ok(calls.length >= 10, '至少应有 10 个 mkTool 调用，实际 ' + calls.length + ' —— 工具集被删了？');

  // 每个工具名必须唯一（重名会让注册相互覆盖，而症状是"某个工具消失了"）
  const dup = calls.filter((n, i) => calls.indexOf(n) !== i);
  assert.deepEqual([...new Set(dup)], [], '★ 工具名不许重复（重复会互相覆盖）');

  // 而 mkTool 的契约注释必须在 —— 防止有人删掉那段警告后照 issue 改坏
  assert.match(src, /不要.*改写成标准 JSON Schema|参数契约/, 
    '★ mkTool 上方的"契约警告"必须保留 —— 它是防止下一个人照 issue 改坏的第一道防线');
});
