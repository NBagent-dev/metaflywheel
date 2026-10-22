// P601 探针（先看实际值，再改代码、再写断言）
// 目的：在**未修改**的 hits.mjs 上，把五种情形的真实行为打出来。
// 关键问题：现在的 disposeHit 收到第 8 个参数 direction 时会怎样？（大概会忽略 ⇒ 方向根本没实现）
import * as H from 'file:///C:/Users/Administrator/Desktop/daima/XIN/metaflywheel/engine/modules/hits.mjs';

const NOW = 1792500000000;
const DAY = 86400000;
const mk = (id, key, extra) => Object.assign({ id, key, text: 'k-' + key, verdict: 'hint', at: NOW - 5 * DAY }, extra || {});
const J = (x) => JSON.stringify(x);
const pick = (e) => e ? { id: e.id, disposedAt: !!e.disposedAt, stillOpen: e.stillOpen, until: e.stillOpenUntil, direction: e.direction } : null;

console.log('=== 导出面 ===');
console.log('  有 directionHits 吗: ' + (typeof H.directionHits));
console.log('  disposeHit 声明参数个数: ' + H.disposeHit.length);

console.log('');
console.log('=== A · direction 是否被接受 ===');
{
  const list = [mk('H1', '项目定位', { disposedAt: NOW - DAY }), mk('H2', '愿景', { disposedAt: NOW - DAY })];
  const r = H.disposeHit(list, 'H2', '方向', NOW, false, null, true, true);
  console.log('  disposed 条数: ' + r.disposed.length);
  console.log('  H2 处置后: ' + J(pick(r.disposed[0])));
  console.log('  outstanding: ' + J(H.outstandingHits(r.list, NOW).map((e) => e.id)));
  console.log('  ⇒ 现状（我预期 direction 被忽略、H2 被当成"真解决了"）');
}

console.log('');
console.log('=== B · 同 key 两条：direction 会不会连坐 ===');
{
  const list = [mk('A1', '项目定位', { disposedAt: NOW - DAY }), mk('A2', '项目定位', { disposedAt: NOW - DAY })];
  const r = H.disposeHit(list, 'A1', '方向', NOW, false, null, true, true);
  console.log('  outstanding: ' + J(H.outstandingHits(r.list, NOW).map((e) => e.id)));
  console.log('  A1: ' + J(pick(r.list.find((x) => x.id === 'A1'))));
}

console.log('');
console.log('=== C · 取消方向 ===');
{
  const list = [mk('B1', '愿景', { disposedAt: NOW - DAY, direction: true })];
  console.log('  前置 outstanding（带 direction:true 的条目现在算不算欠账）: ' + J(H.outstandingHits(list, NOW).map((e) => e.id)));
  const r = H.disposeHit(list, 'B1', '其实是任务', NOW, true, 14, true, false);
  console.log('  B1 处置后: ' + J(pick(r.list.find((x) => x.id === 'B1'))));
  console.log('  outstanding: ' + J(H.outstandingHits(r.list, NOW).map((e) => e.id)));
}

console.log('');
console.log('=== D · hitsLine 现状 ===');
{
  const list = [mk('C1', '愿景', { disposedAt: NOW - DAY, direction: true }), mk('C2', '项目定位', { disposedAt: NOW - DAY })];
  console.log('  ' + String(H.hitsLine({ hits: list }, 3)).slice(0, 260));
}

console.log('');
console.log('=== E · 幂等 ===');
{
  let list = [mk('D1', '愿景', { disposedAt: NOW - DAY })];
  list = H.disposeHit(list, 'D1', '方向1', NOW, false, null, true, true).list;
  const a = [H.outstandingHits(list, NOW).length, (typeof H.directionHits === 'function' ? H.directionHits(list).length : -1)];
  list = H.disposeHit(list, 'D1', '方向2', NOW, false, null, true, true).list;
  const b = [H.outstandingHits(list, NOW).length, (typeof H.directionHits === 'function' ? H.directionHits(list).length : -1)];
  console.log('  第一次 [欠账, 方向]: ' + J(a) + '  第二次: ' + J(b));
}
