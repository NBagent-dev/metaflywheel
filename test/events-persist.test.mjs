// P594③ 判据（写路径那一半）：事件日志必须是**有界**且**保留最近的**
//
// ★ 为什么这一半要单独测：`persistImpl` 是全账本覆盖写，改它的风险与改纯函数完全不同。
//   所以先把"读—拼—写"的那个纯函数钉死，再信 persist 里的三行调用。
//
// ★ 三条要钉的性质：
//   ① **有界**：超过 cap 必须丢最旧的（否则每次落盘都在搬越来越大的字符串）；
//   ② **保留最近的**：丢的必须是头部，不是尾部（"刚才那次写盘改了什么"才是问题）；
//   ③ **行尾必须干净**：拼接后每行一个 JSON，不带双换行（否则 parseEvents 会计入坏行）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimEventLines, parseEvents } from '../engine/modules/events-log.mjs';

const line = (i) => JSON.stringify({ at: i, state: { seq: i } });

test('① 有界：超过 cap 必须丢最旧的，且报告丢了几行', () => {
  // ★夹具修正：这里原本每步都用 cap=4 重建，导致 txt 从来没长到 10 行 ——
  //   于是 dropped=1（正确行为）被当成失败。**判据的夹具必须先自证能造出它要的情境**。
  let txt = '';
  for (let i = 1; i <= 10; i++) txt += line(i) + '\n';   // 造满 10 行，不再裁剪
  const r = trimEventLines(txt, line(11), 4);
  assert.equal(r.kept, 4, '必须只剩 cap 行，实得 ' + r.kept);
  assert.equal(r.dropped, 7, '10 行 + 新的 1 行 - 保留 4 = 丢 7 行，实得 ' + r.dropped);
  const parsed = parseEvents(r.text);
  assert.equal(parsed.bad, 0, '拼出来的内容不许有坏行（双换行/缺换行都会变成坏行）');
  assert.deepEqual(parsed.events.map(e => e.at), [8, 9, 10, 11], '留下的必须是**最后** 4 行，实得 ' + JSON.stringify(parsed.events.map(e => e.at)));
});

test('② 空起始 / 空行输入：不许产生前导空行，也不许抛', () => {
  const a = trimEventLines('', line(1), 5);
  assert.equal(a.text, line(1) + '\n');
  assert.equal(a.kept, 1);
  assert.equal(a.dropped, 0);
  const b = trimEventLines('\n\n' + line(1) + '\n\n', line(2), 5);
  assert.equal(parseEvents(b.text).bad, 0, '空行必须被过滤，不许变成"坏行"');
  assert.equal(parseEvents(b.text).events.length, 2);
});

test('③ ★负控：不给 line（只做裁剪）时不许凭空多出一行', () => {
  const txt = [line(1), line(2), line(3)].join('\n') + '\n';
  const r = trimEventLines(txt, '', 2);
  assert.equal(r.kept, 2, '只裁剪时行数必须由 cap 决定');
  assert.deepEqual(parseEvents(r.text).events.map(e => e.at), [2, 3], '只裁剪也必须保留最后 2 行');
  const r2 = trimEventLines(txt, null, 10);
  assert.equal(r2.kept, 3, 'cap 大于现有行数时一行都不许丢');
  assert.equal(r2.dropped, 0);
});
