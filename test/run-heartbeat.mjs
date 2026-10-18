// P556 的"真的跑一次"——刻意写成脚本文件，不塞进 pwsh 内联
// （因为"pwsh + 中文引号/正则"今天已经让内联脚本失败 4 次）
import fs from 'node:fs';
import { vitals, renderVitals } from 'file:///C:/Users/Administrator/Desktop/daima/XIN/metaflywheel/engine/modules/heartbeat.mjs';

const LEDGER = 'C:/Users/Administrator/Desktop/daima/XIN/.mpm/flywheel.json';
const UNF = 'C:/Users/Administrator/Desktop/daima/XIN/.mpm/unforeseen.json';

const st = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const un = JSON.parse(fs.readFileSync(UNF, 'utf8'));

console.log('═══ ① 真实账本：真的跑一次（不是"看起来能跑"）═══');
console.log(renderVitals(vitals(st, un.entries)));

console.log('');
console.log('═══ ② 判据要能失败（P117-M71）：坏数据必须被认出来 ═══');
const bad = [
  ['null', null],
  ['数组', []],
  ['空对象', {}],
  ['缺三个锚点字段', { foo: 1 }]
];
let caught = 0;
for (const [name, s] of bad) {
  const v = vitals(s, []);
  const ok = v.ok === false && typeof v.error === 'string';
  if (ok) caught++;
  console.log('  [' + name.padEnd(14) + '] ok=' + v.ok + (ok ? '  ✓ 认出并报错：' + v.error : '  ✗ 静默放行（判据失败）'));
}
console.log('  ⇒ ' + caught + '/' + bad.length + ' 被认出');

console.log('');
console.log('═══ ③ 缺数据必须显示"缺"，不许显示 0 ═══');
const partial = vitals({ sediments: [], problems: {}, hits: [] }, []);
console.log('  ok=' + partial.ok + ' · 缺 ' + partial.missing.length + ' 项：' + partial.missing.join('、'));
const line = renderVitals(partial);
console.log('  卡里是否出现"（缺）"：' + (line.includes('（缺）') ? '✓' : '✗'));
console.log('  ★ 若缺数据显示成 0，这张卡就"永远看起来正常"⇒ 判据无区分力');

console.log('');
console.log('═══ ④ 这一轮自己的失败也进账（类型账第 14 条）═══');
console.log('  本次：pwsh 内联 + 中文引号 ⇒ 解析失败（第 4 次）· 类型=shell 转义');
console.log('  ★ 而它【是旧类型】⇒ "最近 N 条全旧类型"的风险在增加');
