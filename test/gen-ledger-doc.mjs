// P559 · 从账本生成 docs/ledger.md —— 编号索引
// ★ 为什么不手写：469 条沉积手写必然过期；而生成器【永远与账本同步】。
//   （与 P507-M425 同一个理由：手写清单会漏，发现出来的不会。）
//
// ★ P582：输出路径可参数化 —— 而这不是为了灵活，是为了让【新鲜度判据】能存在。
//   检查新鲜度的判据必须生成到别处再比对；如果它顺手重写检查对象，
//   那它检查的就是"它自己刚写的东西"，永远绿。**那是一个恒绿陷阱。**
//   用法：node test/gen-ledger-doc.mjs [输出路径]
//         MPM_LEDGER=<path> 覆盖账本路径
import fs from 'node:fs';

const LEDGER = process.env.MPM_LEDGER
  || 'C:/Users/Administrator/Desktop/daima/XIN/.mpm/flywheel.json';
const OUT = process.argv[2]
  || 'C:/Users/Administrator/Desktop/daima/XIN/metaflywheel/docs/ledger.md';

const st = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const seds = (st.sediments || []).filter(s => s && s.id);

// 按题号分组（P001、P002…），每组内按 M 编号
const byProblem = new Map();
for (const s of seds) {
  const pid = String(s.problemId || String(s.id).split('-')[0]);
  if (!byProblem.has(pid)) byProblem.set(pid, []);
  byProblem.get(pid).push(s);
}
const problems = Array.from(byProblem.keys()).sort((a, b) => {
  return (parseInt(String(a).replace(/\D/g, ''), 10) || 0) - (parseInt(String(b).replace(/\D/g, ''), 10) || 0);
});

const lines = [];
lines.push('# 编号索引（自动生成）');
lines.push('');
lines.push('> **本文件由 `test/gen-ledger-doc.mjs` 从账本生成，请勿手改。**');
lines.push('>');
lines.push('> 这个项目用 `P<题号>-M<沉积号>` 编号来指向"某一次具体的修复或发现"。');
lines.push('> **如果你只是想知道这个仓库是干什么的，你不需要看这里任何一个编号。**');
lines.push('> 这个文件只回答一个问题：**某条编号背后，当时到底发生了什么。**');
lines.push('');
lines.push('统计：**' + seds.length + ' 条沉积 · ' + problems.length + ' 道题**');
lines.push('');
lines.push('---');
lines.push('');

for (const pid of problems) {
  const list = byProblem.get(pid);
  lines.push('## ' + pid + '（' + list.length + ' 条）');
  lines.push('');
  for (const s of list) {
    const cites = s.cites ? ' · 被引用 ' + s.cites + ' 次' : '';
    lines.push('- **' + s.id + '** — ' + String(s.title || '(无标题)') + cites);
  }
  lines.push('');
}

lines.push('---');
lines.push('');
lines.push('## 这些编号是怎么来的');
lines.push('');
lines.push('每一条都是**一次真实的缺陷或发现**，而不是"设计文档的编号"。');
lines.push('写它们的规则是：**一个编号只在它对应的那件事真的发生过之后才存在**。');
lines.push('');
lines.push('所以你会看到一些编号写着很具体的、看上去像事故的东西——');
lines.push('比如某个字段读错了、某个路径拼错了、某条判据永远为真。');
lines.push('那不是失误的展览，那是**判据的来源**：没有任何一条判据是为了让测试变多而写的。');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log('已生成 ' + OUT);
console.log('  ' + seds.length + ' 条沉积 · ' + problems.length + ' 道题 · ' + lines.length + ' 行');
console.log('  前 5 行：');
for (const l of lines.slice(0, 5)) console.log('    ' + l);
