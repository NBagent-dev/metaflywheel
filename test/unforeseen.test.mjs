// P554 第 ② 项判据：类型账（未预见后果的类型分布）
// 运行：node --test test/unforeseen.test.mjs
//
// ★ 这个模块成立的三条条件（P553-M465 给的）：
//   ① 记【类型分布】不记【数量】——数量必然 >0 ⇒ 无信息
//   ② 退化形态是【类型固定】，不是"数量少"
//   ③ `isOldType` 必须在【记录时固化】，不能在读取时重算（否则恒真）
// ★ 以及两条防"假停/漏停"的边界（A7 的教训）：
//   ④ 空数据不许报"停"（没有记录 ≠ 停止了长）
//   ⑤ 样本不足 N 条不许判（"刚开始"不许被读成"长停了"）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { typeLedger, ledgerLine } from '../engine/modules/unforeseen.mjs';

const DATA = 'C:/Users/Administrator/Desktop/daima/XIN/.mpm/unforeseen.json';
const load = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const mk = (cat, isOld) => ({ at: 1, what: 'x', category: cat, isOldType: isOld });

test('① 真实数据：13 条、7 类，且类型按首次出现顺序排列', () => {
  const d = load();
  assert.ok(Array.isArray(d.entries), 'unforeseen.json 必须有 entries');
  const t = typeLedger(d.entries);
  assert.equal(t.total, 13, '★ 13 条真实样本（今天实际发生的，不是编的）');
  assert.equal(t.categoryCount, 7, '★ 7 类');
  assert.ok(t.categories.length === 7);
  // 首次出现顺序必须稳定（顺序本身携带信息：先长出来的是什么）
  assert.equal(t.categories[0], '字段名假设');
  assert.equal(t.categories[1], '路径形态假设');
});

test('② 真实数据的现状：类型还在变 ⇒ 不报"长停"', () => {
  const t = typeLedger(load().entries);
  assert.equal(t.stalled, false, '★ 今天类型一直在变，绝不许报停');
  assert.ok(t.recentNew > 0, '最近 5 条里应有新类型，实测 recentNew=' + t.recentNew);
});

test('③ 注入"最近 N 条全是旧类型" ⇒ 必须报停（这是它的红灯）', () => {
  const d = load();
  const broken = d.entries.concat([mk('字段名假设', true), mk('字段名假设', true), mk('路径形态假设', true), mk('shell 转义', true), mk('判据边界', true)]);
  const t = typeLedger(broken);
  assert.equal(t.stalled, true, '★ 最近 5 条全旧类型 ⇒ 必须红，否则这个账是装饰');
  assert.ok(ledgerLine(broken).includes('长停了'));
});

test('④ 负控：最近 N 条里有【一个】新类型 ⇒ 不许报停（不许恒真）', () => {
  const d = load();
  const mixed = d.entries.concat([mk('字段名假设', true), mk('字段名假设', true), mk('字段名假设', true), mk('字段名假设', true), mk('全新的一个类型', false)]);
  const t = typeLedger(mixed);
  assert.equal(t.stalled, false, '★ 只要还有一个新类型，就不算停');
  assert.equal(t.recentNew, 1);
});

test('⑤ 空数据：不许报"停"，但必须说出来（不许静默）', () => {
  assert.equal(typeLedger([]).stalled, false, '★ 没有记录 ≠ 停止了长');
  const line = ledgerLine([]);
  assert.ok(line.length > 0, '★ 空数据时也必须输出一行（A7 的教训：沉默会被读成一切正常）');
  assert.ok(/从未记录/.test(line), '必须显式说"从未记录"');
  assert.ok(!/长停了/.test(line), '★ 不许把"没数据"说成"长停了"');
});

test('⑥ 样本不足 N 条 ⇒ 不判（"刚开始"不许被读成"长停了"）', () => {
  const few = [mk('甲', true), mk('甲', true)];  // 只有 2 条，而 recentN 默认 5
  const t = typeLedger(few);
  assert.equal(t.enoughSample, false);
  assert.equal(t.stalled, false, '★ 样本不足时不许报停');
  assert.ok(/样本不足/.test(ledgerLine(few)), '必须说明"样本不足，暂不判"');
});

test('⑦ isOldType 必须由数据携带（读取时不许重算）—— 契约判据', () => {
  const d = load();
  // ★ 若读取时重算（用现在的全部类型），那么"历史上第一条"也会被算成旧类型 ⇒ 恒真
  //   所以：每条必须【自带】isOldType 字段；且历史上至少有一条 false
  const withField = d.entries.filter(e => typeof e.isOldType === 'boolean');
  assert.equal(withField.length, d.entries.length, '★ 每条都必须自带 isOldType（记录时固化）');
  const news = d.entries.filter(e => e.isOldType === false);
  assert.ok(news.length >= 5, '★ 历史上必须有多条"当时是新类型"的记录，否则分不清"当时是否新"');
  // 且第一条必然是"新类型"（第一个类型在定义上不可能是旧的）
  assert.equal(d.entries[0].isOldType, false, '★ 第一条必然是 false——如果它是 true，说明这个字段是重算出来的');
});
