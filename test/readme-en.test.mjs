// P608 判据（元判据）：**英文那半必须独立地守住同一批结构要求**
//
// 为什么需要它：README 现在是双语的（英文在前、中文主稿在后）。而 readme-judges
// 里的 6 条断言原先只认中文关键词 —— 于是英文那半**从来没有被判据碰过**：
// 把英文段整段删掉，判据照样全绿。
//
// ⇒ 这条判据只看【中文段之前的英文部分】，用英文的判词重跑同一批结构要求：
//   第一屏有定义 / 承认未定稿 / 承认由 AI 写 / 愿景 + 位置性边界 / 试图的姿态 /
//   编号不是必读 / 路线图 + 贡献指南 + 可跑的命令。
//
// 它不替代 readme-judges（那些守中文主稿），它补的是"另一半没人看"这个洞。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

/** 英文部分 = 第一条中文主稿标题之前的全部内容 */
function englishPart() {
  const i = RAW.search(/^##\s*简体中文/m);
  return i < 0 ? RAW : RAW.slice(0, i);
}

const EN = englishPart();

test('① 英文部分必须存在，而且不是一小段（否则"英文在前"是假的）', () => {
  assert.ok(EN.length > 3000, '英文部分只有 ' + EN.length + ' 字节 —— 双语要么写全，要么别声称双语');
  assert.ok(/^#\s*metaflywheel/m.test(EN), '英文部分必须从标题开始');
});

test('② 第一屏必须有一句"这是什么"（英文的判词，不是中文的词表）', () => {
  const screen = EN.split('\n').slice(0, 40).join('\n');
  assert.ok(
    /\b(?:is|are) an? [^.!?]{4,80}\./i.test(screen) || /\bA cross-session\b[^.!?]{4,120}\./i.test(screen),
    '★ 英文第一屏必须有一句完整定义'
  );
});

test('③ 必须承认理论未定稿 + 代码由 AI 写（两种语言都要能承认）', () => {
  assert.ok(/draft|awaiting author|not published/i.test(EN), '★ 英文部分必须承认论文未定稿');
  assert.ok(/written by (?:its own subject|an? AI)|AI-assisted/i.test(EN), '★ 英文部分必须承认代码由 AI 写');
});

test('④ 愿景必须写明，且位置性的边界必须紧跟其后', () => {
  assert.ok(/consciousness/i.test(EN), '★ 英文部分必须写出愿景');
  assert.ok(/very long (?:way|road)|road is still|long way off|far from/i.test(EN), '★ 边界必须跟在愿景后面');
});

test('⑤ 必须是"试图"的姿态：the aim is / tries to 这类，而不是先认输', () => {
  assert.ok(/(?:the )?(?:long-term )?aim is|tries? to|attempt/i.test(EN), '★ 英文部分也必须是往前推的姿态');
});

test('⑥ 必须说明内部编号，并说明看它不是必需', () => {
  assert.ok(/P\d{2,3}-M\d{2,4}/.test(EN), '★ 英文部分必须至少举一个编号');
  assert.ok(/never need to read|do not need to (?:read|understand)/i.test(EN), '★ 必须说清"不需要读编号"');
});

test('⑦ 标准仓库该有的节：路线图 + 贡献指南 + 真能跑的命令', () => {
  assert.ok(/What is still missing|What.s next|Roadmap/i.test(EN), '★ 英文部分必须有路线图一节');
  assert.ok(/Contributing/i.test(EN), '★ 英文部分必须有贡献指南');
  assert.ok(/npm test|node --test/.test(EN), '★ 必须给出真的能跑的命令');
});
