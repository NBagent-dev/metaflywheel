// P615 判据：文档的**语域**与**覆盖面**都要有账 —— docs/ 里每一份都必须被分类
//
// 用户原话：「不觉得很奇怪吗？为什么是第一人称写？能不能靠谱点？写的规范一点？」
// 而按同一标准过一遍 docs/ 时出现了一个真问题：**同一套标准不能一刀切**。
//
// 四类文档，四套语域，而且必须**明写在清单里**：
//   impersonal  描述软件行为的文档 —— 第三人称、无感叹号
//   subject     以主体自己的口吻写的文本（对 issue 的回信）—— 允许"我"
//   quotes      正文里必须**引用**第一人称（例如定义"回合内第一人称叙述"）—— 允许
//   generated   机器生成（docs/ledger.md）—— 不判语域
//
// ② 是这条判据真正的价值：**清单必须覆盖 docs/ 与根目录 README* 的每一个文件。**
//   新加一份无分类的文档 ⇒ 变红。否则"标准"只覆盖当年它写下的那几份。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const REGIME = {
  'README.md': 'impersonal',
  'README.zh-CN.md': 'impersonal',
  'docs/install.md': 'impersonal',
  'docs/architecture.md': 'impersonal',
  'docs/DEVELOPMENT.md': 'impersonal',
  'docs/intelligence-network.md': 'impersonal',
  'docs/engine-structure.md': 'impersonal',
  'docs/issue-1-reply.md': 'subject',
  'docs/experiment-phenomenal-layer.md': 'quotes',
  'docs/theory.md': 'impersonal',
  'docs/ledger.md': 'generated'
};

const files = function () {
  const out = fs.readdirSync(ROOT).filter(function (f) { return /^README.*\.md$/.test(f); });
  for (const f of fs.readdirSync(path.join(ROOT, 'docs'))) {
    if (/\.md$/.test(f)) out.push('docs/' + f);
  }
  return out.sort();
};

/** 去代码块与行内代码：那是数据，不是叙述 */
const body = function (p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');
};

const EN_FP = /\b(?:I|my|mine|we|We|our|Our|ours|us)\b/;
const ZH_FP = /(?<!自)我/;

const violations = function (p) {
  const out = [];
  body(p).split('\n').forEach(function (line, i) {
    if (/^\s*\[\d+\]\s/.test(line)) return;  // 参考文献逐字引用，不判语域（'Systeme I[J]' 的 I 是卷期标记）
    if (EN_FP.test(line) || ZH_FP.test(line) || line.indexOf('!') >= 0 || line.indexOf('！') >= 0) {
      out.push('L' + (i + 1) + ': ' + line.trim().slice(0, 80));
    }
  });
  return out;
};

test('① 清单里声明的每个文件都必须真实存在（防止清单说谎）', () => {
  for (const p of Object.keys(REGIME)) {
    assert.ok(fs.existsSync(path.join(ROOT, p)), '清单里的文件不存在：' + p);
  }
});

test('② ★ docs/ 与 README* 的每一个文件都必须在清单里分类', () => {
  const unlisted = files().filter(function (f) { return !(f in REGIME); });
  assert.deepEqual(unlisted, [],
    '这些文档没有语域分类（标准不会自动覆盖新文件）：' + unlisted.join(', ')
    + '\n      把它们加进 REGIME：impersonal / subject / quotes / generated');
});

test('③ impersonal 类：不许第一人称，不许感叹号', () => {
  const bad = [];
  for (const p of Object.keys(REGIME)) {
    if (REGIME[p] !== 'impersonal') continue;
    const v = violations(p);
    if (v.length) bad.push(p + '\n      ' + v.join('\n      '));
  }
  assert.deepEqual(bad, [], '以下描述软件的文档用了第一人称或感叹号：\n    ' + bad.join('\n    '));
});

test('④ 每条 README/docs 都必须有标题（没有标题的文件不可能是文档）', () => {
  for (const p of Object.keys(REGIME)) {
    if (REGIME[p] === 'generated') continue;
    assert.match(body(p), /^#\s+\S/m, p + ' 没有一级标题');
  }
});

test('⑤ 负控：判据必须能红', () => {
  assert.ok(EN_FP.test('We recommend this.'), '英文第一人称负控失效');
  assert.ok(ZH_FP.test('我们约定什么？'), '中文第一人称负控失效');
  assert.ok('完成！'.indexOf('！') >= 0, '感叹号检测失效');
  // ★ 而术语与引用不许被误判
  assert.equal(ZH_FP.test('引擎在每轮装配时注入一份自我快照'), false, '「自我」被误判');
  // 清单外的新文档必须被判为"未分类"
  assert.equal(('docs/新文档.md' in REGIME), false, '未分类检测失效');
});
