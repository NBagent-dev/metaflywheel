// P543-M469 · PR-007 集成判据：工具失败 → 动作名 的映射
// ★ 这一层是"在动作发生的那一刻"的实现核心：它必须【认得出失败】，也必须【认不出时不硬套】。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureToAction, isShellTool, collectText } from '../engine/modules/triggers.mjs';

test('① edit 被读守卫拒 ⇒ edit-blocked（今晚真被拒过两次的那个）', () => {
  assert.equal(failureToAction('edit', "cannot modify: file has not been read — read the file, then retry"), 'edit-blocked');
});

test('② 猜了不存在的沉积 ID ⇒ id-guess', () => {
  assert.equal(failureToAction('mpm_deposit', 'links 里有账本中不存在的沉积 ID：P543-M453'), 'id-guess');
});

test('③ 读不到路径 ⇒ path-guess', () => {
  assert.equal(failureToAction('read', 'Error: cannot read "C:/x/y.md": not found'), 'path-guess');
  assert.equal(failureToAction('read', '路径不存在'), 'path-guess');
});

test('④ shell 非零退出 ⇒ pwsh-inline-fail', () => {
  assert.equal(failureToAction('pwsh', '...\n[exit code: 1]'), 'pwsh-inline-fail');
  assert.equal(failureToAction('bash', '[exit code: 127]'), 'pwsh-inline-fail');
});

test('⑤ ★★ 负控：exit code 0 是【成功】⇒ 必须返回 null（不许把成功当失败）', () => {
  assert.equal(failureToAction('pwsh', '[exit code: 0]'), null);
  assert.equal(failureToAction('pwsh', 'all good\n[exit code: 0]'), null);
});

test('⑥ ★★ 负控：非 shell 工具里出现 "[exit code:" 字样 ⇒ 不许认（防止偶然命中）', () => {
  assert.equal(isShellTool('edit'), false);
  assert.equal(failureToAction('edit', '我写了一段包含 "[exit code: 1]" 的文档'), null);
});

test('⑦ ★★ 负控：正常输出 ⇒ null（沉默是对的，否则提示会变噪声）', () => {
  assert.equal(failureToAction('read', 'file content here, everything fine'), null);
  assert.equal(failureToAction('write', 'File created successfully'), null);
  assert.equal(failureToAction(null, null), null);
  assert.equal(failureToAction(undefined, undefined), null);
});

test('⑧ 优先级：一笔 edit 同时含 "not found" 与 "has not been read" ⇒ 取更精确的 edit-blocked', () => {
  assert.equal(failureToAction('edit', 'file has not been read yet; also target not found'), 'edit-blocked');
});

test('⑩ ★★ 误报防护：错误短语出现在【输出深处】必须不算（真实误报逼出来的）', () => {
  // 2026-10-18 实况：脚本打印了一条沉积标题「…edit 的 4 空格缩进必然 not found」，
  // 而 failureToAction 把"输出里有 not found"当成了"读不到路径" ⇒ 误报 path-guess。
  const deep = [
    '═══ 查 edit / old_string 相关 ═══',
    '  P358-M304  预测事件表复检…',
    '  P401-M344  edit 匹配串只取内容本身…',
    '  P408-M348  改卡不该靠字符串匹配：edit 的 4 空格缩进必然 not found',
    '  P427-M365  rev 逐字回嘴 wor 的格子…',
    '  共 12 条'
  ].join('\n');
  assert.equal(failureToAction('pwsh', deep), null, '★ 第 4 行含 not found，但那不是失败消息 ⇒ 必须沉默');
});

test('⑪ 而真正的错误在【头部】时仍然认（不许因为防误报而漏报）', () => {
  const real = ['Error: cannot read "C:/x/y.md": not found', '', '后面还有很多正常输出…', 'a', 'b', 'c'].join('\n');
  assert.equal(failureToAction('read', real), 'path-guess', '★ 错误在第 1 行 ⇒ 必须认');
});

test('⑨ collectText 只取 {type:text}，不把结构化字段塞进正则', () => {
  assert.equal(collectText({ content: [{ type: 'text', text: 'a' }, { type: 'image', data: 'b' }, { type: 'text', text: 'c' }] }), 'a\nc');
  assert.equal(collectText({}), '');
  assert.equal(collectText(null), '');
  assert.equal(collectText({ content: 'not-an-array' }), '');
});
