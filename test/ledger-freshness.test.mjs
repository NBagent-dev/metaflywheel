// P582 · 生成物不许过期 —— docs/ledger.md 必须与账本同步
//
// ★ 为什么需要这条判据：
//   docs/ledger.md 由 test/gen-ledger-doc.mjs 从账本生成。而"自动生成"这四个字
//   有一个陷阱：**它只在有人重跑时才是新的**。今天已经撞过一次——README 说它
//   "永不过期"，而它实际上已经悄悄旧了（那时对账器抓不到，因为它只查文件存在）。
//   ⇒ 一个没人检查的生成物，一定会过期。这不是可能性，是时间问题。
//
// ★ 设计约束（三条）：
//   ① **外部克隆者没有账本** —— 那不是失败，是正常。找不到账本时 skip。
//   ② 比对必须比【生成结果】，不能比"文件存在"（存在不等于新）。
//   ③ 红的时候必须给出【怎么办】——只说"过期了"等于没说。
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs', 'ledger.md');
const GEN = path.join(ROOT, 'test', 'gen-ledger-doc.mjs');

// ── 找账本：与 test/audit-timeline.mjs 用同一套规则 ──
function findLedger() {
  const env = process.env.MPM_LEDGER;
  if (env && fs.existsSync(env)) return env;
  let dir = ROOT;
  for (let i = 0; i < 4; i++) {
    const p = path.join(dir, '.mpm', 'flywheel.json');
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

test('⑩ ★ docs/ledger.md 必须与账本同步（生成物不许过期）', () => {
  const ledger = findLedger();
  if (!ledger) {
    // ★ 外部克隆者没有账本：这是正常情况，跳过而不是失败
    console.log('# 跳过：找不到账本（.mpm/flywheel.json）——外部克隆者不携带账本，属正常。');
    return;
  }
  assert.ok(fs.existsSync(DOC), '★ docs/ledger.md 不存在 —— 跑 node test/gen-ledger-doc.mjs 生成它');
  assert.ok(fs.existsSync(GEN), '★ 生成器不存在：' + GEN);

  // 生成到临时文件，再与仓库里的那份比对
  const tmp = path.join(os.tmpdir(), 'ledger-freshness-' + process.pid + '.md');
  try {
    execFileSync(process.execPath, [GEN, tmp], {
      cwd: ROOT,
      env: { ...process.env, MPM_LEDGER: ledger },
      stdio: 'pipe',
      timeout: 60000,
    });
    assert.ok(fs.existsSync(tmp), '★ 生成器没有产出文件 —— 它可能改了输出参数约定');

    const fresh = fs.readFileSync(tmp, 'utf8').replace(/\r\n/g, '\n');
    const disk = fs.readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n');

    if (fresh === disk) return;   // 同步，通过

    // 不同：报出**第一处**差异所在的行，让修的人有落点
    const a = fresh.split('\n'), b = disk.split('\n');
    let firstDiff = -1;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) { firstDiff = i; break; }
    }
    const show = (arr, i) => (i >= 0 && i < arr.length) ? JSON.stringify(arr[i].slice(0, 80)) : '（超出该文件末尾）';

    assert.fail(
      '★ docs/ledger.md 已过期（账本变了，而它没重生成）\n' +
      '  第一处差异在第 ' + (firstDiff + 1) + ' 行\n' +
      '    应该是: ' + show(a, firstDiff) + '\n' +
      '    现在是: ' + show(b, firstDiff) + '\n' +
      '  ⇒ 修法：node test/gen-ledger-doc.mjs'
    );
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { /* 临时文件清不掉不影响结论 */ }
  }
});
