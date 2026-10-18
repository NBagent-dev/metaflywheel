// P561 · 知行对账【变成判据】——这样它随 npm test 自动跑，不会再次过期
//
// ★ 为什么必须是判据而不是一个 CI job：
//   一个"需要人记得去跑"的对账器，会以同样的方式再次过期 ——
//   而那正是它第一次要治的病（README 说 221，真实 233，而没人发现）。
//   ⇒ 把它写成判据 ⇒ 每次 `npm test` 都跑 ⇒ 它无法被忘记。
//
// ★★ 而它自己踩了一个递归陷阱（值得留在这里，因为下一个改它的人也会踩）：
//   npm test → 本判据 → audit-consistency.mjs → 它内部跑 node --test → 又扫到本判据 ⇒ 无限递归。
//   ⇒ 所以用 SKIP_TEST_COUNT=1 跳过那次子测试（见 audit-consistency.mjs 顶部注释）。
//   ⇒ 代价：数字断言这一类在本判据里【不生效】。**而这个代价必须被明说** ——
//     否则它会看起来"全绿"，而实际上有一类检查被静默跳过了（那正是假通过）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'C:/Users/Administrator/Desktop/daima/XIN/metaflywheel';
const AUDIT = path.join(REPO, 'test', 'audit-consistency.mjs');

function runAudit() {
  const env = { ...process.env, SKIP_TEST_COUNT: '1' };
  let out = '';
  try {
    out = execFileSync(process.execPath, [AUDIT], {
      cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env
    });
  } catch (e) {
    out = String((e.stdout || '') + (e.stderr || ''));
  }
  return out;
}

test('知行对账·① 链接与路径断言必须全部一致（0 项不一致）', () => {
  const out = runAudit();
  // ★ 只认链接/路径类的不一致（第 ①②③ 段）——数字那一段被 SKIP 了
  const bad = out.split('\n')
    .filter(l => l.includes('✗'))
    .filter(l => l.includes('链接') || l.includes('提到') || l.includes('description'))
    // ★ 数字类被跳过是【设计】，但"对账器自己失败"必须仍然红
    .filter(l => !l.includes('SKIP'));
  assert.deepEqual(bad, [], '★ 存在知行不一致：\n' + bad.join('\n') + '\n\n完整报告：\n' + out);
});

test('知行对账·② 对账器不许静默失败（它的输出必须能被解析）', () => {
  const out = runAudit();
  // ★ 这条守的是 P474-M396 那个教训：检查器必须自带"自证会红"。
  //   如果它因为任何原因没输出统计行，那它就不是在检查，而是在装饰。
  assert.ok(/知行对账：/.test(out), '★ 对账器没有输出汇总行 —— 它可能在静默失败');
  assert.ok(/✓ \d+ 一致 · ✗ \d+ 不一致/.test(out), '★ 汇总行格式变了或缺失');
});

test('知行对账·③ 必须存在一份真实的不一致检测能力（防恒绿）', () => {
  // ★ 恒绿判据的识别法：先让它红一次（P474-M396）。
  //   这里用【注入一个必然不存在的链接】来证明它真的会红。
  const probe = path.join(REPO, 'test', '__probe_dead_link__.md');
  fs.writeFileSync(probe, '# probe\n\n[dead](definitely-not-here-xyz.md)\n', 'utf8');
  try {
    const out = runAudit();
    assert.ok(/definitely-not-here-xyz\.md/.test(out),
      '★★ 注入了一个死链，而对账器没抓到 —— 它是恒绿的（装饰品）');
  } finally {
    fs.unlinkSync(probe);
  }
});
