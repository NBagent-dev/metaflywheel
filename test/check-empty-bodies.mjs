// P543 的验证：零引用沉积里，有多少是【body 空】的？
// ★ 为什么这重要：内生议程现在只报"零引用"，而它分不出——
//   (a) 写得漂亮但没用（body 空 ⇒ 物理证据）
//   (b) 该用的时候没想起来（body 非空 ⇒ 才是真的漏用）
//   而 body 长度【能分开】这两件完全不同的病。
import fs from 'node:fs';

const st = JSON.parse(fs.readFileSync('C:/Users/Administrator/Desktop/daima/XIN/.mpm/flywheel.json', 'utf8'));
const seds = (st.sediments || []).filter(s => s && s.id);
const len = s => String(s.body == null ? '' : s.body).trim().length;

const zero = seds.filter(s => !(s.cites > 0));
const zeroEmpty = zero.filter(s => len(s) === 0);
const zeroTiny = zero.filter(s => len(s) > 0 && len(s) < 200);
const zeroReal = zero.filter(s => len(s) >= 200);

console.log('═══ 全库概况 ═══');
console.log('  沉积总数        ' + seds.length);
console.log('  有引用（>0）    ' + (seds.length - zero.length));
console.log('  零引用          ' + zero.length + '  (' + (zero.length / seds.length * 100).toFixed(1) + '%)');
console.log('');
console.log('═══ ★ 零引用里，body 长度分布 ═══');
console.log('  body 完全为空   ' + zeroEmpty.length + '  ← (a) 写得漂亮但没用（物理证据）');
console.log('  body < 200 字    ' + zeroTiny.length + '  ← 接近空，几乎不可用');
console.log('  body >= 200 字   ' + zeroReal.length + '  ← 只有这些才可能是 (b) 真漏用');
console.log('');
console.log('═══ body 全空的零引用沉积（前 20 条）═══');
for (const s of zeroEmpty.slice(0, 20)) {
  console.log('  ' + s.id + '  ' + String(s.title).slice(0, 62));
}
if (zeroEmpty.length > 20) console.log('  …共 ' + zeroEmpty.length + ' 条');
console.log('');
console.log('═══ ★ 有引用的沉积里，body 空的有几条？（对照）═══');
const cited = seds.filter(s => s.cites > 0);
const citedEmpty = cited.filter(s => len(s) === 0);
console.log('  有引用 ' + cited.length + ' 条 · 其中 body 空 ' + citedEmpty.length + ' 条');
if (citedEmpty.length) for (const s of citedEmpty) console.log('    ' + s.id + '  ' + String(s.title).slice(0, 60));
console.log('');
console.log('═══ ★★ 判据：零引用中 body 空的比例 vs 有引用中 body 空的比例 ═══');
const r1 = zero.length ? (zeroEmpty.length / zero.length * 100).toFixed(1) : 'n/a';
const r2 = cited.length ? (citedEmpty.length / cited.length * 100).toFixed(1) : 'n/a';
console.log('  零引用中 body 空：  ' + r1 + '%');
console.log('  有引用中 body 空：  ' + r2 + '%');
console.log('  ⇒ 若零引用组显著更高 ⇒ "零引用"这个信号里，有相当一部分是【空壳】，不是漏用');
