// MetaFlywheel 纯工具/常量模块（P079 重构第 1 步：从 apply 闭包抽出无状态部分）
// 无上下文字段依赖，可独立测试；供 engine/host.js 与后续模块复用。
export const STAGE_NAMES = { G: '生成', F: '界定', S: '求解', C: '收敛', D: '沉积', E: '激发' };

// φ = 界定陈述的五要素关键词覆盖（0~1，结构性完整性）；
// 改写度 revision = 相邻两次界定的双字组 Jaccard 距离（0~1，回溯时"问题真的变了"的客观信号）。
export const PHI_MARKS = {
  initial: /初始|现状|当前状态|as-is/i,
  goal: /目标|期望|要达到|达成|to-be/i,
  constraint: /约束|限制|不得|不许|不能|边界|前提/i,
  operators: /算子|工具|手段|步骤|操作|途径|方法/i,
  criteria: /判据|标准|验收|完成定义|criteria|满足/i
};

export function phiOf(text) {
  const t = String(text || '');
  let hit = 0;
  for (const k in PHI_MARKS) if (PHI_MARKS[k].test(t)) hit += 1;
  return Math.round((hit / 5) * 100) / 100;
}

export function bigrams(s) {
  const set = new Set();
  const t = String(s).replace(/\s+/g, '');
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

export function revisionOf(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  return Math.round((1 - inter / (A.size + B.size - inter)) * 100) / 100;
}

export function relAgo(ts) {
  const d = Date.now() - (ts || 0);
  if (d < 45e3) return '刚刚';
  if (d < 36e5) return Math.max(1, Math.round(d / 6e4)) + '分钟前';
  if (d < 864e5) return Math.round(d / 36e5) + '小时前';
  return Math.round(d / 864e5) + '天前';
}
