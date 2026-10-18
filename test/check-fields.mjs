// ★ 先验字段，再量 —— 不许再猜（P002-M2）
import fs from 'node:fs';
import path from 'node:path';

const LEDGER = 'C:/Users/Administrator/Desktop/daima/XIN/.mpm/flywheel.json';
const DEPDIR = 'C:/Users/Administrator/Desktop/daima/XIN/.mpm/deposits';

const st = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const seds = (st.sediments || []).filter(s => s && s.id);

console.log('═══ ① 账本 sediments[0] 的真实字段 ═══');
const s0 = seds[0];
console.log('  id = ' + s0.id);
console.log('  字段名：' + Object.keys(s0).join(' , '));
console.log('  各字段值（截断）：');
for (const [k, v] of Object.entries(s0)) {
  const t = typeof v === 'string' ? '"' + v.slice(0, 70) + '"' : JSON.stringify(v).slice(0, 70);
  console.log('    ' + k.padEnd(14) + ' = ' + t);
}

console.log('');
console.log('═══ ② 有没有 body 这个字段？ ═══');
const hasBody = seds.filter(s => 'body' in s).length;
const hasDigest = seds.filter(s => s.digest != null && String(s.digest).length > 0).length;
const hasPath = seds.filter(s => s.path != null && String(s.path).length > 0).length;
console.log('  有 body 字段：   ' + hasBody + ' / ' + seds.length + (hasBody === 0 ? '  ← ★ 所以不是空壳，是【账本不存全文】' : ''));
console.log('  有非空 digest：  ' + hasDigest + ' / ' + seds.length);
console.log('  有 path：        ' + hasPath + ' / ' + seds.length);

console.log('');
console.log('═══ ③ 沉积目录里的 .md 文件真实大小（真相在这里）═══');
if (!fs.existsSync(DEPDIR)) { console.log('  目录不存在：' + DEPDIR); }
else {
  const files = fs.readdirSync(DEPDIR).filter(f => f.endsWith('.md'));
  const sizes = files.map(f => ({ f, n: fs.statSync(path.join(DEPDIR, f)).size }));
  sizes.sort((a, b) => b.n - a.n);
  const total = sizes.reduce((a, b) => a + b.n, 0);
  const empty = sizes.filter(x => x.n < 200);
  console.log('  .md 文件数：      ' + files.length);
  console.log('  总字节：          ' + total);
  console.log('  中位数：          ' + sizes[Math.floor(sizes.length / 2)].n + ' 字节');
  console.log('  ★ 小于 200 字节：' + empty.length + ' 个');
  console.log('');
  console.log('  最大的 3 个：');
  for (const x of sizes.slice(0, 3)) console.log('    ' + x.n + ' B  ' + x.f.slice(0, 62));
  console.log('  最小的 5 个：');
  for (const x of sizes.slice(-5)) console.log('    ' + x.n + ' B  ' + x.f.slice(0, 62));
}

console.log('');
console.log('═══ ④ 那三条零引用的沉积，文件里到底有没有内容？ ═══');
const THREE = ['P027', 'P028', 'P030'];
for (const pre of THREE) {
  const hit = seds.filter(s => String(s.id).startsWith(pre + '-'));
  for (const s of hit.slice(0, 1)) {
    const p = s.path ? String(s.path) : null;
    const exists = p ? fs.existsSync(p) : false;
    const n = exists ? fs.statSync(p).size : -1;
    console.log('  ' + s.id + '  path存在=' + exists + '  字节=' + n + '  digest=' + String(s.digest || '').slice(0, 50));
  }
}
