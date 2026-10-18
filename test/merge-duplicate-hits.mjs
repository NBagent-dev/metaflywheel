// 一次性清理：把「同一 key 的重复未处置命中」合并成一条
//
// ★ 为什么需要它（2026-10-18）：
//   P574 的修法（`recordHit` 同 key 合并）**还没生效**（引擎要重启），
//   而在此之前，principal 的每次注入都在记一条新的未处置命中。
//   四次自主发动里那个数从 18 长到 23 —— **每分钟都在涨**。
//   ⇒ 修法治的是"不再增长"，而【已经积累的那些】不会因重启消失。
//
// ★ 这个脚本做什么（而且【只】做这些）：
//   对每个 key，保留【最后一条未处置】，把更早的未处置标为已处置 ——
//   而条件很严：那些记录的 `text` 必须与保留的那条**完全相同**。
//   不同文本的未处置一律不动（那可能是真的不同事件）。
//
// ★ 为什么那是对的，而不是"洗白"：
//   同一句 principal 被注入 23 次，欠的仍然是**一次处置**。
//   而把 23 条都留着，会让账本每一轮都说"你欠 23 笔" —— **那是假的**。
//
// 用法：node test/merge-duplicate-hits.mjs [--apply]
//   不带 --apply ⇒ 只报告（dry run）
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const P = 'C:/Users/Administrator/Desktop/daima/XIN/.mpm/flywheel.json';

const raw = fs.readFileSync(P, 'utf8');
const st = JSON.parse(raw);
const hits = Array.isArray(st.hits) ? st.hits : [];
const open = hits.filter(h => h && !h.disposedAt);

console.log('=== 现状 ===');
console.log('  命中总数: ' + hits.length);
console.log('  未处置  : ' + open.length);

// 按 key 分组未处置
const byKey = new Map();
for (const h of open) {
  const k = String(h.key || '');
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(h);
}

console.log('');
console.log('=== 每个 key 的未处置情况 ===');

const toDispose = [];
const now = Date.now();

for (const [k, list] of byKey) {
  // 按时间排序，保留最后一条
  list.sort((a, b) => (a.at || 0) - (b.at || 0));
  const keep = list[list.length - 1];
  const earlier = list.slice(0, -1);

  // ★ 只合并【文本完全相同】的那些 —— 不同文本可能真是不同事件
  const sameText = earlier.filter(h => String(h.text || '') === String(keep.text || ''));
  const differing = earlier.length - sameText.length;

  console.log('');
  console.log('  「' + k + '」 未处置 ' + list.length + ' 条');
  console.log('    保留最新那条: ' + new Date(keep.at || 0).toISOString().slice(0, 16).replace('T', ' '));
  console.log('    文本: ' + JSON.stringify(String(keep.text || '').slice(0, 50)));
  console.log('    可合并（文本相同）: ' + sameText.length);
  if (differing > 0) console.log('    ★ 文本不同、不动: ' + differing);

  for (const h of sameText) toDispose.push(h);
}

console.log('');
console.log('=== 计划 ===');
console.log('  将标为已处置: ' + toDispose.length + ' 条');
console.log('  处理后未处置应剩: ' + (open.length - toDispose.length) + ' 条');

if (!APPLY) {
  console.log('');
  console.log('（dry run —— 加 --apply 才会写回）');
  process.exit(0);
}

if (!toDispose.length) {
  console.log('');
  console.log('没有可合并的 —— 账本不变。');
  process.exit(0);
}

// ★ 备份：写回前必须能回滚
const bak = P + '.premerge-' + now;
fs.writeFileSync(bak, raw, 'utf8');

const NOTE = '【合并】同一句 principal 在未处置期间的重复注入 —— 不是处置了 '
  + 'N 次，而是同一件事被采样了 N 次（P572/P574）。保留最新那条继续挂着。';

for (const h of toDispose) {
  h.disposedAt = now;
  h.myAction = NOTE;
  h.mergedInto = '（保留同类中最新的一条未处置记录）';
}

fs.writeFileSync(P, JSON.stringify(st), 'utf8');

console.log('');
console.log('=== 已写回 ===');
console.log('  备份: ' + bak);
console.log('  新未处置数: ' + st.hits.filter(h => h && !h.disposedAt).length);
