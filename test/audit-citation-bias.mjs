// P566 · 有引用 vs 零引用：标题的词频差异
// ★ 问法：如果"零引用"不是随机的，那两组的标题应该有【系统的】词频差。
//   ⇒ 而那个差会告诉我们：我的链接偏好是什么形状。
//
// ★ 设计要能拆穿它自己（三条）：
//   ① 不能只看"零引用里哪个词多"——样本量 395 vs 76，任何词都会显得多。
//      ⇒ 所以比【占比】（出现在组内的比例），并算差值。
//   ② 必须滤掉高频虚词（"的""与""及"），否则它们会占满榜首。
//   ③ 必须给【反例检查】：若两组词频几乎相同 ⇒ 零引用与内容无关 ⇒ 我该换方向。
import fs from 'node:fs';

const ROOT = 'C:/Users/Administrator/Desktop/daima/XIN';
const st = JSON.parse(fs.readFileSync(ROOT + '/.mpm/flywheel.json', 'utf8'));
const seds = (st.sediments || []).filter(s => s && s.id);

const STOP = new Set(['的', '与', '及', '和', '在', '是', '了', '一个', '一条', '以及', '不', '要', '会',
  '可', '从', '到', '对', '为', '而', '就', '也', '都', '这', '那', '么', '什么', '怎么', '如何',
  '附', '含', '即', '其', '之', '者', '把', '被', '让', '使', '并', '且', '或']);

// 中文按 2-gram 切（无分词器，而 2-gram 足够看趋势；P028-M18 用的也是这方法）
function bigrams(s) {
  const t = String(s).replace(/[A-Za-z0-9_\-\/\.]+/g, ' ').replace(/[^\u4e00-\u9fa5]+/g, '');
  const out = [];
  for (let i = 0; i + 2 <= t.length; i++) {
    const b = t.slice(i, i + 2);
    if (!STOP.has(b)) out.push(b);
  }
  return out;
}

const cited = seds.filter(s => (s.cites || 0) > 0);
const zero = seds.filter(s => (s.cites || 0) === 0);

function freqOf(group) {
  const m = new Map();
  for (const s of group) for (const b of new Set(bigrams(s.title))) m.set(b, (m.get(b) || 0) + 1);
  return m;
}
const fC = freqOf(cited), fZ = freqOf(zero);

// 占比差：该词在组内出现的百分比差
const rows = [];
for (const [b, nz] of fZ) {
  const nc = fC.get(b) || 0;
  if (nz < 8) continue;                       // 太罕见不可靠
  rows.push({ b, pz: nz / zero.length, pc: nc / cited.length, diff: (nc / cited.length) - (nz / zero.length), nz, nc });
}

console.log('═══ 样本 ═══');
console.log('  有引用（cites>0）：' + cited.length + ' 条');
console.log('  零引用           ：' + zero.length + ' 条');

console.log('');
console.log('═══ ① 零引用【更常见】的词（我的链接回避面）═══');
for (const r of rows.slice().sort((a, b) => a.diff - b.diff).slice(0, 14)) {
  console.log('  ' + r.b + '  零引用中 ' + (r.pz * 100).toFixed(0) + '%  有引用中 ' + (r.pc * 100).toFixed(0) + '%   差 ' + (r.diff * 100).toFixed(1) + ' 点');
}

console.log('');
console.log('═══ ② 有引用【更常见】的词（我的链接引力中心）═══');
for (const r of rows.slice().sort((a, b) => b.diff - a.diff).slice(0, 14)) {
  console.log('  ' + r.b + '  有引用中 ' + (r.pc * 100).toFixed(0) + '%  零引用中 ' + (r.pz * 100).toFixed(0) + '%   差 +' + (r.diff * 100).toFixed(1) + ' 点');
}

console.log('');
console.log('═══ ③ ★ 反例检查：两组的词频差是不是【真的】有意义？ ═══');
const big = rows.filter(r => Math.abs(r.diff) >= 0.15);
console.log('  差值 ≥15 个百分点的词：' + big.length + ' / ' + rows.length + ' 个被检验的词');
if (big.length === 0) {
  console.log('  ⇒ ★★ 两组词频几乎相同 ⇒ **零引用与标题内容无关** ⇒ 该换方向（去查机制，不是查内容）');
} else {
  console.log('  ⇒ 存在系统性词汇差异，共 ' + big.length + ' 个词');
}

console.log('');
console.log('═══ ④ 被链到最多的 8 条沉积（引力中心实体）═══');
for (const s of seds.slice().sort((a, b) => (b.cites || 0) - (a.cites || 0)).slice(0, 8)) {
  console.log('  ' + String(s.cites).padStart(2) + ' 次  ' + s.id + '  ' + String(s.title).slice(0, 60));
}

console.log('');
console.log('═══ ⑤ 那 8 条 vs 零引用的随机 8 条：字数与题号 ═══');
const top8 = seds.slice().sort((a, b) => (b.cites || 0) - (a.cites || 0)).slice(0, 8);
const rand8 = zero.slice(0, 8);
const avg = a => (a.reduce((s, x) => s + String(x.title).length, 0) / a.length).toFixed(1);
console.log('  引力中心 平均标题长: ' + avg(top8) + ' 字');
console.log('  零引用   平均标题长: ' + avg(rand8) + ' 字');
for (const s of top8) console.log('    [高] ' + s.id + '  ' + String(s.title).slice(0, 50));
for (const s of rand8) console.log('    [零] ' + s.id + '  ' + String(s.title).slice(0, 50));
