// 量 README 的【指代与信息缺口】—— 而不是继续猜哪里奇怪
// ★ 假设：读起来奇怪，不是因为句子不好，是因为【读到代词时，读者还不知道它指什么】。
//
// 检查三件事：
//   ① 每个代词（它 / 这 / 那 / 该）首次出现时，前面是否已有明确的承载名词
//   ② 前 40 行里有多少个"未定义就使用"的领域词
//   ③ 第一句是否有代词开头（那是最典型的悬空）
import fs from 'node:fs';

const P = 'C:/Users/Administrator/Desktop/daima/XIN/metaflywheel/README.md';
const raw = fs.readFileSync(P, 'utf8');
const lines = raw.split('\n');

// 去掉代码块，只看正文
let inCode = false;
const bodyLines = [];
for (const l of lines) {
  if (/^\s*```/.test(l)) { inCode = !inCode; continue; }
  if (!inCode) bodyLines.push(l);
}
const text = bodyLines.join('\n');

console.log('=== ① 第一句 ===');
const firstSent = text.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#') && !s.startsWith('**'))[0]
  || text.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))[0];
console.log('  ' + String(firstSent).slice(0, 90));
const startsWithPronoun = /^(它|他|这|那|其|该)/.test(String(firstSent).replace(/^\*\*/, ''));
console.log('  以代词开头？ ' + (startsWithPronoun ? '★ 是 —— 读者还不知道它是什么' : '否'));
const hasItIn30 = /它/.test(String(firstSent).slice(0, 30));
console.log('  前 30 字内出现「它」？ ' + (hasItIn30 ? '★ 是' : '否'));

console.log('');
console.log('=== ② 代词首次出现的位置与上下文 ===');
const pronouns = ['它', '这个', '那个', '该'];
for (const p of pronouns) {
  const i = text.indexOf(p);
  if (i < 0) continue;
  const before = text.slice(Math.max(0, i - 40), i).replace(/\n/g, ' ');
  const after = text.slice(i, i + 30).replace(/\n/g, ' ');
  console.log('  「' + p + '」第 ' + text.slice(0, i).split('\n').length + ' 行');
  console.log('    前文: …' + before);
  console.log('    此处: ' + after + '…');
}

console.log('');
console.log('=== ③ 前 40 行里，哪些词是"未定义就使用"的 ===');
const head = bodyLines.slice(0, 40).join('\n');
const TERMS = ['账本', '沉积', '判据', '飞轮', '组合行', '插件', '宿主', 'DSH', 'MPM', '链接', '版本库'];
for (const w of TERMS) {
  const i = head.indexOf(w);
  if (i < 0) continue;
  const lineNo = head.slice(0, i).split('\n').length;
  // 判断：这个词首次出现后 100 字内，有没有定义性表述
  const win = head.slice(i, i + 100);
  const defined = /是|即|指|一种|一本|一个|也就是|：/.test(win);
  console.log('  ' + (defined ? '  有解释' : '★ 无解释') + '  「' + w + '」第 ' + lineNo + ' 行');
}

console.log('');
console.log('=== ④ 谁在说话 / 对谁说话 ===');
console.log('  「我们」: ' + (text.match(/我们/g) || []).length + ' 次');
console.log('  「你」  : ' + (text.match(/你/g) || []).length + ' 次');
console.log('  「读者」: ' + (text.match(/读者|使用者|用户/g) || []).length + ' 次');
console.log('  （一个文档如果从不称呼读者，读者会不知道自己在其中什么位置）');

console.log('');
console.log('=== ⑤ 前 40 行原样（自己读一遍）===');
bodyLines.slice(0, 40).forEach((l, i) => {
  if (l.trim()) console.log('  ' + String(i + 1).padStart(2) + '  ' + l.slice(0, 82));
});
