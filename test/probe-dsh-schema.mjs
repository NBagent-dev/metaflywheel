// 实验：issue #1 建议的修法，defineTool 到底接不接受？
//
// 争议点：
//   issue 说「把 parameters 改成标准 JSON Schema：{type:'object', properties, required:[]}，
//              并去掉属性内的 required: true」
//   而 DSH 的 schema.js 说：「属性内 required 必须是 true（must be true when present）」，
//              并且 defineTool 会用 parameterSchemaSpecToJsonSchema 把它【提升到根级】。
//
// 所以问题是：issue 的修法会不会让 defineTool 直接抛错？
// 这个脚本用【真实的 dsh-tools】跑三种写法，看哪种能活着输出标准 schema。

const TOOLS = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js';

let mod;
try {
  mod = await import('file:///' + TOOLS.replace(/\\/g, '/'));
} catch (e) {
  console.log('★ 无法加载 dsh-tools：' + e.message);
  process.exit(0);
}

const defineTool = mod.defineTool;
if (typeof defineTool !== 'function') {
  console.log('★ 导出里没有 defineTool。可用导出：' + Object.keys(mod).join(', '));
  process.exit(0);
}

const base = (parameters) => ({
  name: 'x',
  description: 'probe',
  parameters,
  output: {
    schema: { type: 'object', additionalProperties: true },
    render: () => [{ type: 'text', text: '' }],
  },
  execute: async () => ({ ok: true }),
});

function probe(label, parameters) {
  console.log('=== ' + label + ' ===');
  try {
    const t = defineTool(base(parameters));
    console.log('  ✓ 接受');
    console.log('  产出的 parameters = ' + JSON.stringify(t.parameters));
    const p = t.parameters;
    const ok =
      p && p.type === 'object' &&
      p.properties && typeof p.properties === 'object' &&
      !Object.values(p.properties).some(v => v && 'required' in v);
    console.log('  ' + (ok ? '✓ 输出是标准 JSON Schema（type:object · 无属性内 required）' : '✗ 输出不符合标准'));
  } catch (e) {
    console.log('  ✗ 被拒绝：' + e.message);
  }
  console.log('');
}

// ① 现在的写法（DSH spec 格式：属性内 required: true）
probe('① 现在的 mkTool 写法（属性内 required: true）', {
  title: { type: 'string', description: '标题', required: true },
  observation: { type: 'string', description: '观察', required: true },
});

// ② issue 建议的写法（标准 JSON Schema：根级 required 数组 · 属性内无 required）
probe('② issue 建议的写法（根级 required 数组）', {
  type: 'object',
  properties: {
    title: { type: 'string', description: '标题' },
    observation: { type: 'string', description: '观察' },
  },
  required: ['title', 'observation'],
});

// ③ 扁平的属性字典（issue 说现在发出去的样子）
probe('③ 扁平属性字典（无外层包装 —— issue 认为现在是这样）', {
  title: { type: 'string', description: '标题' },
  observation: { type: 'string', description: '观察' },
});
