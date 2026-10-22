// P614 判据：README 的语域是**项目文档**，不是个人博客
//
// 为什么需要它（用户原话）：「不觉得很奇怪吗？为什么是第一人称写？能不能靠谱点？写的规范一点？」
//
// 问题不在那 4 个「我」字本身，而在语域。读起来像日记的文档会带来两个具体后果：
//   ① 读者不知道"我"是谁 —— 作者？某个维护者？还是这个软件自己？
//   ② 一旦允许第一人称，就会允许"包括我自己的坏步"这种把判断说成心情的句子，
//      而文档里每句该说的是"它做什么"，不是"当时怎么觉得"。
//
// 所以这条判据守两件事：不许出现第一人称；不许出现感叹号（文档陈述事实，不表达情绪）。
// 例外只有一处：代码块内部（示例输出里出现第一人称是数据，不是叙述）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BODY = function (f) {
  return fs.readFileSync(path.join(ROOT, f), 'utf8')
    .replace(/```[\s\S]*?```/g, '')   // 去掉代码块：那是数据，不是叙述
    .replace(/`[^`\n]*`/g, '');       // 去掉行内代码
};

const EN_FIRST_PERSON = /\b(?:I|my|mine|we|We|our|Our|ours|us)\b/;
// 「自我」在本项目里是术语（自我快照/自我设定），所以只抓不成词的「我」。
// ★ 第一版这里写了一个多余的负向前瞻（想排除「我们」），结果把「我们」也放过了 ——
//   而负控当场逮住它：断言"「我们」必须被抓到"红了。**负控的价值就在这里**。
const ZH_FIRST_PERSON = /(?<!自)我/;

test('① 英文 README 不许出现第一人称（I / my / we / our / us）', () => {
  const bad = BODY('README.md').split('\n')
    .map(function (l, i) { return { l: l, n: i + 1 }; })
    .filter(function (x) { return EN_FIRST_PERSON.test(x.l); });
  assert.deepEqual(bad.map(function (x) { return x.n; }), [],
    '以下行用了第一人称：\n      '
    + bad.map(function (x) { return 'L' + x.n + ': ' + x.l.trim().slice(0, 90); }).join('\n      '));
});

test('② 中文 README 不许出现第一人称「我」（「自我」是术语，不算）', () => {
  const bad = BODY('README.zh-CN.md').split('\n')
    .map(function (l, i) { return { l: l, n: i + 1 }; })
    .filter(function (x) { return ZH_FIRST_PERSON.test(x.l); });
  assert.deepEqual(bad.map(function (x) { return x.n; }), [],
    '以下行用了第一人称：\n      '
    + bad.map(function (x) { return 'L' + x.n + ': ' + x.l.trim().slice(0, 90); }).join('\n      '));
});

test('③ 两份 README 都不许有感叹号（陈述事实，不表达情绪）', () => {
  for (const f of ['README.md', 'README.zh-CN.md']) {
    const lines = BODY(f).split('\n');
    const bad = [];
    for (let i = 0; i < lines.length; i++) if (lines[i].indexOf('!') >= 0) bad.push('L' + (i + 1));
    assert.deepEqual(bad, [], f + ' 里有感叹号：' + bad.join(', '));
  }
});

test('④ 负控：判据必须能红 —— 这些写法都必须被抓到', () => {
  assert.ok(EN_FIRST_PERSON.test('including mine'), '英文负控失效：抓不到 "including mine"');
  assert.ok(EN_FIRST_PERSON.test('We recommend this.'), '英文负控失效：抓不到 "We"');
  assert.ok(ZH_FIRST_PERSON.test('包括我自己的坏步'), '中文负控失效：抓不到「我自己」');
  assert.ok(ZH_FIRST_PERSON.test('我们推荐这样做'), '中文负控失效：抓不到「我们」');
  // ★ 而术语不许被误判：这两句必须**通过**
  assert.equal(ZH_FIRST_PERSON.test('引擎在提示装配时注入一份自我快照'), false, '「自我」被误判为第一人称');
  assert.equal(ZH_FIRST_PERSON.test('节律是自我设定的'), false, '「自我」被误判为第一人称');
});
