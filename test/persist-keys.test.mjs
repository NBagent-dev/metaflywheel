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
const EXPECTED_PERSISTED = ['seq', 'problems', 'sediments', 'lastRoot', 'patrol', 'measure', 'constitution', 'valence', 'rhythm', 'narrations',
  // ★P511：用户在场证据（perception 快照 + lastActive）。**看守者**：
  //   test/presence-persist.test.mjs（两个方向 + 端到端 + 接线）与
  //   test/presence-merge.test.mjs（归并而非覆盖，调 engines 自己的 mergePresenceInto）。
  //   它是被**本条判据**逼着登记的——加完字段两秒后就报红："否则它的恢复无人看守"。
  'presence',
  // ★P517：**委托人的思考方式**（他说过什么、用什么方式说的）。
  //   看守者：test/principal.test.mjs（模式识别 / 覆盖规则 / 负控不许编造 / 界线要写在显示里）。
  'principal'];
/** 对象型父字段：恢复时必须"先继承再覆盖"（源对象名约定为 <x>Src）。 */
const OBJECT_PARENTS = ['patrol', 'measure', 'constitution', 'valence'];
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

/** ★P517 改进：判据要测**实现**，不是测**运行实例的磁盘状态**。
 *  原来"登记了但账本里不存在"直接判失败 —— 但账本由**正在运行的实例**写，
 *  而实例可能仍是旧代码（改完要重启才生效）⇒ 于是 schema 与实现一致、却因为"还没重启"而报红。
 *  正确的口径：**schema 必须与 persistImpl 实际写出的键一致**（静态扫源码，判据测实现）；
 *  真账本缺某个键只作为**信息**（下一代会补上），不再作为失败。 */
function persistedKeys(src) {
  const r0 = src.indexOf('async function persistImpl');
  assert.ok(r0 > 0, '找不到 persistImpl——判据锚点失效');
  const block = src.slice(r0, src.indexOf('const json = JSON.stringify(plain', r0));
  const i = block.indexOf('const plain = {');
  assert.ok(i > 0, '找不到 plain 对象字面量——判据锚点失效');
  const body = block.slice(i + 'const plain = {'.length);
  const out = new Set();
  // ★深度跟踪：只收**顶层**键。第一版用朴素正则，把 `constitution: { autonomy: … }` 里的
  //   autonomy/grantedAt/log/lastFireAt、`valence: { events }`、presence IIFE 里的
  //   lastInboxAt/inboxCount/… 全当成顶层键 ⇒ 一次假警报到 11 个。
  //   另：三元表达式 `… === undefined ? undefined : (…)` 里的 `undefined :` 也会被误认为键 ⇒ 显式排除字面量 undefined。
  let depth = 0;
  const re = /([{}])|([A-Za-z_$][\w$]*)\s*:/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m[1] === '{') { depth += 1; continue; }
    if (m[1] === '}') { depth -= 1; if (depth < 0) break; continue; }
    if (depth === 0 && m[2] && m[2] !== 'undefined') out.add(m[2]);
  }
  return out;
}

test('★schema 与**实现**必须一致（这是本判据的真正口径）', () => {
  const wrote = persistedKeys(SRC);
  const notRegistered = Array.from(wrote).filter(function (k) { return EXPECTED_PERSISTED.indexOf(k) < 0; });
  assert.deepEqual(notRegistered, [], 'persistImpl 写了但没登记：' + notRegistered.join('、'));
  const notWritten = EXPECTED_PERSISTED.filter(function (k) { return !wrote.has(k); });
  assert.deepEqual(notWritten, [], '登记了但 persistImpl 不写（schema 与实现对不上）：' + notWritten.join('、'));
});

test('若本机有真账本：未登记的顶层键必须报错；缺键只作提示（实例可能仍是旧代码）', () => {
  if (!fs.existsSync(LEDGER)) return;                  // 其他机器/CI：跳过
  const keys = Object.keys(JSON.parse(fs.readFileSync(LEDGER, 'utf8')));
  const unregistered = keys.filter(function (k) { return EXPECTED_PERSISTED.indexOf(k) < 0; });
  assert.deepEqual(unregistered, [], '账本里有未登记的顶层字段（请加入 EXPECTED_PERSISTED，否则它的恢复无人看守）：' + unregistered.join('、'));
  const absent = EXPECTED_PERSISTED.filter(function (k) { return keys.indexOf(k) < 0; });
  if (absent.length) {
    console.log('  ℹ 真账本暂缺（下一代会补上，因为正在运行的实例可能仍是旧代码）：' + absent.join('、'));
  }
});

test('对象型父字段：恢复必须"先继承再覆盖"（白名单重建 = 新字段静默丢失）', () => {
  // P500 第五例（2026-10-11 实机）：`measure` 原来是白名单重建（只取 samples/driftSignals）
  // ⇒ `measure.promiseStats`（承诺履行累计）每次重启被丢掉 ⇒ 快照出现「已叫醒 1 · 已履行 0」
  // 的**呈现失真**：明明履行过，看起来像没履行。
  // 规则：恢复对象先 Object.assign 源对象，再覆盖需要校验/裁剪的字段。
  const r0 = SRC.indexOf('async function restoreImpl');
  const block = SRC.slice(r0, SRC.indexOf('async function remapForeignSedimentsImpl', r0));
  const bad = OBJECT_PARENTS.filter(function (k) {
    // 第一个参数允许是空对象，也允许是"默认值对象"（如 Object.assign({ rounds: 0, … }, patrolSrc, {…})）
    return !(new RegExp('Object\\.assign\\(\\{[^}]*\\}[^;]*?' + k + 'Src')).test(block);
  });
  assert.deepEqual(bad, [], '这些对象字段是白名单重建（新字段会静默丢失）：' + bad.join('、')
    + '\n应改成：Object.assign({}, <x>Src, { …只覆盖需要校验的字段… })');
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
