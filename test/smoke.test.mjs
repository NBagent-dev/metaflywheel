// MetaFlywheel 冒烟测试：以最小 mock 宿主驱动引擎完整微生命周期。
// 运行：node --test test/smoke.test.mjs
// 不需要 DSH 宿主；fs 为内存实现，不触真实磁盘。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function makeMockCtx() {
  const files = new Map();            // 内存文件系统
  const registered = [];              // 捕获的工具注册
  const events = [];                  // 捕获的事件订阅 [name, handler]
  const effects = [];                 // 捕获的 effect
  const provided = {};                // 捕获的 provide

  const fsSvc = {
    resolve: async (p) => p,
    readText: async (p) => {
      if (!files.has(p)) { const e = new Error('ENOENT: ' + p); e.code = 'ENOENT'; throw e; }
      return files.get(p);
    },
    writeText: async (p, c) => { files.set(p, String(c)); return true; },
  };

  const ctx = {
    // ---- inject 的五个服务 ----
    systemPrompt: {
      context: () => {},
      section: () => {},
    },
    tools: {
      register: (t) => registered.push(t),
      guard: (fn) => fn,               // 引擎用 ctx.effect(() => toolsSvc.guard(...)) 包裹
    },
    fs: fsSvc,
    sandboxPolicy: { mode: 'test' },
    timer: {},
    // ---- 通用宿主面 ----
    get: (name) => {
      if (name === 'fs') return fsSvc;
      if (name === 'tools') return ctx.tools;
      if (name === 'agents') return { list: async () => [] };
      if (name === 'workspaceRegistry') return { list: async () => [] };
      return undefined;                // 其余服务缺失 → 引擎应走降级链
    },
    on: (name, handler) => { events.push([name, handler]); return () => {}; },
    effect: (fn) => { effects.push(fn); try { return fn(); } catch (e) { return () => {}; } },
    provide: (name, svc) => { provided[name] = svc; },
    timeout: () => () => {},           // 不真调度巡检（8s 首巡/20min 循环）
    interval: () => () => {},
  };
  return { ctx, registered, events, provided, files };
}

async function callTool(registered, name, args) {
  // defineTool 测试替身透传定义：{ name, description, parameters, output, execute }
  const t = registered.find((x) => x && x.name === name);
  assert.ok(t, 'tool not registered: ' + name);
  assert.equal(typeof t.execute, 'function', 'execute missing for ' + name);
  return t.execute(args, { agentId: 'test-agent' });
}

test('MetaFlywheel 微生命周期：生成→界定→求解→收敛→沉积→激发', async () => {
  const { ctx, registered, provided } = makeMockCtx();
  const mod = await import('../engine/host.js');
  assert.equal(mod.name, 'mpm-flywheel');
  assert.ok(Array.isArray(mod.inject) && mod.inject.includes('fs'), 'inject 必须声明 fs');
  mod.apply(ctx);

  assert.ok(registered.length >= 9, '至少注册 9 个生命周期工具');
  const names = registered.map((t) => (typeof t === 'string' ? t : t.name || t.tool?.name || t.definition?.name));
  for (const n of ['mpm_generate', 'mpm_frame', 'mpm_solve', 'mpm_converge', 'mpm_deposit', 'mpm_evoke', 'mpm_micro', 'mpm_setroot', 'mpm_grant']) {
    assert.ok(names.includes(n), '缺少工具 ' + n);
  }
  assert.ok(provided.mpmFlywheel, '应 provide mpmFlywheel 服务（快照）');

  // G：生成
  const g = await callTool(registered, 'mpm_generate', { title: '冒烟测试题', observation: 'mock 宿主下的生命周期验证' });
  assert.equal(g.ok, true);
  const pid = g.id;

  // F：界定（五要素）
  const f = await callTool(registered, 'mpm_frame', {
    problemId: pid, delta: 0.2,
    statement: '【初始状态】mock；【目标状态】走通生命周期；【约束】无；【可用算子】工具调用；【成功判据】各阶段 ok',
  });
  assert.equal(f.ok !== false, true, JSON.stringify(f));

  // S：求解登记
  const s = await callTool(registered, 'mpm_solve', { problemId: pid, action: '走通流程', epsilon: 0.2 });
  assert.ok(String(s.report).length > 0);

  // C：收敛（证据门禁因有 solve 登记而放行）
  const c = await callTool(registered, 'mpm_converge', { problemId: pid, delta: 0.15, epsilon: 0.1, robustness: 'pass', notes: 'smoke' });
  assert.ok(String(c.report).includes('完全收敛') || c.ok === true, JSON.stringify(c));

  // D：沉积（落内存盘）
  const d = await callTool(registered, 'mpm_deposit', { problemId: pid, title: '冒烟沉积', body: '生命周期验证沉积物', tags: '["smoke"]' });
  assert.equal(d.ok, true);
  assert.ok(d.sediment && d.sediment.id, '沉积物应有 M 编号');

  // E：激发（外部注入型）
  const ev = await callTool(registered, 'mpm_evoke', { sedimentId: d.sediment.id, friction: 'mock 摩擦', type: 'injection' });
  assert.equal(ev.ok, true);
  assert.ok(String(ev.report).includes('外部注入型'), '激发报告应带类型标注');
  assert.notEqual(ev.id, pid, '激发应产生新问题');
});

test('搁置（parked）与开放题（openEnded）语义', async () => {
  const { ctx, registered } = makeMockCtx();
  const mod = await import('../engine/host.js');
  mod.apply(ctx);

  // parked：登记搁置，报告应带 PARKED 标注（生命周期门禁：先界定才可求解）
  const g = await callTool(registered, 'mpm_generate', { title: '搁置测试', observation: 'x' });
  await callTool(registered, 'mpm_frame', {
    problemId: g.id, delta: 0.2,
    statement: '【初始状态】a；【目标状态】b；【约束】c；【可用算子】d；【成功判据】e',
  });
  const s1 = await callTool(registered, 'mpm_solve', { problemId: g.id, action: '先搁置', parked: true, awakenWhen: '条件满足时' });
  assert.ok(String(s1.report).includes('PARKED'), JSON.stringify(s1));

  // openEnded：标记不收敛情形 → 报告带 OPEN 标注
  const s2 = await callTool(registered, 'mpm_solve', { problemId: g.id, action: '价值不可通约，接受妥协', openEnded: 'negotiated-compromise' });
  assert.ok(String(s2.report).includes('OPEN(negotiated-compromise)'), JSON.stringify(s2));

  // 开放题守卫：converge 应被拒绝
  const c = await callTool(registered, 'mpm_converge', { problemId: g.id, delta: 0.1, epsilon: 0.1, robustness: 'pass', notes: 'x' });
  assert.equal(c.ok, false);
  assert.ok(String(c.report).includes('开放题守卫') || String(c.report).includes('§5.4'), JSON.stringify(c));

  // 解除标记后恢复可收敛路径（此处仅验证解除成功）
  const s3 = await callTool(registered, 'mpm_solve', { problemId: g.id, action: '重新评估', openEnded: 'none' });
  assert.ok(String(s3.report).includes('OPEN-CLEARED'), JSON.stringify(s3));
});

test('微通道（mpm_micro）一息走完 G→F→S→C', async () => {
  const { ctx, registered } = makeMockCtx();
  const mod = await import('../engine/host.js');
  mod.apply(ctx);
  const r = await callTool(registered, 'mpm_micro', {
    title: '微通道冒烟',
    statement: '初始=mock；目标=一息闭环；约束=无；算子=mpm_micro；判据=ok',
    action: '验证完成', delta: 0.2, epsilon: 0.1, robustness: 'pass',
  });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('收敛证据门禁：无求解登记的收敛被拒绝', async () => {
  const { ctx, registered } = makeMockCtx();
  const mod = await import('../engine/host.js');
  mod.apply(ctx);
  const g = await callTool(registered, 'mpm_generate', { title: '门禁测试', observation: 'x' });
  await callTool(registered, 'mpm_frame', {
    problemId: g.id, delta: 0.2,
    statement: '【初始状态】a；【目标状态】b；【约束】c；【可用算子】d；【成功判据】e',
  });
  const c = await callTool(registered, 'mpm_converge', { problemId: g.id, delta: 0.1, epsilon: 0.1, robustness: 'pass', notes: '无证据' });
  assert.equal(c.ok, false, '无 solve 登记且无代价增长，收敛必须被拒');
  assert.ok(String(c.report).includes('证据门禁'), JSON.stringify(c));
});
