// P592 判据：**退役的沉积必须退出「注入」与「检索」，但不许消失。**
//
// ★ 为什么这三条要一起写：
//   ① 只测"退役的不出现" ⇒ 一个把库房清空的实现也能通过（所以要有 ③ 负控）；
//   ② 只测"检索结果" ⇒ 漏掉**缓存**：`sedimentCacheGet` 的 key 原来只看
//      「长度 + 末条 id」，而"某条被标记退役"不改变这两者 ⇒ 标记之后仍返回旧缓存，
//      于是退役**在检索里看起来没有发生**。（P539 同族：key 少一个维度）
//   ③ 只测"不出现" ⇒ 漏掉"退休 ≠ 删除"：数组里必须仍然是两条。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sedimentCacheGet, retrieveTop } from '../engine/modules/retrieval.mjs';

const mk = (id, title, extra) => Object.assign({ id: id, title: title, tags: [], depositedAt: Date.now(), cites: 0 }, extra || {});

// ★语料里必须放"填充物"：retrieveTop 会丢掉 DF>40% 的 gram（领域通用词过滤）。
//   在 2 条的语料里，任何共享 gram 的 DF 都是 100% ⇒ 全被过滤 ⇒ eff=0 ⇒ 谁都不命中。
//   （这正是 P079 那条"判据的断言范围不许大于夹具的控制范围"）
const fillers = () => {
  const out = [];
  for (let i = 0; i < 10; i++) out.push(mk('F' + i, 'zz' + i + 'qq' + (i * 7)));
  return out;
};

test('① 退役的沉积不进检索（正控），但仍留在 sediments 数组里（退休 ≠ 删除）', () => {
  const q = '沉积退役状态判据';
  const alive = mk('A1', q);
  const dead = mk('D1', q, { status: 'superseded' });
  const list = fillers().concat([alive, dead]);
  const C = sedimentCacheGet(list);
  const ids = retrieveTop(q, 5, 0.3, C).map(function (h) { return h.ref.id; });
  assert.ok(ids.indexOf('A1') >= 0, '现役的必须被检索到。实得：' + JSON.stringify(ids));
  assert.equal(ids.indexOf('D1'), -1, '已退役的必须不出现在检索结果。实得：' + JSON.stringify(ids));
  assert.equal(list.length, 12, '退休 ≠ 删除：数组里仍是 12 条');
  assert.equal(dead.title, q, '标题不许被改动');
});

test('② ★缓存 key 必须覆盖过滤输入：标记退役后必须重算，不许返回旧缓存', () => {
  const a = mk('B1', '缓存键覆盖测试');
  const b = mk('B2', '缓存键覆盖测试');
  const list = [a, b];
  const C1 = sedimentCacheGet(list);
  assert.equal(C1.total, 2, '两条都现役时 total=2');
  b.status = 'refuted';                     // ← 长度不变、末条 id 不变：旧 key 看不出这个变化
  const C2 = sedimentCacheGet(list);
  assert.notEqual(C2, C1, '状态改了必须得到新的缓存对象（旧 key 只看 长度+末条id）');
  assert.equal(C2.total, 1, '退役一条后 total 必须变 1');
});

test('③ ★负控：没有 status 字段的旧沉积必须仍是现役', () => {
  const legacy = mk('L1', '旧账本没有状态字段的沉积');
  const list = fillers().concat([legacy]);
  const C = sedimentCacheGet(list);
  const ids = retrieveTop('旧账本状态字段沉积', 5, 0.3, C).map(function (h) { return h.ref.id; });
  assert.ok(ids.indexOf('L1') >= 0, '缺 status 的旧记录必须仍可被检索（否则上线即清空库房）。实得：' + JSON.stringify(ids));
});