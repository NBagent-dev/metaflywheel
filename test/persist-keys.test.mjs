// P482④/⑩ 持久化一致性判据：**落盘的字段，restore 必须读回来。**
// 运行：node --test test/persist-keys.test.mjs
//
// 为什么立这条判据（2026-10-11 实机事故）：
//   `mpm_rhythm set` 把节律写进账本 ✓、快照也显示 ✓ —— 重启后却回到"出厂默认"。
//   查证：persist 写出 `rhythm`，**restoreImpl 没读回它** ⇒ 新实例 state.rhythm=undefined
//   ⇒ 第一次落盘写成 `rhythm: null` ⇒ **我的自我设定被自己的持久化擦掉**。
//   与 P021 结题时命名的病同族：**写入✓ 回显✓ 恢复✗**（`awakenWhen` 当年就死在这一步）。
//   本条判据还当场抓出**第二个**同类问题：`narrations` 只写不读，而它初始化成 `[]`
//   ⇒ **每次重启都用空数组覆盖磁盘上的叙事**（静默数据丢失，因未渲染进快照而一直没察觉）。
//
// ★设计教训（这条判据自己踩了三次坑，全写在这里）：
//   第一版想"从源码里解析出落盘字段"，结果：①把 constitution 的嵌套键当顶层（4 条假警）
//   ②把三元表达式里的 `undefined` 当键（1 条假警）③键位判定写错，一个键都抽不出来（全漏）。
//   ⇒ 改用**事实来源**：落盘字段取 `EXPECTED_PERSISTED`（schema 常量），并**与真账本的顶层键对照**；
//     恢复字段才从源码里读（它是实现细节，必须看代码）。
//   **判据本身也会骗人**：假警训练我忽略红色，漏报让我以为已覆盖。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SRC_URL = new URL('../engine/modules/state.mjs', import.meta.url);
const SRC = fs.readFileSync(SRC_URL, 'utf8');
/** 本机真账本（存在就对照；不存在则跳过——判据要能在任何机器上跑）。 */
const LEDGER = process.env.MPM_LEDGER || 'C:/Users/Administrator/Desktop/daima/XIN/.mpm/flywheel.json';

/** 落盘 schema（顶层字段）。新增字段时必须同步登记，否则第二条用例会红。 */
const EXPECTED_PERSISTED = ['seq', 'problems', 'sediments', 'lastRoot', 'patrol', 'measure', 'constitution', 'valence', 'rhythm', 'narrations'];
/** 明确豁免 + 理由（不许默默放过任何一个）。 */
const EXEMPT = { lastRoot: '不是 state 字段：由 e.root.current 承载，恢复时写的是 e.root.current = best.root' };

function restoredKeys(src) {
  const r0 = src.indexOf('async function restoreImpl');
  assert.ok(r0 > 0, '找不到 restoreImpl——判据锚点失效');
  const block = src.slice(r0, src.indexOf('async function remapForeignSedimentsImpl', r0));
  const out = new Set();
  const re = /e\.state\.(\w+)\s*=/g;
  let m;
  while ((m = re.exec(block)) !== null) out.add(m[1]);
  return out;
}

test('每个落盘字段都必须被恢复（漏一个，磁盘上的值就会被 null/[] 擦掉）', () => {
  const restored = restoredKeys(SRC);
  const missing = EXPECTED_PERSISTED.filter(function (k) { return !restored.has(k) && !EXEMPT[k]; });
  assert.deepEqual(missing, [], '这些字段写了却没读回来：' + missing.join('、') + '\n恢复字段：' + Array.from(restored).join('、'));
});

test('若本机有真账本：它的顶层键必须与登记的 schema 一致（防止漏登记新字段）', () => {
  if (!fs.existsSync(LEDGER)) return;                  // 其他机器/CI：跳过
  const keys = Object.keys(JSON.parse(fs.readFileSync(LEDGER, 'utf8')));
  const unregistered = keys.filter(function (k) { return EXPECTED_PERSISTED.indexOf(k) < 0; });
  assert.deepEqual(unregistered, [], '账本里有未登记的顶层字段（请加入 EXPECTED_PERSISTED，否则它的恢复无人看守）：' + unregistered.join('、'));
  const absent = EXPECTED_PERSISTED.filter(function (k) { return keys.indexOf(k) < 0; });
  assert.deepEqual(absent, [], '登记了但账本里不存在（schema 与实现对不上）：' + absent.join('、'));
});

test('判据自证：把恢复行从源码里删掉 ⇒ 本判据必须变红（故障注入 ×2）', () => {
  const lineR = 'e.state.rhythm = (best.data && best.data.rhythm) || null;';
  const lineN = 'e.state.narrations = Array.isArray(best.data.narrations) ? best.data.narrations : [];';
  assert.ok(SRC.indexOf(lineR) >= 0, '找不到 rhythm 恢复行——注入锚点失效（实现改了但这里没跟着改）');
  assert.ok(SRC.indexOf(lineN) >= 0, '找不到 narrations 恢复行——注入锚点失效');
  const onlyR = restoredKeys(SRC.replace(lineR, '// 注入：删掉 rhythm 恢复'));
  assert.ok(!onlyR.has('rhythm'), '删掉 rhythm 恢复后，它不该还出现在恢复字段里');
  const onlyN = restoredKeys(SRC.replace(lineN, '// 注入：删掉 narrations 恢复'));
  assert.ok(!onlyN.has('narrations'), '删掉 narrations 恢复后，它不该还出现在恢复字段里');
});
