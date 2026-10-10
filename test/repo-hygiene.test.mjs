// 仓库卫生判据：把 2026-10-10 一晚踩到的两类"用户按文档跑第一条命令就失败"变成自动检查。
// 运行：node --test test/repo-hygiene.test.mjs
//
// 两类（都是实测撞过的，不是想象）：
//   ① **无 BOM 的 .ps1 + 中文 = 可能解析失败**。PowerShell（本机实测 5.1 与 pwsh 都如此）
//      对无 BOM 脚本按 ANSI/GBK 解码：`：`（UTF-8 的 ef bc 9a）被拆成 GBK 双字节，
//      **把紧跟其后的 `"` 当尾字节吃掉** ⇒ 「字符串缺少终止符」⇒ 整个脚本不加载。
//      现象与内容无关、与执行策略无关——文件本身完全合法，只是没告诉我它是 UTF-8。
//      ★install/sync-engine.ps1 就是这么坏的，而 README 让用户跑的就是它。
//   ② **文本文件必须是合法 UTF-8**（截断/半个多字节字符/编码混杂会被抓到）。
// 这两个判据的价值在于：它们检查的是"**用户能不能跑起来**"，而不是"代码逻辑对不对"。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', '.cache']);
const TEXT_EXT = new Set(['.mjs', '.js', '.cjs', '.json', '.md', '.yml', '.yaml', '.ps1', '.txt', '.sh', '.py']);
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') && ent.name !== '.gitignore') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(p, out); continue; }
    if (ent.name.includes('.bak')) continue;                 // 本地备份不进判据
    out.push(p);
  }
  return out;
}
const FILES = walk(ROOT);
const decoder = new TextDecoder('utf-8', { fatal: true });

test('仓库卫生·文本文件必须是合法 UTF-8（截断/半字符/编码混杂都会被抓）', () => {
  const bad = [];
  for (const f of FILES) {
    if (!TEXT_EXT.has(path.extname(f).toLowerCase()) && path.basename(f) !== '.gitignore') continue;
    const buf = fs.readFileSync(f);
    let text;
    try { text = decoder.decode(buf); } catch (e) {
      bad.push(path.relative(ROOT, f) + ' —— ' + e.message);
      continue;
    }
    // 解出来含替换字符（U+FFFD）说明原文有坏字节，即使没抛也要报
    if (text.includes('\uFFFD')) bad.push(path.relative(ROOT, f) + ' —— 含 U+FFFD 替换字符');
  }
  assert.deepEqual(bad, [], '以下文件不是合法 UTF-8：\n  ' + bad.join('\n  '));
});

test('仓库卫生·含中文的 .ps1 必须带 UTF-8 BOM（否则 PowerShell 按 ANSI 解码会吃掉引号）', () => {
  const offenders = [];
  const checked = [];
  for (const f of FILES) {
    if (path.extname(f).toLowerCase() !== '.ps1') continue;
    const buf = fs.readFileSync(f);
    const text = decoder.decode(buf);
    const hasCjk = /[\u4e00-\u9fa5]/.test(text);
    const hasBom = buf.length >= 3 && buf.subarray(0, 3).equals(BOM);
    checked.push(path.relative(ROOT, f) + (hasCjk ? '(中文)' : ''));
    if (hasCjk && !hasBom) offenders.push(path.relative(ROOT, f));
  }
  assert.ok(checked.length > 0, '没扫到任何 .ps1 —— 判据本身失效了');
  assert.deepEqual(offenders, [], '以下 .ps1 含中文但无 BOM，PowerShell 下会解析失败：\n  ' + offenders.join('\n  '));
});
