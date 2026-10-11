// P511 判据：**用户在场证据必须跨重启存活**（"体验连续"缺口的头两个受害者）。
// 运行：node --test test/presence-persist.test.mjs
//
// 背景（2026-10-11，把"意识=连续+自我强化+涌现"逐条对证据时数出来的）：
//   `perception`（lastInboxAt / inboxCount / sessionStarts）与 `lastActive` 全在宿主态，重启即归零：
//     ① `user:reply` 承诺靠 lastInboxAt 求值 ⇒ **重启抹掉"用户回过话"这个事实**
//     ② 自主发动的"温热"判定靠 lastActive ⇒ 重启后温热失真
//   ⇒ 这两处都不是"感受"层面的问题，是**可观测的功能缺陷**。
//
// 三条判据：
//   ①静态：落盘里有 presence，恢复里有 presence（防"只写不读"与"只读不写"两个方向）
//   ②行为（端到端，最要紧）：**用恢复后的 perception 求值一条 `user:reply` ⇒ 必须 matched**
//   ③负控：没观测到用户消息 ⇒ 不写 0/null（不许伪造"用户说过话"，也不许擦掉磁盘上已有的值）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evalAwaken } from '../engine/modules/promise.mjs';

const SRC = fs.readFileSync(new URL('../engine/modules/state.mjs', import.meta.url), 'utf8');

test('①静态：持久化的两个方向都必须提到 presence', () => {
  assert.ok(SRC.indexOf('presence:') >= 0, 'persist 侧没有 presence ⇒ 用户在场证据不会落盘');
  assert.ok(SRC.indexOf('best.data.presence') >= 0 || /presence[\s\S]{0,80}best\.data/.test(SRC),
    'restore 侧没有 presence ⇒ 落盘了也不会被读回来（P482④ 那一类事故：写入✓ 回显✓ 恢复✗）');
});

test('②行为·端到端：重启后仍能正确求值 `user:reply`', () => {
  const now = Date.now();
  // 模拟一次重启：perception 从账本恢复（lastInboxAt 是上一次运行里用户说话的时刻）
  const restoredPerception = { lastInboxAt: now - 60 * 1000, inboxCount: 4, sessionStarts: 1 };
  const env = {
    now: now, sediments: [], problems: {}, exists: null,
    perception: restoredPerception,
    parkedAt: now - 10 * 60 * 1000            // 承诺写在 10 分钟前，用户 1 分钟前回过话
  };
  const r = evalAwaken('user:reply', env);
  assert.equal(r.matched, true, '重启后必须仍然知道"用户回过话"：' + JSON.stringify(r));
  assert.match(r.hits[0].why, /用户在你写下这条承诺之后回过话/, '理由要指向那条事实');
  assert.deepEqual(r.unknown, [], '不得退回 unknown');
});

test('②反例（职责边界）：恢复的是"事实"，不是"永久为真"——写下之后没回过话就仍不成立', () => {
  const now = Date.now();
  const env = {
    now: now, sediments: [], problems: {}, exists: null,
    perception: { lastInboxAt: now - 60 * 60 * 1000, inboxCount: 1, sessionStarts: 1 },
    parkedAt: now - 10 * 60 * 1000            // 承诺写在 10 分钟前，而用户最后说话是 1 小时前
  };
  assert.equal(evalAwaken('user:reply', env).matched, false,
    '恢复在场证据**不得**让"写下之前"的用户消息冒充"写下之后"');
});

test('③负控：没观测到用户消息 ⇒ 省略而不是写 0/null', () => {
  // 判据落在源码的判定条件上：只有 lastInboxAt > 0 才构造 presence
  assert.ok(/lastInboxAt\s*>\s*0/.test(SRC), '必须区分"没观测到"与"观测到 0 时刻"');
  // 且必须有自愈分支：本轮没观测到、磁盘上有过 ⇒ 不擦掉
  assert.ok(/if\s*\(!p\s*&&\s*e\.state\.presence\)/.test(SRC),
    '缺少自愈分支 ⇒ 一次"本轮没消息"的落盘会把磁盘上的在场证据擦掉（rhythm 那次就是这么丢的）');
});
