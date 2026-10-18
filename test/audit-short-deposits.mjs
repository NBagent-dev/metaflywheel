// P564 · 量：短沉积是否真的结构性无法被想起？
// ★ 起因：读 P028-M18（513 字节，零引用 49 天）时，它自己写着
//   「eff≥8 才计分，短标题的沉积不可比」—— 而它自己就是短标题。
//   ⇒ 于是我怀疑一个相关性：**短 ⇒ 零引用**。
//   ★ 但那是【推测】，必须量。
//
// ★ 而量的设计要能拆穿它自己：
//   ① 若"短"与"零引用"无关 ⇒ 我的假设错，该换方向
//   ② 若有关但非单调（比如长也零引用）⇒ 那不是"短"的问题，是"从未被读"的问题
//   ③ 必须看【零引用的长短分布 vs 有引用的长短分布】—— 只看零引用会自我确认
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/Users/Administrator/Desktop/daima/XIN';
const st = JSON.parse(fs.readFileSync(path.join(ROOT, '.mpm/flywheel.json'), 'utf8'));
const seds = (st.sediments || []).filter(s => s && s.id && s.path);

const rows = [];
for (const s of seds) {
  let bytes = 0;
  try { bytes = fs.statSync(s.path).size; } catch { continue; }
  rows.push({ id: s.id, title: String(s.title || ''), bytes, cites: s.cites || 0,
              days: s.depositedAt ? Math.floor((Date.now() - Date.parse(s.depositedAt)) / 86400000) : -1 });
}

const band = b => b < 300 ? 'A<300' : b < 800 ? 'B300-800' : b < 2000 ? 'C800-2k' : b < 5000 ? 'D2k-5k' : 'E5k+';
const BANDS = ['A<300', 'B300-800', 'C800-2k', 'D2k-5k', 'E5k+'];

console.log('═══ ① 字节分布 × 引用数（★ 关键：要看两组对比，不能只看零引用）═══');
console.log('  band         条数   零引用  有引用   零引用率   中位字节');
for (const b of BANDS) {
  const g = rows.filter(r => band(r.bytes) === b);
  if (!g.length) continue;
  const zero = g.filter(r => r.cites === 0).length;
  const sorted = g.map(r => r.bytes).sort((a, c) => a - c);
  const med = sorted[Math.floor(sorted.length / 2)];
  console.log('  ' + b.padEnd(12) + String(g.length).padStart(5) +
    String(zero).padStart(8) + String(g.length - zero).padStart(8) +
    ((zero / g.length * 100).toFixed(1) + '%').padStart(10) + String(med).padStart(11));
}

console.log('');
console.log('═══ ② 那个假设的检验：短是否真的更容易零引用？═══');
const shortG = rows.filter(r => r.bytes < 800);
const longG = rows.filter(r => r.bytes >= 800);
const zs = shortG.filter(r => r.cites === 0).length / (shortG.length || 1);
const zl = longG.filter(r => r.cites === 0).length / (longG.length || 1);
console.log('  短(<800B)   : ' + shortG.length + ' 条，零引用率 ' + (zs * 100).toFixed(1) + '%');
console.log('  长(>=800B)  : ' + longG.length + ' 条，零引用率 ' + (zl * 100).toFixed(1) + '%');
console.log('  差值        : ' + ((zs - zl) * 100).toFixed(1) + ' 个百分点');
if (Math.abs(zs - zl) < 0.10) {
  console.log('  ⇒ ★★ 差别很小：**"短"不是主因**，假设 ①（短⇒零引用）不成立');
} else if (zs > zl) {
  console.log('  ⇒ 短确实更容易零引用（差 ' + ((zs - zl) * 100).toFixed(1) + ' 点）—— 但要看③');
} else {
  console.log('  ⇒ ★★ 反而长更容易零引用 —— 假设方向错了');
}

console.log('');
console.log('═══ ③ 真正的分母：有多少条【从未被读过】？═══');
const zero = rows.filter(r => r.cites === 0);
console.log('  零引用总数：' + zero.length + ' / ' + rows.length + ' (' + (zero.length / rows.length * 100).toFixed(1) + '%)');
console.log('  其中短(<800B)：' + zero.filter(r => r.bytes < 800).length +
            '　长(>=800B)：' + zero.filter(r => r.bytes >= 800).length);
console.log('  ⇒ ★ 所以"全读"的对象不是"所有短沉积"，而是【零引用的全部 ' + zero.length + ' 条】');

console.log('');
console.log('═══ ④ 零引用里最老的一批（前 12 条，按字节升序）═══');
for (const r of zero.slice().sort((a, b) => a.bytes - b.bytes).slice(0, 12)) {
  console.log('  ' + String(r.bytes).padStart(5) + 'B  ' + String(r.days).padStart(3) + 'd  ' + r.id + '  ' + r.title.slice(0, 56));
}

console.log('');
console.log('═══ ⑤ ★ 反例检查：有没有【长而零引用】的？（那会推翻"短是主因"）═══');
const longZero = zero.filter(r => r.bytes >= 2000);
console.log('  长(>=2000B)且零引用：' + longZero.length + ' 条');
for (const r of longZero.slice(0, 5)) {
  console.log('    ' + String(r.bytes).padStart(6) + 'B  ' + r.id + '  ' + r.title.slice(0, 56));
}
if (longZero.length >= 20) {
  console.log('  ⇒ ★★ 长沉积也大量零引用 ⇒ **"短"绝不是主因**，真正的因是"从未被读"');
}
