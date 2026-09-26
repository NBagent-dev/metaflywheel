// P247 重启验收单的**自检脚本**：证明验收单里那两组控制命令真的有区分力。
// 用法: node _p247_ctrlcheck.mjs
//
// 为什么需要它：验收单是散文，散文里的断言没人验。
// 我在 2026-09-21 写正控②时的第一版就是**没有区分力**的——
//   `echo <95 字符>-01` 的 JSON 总长 < 240，v1 的 slice(0,240) 会完整看见尾部差异，
//   照样静默 ⇒ 那条正控无论 v1/v2 都"通过"，证明不了任何事。
// 这正是本文件要防的那类错误：**一条恒过的检查比没有检查更坏。**
// 教训（与 _p247_sigtest.mjs 的 E 组同源）：公共头必须**自身**就超过 240 字符。
//
// 判据：
//   正控②  4×pwsh 长命令、共享 >240 字符前缀  → v1 误报(必须)、v2 静默(必须)
//   负控   4×完全同参                          → v2 报警(必须)
// 任何一条不成立 ⇒ 验收单无效，先修验收单再谈重启。

import { signatureOf } from './events.mjs';

// ---- 中间版 v1：取对了 arguments，但只比 240 字符前缀（重启前线上跑的是更早的 v0）----
function sigV1(name, exec) {
  let sig = null;
  try {
    const raw = exec && (exec.arguments != null ? exec.arguments
      : (exec.args != null ? exec.args : exec.input));
    if (raw != null) sig = name + '|' + JSON.stringify(raw).slice(0, 240);
  } catch (e) { sig = null; }
  return sig;
}

function simulate(sigOf, calls) {
  let last, repeat = 0, fired = false;
  for (const [name, exec] of calls) {
    const s = sigOf(name, exec);
    if (s !== null) {
      if (s === last) repeat += 1; else { last = s; repeat = 0; }
    }
    if (repeat >= 3) fired = true;
  }
  return fired;
}

// ---- 正控②：公共头自身 > 240 字符，差异只在尾部 ----
const PAD = 'A'.repeat(260);
const POS = ['01', '02', '03', '04'].map(n => 'echo ' + PAD + '-' + n);
const posCalls = POS.map(c => ['pwsh', { name: 'pwsh', arguments: { command: c, description: '长参正控' } }]);

// 前提自检：头部必须自身超 240，否则这条正控没有区分力
const headCollides = POS[0].length > 240 && POS.every(s => s.slice(0, 240) === POS[0].slice(0, 240));
console.log('正控② 前提成立（公共头自身 > 240 字符）: ' + (headCollides ? '是' : '否'));
if (!headCollides) { console.log('本正控无区分力，验收单无效'); process.exit(1); }

// ---- 负控：4 次完全同参 ----
const NEG = [1, 2, 3, 4].map(() => ['read', { name: 'read', arguments: { file_path: 'dsh-port/c7_live.py', offset: 1, limit: 20 } }]);

const v1pos = simulate(sigV1, posCalls);
const v2pos = simulate(signatureOf, posCalls);
const v2neg = simulate(signatureOf, NEG);

const checks = [
  ['正控② 是 v1→v2 判别器：v1 必须误报', v1pos === true],
  ['正控② 在 v2 下必须静默', v2pos === false],
  ['负控 在 v2 下必须报警（否则判据恒假）', v2neg === true],
];
let bad = 0;
for (const [label, ok] of checks) {
  if (!ok) bad += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
}

console.log('\n---- 正控②：把下面四条依次发给 agent（只 echo，无害）----');
for (const c of POS) console.log('  ' + c);
console.log('\n---- 负控：把下面这条发四次 ----');
console.log('  read dsh-port/c7_live.py  (offset=1, limit=20)');

console.log(bad === 0 ? '\n验收单有效（全部 OK）' : `\n${bad} 个 FAIL —— 验收单无效，先修它再重启`);
process.exit(bad === 0 ? 0 : 1);
