// 宿主包 @deepseek-ai/dsh-tools 的测试替身：
// 引擎只用 defineTool(def) 打包工具定义，测试中透传即可（形状见 engine/host.js mkTool）。
export function defineTool(def) { return def; }
export default { defineTool };
