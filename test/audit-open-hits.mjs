// 查全部未处置命中的 key 分布 —— 而不是只看摘要里的三条
// ★ 要回答的问题：这 18 条是两个 key 反复命中，还是有别的？
import fs from 'node:fs';

const P = 'C:/Users/Administrator/Desktop/daima/XIN/.mpm/flywheel.json';
const st = JSON.parse(fs.readFileSync(P, 'utf8'));
const hits = st.hits || [];

const open = hits.filter(h => h && !h.disposedAt);
const still = hits.filter(h => h && h.disposedAt && h.stillOpen);

console.log('=== 未处置（disposedAt 为空）===');
console.log('  总数: ' + open.length);

const byKey = {};
for (const h of open) byKey[h.key || '(无 key)'] = (byKey[h.key || '(无 key)'] || 0) + 1;
for (const [k, n] of Object.entries(byKey).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + String(n).padStart(3) + ' 次  ' + k);
}

console.log('');
console.log('=== 已处置但标了 stillOpen（仍未解决）===');
console.log('  总数: ' + still.length);
const byKey2 = {};
for (const h of still) byKey2[h.key || '(无 key)'] = (byKey2[h.key || '(无 key)'] || 0) + 1;
for (const [k, n] of Object.entries(byKey2).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + String(n).padStart(3) + ' 次  ' + k);
}

console.log('');
console.log('=== 全部命中按 key 汇总（含已处置）===');
const all = {};
for (const h of hits) {
  const k = h.key || '(无 key)';
  if (!all[k]) all[k] = { total: 0, open: 0, stillOpen: 0 };
  all[k].total++;
  if (!h.disposedAt) all[k].open++;
  else if (h.stillOpen) all[k].stillOpen++;
}
for (const [k, v] of Object.entries(all).sort((a, b) => b[1].total - a[1].total)) {
  console.log('  ' + String(v.total).padStart(3) + ' 总 · 未处置 ' + String(v.open).padStart(2) + ' · 仍未解决 ' + String(v.stillOpen).padStart(2) + '  ' + k);
}

console.log('');
console.log('=== 未处置那 18 条的时间跨度（如果它们全是同一天注入的，那是机制不是行为）===');
const ts = open.map(h => h.at).filter(Boolean).sort((a, b) => a - b);
if (ts.length) {
  const d = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
  console.log('  最早: ' + d(ts[0]));
  console.log('  最晚: ' + d(ts[ts.length - 1]));
  const spanMin = (ts[ts.length - 1] - ts[0]) / 60000;
  console.log('  跨度: ' + spanMin.toFixed(0) + ' 分钟');
}

console.log('');
console.log('=== 前 5 条未处置的原文（看它们到底说了什么）===');
for (const h of open.slice(0, 5)) {
  console.log('  [' + h.key + '] ' + String(h.text || '').slice(0, 70));
}
