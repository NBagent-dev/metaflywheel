// P612 判据：多语言 README 的**语言栏必须真的能切换**，而且各语言不许各写各的
//
// 为什么需要它（这次是用户直接问出来的）：
//   我把两种语言塞进同一个 README.md，理由是"那六条结构判据只认中文关键词"。
//   ⇒ 那是判据给我的枷锁，不是产品理由。别的开源仓库的做法是一个语言一个文件 +
//     顶部一行语言链接。而换了做法之后，会出现两个新故障，必须有人守：
//       ① 语言栏里的链接指向一个不存在的文件（点进去 404）
//       ② 新加一节只写进了一种语言（另一种永久落后，而没人看得出来）
//
// 这两条都不靠"我记得"守：链接要能解析，小节数要对齐。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const LANGS = fs.readdirSync(ROOT).filter(function (f) {
  return /^README(\.[A-Za-z-]+)?\.md$/.test(f);
}).sort();

const body = function (f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); };

/** 语言栏 = 文件开头那几行里的 markdown 链接（只认 .md 目标） */
function barLinks(text) {
  const head = text.split('\n').slice(0, 8).join('\n');
  const out = [];
  const re = /\[[^\]]+\]\(([^)\s]+\.md)\)/g;
  let m;
  while ((m = re.exec(head)) !== null) out.push(m[1]);
  return out;
}

function h2Count(text) {
  return text.split('\n').filter(function (l) { return /^##\s+\S/.test(l); }).length;
}

test('① 必须存在 README.md，而且至少有两种语言的文件', () => {
  assert.ok(LANGS.indexOf('README.md') >= 0, '默认 README.md 必须存在');
  assert.ok(LANGS.length >= 2, '只找到 ' + LANGS.length + ' 个 README：' + LANGS.join(', '));
});

test('② 语言栏里的每个链接都必须指向一个**真的存在的** README 文件', () => {
  for (const f of LANGS) {
    const links = barLinks(body(f));
    assert.ok(links.length >= 1, f + ' 开头没有语言栏（至少要有一个指向别种语言的链接）');
    for (const target of links) {
      assert.ok(fs.existsSync(path.join(ROOT, target)), f + ' 的语言栏指向不存在的文件：' + target);
      assert.ok(LANGS.indexOf(target) >= 0, f + ' 的语言栏指向的不是 README 语言文件：' + target);
    }
  }
});

test('③ 每种语言都必须能从 README.md 走到，也能走回来（不许有孤岛）', () => {
  const fromDefault = barLinks(body('README.md'));
  for (const f of LANGS) {
    if (f === 'README.md') continue;
    assert.ok(fromDefault.indexOf(f) >= 0,
      'README.md 的语言栏里没有 ' + f + ' —— 读者从默认入口到不了它');
    const back = barLinks(body(f));
    assert.ok(back.indexOf('README.md') >= 0,
      f + ' 的语言栏里没有回到 README.md 的链接 —— 进去就出不来');
  }
});

test('④ 各语言的小节数必须与 README.md 一致（这是"只加了一种语言"的探测器）', () => {
  const base = h2Count(body('README.md'));
  assert.ok(base >= 5, 'README.md 只有 ' + base + ' 个二级小节，判据可能读错了文件');
  for (const f of LANGS) {
    if (f === 'README.md') continue;
    const n = h2Count(body(f));
    assert.equal(n, base,
      f + ' 有 ' + n + ' 个二级小节，README.md 有 ' + base + ' 个 —— 两边结构不同步'
      + '（通常是某一节只加进了一种语言）');
  }
});

test('⑤ 负控：判据必须能红 —— 空语言栏 / 悬空链接都必须被它发现', () => {
  assert.deepEqual(barLinks('**English**'), [], '没有链接时必须返回空数组');
  assert.deepEqual(barLinks('**English** · [简体中文](README.zh-CN.md)'), ['README.zh-CN.md']);
  const dangling = barLinks('**English** · [日本语](README.ja.md)');
  assert.equal(fs.existsSync(path.join(ROOT, dangling[0])), false,
    '★ 这条负控假设 README.ja.md 不存在；它现在存在了 ⇒ 请换一个不存在的目标，别让负控变假');
});

test('⑥ 中文那一份必须真的是中文、英文那一份的正文必须是纯英文', () => {
  const zh = body('README.zh-CN.md');
  const en = body('README.md');
  const cjk = /[\u4e00-\u9fff]/;
  // ★语言栏本身必然含"简体中文"这四个字（那是给中文读者看的入口），
  //   所以这一条只检查**语言栏之后**的正文——否则判据会把正确的东西判错。
  const enBody = en.split('\n').slice(8).join('\n');
  assert.ok(cjk.test(zh), 'README.zh-CN.md 里没有中文 —— 那一份不是中文版');
  assert.ok(!cjk.test(enBody), 'README.md 的正文里不该出现中文 —— 否则又变成"一个文件两种语言"');
});
