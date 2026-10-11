// P517 判据：**录入通道**必须存在、必须调引擎自己的函数、且必须挡住"替他说话"。
// 运行：node --test test/principal-tool.test.mjs
//
// 为什么这条也要判据：`mpm_principal` 是**唯一一个"我替他记东西"的入口**——
//   最容易滑向"替他说话"的地方。它一旦能悄悄写，整条界线就废了。
//   静态部分只判"门在不在、口径对不对"；行为部分由 principal.test.mjs（调同一个函数）承担。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SRC = fs.readFileSync(new URL('../engine/modules/tools.mjs', import.meta.url), 'utf8');

test('①门存在：mpm_principal 已注册', () => {
  assert.ok(/['"]mpm_principal['"]/.test(SRC), '没有 mpm_principal 这个工具 ⇒ 条目永远进不了账');
});

test('②必填三件：text / key / note —— note 必填是为了"条目自带场合"（可审、可查伪造）', () => {
  const m = /mpm_principal:\s*\[([^\]]*)\]/.exec(SRC);
  assert.ok(m, '找不到 mpm_principal 的必填声明');
  const req = m[1].split(',').map(function (s) { return s.trim().replace(/['"]/g, ''); }).filter(Boolean);
  assert.deepEqual(req.sort(), ['key', 'note', 'text'], '必填项应为 text/key/note，实际：' + req.join('、'));
});

test('③它调的是**引擎自己的** recordPrincipal —— 不在工具里复刻一份归并逻辑', () => {
  assert.match(SRC, /import\s*\{[^}]*recordPrincipal[^}]*\}\s*from\s*['"]\.\/principal\.mjs['"]/,
    'tools.mjs 必须从 principal.mjs 引入 recordPrincipal');
  assert.ok(/recordPrincipal\(\s*d\.state\.principal/.test(SRC), '必须把条目交给引擎自己的 recordPrincipal 处理');
});

test('④纪律必须写在工具描述里（不只是写在代码注释里）', () => {
  const i = SRC.indexOf("'mpm_principal'");
  const desc = SRC.slice(i, i + 1200);
  assert.match(desc, /只在他明确确认后录入/, '描述里必须写明"不许替他说话"');
  assert.match(desc, /不冒充"他在乎什么"的来源/, '描述里必须写明不可逾越的那条界线');
});

test('⑤负控：空 text / 空 key 一律不录入（工具自己也要挡一道）', () => {
  const i = SRC.indexOf("'mpm_principal'");
  const body = SRC.slice(i, i + 3000);
  assert.match(body, /if\s*\(!r\.entry\)\s*return\s*\{\s*ok:\s*false/, '必须显式返回失败，而不是默默写一条空条目');
});
