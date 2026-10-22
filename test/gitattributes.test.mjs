import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PINS = ['*.mjs', '*.js', '*.json', '*.md', '*.yml', '*.yaml', '*.sh'];
const BINS = ['*.png', '*.zip'];

// 纯函数：给一段 .gitattributes 文本，报出它缺了什么 —— 这样负控才测得到判据本身。
export function checkAttrs(text) {
  const lines = text.split('\n').map(function (l) { return l.trim(); });
  const bad = [];
  if (!lines.some(function (l) { return l === '* text=auto eol=lf'; })) bad.push('缺少全局默认 * text=auto eol=lf');
  for (const p of PINS) {
    const ok = lines.some(function (l) { return l.indexOf(p + ' ') === 0 && l.indexOf('eol=lf') > 0; });
    if (!ok) bad.push('未把 ' + p + ' 钉成 eol=lf');
  }
  for (const p of BINS) {
    const ok = lines.some(function (l) { return l.indexOf(p + ' ') === 0 && /\bbinary\b/.test(l); });
    if (!ok) bad.push('未把 ' + p + ' 标成 binary');
  }
  return bad;
}

test('① 仓库必须有 .gitattributes（否则"本地绿、别人 clone 红"是必然的）', () => {
  assert.ok(fs.existsSync(path.join(ROOT, '.gitattributes')));
});

test('② 行尾契约完整：全局 LF + 七类文本钉死 + 二进制标出', () => {
  const bad = checkAttrs(fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8'));
  assert.deepEqual(bad, [], '行尾契约有缺口：' + bad.join('；'));
});

test('③ 负控：删掉任一条钉死，判据必须报出它', () => {
  const real = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
  const broken = real.split('\n').filter(function (l) { return l.indexOf('*.mjs') !== 0; }).join('\n');
  const bad = checkAttrs(broken);
  assert.ok(bad.length > 0, '负控失效：删掉 *.mjs 钉死后判据仍然通过');
  assert.ok(bad.some(function (s) { return s.indexOf('*.mjs') >= 0; }), '负控报错了对象：' + bad.join('；'));
});
