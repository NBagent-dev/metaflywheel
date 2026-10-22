// i18n 覆盖度量测器（**不是判据**：只报数字，不做判定）
//
// ★为什么需要它，以及它的第一版错在哪（2026-10-22）：
//   我第一次量的是"全部模块里含中文的代码行"，得到 959。
//   把 awareness.mjs 的一行渲染搬进 i18n.mjs 之后，再量 —— **还是 959**。
//   因为字符串没有消失，它只是**搬了家**：从渲染文件搬进了文案表。
//   ⇒ 那个指标量的是"中文有多少行"，不是"渲染层迁了多少"。
//   ⇒ 一句被实测推翻的提交信息（我写成了 959 -> 954）。
//
// ★正确的口径：**分母只数"渲染文件"里的中文行，i18n.mjs 是容器不算**。
//   而"i18n.mjs 里的行数"单独报 —— 它是**已完成的工作量**，不是债务。
//
// 用法：node tools/i18n-coverage.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MOD = path.join(ROOT, 'engine', 'modules');
const CJK = /[\u4e00-\u9fa5]/;

function cjkCodeLines(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let n = 0;
  for (const l of lines) {
    const t = l.trim();
    if (t === '') continue;
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    if (CJK.test(t)) n++;
  }
  return n;
}

const files = fs.readdirSync(MOD)
  .filter(function (f) { return f.endsWith('.mjs') && !f.startsWith('_'); })
  .sort();

let ledger = 0;        // i18n.mjs = 容器（已完成的工作量）
const rows = [];
for (const f of files) {
  const n = cjkCodeLines(path.join(MOD, f));
  if (f === 'i18n.mjs') { ledger = n; continue; }
  if (n > 0) rows.push({ m: f, n: n });
}
rows.sort(function (a, b) { return b.n - a.n; });
const debt = rows.reduce(function (s, r) { return s + r.n; }, 0);

console.log('=== i18n 覆盖度（口径：渲染文件里的中文行；i18n.mjs 不计入分母）===');
console.log('');
console.log('  已完成（i18n.mjs 里的行，是工作量不是债）: ' + ledger);
console.log('  待迁移（其余模块里的中文行）          : ' + debt);
console.log('  ⇒ 迁移进度                            : ' + ledger + ' / ' + (ledger + debt)
  + ' = ' + Math.round(ledger / (ledger + debt) * 1000) / 10 + '%');
console.log('');
console.log('  待迁移最多的模块:');
for (const r of rows.slice(0, 10)) console.log('    ' + String(r.n).padStart(4) + '  ' + r.m);
if (rows.length > 10) console.log('    …… 还有 ' + (rows.length - 10) + ' 个模块');
