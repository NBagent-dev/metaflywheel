// MetaFlywheel state 生命周期模块（P079 重构：state 生命周期簇迁出宿主）
// 依赖注入契约：makeStateMachine(e) 返回生命周期服务集。e 为宿主管状所有者注入：
//   { fsSvc, policy, ctx, state, root, diag, adopted, bumpSnapRev, gainOf }
// root/adopted/diag/state 由宿主创建后传入（宿主所有权），模块只读取/变更、不重建。
// 铁律：只做「闭包→参数化」机械变换——函数体一字未动（自由变量改由 e 绑定），阈值/文案/流程不变。

export function makeStateMachine(e) {
  const { fsSvc, policy, ctx, state, root, diag, adopted, bumpSnapRev, gainOf } = e;

  function norm(p) { return String(p).replace(/\\/g, '/').replace(/\/+$/, ''); }
  function resolveInitialRoot() {
    try {
      const wr = ctx.get('workspaceRegistry');
      if (wr && typeof wr.list === 'function') {
        const list = wr.list();
        if (Array.isArray(list) && list.length === 1 && list[0] && list[0].path) return String(list[0].path);
      }
    } catch (e) {}
    return policy && policy.workspaceRoot ? String(policy.workspaceRoot) : '';
  }
  let loadPromise = null;
  function ensureLoaded() {
    if (!loadPromise) loadPromise = restore();
    return loadPromise;
  }
  function hintFile(r) { return r + '/.mpm/root-hint.json'; }
  async function readHint() {
    try {
      const base = policy && policy.workspaceRoot ? String(policy.workspaceRoot) : '';
      if (!base || !fsSvc) return '';
      const raw = await fsSvc.readText(await fsSvc.resolve(hintFile(base)));
      const o = raw ? JSON.parse(raw) : null;
      return o && o.root ? String(o.root) : '';
    } catch (e) { return ''; }
  }
  async function writeHint() {
    try {
      const base = policy && policy.workspaceRoot ? String(policy.workspaceRoot) : '';
      if (!base || !fsSvc || !root.current) return;
      if (norm(root.current) === norm(base)) return;
      await fsSvc.writeText(await fsSvc.resolve(hintFile(base)), JSON.stringify({ root: root.current, at: Date.now() }));
    } catch (e) {}
  }
  async function candidates() {
    const out = [];
    try {
      const wr = ctx.get('workspaceRegistry');
      if (wr && typeof wr.list === 'function') {
        const wl = wr.list();
        for (let i = 0; i < wl.length && i < 12; i++) {
          if (wl[i] && wl[i].path) out.push(String(wl[i].path));
        }
      }
    } catch (e) {}
    if (root.current) out.push(root.current);
    const hint = await readHint();
    if (hint) out.push(hint);
    const seen = {}; const uniq = [];
    for (let j = 0; j < out.length; j++) {
      const n = norm(out[j]);
      if (n && !seen[n]) { seen[n] = true; uniq.push(out[j]); }
    }
    return uniq;
  }
  function stateFile(r) { return r + '/.mpm/flywheel.json'; }
  async function readStateData(r) {
    try {
      const target = await fsSvc.resolve(stateFile(r));
      const raw = await fsSvc.readText(target);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function freshness(data) {
    if (!data || typeof data !== 'object') return -1;
    let m = 0;
    if (data.problems) {
      for (const k in data.problems) {
        const p = data.problems[k];
        if (p && p.updatedAt > m) m = p.updatedAt;
      }
    }
    if (Array.isArray(data.sediments)) {
      for (let i = 0; i < data.sediments.length; i++) {
        if (data.sediments[i] && data.sediments[i].depositedAt > m) m = data.sediments[i].depositedAt;
      }
    }
    return m;
  }
  async function restore() {
    if (!fsSvc) return;
    const cands = await candidates();
    let best = null;
    for (let i = 0; i < cands.length; i++) {
      const data = await readStateData(cands[i]);
      if (!data) continue;
      const fr = freshness(data);
      if (fr < 0) continue;
      if (!best || fr > best.fr) best = { root: cands[i], data, fr };
    }
    if (best) {
      root.current = best.root;
      state.seq = best.data.seq || 0;
      state.problems = best.data.problems || {};
      state.sediments = Array.isArray(best.data.sediments) ? best.data.sediments : [];
      state.patrol = best.data.patrol && typeof best.data.patrol.rounds === 'number'
        ? best.data.patrol : { rounds: 0, lastAt: 0, lastReport: '' };
      state.measure = best.data.measure && Array.isArray(best.data.measure.samples)
        ? { samples: best.data.measure.samples.slice(-48), driftSignals: Array.isArray(best.data.measure.driftSignals) ? best.data.measure.driftSignals : [] }
        : { samples: [], driftSignals: [] };
      // P019 v6：执政权为构成性权能——默认开启（三者的结合才是一）；
      // 仅当宪法记录显示最后一次修正为显式 revoke 时保持关闭（撤回=修正权，粘性而非执照）。
      const cLog = best.data.constitution && Array.isArray(best.data.constitution.log) ? best.data.constitution.log : [];
      let lastCAction = null;
      for (let ci = 0; ci < cLog.length; ci++) { if (cLog[ci] && (cLog[ci].action === 'grant' || cLog[ci].action === 'revoke')) lastCAction = cLog[ci].action; }
      state.constitution = {
        autonomy: lastCAction !== 'revoke',
        grantedAt: (best.data.constitution && best.data.constitution.grantedAt) || null,
        log: cLog, pending: [], lastFireAt: (best.data.constitution && best.data.constitution.lastFireAt) || 0
      };
      // R1 效价账本迁移（P023）：旧态无 valence 字段——schema 回填（P011 类"旧态×新字段"纪律）
      state.valence = best.data.valence && Array.isArray(best.data.valence.events)
        ? { events: best.data.valence.events.slice(-200) }
        : { events: [] };
      // Schema migration on restore: backfill fields introduced after a
      // problem was first persisted. Never assume new fields exist on old state.
      for (const bk in state.problems) {
        const bp = state.problems[bk];
        if (!bp) continue;
        if (!Array.isArray(bp.frameLog)) bp.frameLog = [];
        if (!('phi' in bp)) bp.phi = null;
        if (!('lastRevision' in bp)) bp.lastRevision = null;
        // A_k 诚实迁移：仅单次界定的旧题回填 delta0（增益仍为 0，不伪造历史精度）
        if (bp.delta0 == null && bp.delta != null && bp.iteration === 1) bp.delta0 = bp.delta;
        // P027/B5 迁移：ε0 回填（旧题无逐次 ε 历史，只能≈终值——增益公式注释已声明该近似）
        if (bp.epsilon0 == null && bp.epsilon != null) bp.epsilon0 = bp.epsilon;
        // P027/A1 迁移：从 history 的【PARKED 标记回填搁置状态（修正案 A1 引擎强制）。
        // 规则：最后一条 PARKED 求解晚于最后一次非 PARKED 求解 → 仍搁置；否则视为已重唤醒。
        let lastParkedAt = -1, lastActiveSolveAt = -1;
        for (const h of (bp.history || [])) {
          const note = String((h && h.note) || '');
          if (note.indexOf('【PARKED') === 0) lastParkedAt = h.at;
          else if ((h.event || '').indexOf('S 求解') === 0) lastActiveSolveAt = h.at;
        }
        if (lastParkedAt > lastActiveSolveAt && !bp.parked) {
          bp.parked = { at: lastParkedAt, note: 'history 回填（修正案 A1）', awakenWhen: '' };
        }
        // P027/B5 迁移：按新增益公式重算历史题 gain（旧口径在沉积时写入，结构上恒 0）
        if (bp.delta0 != null) bp.gain = gainOf(bp);
        // P047 迁移：存量 C 题结账——完全收敛(ε≤0.1)且 30min 无动静、或已有"判定:none"记录者置 settled。
        // 保守组合条件避免误伤真在轮题；evoke 通道可随时由沉积物重开新题。
        if (bp.stage === 'C' && !bp.parked && !bp.settled && bp.epsilon != null && bp.epsilon <= 0.1) {
          const hist = bp.history || [];
          let judgedNone = false, fullyConverged = false;
          for (const h of hist) {
            const ev = String((h && h.event) || '');
            if (ev.indexOf('D 沉积判定:none') === 0) judgedNone = true;
            if (ev.indexOf('C 收敛检查') === 0 && ev.indexOf('完全收敛') >= 0) fullyConverged = true;
          }
          const quiet = bp.updatedAt && (Date.now() - bp.updatedAt > 30 * 60000);
          if (judgedNone || (fullyConverged && quiet)) bp.settled = { at: Date.now(), via: judgedNone ? 'migrate-judged' : 'migrate-converged' };
        }
      }
      diag.lastRestore = '已加载最新状态 ' + root.current + ' (freshness ' + best.fr + '，扫描 ' + cands.length + ' 个候选根)';
      console.log('[mpm][engine] ' + diag.lastRestore);
      await remapForeignSediments();
    }
  }
  async function remapForeignSediments() {
    const newDep = norm(root.current + '/.mpm/deposits/');
    for (let i = 0; i < state.sediments.length; i++) {
      const s = state.sediments[i];
      if (!s.path) continue;
      if (norm(s.path).indexOf(newDep) === 0) continue;
      try {
        const content = await fsSvc.readText(await fsSvc.resolve(s.path));
        const np = newDep + norm(s.path).slice(norm(s.path).lastIndexOf('/') + 1);
        await fsSvc.writeText(await fsSvc.resolve(np), content);
        s.path = np;
      } catch (e) { console.error('[mpm][engine] 沉积迁移跳过 ' + s.id + ':', e && e.message ? e.message : e); }
    }
  }
  async function persist() {
    if (!fsSvc || !root.current) return;
    bumpSnapRev();
    try {
      const target = await fsSvc.resolve(stateFile(root.current));
      const plain = { seq: state.seq, problems: state.problems, sediments: state.sediments, lastRoot: root.current, patrol: state.patrol, measure: state.measure, constitution: { autonomy: state.constitution.autonomy, grantedAt: state.constitution.grantedAt, log: state.constitution.log, lastFireAt: state.constitution.lastFireAt }, valence: { events: (state.valence && Array.isArray(state.valence.events)) ? state.valence.events.slice(-200) : [] }, narrations: state.narrations };
      await fsSvc.writeText(target, JSON.stringify(plain, null, 2));
      await writeHint();
    } catch (e) {
      console.error('[mpm][engine] 持久化失败:', e && e.message ? e.message : e);
    }
  }
  function collectEvidence(exec) {
    const ev = { hadExec: !!exec, agentId: '', agentCwd: '', agentsSeen: [], workspaces: [], source: '' };
    try {
      if (exec && exec.agent) {
        ev.agentId = exec.agent.id ? String(exec.agent.id) : '';
        if (exec.agent.meta && exec.agent.meta.cwd) ev.agentCwd = String(exec.agent.meta.cwd);
      }
    } catch (e) {}
    try {
      const ag = ctx.get('agents');
      if (ag && typeof ag.list === 'function') {
        const list = ag.list();
        for (let i = 0; i < list.length && i < 12; i++) {
          const a = list[i];
          const rec = { id: a && a.id ? String(a.id) : '', cwd: (a && a.meta && a.meta.cwd) ? String(a.meta.cwd) : '' };
          if (ev.agentId && rec.id === ev.agentId && rec.cwd) ev.agentCwd = ev.agentCwd || rec.cwd;
          ev.agentsSeen.push(rec);
        }
      }
    } catch (e) {}
    try {
      const wr = ctx.get('workspaceRegistry');
      if (wr && typeof wr.list === 'function') {
        const wl = wr.list();
        for (let j = 0; j < wl.length && j < 12; j++) {
          if (wl[j] && wl[j].path) ev.workspaces.push(String(wl[j].path));
        }
      }
    } catch (e) {}
    return ev;
  }
  function pickRoot(ev) {
    if (ev.agentCwd) { ev.source = 'agent.cwd'; return ev.agentCwd; }
    const cwds = [];
    for (let i = 0; i < ev.agentsSeen.length; i++) {
      const c = ev.agentsSeen[i].cwd;
      if (c && cwds.indexOf(norm(c)) < 0) cwds.push(c);
    }
    if (cwds.length === 1) { ev.source = 'agents.list唯一cwd'; return cwds[0]; }
    if (ev.workspaces.length === 1) { ev.source = 'workspace唯一'; return ev.workspaces[0]; }
    ev.source = 'none';
    return '';
  }
  async function adoptRoot(exec) {
    const ev = collectEvidence(exec);
    diag.lastEvidence = ev;
    const cw = pickRoot(ev);
    diag.lastSource = ev.source;
    if (!cw || !fsSvc) return;
    if (norm(cw) === norm(root.current)) return;
    root.current = cw;
    if (adopted[norm(cw)]) return;
    adopted[norm(cw)] = true;
    try {
      await remapForeignSediments();
      await persist();
      console.log('[mpm][engine] 沉积根采纳: ' + cw + ' (via ' + ev.source + ')');
    } catch (e) { console.error('[mpm][engine] 根采纳迁移失败:', e && e.message ? e.message : e); }
  }

  return { ensureLoaded, persist, adoptRoot, remapForeignSediments, readHint, writeHint, stateFile, hintFile, norm, resolveInitialRoot, candidates, pickRoot, restore };
}
