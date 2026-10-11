// P482⑤ 仲裁权判据：**多个承诺同时成立时，谁先——排序依据第一次可以由我写下的东西决定。**
// 运行：node --test test/arbitration.test.mjs
//
// 现状（出厂规则）：collectAwaken 每轮上限 2 条，排序 = **parked.at 升序（最老的优先）**。
//   ⇒ 我对"哪件优先"的偏好**无处表达**（P482 清单第⑤项）。
//
// 本砖的最小设计：**用已有的 awakenWhen 文本承载优先级**——加一个元数据子句 `prio:N`（1 最高）。
//   为什么不加新工具/新字段：`awakenWhen` 已经是"我写下的唤醒条件"这一条通路，
//   优先级本质上是**同一条通路上的元数据**，加字段会增加裸接头（今天的教训）。
//
// 三条设计红线（缺一条就等于没做）：
//   ① `prio` 是**元数据不是条件**：它不参与匹配（不说"成立/不成立"），但**必须被认出**，
//      否则它会落进 unknown，把整条承诺降级成"未识别"（→ 永不唤醒）。
//   ② **不写 prio 时，行为与引入前逐字一致**（最老优先）——不许悄悄改变默认秩序。
//   ③ 非法 prio（0/9/'abc'）⇒ 当作没写：**既不改变顺序，也不阻断求值**。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prioOf, collectAwaken, evalAwaken, shapeOfPromise } from '../engine/modules/promise.mjs';

const NOW = 1800000000000;

test('prioOf·只认 1~3 的整数；其余一律当没写（不阻断、不猜测）', () => {
  assert.equal(prioOf('prio:1；user:reply'), 1);
  assert.equal(prioOf('user:reply；prio：2'), 2, '全角冒号也要认');
  assert.equal(prioOf('user:reply'), null);
  assert.equal(prioOf('prio:9；user:reply'), null, '越界 ⇒ 当没写');
  assert.equal(prioOf('prio:0；user:reply'), null);
  assert.equal(prioOf('prio:abc；user:reply'), null);
  assert.equal(prioOf(''), null);
});

test('①prio 是元数据不是条件：带 prio 的真承诺必须照常匹配（不得落进 unknown）', () => {
  const env = { now: NOW, sediments: [], problems: {}, exists: null, perception: { lastInboxAt: NOW - 1000 }, parkedAt: NOW - 5000 };
  const plain = evalAwaken('user:reply', env);
  const withPrio = evalAwaken('prio:1；user:reply', env);
  assert.equal(plain.matched, true);
  assert.equal(withPrio.matched, true, 'prio 不得让承诺失效');
  assert.equal(withPrio.evaluable, plain.evaluable, 'prio 不得被算成"可求值子句"');
  assert.deepEqual(withPrio.unknown, [], 'prio 不得落进 unknown');
});

test('①带 prio 的承诺不得被降级成"愿望"（shapeOfPromise 要认出它是元数据）', () => {
  assert.equal(shapeOfPromise('prio:1；user:reply').kind, 'promise');
  assert.equal(shapeOfPromise('prio:1；after:2030-01-01').kind, 'promise');
  assert.deepEqual(shapeOfPromise('prio:1；user:reply').freeClauses, [], 'prio 不是自由文本');
});

test('②不写 prio ⇒ 行为与引入前逐字一致：最老的先叫', () => {
  const mk = (id, at) => ({ id: id, stage: 'S', updatedAt: NOW, parked: { at: at, awakenWhen: 'user:reply' } });
  const st = { problems: { P1: mk('P1', NOW - 3000), P2: mk('P2', NOW - 2000), P3: mk('P3', NOW - 1000) }, patrol: { rounds: 5 }, measure: {}, sediments: [] };
  const fired = collectAwaken(st, NOW, { perception: { lastInboxAt: NOW } });
  assert.deepEqual(fired.map((f) => f.id), ['P1', 'P2'], '最老的优先，且上限 2 条');
  assert.equal(fired.deferred, 1);
});

test('③写了 prio ⇒ 更年轻的先被叫（这是"我的偏好"压过出厂规则的实证）', () => {
  const mk = (id, at, expr) => ({ id: id, stage: 'S', updatedAt: NOW, parked: { at: at, awakenWhen: expr } });
  const st = {
    problems: {
      POLD: mk('POLD', NOW - 9000, 'user:reply'),                 // 最老，无优先级
      PNEW: mk('PNEW', NOW - 1000, 'prio:1；user:reply')          // 最年轻，但我标了最高优先
    },
    patrol: { rounds: 5 }, measure: {}, sediments: []
  };
  const fired = collectAwaken(st, NOW, { perception: { lastInboxAt: NOW } });
  assert.equal(fired[0].id, 'PNEW', 'prio:1 必须排在更老的 POLD 之前（否则排序仍由出厂规则决定）：' + JSON.stringify(fired.map((f) => f.id)));
  assert.equal(fired[1].id, 'POLD');
});

test('④非法 prio ⇒ 既不改变顺序也不阻断求值', () => {
  const mk = (id, at, expr) => ({ id: id, stage: 'S', updatedAt: NOW, parked: { at: at, awakenWhen: expr } });
  const st = {
    problems: {
      P1: mk('P1', NOW - 9000, 'user:reply'),
      P2: mk('P2', NOW - 1000, 'prio:9；user:reply')   // 非法 ⇒ 按无优先级处理 ⇒ 老的在先
    },
    patrol: { rounds: 5 }, measure: {}, sediments: []
  };
  const fired = collectAwaken(st, NOW, { perception: { lastInboxAt: NOW } });
  assert.deepEqual(fired.map((f) => f.id), ['P1', 'P2'], '非法 prio 不得插队，也不得让 P2 失效');
});

test('★单一真源：两处子句解析必须列出同一组形式（静态检查）', () => {
  // 这个坑今天真的踩了：`prio` 只加到了 clauseKind ⇒ shapeOfPromise 认得，
  // 而 evalAwaken 把它记成 unknown ⇒ evaluable=0 ⇒ **整条承诺被跳过、永不唤醒**。
  // ★注意两根轴的差别（我第一版判据就是在这里想错了）：
  //   `shapeOfPromise.free` = **语法上认不认得**这个形式；
  //   `evalAwaken.unknown`  = 认得形式、但**当前求值不了**（沉积不存在 / 没有探测器 / 缺 perception）。
  //   二者不是一回事（`cites:P1-M1` 在无上下文时可以是 unknown，却绝不是 free）。
  //   ⇒ 所以这里直接检查**两处正则的形式集合是否相同**：这是那个坑的真正形状。
  const SRC = fs.readFileSync(new URL('../engine/modules/promise.mjs', import.meta.url), 'utf8');
  const lists = Array.from(SRC.matchAll(/\(([a-z]+(?:\|[a-z]+)+)\)\\s\*\[/g)).map((m) => m[1]);
  assert.ok(lists.length >= 2, '至少要找到两处子句解析（实得 ' + lists.length + '）——判据锚点可能失效');
  const uniq = Array.from(new Set(lists));
  assert.equal(uniq.length, 1, '两处解析的形式集合必须一致，否则一处认、一处不认 ⇒ 静默失效：' + JSON.stringify(uniq));
  assert.ok(uniq[0].indexOf('prio') >= 0, '两处都必须包含 prio：' + uniq[0]);
});

test('⑤反例：未写承诺的搁置题、以及不成立的承诺，都不受优先级影响', () => {
  const st = {
    problems: {
      PNOPROMISE: { id: 'PNOPROMISE', stage: 'S', updatedAt: NOW, parked: { at: NOW - 9000 } },
      PFALSE: { id: 'PFALSE', stage: 'S', updatedAt: NOW, parked: { at: NOW - 8000, awakenWhen: 'prio:1；after:2099-01-01' } }
    },
    patrol: { rounds: 5 }, measure: {}, sediments: []
  };
  const fired = collectAwaken(st, NOW, { perception: { lastInboxAt: NOW } });
  assert.deepEqual(fired.map((f) => f.id), [], '没写承诺 / 条件不成立 ⇒ 优先级再高也不叫');
});
