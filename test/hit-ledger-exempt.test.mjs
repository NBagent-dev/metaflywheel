// P546 判据：**登记类工具（mpm_*）不该产生"命中"** —— 白名单必须换成前缀判断。
// 运行：node --test test/hit-ledger-exempt.test.mjs
//
// 现场（2026-10-18 实测）：
//   · host.js 对命中记录有一个豁免：`tn !== 'mpm_principal' && … && tn !== 'mpm_unknown'`
//     ⇒ 只豁免了 4 个**具体工具名**，而意图是"登记类调用不算"。
//   · 结果：45 笔命中里 **29 笔（64.4%）来自 mpm_\* 工具**
//     （micro 9 · solve 7 · converge 4 · deposit 4 · generate 2 · frame 2 · narrate 1）。
//   · 更糟的是**死循环**：清账动作（mpm_hit）虽被豁免，但**清账前的 mpm_micro** 会产生一笔，
//     且时间戳精确对应（13:49:24 → 被 13:49:47 清 → 13:49:47 又产生 → 被 13:50:12 清 → …）
//     ⇒ **未处置永远 ≥ 1** ⇒ hit-open 永久占用一个议程名额（P537 判据的极限）。
//
// ★ 修法：把"4 个具体名字的白名单"换成**前缀判断**，并抽成可测函数。
//   理由与 P004-M3 的既有豁免同源：
//     「工具调用自动累积 C 的监听器对 mpm_* 前缀工具豁免计价——
//       登记类调用本身不计入被登记问题的求解成本」
//   ⇒ **那条给 C 计价豁免了 mpm_*，而命中记录没跟上。**
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isLedgerTool } from '../engine/modules/hits.mjs';

test('①所有 mpm_* 都是登记类工具（前缀判断，不是白名单）', () => {
  const ledger = [
    'mpm_generate', 'mpm_frame', 'mpm_solve', 'mpm_converge', 'mpm_micro',
    'mpm_deposit', 'mpm_evoke', 'mpm_setroot', 'mpm_flywheel_state',
    'mpm_principal', 'mpm_unknown', 'mpm_hit', 'mpm_rhythm', 'mpm_grant',
    'mpm_adopt', 'mpm_narrate', 'mpm_hit'
  ];
  for (const t of ledger) {
    assert.equal(isLedgerTool(t), true, '★登记类工具必须被识别：' + t);
  }
});

test('②★未来新增的 mpm_* 自动豁免（这是前缀判断 vs 白名单的分水岭）', () => {
  // 旧白名单只列了 4 个名字 ⇒ 新增工具自动漏网。这条判据钉住"前缀"这个契约。
  assert.equal(isLedgerTool('mpm_some_future_tool'), true,
    '★前缀判断才覆盖未来新增的登记类工具——白名单不能');
});

test('③真正的"干活"工具不许被豁免（否则命中记录会空掉）', () => {
  const workTools = ['write', 'edit', 'read', 'grep', 'glob', 'pwsh', 'web_search', 'web_fetch', 'subagent', 'present'];
  for (const t of workTools) {
    assert.equal(isLedgerTool(t), false, '★干活工具必须仍然被记录：' + t);
  }
});

test('④边界：空/非字符串/大小写', () => {
  assert.equal(isLedgerTool(''), false);
  assert.equal(isLedgerTool(null), false);
  assert.equal(isLedgerTool(undefined), false);
  assert.equal(isLedgerTool('MPM_micro'), false, '大小写敏感（工具名本来就全小写）');
  assert.equal(isLedgerTool('xmpm_micro'), false, '★前缀必须锚定在开头（xmpm_ 不是登记类）');
});

test('⑤契约落地：host.js 必须用这个函数，不许再写白名单', () => {
  const src = fs.readFileSync(new URL('../engine/host.js', import.meta.url), 'utf8');
  assert.ok(/isLedgerTool\s*\(/.test(src),
    '★host.js 必须调用 isLedgerTool（把判定抽出来才能被测）');
  assert.ok(!/tn\s*!==\s*'mpm_principal'/.test(src),
    '★旧的"逐个名字"白名单必须已被移除——它是 64.4% 噪声的来源');
});
