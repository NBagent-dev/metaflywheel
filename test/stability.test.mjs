// MetaFlywheel 稳定性测试：不是"跑一遍能过"，而是"反复跑、坏条件跑、跨重启跑都不炸"。
// 运行：node --test test/stability.test.mjs
//
// 与 smoke.test.mjs 的两处关键差别（都不是风格问题）：
//   ① **fs 契约忠实**：resolve() 返回不透明 `{targetKey, displayPath}`（不是路径字符串），
//      writeText() 返回 `{operation, version, before, after}`，另有 listDir()。
//      ★来历（2026-10-10 实测）：引擎曾经假设 resolve() 返回路径，于是"原子写/备份/对账"
//      三条判据在生产里从未执行，而测试全绿——因为**桩由实现者写，把错误假设又确认了一遍**。
//      本文件把契约写成文档里的样子，让错误假设在测试环境里**不可表达**。
//   ② **有沉积根**：mock 宿主给出 workspaceRoot（同步数组 registry）。旧 mock 没有根，
//      persist() 恒返回失败 ⇒ **持久化路径从未被仓库测试覆盖过**。
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = 'C:/mf-test-ws';

// ── 契约忠实的 mock 宿主 ─────────────────────────────────────────────
function makeHost(opts) {
  opts = opts || {};
  const files = new Map();       // targetKey → content
  const registered = [];
  const provided = {};
  let seq = 0;
  const T = (p) => ({ targetKey: 'ws://root' + p, displayPath: p });   // 不可当路径用

  const fsSvc = {
    resolve: async (p) => T(String(p).replace(/^.*?(?=\/\.mpm)/, '')),
    readText: async (t) => {
      if (opts.readFails) throw new Error('EIO: injected read failure');
      if (!files.has(t.targetKey)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return files.get(t.targetKey);
    },
    writeText: async (t, content) => {
      if (opts.writeFails) throw new Error('EACCES: sandbox mode is read-only');
      const prev = files.get(t.targetKey);
      files.set(t.targetKey, String(content));
      seq += 1;
      return { operation: prev === undefined ? 'create' : 'update', version: 'v' + seq, before: prev === undefined ? null : prev, after: String(content) };
    },
    listDir: async () => (opts.dirEntries || []).slice()
  };

  const ctx = {
    systemPrompt: { context: () => {}, section: () => {} },
    tools: { register: (t) => registered.push(t), guard: (fn) => fn },
    fs: fsSvc,
    // ★关键：同步数组 + workspaceRoot —— 否则引擎走"内存模式"，持久化路径整条不被覆盖
    workspaceRegistry: { list: () => [{ path: ROOT }] },
    sandboxPolicy: { mode: 'test', workspaceRoot: ROOT },
    get: function (name) {
      if (name === 'fs') return fsSvc;
      if (name === 'tools') return this.tools;
      if (name === 'agents') return { list: () => [] };
      if (name === 'workspaceRegistry') return this.workspaceRegistry;
      if (name === 'sandboxPolicy') return this.sandboxPolicy;
      return undefined;                       // 其余服务缺失 ⇒ 引擎必须走降级链而不是炸
    },
    on: () => () => {},
    effect: (fn) => { try { fn(); } catch (e) {} return () => {}; },
    provide: (n, svc) => { provided[n] = svc; },
    timeout: () => () => {},                  // 不真调度巡检
    interval: () => () => {}
  };
  return { ctx, registered, provided, files, fsSvc };
}

async function mount(host) {
  const mod = await import('../engine/host.js');
  mod.apply(host.ctx);
  return mod;
}
function tool(host, name) {
  const t = host.registered.find((x) => x && x.name === name);
  assert.ok(t, 'tool not registered: ' + name);
  return t;
}
async function call(host, name, args) {
  // 任何工具调用都不许把异常抛到调用方（宿主只期待 {ok:false, report}）
  return await tool(host, name).execute(args || {}, { agentId: 'stability-agent', agent: { id: 'stability-agent', meta: { cwd: ROOT } } });
}
function ledger(host) {
  const key = 'ws://root/.mpm/flywheel.json';
  const raw = host.files.get(key);
  return raw ? JSON.parse(raw) : null;
}
// ── 不变量：每次调用后都要成立 ───────────────────────────────────────
function invariants(host, where) {
  const st = ledger(host);
  if (!st) return;                       // 尚未落盘（例如全是只读调用）
  const STAGES = ['G', 'F', 'S', 'C', 'D', 'E'];
  const seenSed = new Set();
  for (const id of Object.keys(st.problems || {})) {
    const p = st.problems[id];
    assert.ok(STAGES.includes(p.stage), where + '：非法 stage ' + p.stage + ' @' + id);
    for (const k of ['delta', 'epsilon']) {
      const v = p[k];
      assert.ok(v == null || (typeof v === 'number' && v >= 0 && v <= 1), where + '：' + k + ' 越界 ' + v + ' @' + id);
    }
    assert.ok(typeof p.cost === 'number' && p.cost >= 0, where + '：cost 非法 @' + id);
    assert.ok(typeof p.iteration === 'number' && p.iteration >= 0, where + '：iteration 非法 @' + id);
  }
  for (const s of st.sediments || []) {
    assert.ok(!seenSed.has(s.id), where + '：沉积 ID 重复 ' + s.id);
    seenSed.add(s.id);
    assert.match(String(s.id), /^P\d+-M\d+$/, where + '：沉积 ID 形状非法 ' + s.id);
    assert.ok((s.cites || 0) >= 0, where + '：cites 非法');
  }
  assert.ok(Array.isArray(st.sediments), where + '：sediments 不是数组');
}

// ── A. 非法输入不得炸：12 个工具逐个用空参数调用 ────────────────────
test('稳定性·非法输入：所有工具在缺参数/错参数下必须返回 ok:false 而不是抛异常', async () => {
  const host = makeHost(); await mount(host);
  // 写入类：空参数必须拒绝；查询类：空参数必须应答（ok:true 且有报告）。
  // ★这里一开始把"所有工具空参数都必须 ok:false"当成判据，是**测试的假设错了**——
  //   mpm_flywheel_state 是只读查询，空参数正常返回统计。判据要把两类分开。
  const WRITE_TOOLS = ['mpm_generate', 'mpm_frame', 'mpm_solve', 'mpm_converge', 'mpm_deposit', 'mpm_evoke',
    'mpm_micro', 'mpm_setroot', 'mpm_grant', 'mpm_narrate',
    // ★P517：录入委托人的思考方式（写入类）。空参必须拒绝——**这是"我替他记东西"的唯一入口**，
    //   最不能允许它悄悄写一条空条目。登记它同时也是本条判据的用途：新增工具必须在这里露一次面。
    'mpm_principal',
    // ★P591：沉积的「被取代」（写入类）——空参必须拒绝：它要改的是**已固化的判断**，
    //   最不能允许"什么都没说"就动一条沉积的状态。登记它也是本条判据的用途所在。
    'mpm_supersede'];
  // ★P517③：未核清单——**空参=list（只读查询）**，与 mpm_rhythm 空参=show 同类；
  //   写入路径（add/resolve）缺参时由工具自身返回 ok:false，已由 unknowns.test.mjs 覆盖。
  // ★P519：回流——空参=list（只读查询）；dispose 缺 myAction 时由工具自身返回 ok:false，已由 hits.test.mjs 覆盖。
  // ★P526：采用——空参=list（只读查询）；add 缺件时由工具自身返回 ok:false，已由 adopt.test.mjs 覆盖。
  const QUERY_TOOLS = ['mpm_flywheel_state', 'mpm_rhythm', 'mpm_unknown', 'mpm_hit', 'mpm_adopt'];
  const names = host.registered.map((t) => t.name);
  for (const n of WRITE_TOOLS.concat(QUERY_TOOLS)) assert.ok(names.includes(n), '工具缺失：' + n);
  assert.equal(names.length, WRITE_TOOLS.length + QUERY_TOOLS.length,
    '工具数量与预期不符 ⇒ **新增工具必须在这里登记**，并确认它空参/错参的行为（这是它被立的目的）：实得 ' + names.join(','));

  for (const n of WRITE_TOOLS) {
    const r = await call(host, n, {});                       // 空参数
    assert.ok(r && typeof r === 'object', n + '：应返回对象');
    assert.equal(r.ok, false, n + '：空参数必须 ok:false，实得 ' + JSON.stringify(r).slice(0, 120));
  }
  for (const n of QUERY_TOOLS) {
    const r = await call(host, n, {});
    assert.equal(r.ok, true, n + '：只读查询空参数应正常应答');
    assert.ok(String(r.report || '').length > 0, n + '：查询必须有报告');
  }
  for (const n of WRITE_TOOLS) {                              // 查询类不吃参数，故只查写入类
    const r2 = await call(host, n, { problemId: 'P999999', title: 1, delta: 'x', epsilon: 99, robustness: 'x', action: 1, path: 1, text: 1, sedimentId: 'NOPE', friction: 1, statement: 1, observation: 1 });
    assert.ok(r2 && typeof r2 === 'object', n + '：错参数应返回对象');
    assert.notEqual(r2.ok, true, n + '：错参数不该 ok:true');
  }
});

// ── B. 浸泡：随机调用序列 + 每次调用后校验不变量 ────────────────────
test('稳定性·浸泡：200 次随机调用后，账本仍可解析且不变量全部成立', async () => {
  const host = makeHost(); await mount(host);
  let seed = 20261010;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const created = [];
  let calls = 0, errs = 0;

  for (let i = 0; i < 200; i++) {
    const roll = rnd();
    let r;
    try {
      if (roll < 0.20) { r = await call(host, 'mpm_generate', { title: '浸泡题' + i, observation: '随机 ' + i }); if (r.id) created.push(r.id); }
      else if (roll < 0.45 && created.length) { r = await call(host, 'mpm_solve', { problemId: pick(created), action: '随机推进 ' + i, epsilon: Math.min(0.95, rnd()) }); }
      else if (roll < 0.60 && created.length) { r = await call(host, 'mpm_frame', { problemId: pick(created), delta: rnd(), statement: '【初始状态】a；【目标状态】b；【约束】c；【可用算子】d；【成功判据】e' }); }
      else if (roll < 0.72 && created.length) { r = await call(host, 'mpm_converge', { problemId: pick(created), delta: rnd(), epsilon: rnd(), robustness: pick(['pass', 'fail']), notes: '浸泡' }); }
      else if (roll < 0.80) { r = await call(host, 'mpm_micro', { title: '微' + i, statement: '初始=a；目标=b；约束=c；算子=d；判据=e', action: 'x', delta: 0.3, epsilon: 0.3, robustness: 'pass' }); }
      else if (roll < 0.86) { r = await call(host, 'mpm_flywheel_state', {}); }
      else if (roll < 0.92) { r = await call(host, 'mpm_narrate', { text: '浸泡叙述 ' + i }); }
      else if (roll < 0.96) { r = await call(host, 'mpm_setroot', { path: ROOT + '/sub' + (i % 3) }); }
      else { r = await call(host, 'mpm_grant', { action: pick(['status', 'grant']) }); }
    } catch (e) { errs += 1; assert.fail('第 ' + i + ' 次调用抛异常：' + (e && e.message)); }
    calls += 1;
    assert.ok(r && typeof r === 'object', '第 ' + i + ' 次调用应返回对象');
    invariants(host, '第 ' + i + ' 次调用后');
  }
  const st = ledger(host);
  const size = (host.files.get('ws://root/.mpm/flywheel.json') || '').length;
  console.log('    调用 ' + calls + ' 次 · 异常 ' + errs + ' · 题 ' + Object.keys(st.problems).length + ' · 沉积 ' + st.sediments.length + ' · 账本 ' + size + ' 字符');
  assert.equal(errs, 0, '浸泡期间不得有异常');
  assert.ok(size < 2_000_000, '账本不应病态膨胀，实得 ' + size + ' 字符');
});

// ── C. 故障注入：写读失败都必须"可见地失败"，且不炸 ─────────────────
test('稳定性·故障注入：写失败/读失败下，工具不抛异常且报告明说未落盘', async () => {
  for (const kind of ['writeFails', 'readFails']) {
    const host = makeHost({ [kind]: true }); await mount(host);
    const g = await call(host, 'mpm_generate', { title: '故障题', observation: 'x' });
    assert.ok(g && typeof g === 'object', kind + '：应返回对象');
    const rep = String(g.report || '');
    if (kind === 'writeFails') {
      // ★落盘结论必须出现在报告里（P487① / P488）：失败时不许沉默，也不许说"已落盘"
      assert.ok(rep.includes('未落盘') || rep.includes('账本'), kind + '：报告应交代落盘结论，实得 ' + JSON.stringify(rep.slice(-160)));
      assert.ok(!rep.includes('账本已落盘'), kind + '：写失败时不得声称已落盘');
    }
    invariants(host, kind + ' 之后');
  }
});

// ── D. 冷启动往返：新实例必须从同一份账本恢复（个体连续性的最小检验）──
test('稳定性·冷启动：第二个实例从同一份账本恢复出题与沉积', async () => {
  const h1 = makeHost(); await mount(h1);
  const g = await call(h1, 'mpm_generate', { title: '往返题', observation: '跨实例' });
  await call(h1, 'mpm_frame', { problemId: g.id, delta: 0.2, statement: '【初始状态】a；【目标状态】b；【约束】c；【可用算子】d；【成功判据】e' });
  await call(h1, 'mpm_solve', { problemId: g.id, action: '推进', epsilon: 0.2 });
  await call(h1, 'mpm_converge', { problemId: g.id, delta: 0.15, epsilon: 0.1, robustness: 'pass', notes: 'x' });
  const dep = await call(h1, 'mpm_deposit', { problemId: g.id, title: '往返沉积', body: '跨实例正文', links: 'none', linkReason: '稳定性测试：本题无前身' });
  assert.equal(dep.ok, true, JSON.stringify(dep));
  const before = ledger(h1);
  assert.ok(before && before.sediments.length >= 1, '第一个实例应写出沉积');

  // 新实例：同一份文件内容，全新的 ctx 与对象图
  const h2 = makeHost();
  for (const [k, v] of h1.files) h2.files.set(k, v);
  await mount(h2);
  const st = await call(h2, 'mpm_flywheel_state', {});
  const back = ledger(h2);
  assert.ok(back, '第二个实例应已加载账本');
  assert.ok(Object.keys(back.problems).length >= 1, '恢复后应看得见题');
  assert.ok(back.sediments.length >= 1, '恢复后应看得见沉积');
  assert.ok(String(st.report || '').length > 0, 'flywheel_state 应有报告');
  invariants(h2, '冷启动后');
});

// ── E. 重复挂载：同一宿主上多次 apply 不得炸 ────────────────────────
test('稳定性·重复挂载：同一 ctx 上连续 apply 三次不抛异常', async () => {
  const host = makeHost();
  const mod = await import('../engine/host.js');
  for (let i = 0; i < 3; i++) {
    assert.doesNotThrow(() => mod.apply(host.ctx), '第 ' + (i + 1) + ' 次 apply 抛异常');
  }
  const r = await call(host, 'mpm_micro', { title: '重复挂载', statement: '初始=a；目标=b；约束=c；算子=d；判据=e', action: 'x', delta: 0.3, epsilon: 0.2, robustness: 'pass' });
  assert.ok(r && typeof r === 'object');
  invariants(host, '重复挂载后');
});
