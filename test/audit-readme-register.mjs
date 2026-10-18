// 量 README 的【语域】：粗体密度 / 逻辑符号 / 第一人称 / 句长分布
// ★ 为什么要有这个：用户说"读起来非常别扭" —— 而那是【形式】问题，
//   而我此前只改过内容。形式可量，而量了才知道该改什么。
import fs from 'node:fs';

const P = 'C:/Users/Administrator/Desktop/daima/XIN/metaflywheel/README.md';
const t = fs.readFileSync(P, 'utf8');
const lines = t.split('\n');
const body = lines.filter(l => !/^\s*(```|#)/.test(l) && l.trim());

const count = re => (t.match(re) || []).length;

console.log('=== 文本规模 ===');
console.log('  字符数      : ' + t.length);
console.log('  行数        : ' + lines.length);
console.log('  非空正文行  : ' + body.length);
console.log('  ### 级小节  : ' + count(/^### /gm));
console.log('  ## 级小节   : ' + count(/^## /gm));

console.log('');
console.log('=== 1) 粗体密度 ===');
const bold = count(/\*\*[^*]+\*\*/g);
console.log('  粗体段数    : ' + bold);
console.log('  每千字      : ' + (bold / t.length * 1000).toFixed(1) + ' 个');
console.log('  （参考资料：一般技术 README 约 2-5 个/千字）');

console.log('');
console.log('=== 2) 逻辑符号 ===');
console.log('  双箭头 ⇒    : ' + count(/\u21d2/g));
console.log('  单箭头 →    : ' + count(/\u2192/g));
console.log('  长箭头 ⟶    : ' + count(/\u27f6/g));
console.log('  星号 ★      : ' + count(/\u2605/g));
console.log('  破折号 ——   : ' + count(/\u2014\u2014/g));

console.log('');
console.log('=== 3) 人称 ===');
console.log('  「我」      : ' + count(/\u6211/g));
console.log('  「你」      : ' + count(/\u4f60/g));
console.log('  （正式文档通常几乎不用「我」）');

console.log('');
console.log('=== 4) 句长分布 ===');
const sents = t.split(/[\u3002\uff01\uff1f\n]/).map(s => s.trim()).filter(s => s.length > 1);
const lens = sents.map(s => s.length).sort((a, b) => a - b);
const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
const short = lens.filter(x => x < 10).length;
console.log('  句数        : ' + lens.length);
console.log('  平均句长    : ' + avg.toFixed(1) + ' 字');
console.log('  中位句长    : ' + lens[Math.floor(lens.length / 2)]);
console.log('  短句<10字   : ' + short + ' (' + (short / lens.length * 100).toFixed(0) + '%)');
console.log('  长句>60字   : ' + lens.filter(x => x > 60).length);
console.log('  （参考资料：技术文档平均 25-40 字，短句占比通常 <20%）');

console.log('');
console.log('=== 5) 最像对话体的行（短 + 带符号）===');
const suspects = body
  .map(l => ({ l, score: (/\u2605|\u21d2|\u27f6/.test(l) ? 2 : 0) + (l.length < 25 ? 1 : 0) }))
  .filter(x => x.score >= 2 && x.l.length < 70)
  .slice(0, 12);
for (const s of suspects) console.log('  ' + s.l.slice(0, 78));

console.log('');
console.log('=== 6) 全角引号使用 ===');
console.log('  「」        : ' + count(/\u300c|\u300d/g));
console.log('  """         : ' + count(/[\u201c\u201d]/g));
console.log('  （对话体常用；文档通常用代码反引号或直引号）');
