// MetaFlywheel 账本判据：落盘必须"不可丢"，而不是"看起来成功"。
// 运行：node --test test/ledger.test.mjs
//
// 来历（2026-10-10 一晚上的两次翻车，判据就是这么长出来的）：
//   P327：persist 把异常吞掉后 return undefined ⇒ 六个调用方无从判断 ⇒ "报成功"成了默认行为。
//   P487：调用点丢掉返回值、报告里却无条件写"可索引(flywheel.json)"。
//   P488：按"resolve() 返回路径"写的原子写/备份/对账**在生产里从未执行**——
//        真实契约是 `FsTarget{targetKey, displayPath}` 不透明对象，文档明写
//        "Consumers MUST NOT parse it or assume it is a local absolute path"。
//        ★而当时的测试桩写成 `resolve: async p => p`，**把我的错误假设又确认了一遍**。
//   ⇒ 所以本文件的桩严格照契约写：targetKey 是不可当路径用的 `ws://…`，
//     任何回归到"把 target 当路径用"的代码在这里会立刻炸。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStateMachine, reconcileDeposits, persistNote } from '../engine/modules/state.mjs';

const ROOT = 'C:/mf-ledger-ws';
const STATE = '/.mpm/flywheel.json';
const key = (p) => 'ws://root' + p;

function makeFs(opts) {
  opts = opts || {};
  const store = new Map();
  const dirs = new Map();
  let seq = 0;
  const T = (p) => ({ targetKey: 'ws://root' + p, displayPath: p });
  return {
    store, dirs, T,
    fsSvc: {
      resolve: async (p) => T(String(p).replace(/^.*?(?=\/\.mpm)/, '')),
      readText: async (t) => { if (!store.has(t.targetKey)) throw new Error('FS_NOT_FOUND'); return store.get(t.targetKey); },
      writeText: async (t, content) => {
        if (opts.writeFails) throw new Error('EACCES: sandbox mode is read-only');
        const prev = store.get(t.targetKey);
        store.set(t.targetKey, opts.corruptAfter ? String(content) + '  ' : String(content));
        seq += 1;
        return { operation: prev === undefined ? 'create' : 'update', version: 'v' + seq, before: prev === undefined ? null : prev, after: store.get(t.targetKey) };
      },
      listDir: async (t) => dirs.get(t.targetKey) || []
    }
  };
}
function deps(fs, root) {
  return {
    fsSvc: fs.fsSvc, root: { current: root }, policy: { workspaceRoot: root },
    state: {
      seq: 1, problems: {}, sediments: [], patrol: { rounds: 0, lastAt: 0, lastReport: '' },
      measure: { samples: [], driftSignals: [] },
      constitution: { autonomy: true, grantedAt: 0, log: [], lastFireAt: 0 },
      valence: { events: [] }, narrations: []
    },
    bumpSnapRev: () => {}, gainOf: () => 0, adopted: {}, diag: {},
    ctx: { get: () => undefined, on: () => () => {}, timeout: () => {}, interval: () => {} }
  };
}
const sm = (fs) => makeStateMachine(deps(fs, ROOT));

test('账本·落盘走服务契约：mode 必须标明走的是服务原子路径', async () => {
  const fs = makeFs();
  const pr = await sm(fs).persist();
  assert.equal(pr.ok, true, JSON.stringify(pr));
  assert.equal(pr.mode, 'service-atomic', 'mode 必须区分"走了服务"与"退化成直写"');
  assert.equal(pr.verify, true, '回读等价校验（服务返回的 after === 写出内容）');
  assert.ok(typeof fs.store.get(key(STATE)) === 'string' && fs.store.get(key(STATE)).includes('"seq"'), '内容应进服务存储');
});

test('账本·备份取写前内容，且只有一个槽位（服务没有删除 API）', async () => {
  const fs = makeFs();
  await sm(fs).persist();
  fs.store.set(key(STATE), JSON.stringify({ seq: 111, marker: '第一版' }));
  const second = await sm(fs).persist();
  const bak = fs.store.get(key(STATE + '.bak'));
  assert.ok(typeof bak === 'string' && bak.includes('第一版'), '备份内容应为上一版，实得 ' + String(bak).slice(0, 60));
  assert.equal([...fs.store.keys()].filter((k) => k.includes('.bak')).length, 1, '备份只能有一个槽位，否则无限增长');
  assert.ok(String(second.backup).includes('字符'), '注记要如实标量纲（字符，不是字节）');
});

test('账本·负控：写必失败时不得"看起来成功"', async () => {
  const fs = makeFs({ writeFails: true });
  const pr = await sm(fs).persist();
  assert.equal(pr.ok, false);
  assert.ok(typeof pr.reason === 'string' && pr.reason.length > 0, '必须带可读原因');
  const note = persistNote(pr);
  assert.ok(note.includes('未落盘'), '工具报告尾注必须明说未落盘：' + note);
  assert.ok(!note.includes('已落盘'), '失败时不得出现"已落盘"');
});

test('账本·回读不一致必须判失败（服务说写了，但内容不是我要的）', async () => {
  const fs = makeFs({ corruptAfter: true });
  const pr = await sm(fs).persist();
  assert.equal(pr.ok, false, JSON.stringify(pr));
});

test('账本·启动对账走 listDir：孤儿与幽灵各报一条，目录项不计', async () => {
  const fs = makeFs();
  fs.dirs.set(key('/.mpm/deposits'), [
    { name: 'ORPHAN-x.md', type: 'file', target: fs.T('/.mpm/deposits/ORPHAN-x.md') },
    { name: 'KNOWN-y.md', type: 'file', target: fs.T('/.mpm/deposits/KNOWN-y.md') },
    { name: 'sub', type: 'directory', target: fs.T('/.mpm/deposits/sub') }
  ]);
  const e = deps(fs, ROOT);
  e.state.sediments = [
    { id: 'P1-M1', path: ROOT + '/.mpm/deposits/KNOWN-y.md' },
    { id: 'P2-M2', path: ROOT + '/.mpm/deposits/GHOST-z.md' }
  ];
  const out = await reconcileDeposits(e);
  assert.equal(out.mode, 'ok', 'mode=ok 说明确实走了 listDir');
  assert.deepEqual(out.orphans, ['ORPHAN-x.md']);
  assert.equal(out.ghosts.length, 1);
  assert.ok(out.ghosts[0].startsWith('P2-M2'));
  assert.ok(e.state.measure.reconcile, '结论应进 state.measure（随账本落盘）');
});
