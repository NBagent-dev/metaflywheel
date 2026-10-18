// P567 · 判据：沉积标题必须是【判词型】，不是【目录型】
// ★ 而它必须【先证明自己会红】—— 拿 471 条历史沉积跑一遍。
//   如果它判出 0 条"目录型"，那它就是个恒绿判据（装饰品）。
//
// ★★ 而更重要的自我检验：如果"目录型"的零引用率【不比判词型高】，
//   那这条判据就是错的 —— 它不预测任何东西，而它凭什么要求我改写法？
import fs from 'node:fs';

const ROOT = 'C:/Users/Administrator/Desktop/daima/XIN';
const st = JSON.parse(fs.readFileSync(ROOT + '/.mpm/flywheel.json', 'utf8'));
const seds = (st.sediments || []).filter(s => s && s.id);

// ── 判词型 vs 目录型的机械判据 ──
// ★ 设计原则：宁可漏判，不可误判（误判会让我改掉本来好的标题）
function classify(title) {
  const t = String(title || '');
  const reasons = [];

  // ① 冒号后出现 "/" 分隔的 3+ 项 ⇒ 目录型
  const afterColon = t.includes('：') ? t.split('：').slice(1).join('：') : '';
  const slashParts = afterColon.split('/').filter(x => x.trim().length >= 2);
  if (slashParts.length >= 3) reasons.push('冒号后有 ' + slashParts.length + ' 项用"/"串列');

  // ② 冒号后出现 "与" 连接的 4+ 个并列短语 ⇒ 目录型
  if (afterColon.split('与').filter(x => x.trim().length >= 2).length >= 5) reasons.push('冒号后并列 ≥5 段');

  // ③ 出现"三件套/五原则/四步"这类计数式清单 ⇒ 目录型
  if (/[一二三四五六七八九十\d]+(件套|原则|步骤|种|类|条|项|清单)/.test(afterColon)) reasons.push('含计数式清单');

  // ── 判词型标记（若有其一，则即使长也算判词）──
  const verdictMarks = ['当且仅当', '必须', '不是', '而是', '等于', '不可', '>>', '<<', '<', '>', '=', '⇒'];
  const hasVerdict = verdictMarks.some(m => t.includes(m));

  const isCatalog = reasons.length > 0 && !hasVerdict;
  return { isCatalog, reasons, hasVerdict, len: t.length };
}

const classified = seds.map(s => ({ ...s, ...classify(s.title) }));
const catalogs = classified.filter(s => s.isCatalog);
const verdicts = classified.filter(s => !s.isCatalog);

console.log('═══ ① 判据在自己身上跑一遍（必须会红）═══');
console.log('  总沉积      : ' + classified.length);
console.log('  目录型（判红）: ' + catalogs.length + ' (' + (catalogs.length / classified.length * 100).toFixed(1) + '%)');
console.log('  判词型       : ' + verdicts.length);
if (catalogs.length === 0) {
  console.log('  ⇒ ★★ 它判出 0 条 ⇒ **恒绿判据**，不合格（P474-M396）');
} else {
  console.log('  ⇒ ✓ 它会红（判出 ' + catalogs.length + ' 条）');
}

console.log('');
console.log('═══ ② ★★ 它预测吗？目录型 vs 判词型的零引用率 ═══');
const zr = g => g.filter(s => (s.cites || 0) === 0).length / (g.length || 1);
const zc = zr(catalogs), zv = zr(verdicts);
console.log('  目录型零引用率: ' + (zc * 100).toFixed(1) + '%  (' + catalogs.filter(s => !s.cites).length + '/' + catalogs.length + ')');
console.log('  判词型零引用率: ' + (zv * 100).toFixed(1) + '%  (' + verdicts.filter(s => !s.cites).length + '/' + verdicts.length + ')');
const diff = (zc - zv) * 100;
console.log('  差值          : ' + (diff > 0 ? '+' : '') + diff.toFixed(1) + ' 个百分点');
if (Math.abs(diff) < 10) {
  console.log('  ⇒ ★★ 差别很小 ⇒ **这条判据不预测零引用** ⇒ 它凭什么要求我改写法？');
  console.log('     （P566 的结论可能是对的，但"目录型"这个机械判据没有捕捉到它）');
} else if (diff > 0) {
  console.log('  ⇒ ✓ 目录型确实更容易零引用（差 ' + diff.toFixed(1) + ' 点）—— 判据有预测力');
} else {
  console.log('  ⇒ ★★ 反了：目录型反而引用更多 ⇒ 判据方向错');
}

console.log('');
console.log('═══ ③ 被判为目录型的前 10 条（看判得对不对）═══');
for (const s of catalogs.slice(0, 10)) {
  console.log('  ' + s.id + '  ' + s.reasons.join(' · '));
  console.log('      ' + String(s.title).slice(0, 78));
}

console.log('');
console.log('═══ ④ 被判为判词型的 6 条样本（看有没有误判）═══');
for (const s of verdicts.filter(s => s.hasVerdict).slice(0, 6)) {
  console.log('  ' + s.id + '  ' + String(s.title).slice(0, 78));
}

console.log('');
console.log('═══ ⑤ 争议区：长但不含目录特征的（它们是不是其实也是目录？）═══');
const longVerdict = verdicts.filter(s => s.len >= 55).slice(0, 8);
for (const s of longVerdict) {
  console.log('  ' + s.len + '字  ' + s.id + '  ' + String(s.title).slice(0, 72));
}
