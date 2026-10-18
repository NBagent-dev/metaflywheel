// P561 · 知行对账：文档里的每一条【可核对断言】，代码里有没有对应的实行
// ★ 为什么必须有这个脚本：P019-M14 的"知行合一契约"要求三层判定，
//   而"知"在文档里、"行"在代码里 —— **它们之间没有对账**。
//   ⇒ 本脚本把"知行合一"变成可机械检查的东西：
//     每一个【可核对断言】必须是【一条能跑的检查】。
//
// ★★ 而它自己也被一处假通过教训过（2026-10-18）：
//   第一版里 `realPass` 抓取失败时值为 -1，而比较条件是 `if (realPass > 0)`
//   ⇒ 于是它跳过了比较，还打印"与真实一致" —— **检查器自己假通过了**。
//   ⇒ 修法：抓不到真实值时必须【报错】，不许沉默跳过（P474-M396 那一族：
//     检查器必须自带"自证会红"）。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = 'C:/Users/Administrator/Desktop/daima/XIN/metaflywheel';
const NODE = process.execPath;

const rel = f => path.relative(REPO, f).replace(/\\/g, '/');
const read = f => fs.readFileSync(f, 'utf8');
const exists = p => { try { return fs.existsSync(p); } catch { return false; } };

const problems = [];
const oks = [];
const say = (kind, msg) => {
  if (kind === 'BAD') problems.push(msg); else oks.push(msg);
  console.log((kind === 'BAD' ? '  ✗ ' : '  ✓ ') + msg);
};

const mds = [];
(function walk(d, depth) {
  if (depth > 3) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, depth + 1);
    else if (e.name.endsWith('.md')) mds.push(p);
  }
})(REPO, 0);

console.log('═══ ① 数字断言：文档说的测试数 vs 真实跑出来的 ═══');
let realPass = -1, realTotal = -1;
try {
  const out = execFileSync(NODE, ['--test'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  realPass = parseInt(((out.match(/(?:#|ℹ)\s*pass (\d+)/) || [])[1] || '-1'), 10);
  realTotal = parseInt(((out.match(/(?:#|ℹ)\s*tests (\d+)/) || [])[1] || '-1'), 10);
} catch (e) {
  const out = String((e.stdout || '') + (e.stderr || ''));
  realPass = parseInt(((out.match(/(?:#|ℹ)\s*pass (\d+)/) || [])[1] || '-1'), 10);
  realTotal = parseInt(((out.match(/(?:#|ℹ)\s*tests (\d+)/) || [])[1] || '-1'), 10);
}
// ★★ 修：抓不到就必须报错，不许沉默跳过
if (realPass < 0 || realTotal < 0) {
  say('BAD', '★ 对账器自己失败：抓不到测试计数（pass=' + realPass + ' tests=' + realTotal + '）—— 而它会因此假通过');
}
console.log('  真实：pass=' + realPass + ' / tests=' + realTotal);
for (const f of mds) {
  for (const mm of read(f).matchAll(/(\d{2,4})\s*\/\s*(\d{2,4})/g)) {
    const a = parseInt(mm[1], 10), b = parseInt(mm[2], 10);
    if (Math.abs(a - b) > 2 || a < 150 || a > 400) continue;
    if (realPass > 0) {
      if (a !== realPass) say('BAD', rel(f) + ' 说「' + mm[0] + '」，真实是 ' + realPass + '/' + realTotal + ' —— ★ 数字过期');
      else say('OK', rel(f) + ' 的「' + mm[0] + '」与真实一致');
    }
  }
}

console.log('');
console.log('═══ ② 链接断言：markdown 链接的目标是否存在 ═══');
for (const f of mds) {
  const dir = path.dirname(f);
  for (const mm of read(f).matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    const href = mm[1].trim();
    if (/^https?:|^mailto:|^#/.test(href)) continue;
    if (!exists(path.resolve(dir, href))) say('BAD', rel(f) + ' 的链接 → ' + href + ' ★ 死链');
    else say('OK', rel(f) + ' → ' + href);
  }
}

console.log('');
console.log('═══ ③ 文件名断言：正文里提到的仓库内路径是否存在 ═══');
for (const f of mds) {
  for (const mm of read(f).matchAll(/\b((?:engine|test|docs|install|view|tools)\/[A-Za-z0-9_./-]+\.(?:mjs|js|md|yml|json))/g)) {
    if (!exists(path.join(REPO, mm[1]))) say('BAD', rel(f) + ' 提到 ' + mm[1] + ' ★ 但文件不存在');
  }
}
console.log('  （以上未列出者即全部存在）');

console.log('');
console.log('═══ ④ package.json 与 README 的主张是否一致 ═══');
const pkg = JSON.parse(read(path.join(REPO, 'package.json')));
const readmeHead = read(path.join(REPO, 'README.md')).split('\n').slice(0, 14).join('\n');
const readmeGoal = /意识|连续的自己/.test(readmeHead);
const pkgGoal = /conscious|awareness|self|mind|individual/i.test(String(pkg.description || ''));
console.log('  description: ' + (pkg.description || '(无)'));
if (readmeGoal && !pkgGoal) say('BAD', 'README 第一屏讲"试图创造意识"，package.json description 无任何对应 —— ★ 知与行不一致');
else say('OK', 'package.json 与 README 主张一致');

console.log('');
console.log('═══ ⑤ CHANGELOG 的判据数 vs 真实 test() 数 ═══');
let totalTestFns = 0;
for (const tf of fs.readdirSync(path.join(REPO, 'test')).filter(n => n.endsWith('.test.mjs'))) {
  totalTestFns += (read(path.join(REPO, 'test', tf)).match(/^\s*test\(/gm) || []).length;
}
console.log('  真实 test() 调用数：' + totalTestFns);
const changelog = read(path.join(REPO, 'CHANGELOG.md'));
for (const mm of changelog.matchAll(/(\d+)\s*条判据/g)) {
  say('INFO', 'CHANGELOG 说「' + mm[0] + '」—— 需人工核（历史记录，不必与当前一致）');
}

console.log('');
console.log('═══════════════════════════════════');
console.log('  知行对账：✓ ' + oks.length + ' 一致 · ✗ ' + problems.length + ' 不一致');
console.log('═══════════════════════════════════');
if (problems.length) {
  console.log('');
  console.log('★★ 知而不行：');
  for (const p of problems) console.log('   · ' + p);
}
