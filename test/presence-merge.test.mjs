// P511 续：「在场证据」的恢复必须**归并（取 max）**，不许**覆盖**。
// 运行：node --test test/presence-merge.test.mjs
//
// 为什么（**代码结构证据**，不是观测证据）：
//   `ensureLoaded` 是**懒加载**（第一次需要账本时才恢复），而
//   `ctx.on('agent/created')`（events.mjs:165）在**会话创建时同步**就把 sessionStarts +1，
//   消息事件同步把 inboxCount +1 并写 lastInboxAt。
//   ⇒ 真有事件早于首次 ensureLoaded 到达 ⇒ 直接赋值会把**本轮已经发生的事**抹掉。
//   （当时那条 `sessionStarts=1` 的观测是**双重歧义**的：磁盘 1 与事件 1 恰好相同 ⇒
//     覆盖与归并给出同一个数 ⇒ **不能拿它当证据**。）
//
// ★判据设计（P509 纪律）：**调引擎自己的那个函数**，不在测试里复刻。
//   于是——若有人把 max 改回直接赋值 ⇒ 本文件的第 ① 条**必然变红**，无需额外静态检查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePresenceInto } from '../engine/modules/state.mjs';

const fresh = () => ({ lastInboxAt: 0, inboxCount: 0, sessionStarts: 0, lastSessionStartAt: 0 });
const freshActive = () => ({ agentId: '', at: 0 });

test('①归并·事件早于恢复的场景：本轮已经数到的，绝不能被磁盘旧值抹回去', () => {
  const p = fresh();
  // 本轮事件先发生：会话启动 +1、收到 1 条消息
  p.sessionStarts = 1; p.inboxCount = 1; p.lastInboxAt = 2000;
  // 随后懒加载的恢复送来磁盘旧值（上一次运行：0 条消息、1 次会话）
  const pres = { lastInboxAt: 1000, inboxCount: 0, sessionStarts: 1, lastActiveAt: 0 };
  mergePresenceInto(p, freshActive(), pres);
  assert.equal(p.sessionStarts, 1, '两边都是 1 ⇒ 保持 1（覆盖也得到 1，这条不是判别点）');
  assert.equal(p.inboxCount, 1, '★本轮数到的 1 条消息不能被磁盘的 0 抹掉');
  assert.equal(p.lastInboxAt, 2000, '★时间戳取较新的那个');
});

test('①归并·纯补空：本轮什么都没有 ⇒ 取磁盘值（这是"跨重启记得"的那一半）', () => {
  const p = fresh();
  const pres = { lastInboxAt: 9999, inboxCount: 4, sessionStarts: 2, lastActiveAt: 8888, lastActiveAgent: 'a-1' };
  const la = freshActive();
  assert.equal(mergePresenceInto(p, la, pres), true, '发生了合并 ⇒ 返回 true');
  assert.equal(p.lastInboxAt, 9999);
  assert.equal(p.inboxCount, 4);
  assert.equal(p.sessionStarts, 2);
  assert.equal(la.at, 8888);
  assert.equal(la.agentId, 'a-1');
});

test('②反例：agentId 只在为空时补 —— 不许盖掉本轮已知的那个', () => {
  const la = { agentId: 'this-run', at: 0 };
  mergePresenceInto(fresh(), la, { lastActiveAt: 0, lastActiveAgent: 'last-run' });
  assert.equal(la.agentId, 'this-run', '本轮的 agentId 优先（磁盘值只用于补空）');
});

test('③负控：没有磁盘证据 ⇒ 什么都不做，且不许凭空造', () => {
  const p = fresh(), la = freshActive();
  assert.equal(mergePresenceInto(p, la, null), false);
  assert.equal(mergePresenceInto(p, la, undefined), false);
  assert.deepEqual(p, fresh(), '一个字段都不许被写');
  assert.deepEqual(la, freshActive());
});

test('③负控之二：磁盘值是垃圾类型（字符串/null）⇒ 不许污染宿主态', () => {
  const p = fresh(), la = freshActive();
  mergePresenceInto(p, la, { lastInboxAt: 'x', inboxCount: null, sessionStarts: {}, lastActiveAt: 'y', lastActiveAgent: 42 });
  assert.deepEqual(p, fresh(), '类型不对 ⇒ 一律不采信');
  assert.deepEqual(la, freshActive());
});
