# issue #1 回复草稿

> 用法：直接复制下面 `---` 之间的全部内容，粘到 https://github.com/NBagent-dev/metaflywheel/issues/1 的回复框。
> 粘贴前请确认一件事：**我没有实测过 Gemini 网关**，所以草稿里把"证据指向"和"已证实"分开了——请不要把那些句子改成"已确认"。

---

谢谢你这份报告，它把错误定位到了正确的层次（工具 schema），而且你给出的两条 Gemini 报错解读——`required` 的位置、`parameters` 缺外层包装——**都是对的**。我按你的思路做了三个实验，结论有一半需要修正，而修正的方向恰好决定了该改哪里。

## 一、三个实验（可复跑）

我用 DSH 真实的 `defineTool`（`@deepseek-ai/dsh-tools`）喂了三种 schema：

```js
// 实验脚本已加入仓库：test/tool-schema.test.mjs
import { defineTool } from '@deepseek-ai/dsh-tools';

const base = (parameters) => ({
  name: 'probe', description: 'probe', parameters,
  output: { schema: { type: 'object' }, render: () => [{ type: 'text', text: '' }] },
  execute: async () => ({ ok: true }),
});
```

| # | 输入 | 结果 |
| --- | --- | --- |
| ① | 本插件现在的写法 —— 属性内 `required: true` | **✓ 接受**，产出 `{"type":"object","properties":{...},"required":["title","observation"]}` |
| ② | 你建议的写法 —— 直接给标准 JSON Schema `{type:'object', properties, required:[...]}` | **✗ 拒绝**：`unsupported JSON schema: parameters.type must be a value schema object` |
| ③ | 扁平属性字典（无外层包装） | ✓ 接受，但 `required` 丢失 |

## 二、所以有两处需要修正

### 1. `mkTool` 现在的写法，产出的 schema 已经是标准的

DSH 的 `defineTool` 内部会调用 `parameterSchemaSpecToJsonSchema`（在 `@deepseek-ai/dsh-tools` 的 `types/schema` 模块里），它做两件事：

```js
export function parameterSchemaSpecToJsonSchema(spec) {
  const compiled = compilePropertyMap(spec, 'parameters');
  return {
    type: 'object',                                    // ← 补 type
    properties: compiled.properties,
    ...(compiled.required === undefined ? {} : { required: compiled.required }),  // ← 提升 required
  };
}
```

**⇒ 属性内的 `required: true` 是 DSH spec 的**正确**写法（`schema.js` 甚至要求它必须是 `true`：`required must be true when present`），而它会被提升成根级数组。**

**⇒ 所以"参数被压平、required 留在属性里"这个现象，不是 `mkTool` 造成的。**

### 2. 你建议的修法会让插件加载失败

见实验 ②。如果照那个改，`defineTool` 会在注册期就抛错——**插件不是"报 400"，而是根本起不来**。

（我已经在 `engine/modules/tools.mjs` 的 `mkTool` 上方加了警告注释，并加了一条判据钉住这个契约，防止以后有人这么改。）

## 三、那 400 是从哪来的？—— 一个反向证据

你贴的报错里有一句关键：

```
'...parameters.properties[0].value.required' (TYPE_STRING), true
```

**`required: true` 出现在【属性内部】。而 `defineTool` 的输出不会这样**（实验 ① 已证实它会被提到根级）。

**⇒ 所以真正发到 Gemini 的那份 schema，不是本插件的产物。**

再看反向路径：DSH 的 `dsh-llm-pi-ai` 里有个 `toolsOf()`，它把参数原样透传给下游：

```js
function toolsOf(options) {
  return options.tools?.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,     // ← 原样交给 pi-ai
  }));
}
```

**⇒ 而"`parameters` 被当成标量"（`Starting an object on a scalar field`）正是"对象被塞进 Gemini `Schema` message 的标量字段"的体征**——Gemini 的 `Schema` 里恰好有一个标量字段叫 `title`，而 `mpm_generate` 正好有一个参数也叫 `title`。

**所以问题更可能在这一段：**

```
插件（标准 schema） → DSH 的 toolsOf（原样） → pi-ai 网关 → Gemini functionDeclarations
                                                        ↑
                                              转折在这里出事
```

## 四、我做了什么（插件侧，不涉及契约）

- **README 新增「已知问题」一节**，写明症状、三条证据、临时绕过（换 DeepSeek / OpenAI 兼容模型），以及"这个问题不在本插件"。
- **新增 `test/tool-schema.test.mjs`**（3 条判据）：把 `defineTool` 的输入契约钉住——属性内 `required: true` 合法、标准 JSON Schema 必须被拒、产出必须是标准形态。
- **`mkTool` 上方加契约警告注释**，带上两条实测错误串。

## 五、诚实的边界

**我没有实测过 Gemini 网关。** 所以上面第五节的两处结论强度不同：

- 「`mkTool` 产出的 schema 已是标准的」——**这是实测的**（`npm test` 里有判据守着）；
- 「根因在 pi-ai / 网关」——**这只是证据指向，不是已证实**。我读到了 `toolsOf()` 的透传，但没读到 `pi-ai` 内部怎么把它转成 `functionDeclarations`（那部分可能在别处）。

## 六、需要你帮一件事

如果这个插件在你那里用 **DeepSeek 或 OpenAI 兼容模型**能正常跑（那说明插件侧没问题），而只有 **Gemini** 报 400——请在下面回一句：

1. 你用的宿主版本（`dsh --version`）；
2. 网关是哪种（官方 Gemini API / 自建中转 / pi-ai 内置）；
3. 换 DeepSeek 是否正常。

**这三条能把"证据指向 pi-ai"变成"已定位"。** 而如果换 DeepSeek 也报错，那我的分析就错了，我们从另一个方向重查——那种情况下最有价值的信息是你的完整请求体。

再次感谢——你抓到的两条报错解读是准确的，只是它们指向的层比插件更深一层。

---
