// P559 体检：仓库对外可读性
// ★ 为什么写成文件：pwsh 内联 + 中文引号今天已经失败 5 次（P027-M17 的纪律）
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'C:/Users/Administrator/Desktop/daima/XIN/metaflywheel';

function walk(dir, out = [], depth = 0) {
  if (depth > 3) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else out.push(p);
  }
  return out;
}

const files = walk(REPO);
const rel = f => path.relative(REPO, f).replace(/\\/g, '/');

console.log('═══ ① 仓库顶层 ═══');
for (const e of fs.readdirSync(REPO, { withFileTypes: true })) {
  console.log('  ' + (e.isDirectory() ? '[D] ' : '    ') + e.name);
}

console.log('');
console.log('═══ ② README 有没有 ═══');
const readmes = files.filter(f => /readme/i.test(path.basename(f)));
if (!readmes.length) console.log('  ★ 没有 README —— 这就是"外人打开不知道是什么"的第一原因');
else for (const f of readmes) console.log('  ' + rel(f) + '  ' + fs.statSync(f).size + ' B');

console.log('');
console.log('═══ ③ 所有 .md ═══');
const mds = files.filter(f => f.endsWith('.md'));
if (!mds.length) console.log('  （没有任何 .md）');
for (const f of mds) console.log('  ' + rel(f) + '  ' + fs.statSync(f).size + ' B');

console.log('');
console.log('═══ ④ ★ 内部黑话密度：源码里 P###-M### 出现次数 ═══');
let total = 0;
const perFile = [];
for (const f of files.filter(f => /\.(mjs|js)$/.test(f))) {
  const t = fs.readFileSync(f, 'utf8');
  const n = (t.match(/P\d{2,3}-M\d{2,4}/g) || []).length;
  if (n > 0) perFile.push({ f: rel(f), n });
  total += n;
}
perFile.sort((a, b) => b.n - a.n);
for (const x of perFile.slice(0, 12)) console.log('  ' + x.f.padEnd(34) + x.n);
if (perFile.length > 12) console.log('  …另有 ' + (perFile.length - 12) + ' 个文件');
console.log('  ── 合计 ' + total + ' 处（而外人不知道任何一个编号是什么）');

console.log('');
console.log('═══ ⑤ 源码里显眼的"内部词"出现次数 ═══');
const jargon = ['沉积', '飞轮', '账本', 'P482', 'P519', 'P543', '意识', '判据', '负控'];
for (const w of jargon) {
  let n = 0;
  for (const f of files.filter(f => /\.(mjs|js|md)$/.test(f))) {
    const t = fs.readFileSync(f, 'utf8');
    n += (t.split(w).length - 1);
  }
  console.log('  ' + w.padEnd(8) + n + ' 次');
}

console.log('');
console.log('═══ ⑥ package.json 里有没有 description / keywords ═══');
const pkg = path.join(REPO, 'package.json');
if (fs.existsSync(pkg)) {
  const j = JSON.parse(fs.readFileSync(pkg, 'utf8'));
  console.log('  name        : ' + (j.name || '(无)'));
  console.log('  description : ' + (j.description || '★ (无) —— 别人装上去也不知道这是什么'));
  console.log('  keywords    : ' + JSON.stringify(j.keywords || '★ (无)'));
  console.log('  scripts     : ' + JSON.stringify(j.scripts || {}));
} else console.log('  ★ 没有 package.json');
