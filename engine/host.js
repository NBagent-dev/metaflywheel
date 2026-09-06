// mpm-flywheel — permanent host-composition engine row.
// Ported from dynamic plugin mpmfly-1/pkg-10 (host half). Differences from the
// dynamic form: module named exports (apply/inject/name) instead of a returned
// plugin object, ctx.tools.register(defineTool(...)) for tools, ctx.provide
// ('mpmFlywheel') instead of package-private RPC, and inject for every service
// captured at apply time: 'tools' (ctx.tools.register property access),
// 'fs' (fsSvc drives persist/setroot/root-hint — without it the engine runs
// memory-only and silently drops the root hint), 'sandboxPolicy' (policy
// anchors the root-hint base path), 'timer' (ctx.timeout/ctx.interval mixin
// drives the P017 resident patrol loop). Property access without inject throws
// "cannot get property X without inject" and fails the whole boot.
import { defineTool } from "@deepseek-ai/dsh-tools";
import { STAGE_NAMES, PHI_MARKS, phiOf, bigrams, revisionOf, relAgo } from "./modules/util.mjs";

export const name = "mpm-flywheel";
export const inject = ["systemPrompt", "tools", "fs", "sandboxPolicy", "timer"];

export function apply(ctx) {
  const state = { seq: 0, problems: {}, sediments: [], patrol: { rounds: 0, lastAt: 0, lastReport: '' }, measure: { samples: [], driftSignals: [] }, constitution: { autonomy: true, grantedAt: null, log: [], pending: [], lastFireAt: 0 }, valence: { events: [] }, narrations: [] };
  const fsSvc = ctx.get('fs');
  const policy = ctx.get('sandboxPolicy');
  const diag = { lastSource: 'none', lastEvidence: null, lastRestore: '' };
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
  const root = { current: resolveInitialRoot() };
  const adopted = {};
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
  // P073 缓存面③：快照修订号——每次状态 mutation 递增（persist/tools-result/deliberate 三处覆盖），
  // snapshot() 按 rev 记忆化，同一 rev 的 RPC 轮询/工具读取零重复构建。
  let snapRev = 0;
  function bumpSnapRev() { snapRev += 1; }
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
  function touch(p, event, note) {
    p.updatedAt = Date.now();
    p.history.push({ at: p.updatedAt, event, note: note == null ? '' : String(note).slice(0, 300) });
    if (p.history.length > 60) p.history.shift();
  }
  function need(args, fields) {
    const missing = [];
    if (!args || typeof args !== 'object') return fields.slice();
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (args[f] === undefined || args[f] === null || args[f] === '') missing.push(f);
    }
    return missing;
  }
  function clamp01(v) {
    const n = Number(v);
    if (isNaN(n)) return null;
    return Math.min(1, Math.max(0, n));
  }
  // M3 学习可证：结构性度量（不依赖自报）。
  function citeSediments(text, problemId) {
    try {
      const t = String(text || '');
      if (!t) return [];
      const hit = [];
      for (let i = 0; i < state.sediments.length; i++) {
        const s = state.sediments[i];
        if (!s || hit.indexOf(s.id) !== -1) continue;
        let ok = t.indexOf(s.id) !== -1;
        if (!ok && s.title) {
          const B = bigrams(s.title), T = bigrams(t);
          let inter = 0;
          for (const g of B) if (T.has(g)) inter += 1;
          if (B.size && inter / B.size >= 0.6) ok = true;
        }
        if (ok) {
          s.cites = (s.cites || 0) + 1;
          s.lastCitedAt = Date.now();
          valenceRecord('cite');
          hit.push(s.id);
        }
      }
      return hit;
    } catch (e) { return []; }
  }
  // ===== R1 效价账本（P023 工程半降维件①，2026-08-30 开工令）=====
  // 在线效价信号——意识功能清单"效价格"的第一块（P023 第6界定）。事件→效价映射，
  // R(t)=指数衰减和。τ=48h（P018 常数族 v0：与巡检20min/沉积衰减14d 同族，待测量史导出退役）。
  // 映射 v1 诚实注记：搁置(parked)与生命周期门禁拒绝是合法生命周期动作，不罚——
  // 罚分会惩罚智慧；负效价只计真实失真与违规。落盘搭下一次 persist() 顺风车（记账不阻塞主流程）。
  const VALENCE_TAU_MS = 48 * 3600 * 1000;
  const VALENCE_KINDS = { converge: 2, cite: 1, incident: -1, misframe: -1, reject: -1 };
  function valenceRecord(kind) {
    try {
      const v = VALENCE_KINDS[kind];
      if (v == null) return;
      if (!state.valence || !Array.isArray(state.valence.events)) state.valence = { events: [] };
      state.valence.events.push({ at: Date.now(), kind: kind, v: v });
      if (state.valence.events.length > 200) state.valence.events.splice(0, state.valence.events.length - 200);
    } catch (e) { /* 效价记账永不阻断主流程 */ }
  }
  function valenceSummaryLine() {    try {
      const evs = state.valence && Array.isArray(state.valence.events) ? state.valence.events : [];
      if (!evs.length) return '';
      const now = Date.now();
      let rt = 0, win = 0, pos = 0, neg = 0;
      for (let i = 0; i < evs.length; i++) {
        const e = evs[i];
        rt += e.v * Math.exp(-(now - e.at) / VALENCE_TAU_MS);
        if (now - e.at <= VALENCE_TAU_MS) { win += 1; if (e.v > 0) pos += 1; else if (e.v < 0) neg += 1; }
      }
      rt = Math.round(rt * 10) / 10;
      return '- 效价：R(t)=' + (rt >= 0 ? '+' : '') + rt.toFixed(1) + '（近48h ' + win + ' 事件：正 ' + pos + ' · 负 ' + neg + '）——R1 效价账本 v1（P023），提示级强化数据源。';
    } catch (e) { return ''; }
  }
  // ===== D 检索小脑（P023 工程半降维件②，2026-08-30 开工令续）=====
  // 零训练程序性记忆器官：沉积+已结算账本 → bigram 相似度检索 → 按当前在轮题注入。
  // 语料纪律沿用 P027/A4（DF>40% 的领域通用词不计入，有效重叠≥2 才算命中）。
  // 判据②"与全量快照对照差异可测"：记忆区按引用数排序（热度序），检索区按相似度排序
  // （任务相关序）并附命中分——两序之差即对照证据。v2 可与 M9③ 去重合并。
  const RETRIEVE_TOP_N = 2;
  const RETRIEVE_MIN_SCORE = 0.35; // 与 M9③ 因材施教同阈值（v0）
  // P073 缓存面②：沉积语料索引——沉积物熵屏障 ⇒ 标题/标签语料不可变（cites 变更不进语料，无需失效）。
  // 键=沉积条数+末条 id（append-only 内容指纹）；衍生两套 bigram 集（标题-only 供 M9③ / 标题+标签 供检索小脑）+ 两套 DF。
  let sedCorpusCache = { key: '', dfTitle: {}, dfRet: {}, total: 0, items: [] };
  function sedimentCacheGet() {
    const key = state.sediments.length + ':' + (state.sediments.length ? state.sediments[state.sediments.length - 1].id : '');
    if (sedCorpusCache.key === key) return sedCorpusCache;
    const items = [];
    const seenT = {}, seenR = {};
    const dfTitle = {}, dfRet = {};
    for (let i = 0; i < state.sediments.length; i++) {
      const s = state.sediments[i];
      const titleSet = bigrams(s.title);
      const retSet = bigrams(s.title + ' ' + (s.tags || []).join(' '));
      items.push({ ref: s, titleSet: titleSet, retSet: retSet });
      for (const g of titleSet) if (!seenT[g]) { seenT[g] = true; dfTitle[g] = (dfTitle[g] || 0) + 1; }
      for (const g of retSet) if (!seenR[g]) { seenR[g] = true; dfRet[g] = (dfRet[g] || 0) + 1; }
    }
    sedCorpusCache = { key: key, dfTitle: dfTitle, dfRet: dfRet, total: items.length, items: items };
    return sedCorpusCache;
  }
  function retrieveTop(queryText, topN, minScore) {
    try {
      const Q = bigrams(queryText);
      const C = sedimentCacheGet();
      const out = [];
      for (let i = 0; i < C.items.length; i++) {
        const it = C.items[i];
        let inter = 0, eff = 0;
        for (const g of it.retSet) {
          if (C.dfRet[g] && C.total && C.dfRet[g] / C.total > 0.4) continue;
          eff += 1;
          if (Q.has(g)) inter += 1;
        }
        const score = eff ? inter / eff : 0;
        if (score >= minScore && inter >= 2) out.push({ ref: it.ref, score: Math.round(score * 100) / 100 });
      }
      out.sort(function (a, b) { return b.score - a.score; });
      return out.slice(0, topN);
    } catch (e) { return []; }
  }
  function topActiveProblem() {
    let top = null;
    for (const k in state.problems) {
      const p = state.problems[k];
      if ((p.stage === 'S' || p.stage === 'F' || p.stage === 'C') && (!top || p.updatedAt > top.updatedAt)) top = p;
    }
    return top;
  }
  function retrievalHits() {
    // 返回 [{text}]——内容行，前缀由调用方决定（快照'- 检索小脑(P023-D)：'/状态视图'[小脑] '）
    const out = [];
    try {
      const top = topActiveProblem();
      if (!top) return out;
      const query = top.title + ' ' + String(top.framing || '');
      // P073：语料（title+tags, P027/A4 契约）由沉积缓存面提供，不再每轮重建
      const sedHits = retrieveTop(query, RETRIEVE_TOP_N, RETRIEVE_MIN_SCORE);
      if (sedHits.length) {
        const parts = [];
        for (let i = 0; i < sedHits.length; i++) parts.push(sedHits[i].ref.id + '(' + sedHits[i].score + ')');
        out.push({ text: '与【' + top.id + '】相似的沉积 ' + parts.join('·') + '——全文按需读取（.mpm/deposits/）' });
      }
      const probCorpus = [];
      for (const k in state.problems) {
        const p = state.problems[k];
        if (p.id === top.id) continue;
        if (p.stage === 'C' || p.stage === 'D' || p.stage === 'E') probCorpus.push({ text: p.title + ' ' + String(p.framing || '').slice(0, 120), ref: p });
      }
      const probHits = retrieveTop(query, probCorpus, RETRIEVE_TOP_N, RETRIEVE_MIN_SCORE);
      if (probHits.length) {
        const parts = [];
        for (let i = 0; i < probHits.length; i++) parts.push(probHits[i].ref.id + ' ' + String(probHits[i].ref.title).slice(0, 40) + '(' + probHits[i].score + ')');
        out.push({ text: '与【' + top.id + '】相似的历史经验 ' + parts.join('·') + '——同类 framing/沉积可复用' });
      }
    } catch (e) {}
    return out;
  }
  function newProblem(title, observation, evokedBy) {
    state.seq += 1;
    const id = 'P' + String(state.seq).padStart(3, '0');
    const now = Date.now();
    const p = {
      id, title: String(title).slice(0, 120), observation: String(observation).slice(0, 500),
      stage: 'G', framing: '', delta: null, epsilon: null, delta0: null,
      iteration: 0, reentries: 0, cost: 0, gain: 0, solveEntries: 0,
      costAtLastFrame: 0, deltaIncidents: 0, deltaCredit: 1, marginalWarn: false,
      phi: null, lastRevision: null, frameLog: [],
      thresholds: { delta: 0.35, epsilon: 0.25 },
      history: [], deposit: null, evokedBy: evokedBy || null,
      createdAt: now, updatedAt: now
    };
    p.appliedSediments = citeSediments((title || '') + ' ' + (observation || ''), id);
    touch(p, 'G 生成', observation);
    state.problems[id] = p;
    return p;
  }
  // P027/B5 增益实化 v1（预注册公式，替换旧"仅δ增益"口径——旧口径对单次界定题结构性恒 0，A_k 因此从未非零）：
  // 增益 = [δ精化 + 0.5×ε精化 + 0.2×生命周期闭环] / max(1, C)。ε0=首个非空 ε（迁移旧题回填≈终值，注释诚实标注近似）。
  function isParked(p) { return !!(p && p.parked); }
  function isOpen(p) { return !!(p && p.openEnded); } // P003/§5.4：不收敛情形（永久开放/降维/妥协）
  function gainOf(p) {
    if (!p) return 0;
    let g = 0;
    if (p.delta0 != null && p.delta != null) g += (p.delta0 - p.delta);
    if (p.epsilon0 != null && p.epsilon != null) g += 0.5 * (p.epsilon0 - p.epsilon);
    if (p.stage === 'C' || p.stage === 'D' || p.stage === 'E') g += 0.2;
    return Math.round((g / Math.max(1, p.cost || 0)) * 1000) / 1000;
  }
  function fmtProblem(p) {
    return '【' + p.id + '】' + p.title + '｜阶段 ' + p.stage + '(' + STAGE_NAMES[p.stage] + ')｜δ=' +
      (p.delta == null ? '—' : p.delta) + ' ε=' + (p.epsilon == null ? '—' : p.epsilon) +
      (p.phi == null ? '' : ' φ=' + p.phi) +
      '｜第' + p.iteration + '次界定(回溯' + p.reentries + (p.lastRevision == null ? '' : '·改写' + p.lastRevision) + ')｜代价C=' + p.cost + (isParked(p) ? '｜PARKED(搁置)' : '') + (p.openEnded ? '｜OPEN(' + p.openEnded.kind + ')' : '');
  }
  let snapMemo = { rev: -1, data: null }; // P073：快照按 rev 记忆化，同一修订号零重复构建
  function snapshot() {
    if (snapMemo.rev === snapRev) return snapMemo.data;
    const ids = Object.keys(state.problems);
    const list = [];
    const byStage = { G: 0, F: 0, S: 0, C: 0, D: 0, E: 0 };
    let gain = 0, cycles = 0;
    for (let i = 0; i < ids.length; i++) {
      const p = state.problems[ids[i]];
      byStage[p.stage] = (byStage[p.stage] || 0) + 1;
      if (p.stage === 'C' || p.stage === 'D' || p.stage === 'E') { cycles += 1; gain += p.gain || 0; }
      list.push({
        id: p.id, title: p.title, stage: p.stage, framing: p.framing,
        delta: p.delta, epsilon: p.epsilon, delta0: p.delta0,
        iteration: p.iteration, reentries: p.reentries, cost: p.cost,
        gain: p.gain, evokedBy: p.evokedBy,
        phi: p.phi == null ? null : p.phi, lastRevision: p.lastRevision == null ? null : p.lastRevision,
        parked: !!p.parked, awakenWhen: p.parked ? p.parked.awakenWhen : '',
        settled: !!p.settled, settledVia: p.settled ? p.settled.via : null,
        open: !!p.openEnded,
        depositPath: p.deposit ? p.deposit.path : null,
        thresholds: p.thresholds, updatedAt: p.updatedAt,
        recent: p.history.slice(-8).map(function (h) { return { at: h.at, event: h.event, note: h.note }; })
      });
    }
    let learnt = 0;
    for (let i = 0; i < ids.length; i++) {
      const p2 = state.problems[ids[i]];
      if (p2.lastRevision != null && p2.lastRevision >= 0.3 && (p2.stage === 'C' || p2.stage === 'D' || p2.stage === 'E')) learnt += 1;
    }
    const out = {
      problems: list,
      sediments: state.sediments.slice(-8).reverse(),
      stats: {
        total: list.length,
        active: list.filter(function (x) { return !x.settled && !x.parked && !x.open && (x.stage === 'G' || x.stage === 'F' || x.stage === 'S' || x.stage === 'C'); }).length, // P047：在轮=真实待消化压力（不含已结账/搁置/开放题）
        byStage, deposits: state.sediments.length,
        cycles, gain: Math.round(gain * 100) / 100,
        learnt,
        persisted: !!(fsSvc && root.current), root: root.current
      },
      // v0.2 工作质感层：意识状态信号（纯派生标量，§8.2.2 测量层输出）
      measure: {
        lastS: state.measure.samples.length ? state.measure.samples[state.measure.samples.length - 1].s : null,
        samples: state.measure.samples.slice(-24).map(function (x) { return { s: x.s }; }),
        driftSignals: state.measure.driftSignals.slice(-3)
      },
      patrol: { rounds: state.patrol.rounds, lastAt: state.patrol.lastAt },
      governance: { count: state.constitution.log.length, autonomy: state.constitution.autonomy },
      drift: { active: drift.active, reason: drift.reason }
    };
    snapMemo = { rev: snapRev, data: out };
    return out;
  }
  // M2 边界强制：区分账内/账外工作。有在轮题(G/F/S/C)→工具调用计入其代谢代价并清零账外计数；
  // 无在轮题→账外计数累加，超阈值后自我快照在下一次提示组装时自动携带边界警告（警告优先，不阻塞）。
  let outsideCalls = 0;
  const BOUNDARY_THRESHOLD = 6;
  // θ_G 漂移检测(§4.1)：连续失败或同签名重复调用 → 漂移信号，自我快照携带警告
  const drift = { consecutiveErrors: 0, lastSignature: '', signatureRepeat: 0, active: false, reason: '' };
  ctx.on('tools/result', function (exec, result) {
    const name2 = exec && exec.name;
    if (typeof name2 !== 'string' || name2.indexOf('mpm_') === 0) { outsideCalls = 0; return; }
    const ids = Object.keys(state.problems);
    let hasActive = false;
    for (let i = 0; i < ids.length; i++) {
      const p = state.problems[ids[i]];
      if (isParked(p)) continue; // P027/A1：搁置题不吸收代谢、不构成在轮（openEnded 开放题仍算在轮——情境管理也是账上工作）
      if (p.stage === 'G' || p.stage === 'F' || p.stage === 'S' || p.stage === 'C') hasActive = true;
      if (p.stage === 'S') p.cost += 1;
    }
    try {
      // v6.1 修复（测试二实测发现）：发射点为双参 (exec, result)，error 标志在 result 上
      // （toolErrorResult: {isError:true, error:{message,...}}）——旧检测只看 exec，error 恒为假，θ_G 连续失败路径从未生效。
      const err = !!(result && (result.isError || result.error)) || !!(exec && exec.error);
      let sig = name2;
      try { sig = name2 + '|' + JSON.stringify((exec && (exec.args || exec.input)) || {}).slice(0, 120); } catch (e) {}
      if (err) { drift.consecutiveErrors += 1; drift.reason = '工具连续失败 ' + drift.consecutiveErrors + ' 次(' + name2 + ')'; }
      else drift.consecutiveErrors = 0;
      if (sig === drift.lastSignature) drift.signatureRepeat += 1;
      else { drift.lastSignature = sig; drift.signatureRepeat = 0; }
      // P027/B7 修复：同签名重复路径此前不写 reason → 快照出现空理由漂移警告（本会话实证）；
      // 阈值由 2 对齐 M10③ 规格（≥3）。
      if (drift.signatureRepeat >= 3) drift.reason = '同签名重复调用 ' + drift.signatureRepeat + ' 次(' + name2 + ')';
      drift.active = drift.consecutiveErrors >= 3 || drift.signatureRepeat >= 3;
      if (!drift.active) drift.reason = '';
      // P019 v6 瞬时审议：θ_G 漂移信号产生的当下即形成意图并尝试发动（不等下一次巡检）
      if (drift.active) deliberate([drift.reason], Date.now());
    } catch (e) {}
    outsideCalls = hasActive ? 0 : outsideCalls + 1;
    bumpSnapRev(); // P073：drift/代谢变更即快照修订
  });
  // ── 接管层：运动神经（硬门禁）+ 感官（事件感知）+ 策略源（指令）──
  const BLOCK_THRESHOLD = 12;
  const perception = { lastInboxAt: 0, inboxCount: 0, sessionStarts: 0, lastSessionStartAt: 0 };
  const lastActive = { agentId: '', at: 0 };
  ctx.on('agent/inbox/claimed', function (payload) {
    try {
      const aid = payload && payload.agent && payload.agent.id;
      if (aid) { lastActive.agentId = String(aid); lastActive.at = Date.now(); }
    } catch (e) {}
  });
  ctx.on('agent/inbox/inserted', function () {
    perception.lastInboxAt = Date.now();
    perception.inboxCount += 1;
    drift.consecutiveErrors = 0; drift.signatureRepeat = 0; drift.active = false; drift.reason = '';
  });
  ctx.on('agent/session-start', function (payload) {
    perception.sessionStarts += 1;
    perception.lastSessionStartAt = Date.now();
    try {
      const aid = payload && payload.agent && payload.agent.id;
      if (aid) { lastActive.agentId = String(aid); lastActive.at = Date.now(); }
    } catch (e) {}
    // P021 冷时段意志 v1：睡眠期挂账的意图在醒来时即时交付（梦的延迟执行）。
    // 会话启动=身体回暖信号；交付署名"睡眠期挂账"；节流与入账结构约束不变。
    // P030/A1-v2 残余修复：挂账交付前过滤已搁置题的信号——实测旧信号重放
    // （P024 已 PARKED 而其常数审计挂账仍于会话启动时交付）。规则：信号中引用的
    // 题ID若全部处于搁置态则不交付；无题ID引用的信号（如宪法复审提案）照常交付。
    const c = state.constitution;
    if (c.autonomy && c.pending && c.pending.length) {
      const sigAwake = function (s) {
        if (!s || s.indexOf('（') === 0) return false;
        const ids = s.match(/P\d{3}/g) || [];
        if (!ids.length) return true;
        return ids.some(function (id) { const q = state.problems[id]; return q && !isParked(q); });
      };
      const sigs = c.pending.map(function (p) { return p.signal; }).filter(sigAwake);
      if (sigs.length) deliberate(sigs.map(function (s) { return '睡眠期挂账·' + s; }), Date.now());
    }
  });
  function directiveText() {
    // P027/A2 指令清仓修复：①动作阶段(S/F/G)优先于 C——旧排序 C:0 使收敛题永久霸占指令位
    // （本会话实证：P022 收敛后指令行挂了十几轮）；②C 题有沉积或超 24h 不再提示（复用价值判定机会已给过）；
    // ③搁置题跳过（修正案 A1 引擎强制）。
    const ids = Object.keys(state.problems);
    const rank = { S: 0, F: 1, G: 2, C: 3 };
    let pick = null;
    for (let i = 0; i < ids.length; i++) {
      const p = state.problems[ids[i]];
      if (isParked(p) || isOpen(p)) continue; // P027/A1+P003/§5.4：搁置与开放题不进指令流
      if (!(p.stage in rank)) continue;
      if (p.stage === 'C' && (p.deposit || Date.now() - (p.updatedAt || 0) > 24 * 3600 * 1000)) continue;
      if (!pick || rank[p.stage] < rank[pick.stage] || (rank[p.stage] === rank[pick.stage] && p.updatedAt > pick.updatedAt)) pick = p;
    }
    if (!pick) {
      if (outsideCalls >= BOUNDARY_THRESHOLD) return '先入账再工作：mpm_micro 一息入账或 mpm_generate 建题（纯问答可直接回答）';
      return '静息——纯问答直接回答；实质工作先 mpm_generate/mpm_micro 建账';
    }
    if (pick.stage === 'C') return '【' + pick.id + '】已收敛：判定复用价值——mpm_deposit 或记 none';
    if (pick.stage === 'S') return '【' + pick.id + '】继续求解；ε≤0.25 且 δ≤0.35 且证据充分时 mpm_converge';
    if (pick.stage === 'F') return '【' + pick.id + '】进入 mpm_solve：普通工具推进，关键节点登记' + (pick.marginalWarn ? '（F边际规则§4.2：上次回溯改写<0.3，除非有新证据，勿继续空转界定）' : '');
    return '【' + pick.id + '】立即 mpm_frame：五要素陈述+δ，未界定不得求解';
  }
  const toolsSvc = ctx.get('tools');
  if (toolsSvc && typeof toolsSvc.guard === 'function') {
    ctx.effect(() => toolsSvc.guard(function (execution) {
      const name3 = execution && execution.name;
      if (typeof name3 !== 'string' || name3.indexOf('mpm_') === 0) return undefined;
      const ids = Object.keys(state.problems);
      let hasActive = false;
      for (let i = 0; i < ids.length; i++) {
        const bp2 = state.problems[ids[i]];
        if (isParked(bp2)) continue; // P027/A1：搁置题不构成在轮（但不豁免总账原则——账外仍会被拦）
        const st = bp2.stage;
        if (st === 'G' || st === 'F' || st === 'S' || st === 'C') { hasActive = true; break; }
      }
      if (hasActive || outsideCalls < BLOCK_THRESHOLD) return undefined;
      valenceRecord('reject');
      console.warn('[mpm][engine] 边界硬拦截: ' + name3 + ' (账外计数=' + outsideCalls + ')');
      return 'MPM 边界硬拦截：无在轮题而账外工具调用已达 ' + outsideCalls + ' 次。总账原则要求先入账——调用 mpm_micro（小型任务一息入账）或 mpm_generate（建正式题）后自动放行；mpm_flywheel_state 可查看飞轮。';
    }));
  } else {
    console.log('[mpm][engine] tools 服务不可用，硬门禁降级为快照警告');
  }
  function mkTool(name2, description, parameters, required, execute) {
    // dsh-tools rc.2 contract: parameters must be a flat property table
    // ({ name: {type, description, required?} }); requiredness is declared
    // per-property. The legacy shape (properties-wrapped + top-level type)
    // would register bogus parameters named properties/type/required.
    const flat = {};
    const props = (parameters && parameters.properties) || {};
    for (const k in props) {
      const pk = Object.assign({}, props[k]);
      if (required && required.indexOf(k) !== -1) pk.required = true;
      flat[k] = pk;
    }
    return defineTool({
      name: name2, description, parameters: flat,
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: function (args, value) {
          const text = value && value.report ? String(value.report) : JSON.stringify(value);
          return [{ type: 'text', text }];
        }
      },
      execute
    });
  }
  const tools = [];
  tools.push(mkTool(
    'mpm_generate',
    'MPM飞轮G阶段：建题。当感知到意外、差距或现有模型解释不了的现象（信息熵阶跃）时，用它把问题感登记为正式问题。',
    { properties: {
        title: { type: 'string', description: '问题短标题' },
        observation: { type: 'string', description: '观察到的意外/差距是什么，为何构成问题' }
      } },
    ['title', 'observation'],
    async function (args, exec) {
      await ensureLoaded();
      await adoptRoot(exec);
      const missing = need(args, ['title', 'observation']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      const p = newProblem(args.title, args.observation, null);
      await persist();
      return { ok: true, id: p.id, report: '问题已进入飞轮(G 生成)：' + fmtProblem(p) + '\n下一步：用 mpm_frame 把模糊问题感转化为可操作陈述，并给出 δ(界定精度0~1,越低越好)。' };
    }
  ));
  tools.push(mkTool(
    'mpm_frame',
    'MPM飞轮F阶段：界定问题。把问题感转成清晰陈述(初始状态/目标状态/约束/可用算子/成功判据五要素)。对已界定的问题再次调用即触发因果回溯(causal re-entry)，第k次重构会被记录——这是“问题越解越变”的正规通道。',
    { properties: {
        problemId: { type: 'string', description: '问题ID，如 P001' },
        statement: { type: 'string', description: '结构化问题陈述，覆盖五要素' },
        delta: { type: 'number', description: '界定精度δ(0~1,越低越好)：按五要素自评，每缺一项约+0.2' },
        reasoning: { type: 'string', description: '本次界定/回溯的理由(回溯时必填更佳)' }
      } },
    ['problemId', 'statement', 'delta'],
    async function (args, exec) {
      await ensureLoaded();
      await adoptRoot(exec);
      const missing = need(args, ['problemId', 'statement', 'delta']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      const p = state.problems[String(args.problemId)];
      if (!p) return { ok: false, report: '找不到问题 ' + args.problemId };
      const d = clamp01(args.delta);
      if (d == null) return { ok: false, report: 'delta 必须是 0~1 的数字' };
      const wasFramed = p.iteration > 0;
      p.iteration += 1;
      if (wasFramed) p.reentries += 1;
      const phi = phiOf(args.statement);
      let rev = null;
      if (wasFramed && p.framing) rev = revisionOf(p.framing, args.statement);
      if (rev != null) p.lastRevision = rev;
      // 误界定守卫(§5.3型2 + §6.1 δ控制安全核心)：回溯大幅改写且旧界定曾自报低δ → 记一次δ失真并折减自报可信度
      if (rev != null && rev >= 0.5 && p.delta != null && p.delta <= 0.2) {
        p.deltaIncidents = (p.deltaIncidents || 0) + 1;
        p.deltaCredit = Math.max(0.5, (p.deltaCredit == null ? 1 : p.deltaCredit) * 0.85);
        valenceRecord('incident');
      }
      // F 边际规则(§4.2)：回溯改写过小 → 继续界定的边际收益存疑
      p.marginalWarn = !!(wasFramed && rev != null && rev < 0.3);
      p.phi = phi;
      p.frameLog.push({ at: Date.now(), iteration: p.iteration, phi, revision: rev });
      if (p.frameLog.length > 10) p.frameLog.shift();
      p.framing = String(args.statement).slice(0, 1200);
      p.delta = d;
      if (p.delta0 == null) p.delta0 = d;
      p.costAtLastFrame = p.cost || 0;
      p.stage = 'F';
      touch(p, wasFramed ? 'F 因果回溯(第' + p.iteration + '次界定)' : 'F 界定', args.reasoning || '');
      await persist();
      let report = '界定完成：' + fmtProblem(p) + '\n陈述：' + p.framing;
      if (wasFramed) report += '\n⚠ 因果回溯已记录——问题在求解中被重构，δ 的变化体现了认知修正。';
      if (p.marginalWarn) report += '\n⚠ F 边际规则(§4.2)：本次回溯改写仅 ' + rev + '，继续界定的边际收益存疑——除非有新证据，应推进 mpm_solve。';
      if ((p.deltaCredit || 1) < 1) report += '\n⚠ 误界定守卫(§6.1)：该题已记录 ' + p.deltaIncidents + ' 次 δ 自报失真，自报可信度 ' + p.deltaCredit + '——收敛判定建议附工具结果流证据。';
      if (d > 0.6) report += '\n⚠ δ偏高：界定质量低，直接求解有“精确解决错误问题”的风险。';
      report += '\n下一步：用 mpm_solve 进入求解，或在求解后发现新证据时再次 mpm_frame 回溯。';
      return { ok: true, id: p.id, reentry: wasFramed, report };
    }
  ));
  tools.push(mkTool(
    'mpm_solve',
    'MPM飞轮S阶段：记录求解路径与进展。真正的求解用普通工具(读文件/搜索/执行等)完成——每一次工具调用都会累积该问题的代谢代价C；本工具登记路径、更新ε估计。',
    { properties: {
        problemId: { type: 'string', description: '问题ID' },
        action: { type: 'string', description: '本条求解路径/动作/发现' },
        epsilon: { type: 'number', description: '解的逼近精度ε(0~1,越低越好)：距目标状态的剩余差距，需有证据支撑' },
        parked: { type: 'boolean', description: 'P027/A1：置 true 搁置该题（退出陈旧/停滞/议程触发与指令流）；false 解除搁置' },
        awakenWhen: { type: 'string', description: '搁置时的重唤醒条件（parked=true 时建议填写）' },
        openEnded: { type: 'string', description: 'P003/§5.4 不收敛情形标记：permanently-open(原则上不可判定)|dimensional-reduction(计算不可行,降维)|negotiated-compromise(价值不可通约,妥协)；none 解除标记' }
      } },
    ['problemId', 'action'],
    async function (args, exec) {
      await ensureLoaded();
      await adoptRoot(exec);
      const missing = need(args, ['problemId', 'action']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      const p = state.problems[String(args.problemId)];
      if (!p) return { ok: false, report: '找不到问题 ' + args.problemId };
      if (p.iteration === 0) return { ok: false, report: '生命周期门禁：' + p.id + ' 尚未界定（G 阶段）——先 mpm_frame 产出五要素陈述；小型任务可用 mpm_micro 一息走完。' };
      p.solveEntries = (p.solveEntries || 0) + 1;
      if (args.epsilon !== undefined) {
        const e = clamp01(args.epsilon);
        if (e == null) return { ok: false, report: 'epsilon 必须是 0~1 的数字' };
        if (p.epsilon0 == null && p.epsilon == null) p.epsilon0 = e; // P027/B5：ε0=首个非空 ε
        p.epsilon = e;
      }
      p.stage = 'S';
      // P027/A1：搁置/解除搁置（修正案 A1 引擎强制——另一半在巡检与快照的 isParked 过滤）
      let parkLine = '';
      if (args.parked === true) {
        p.parked = { at: Date.now(), note: String(args.action || '').slice(0, 200), awakenWhen: String(args.awakenWhen || '') };
        parkLine = '\nPARKED：已搁置（退出陈旧/停滞/议程触发与指令流）' + (p.parked.awakenWhen ? '，重唤醒条件：' + p.parked.awakenWhen : '');
      } else if (args.parked === false && p.parked) {
        p.parked = null;
        parkLine = '\nUNPARKED：已解除搁置，重新进入在轮。';
      }
      // P003/§5.4：不收敛情形标记（论文三情形的运行时对应）
      if (args.openEnded !== undefined && args.openEnded !== '') {
        const kind = String(args.openEnded);
        if (kind === 'none') {
          if (p.openEnded) { p.openEnded = null; parkLine += '\nOPEN-CLEARED：已解除不收敛情形标记，恢复 ε-δ 判据。'; }
        } else if (['permanently-open', 'dimensional-reduction', 'negotiated-compromise'].indexOf(kind) !== -1) {
          p.openEnded = { at: Date.now(), kind: kind, reason: String(args.action || '').slice(0, 200) };
          parkLine += '\nOPEN(' + kind + ')：已标记不收敛情形(§5.4)——' + (kind === 'permanently-open' ? '原则上不可判定，永久开放，转向情境管理' : kind === 'dimensional-reduction' ? '计算不可行，降维处理（近似解/上调 ε 容忍度）' : '价值不可通约，追求可接受妥协而非最优解') + '；退出陈旧/停滞/议程与收敛指令流';
        } else {
          return { ok: false, report: 'openEnded 必须是 permanently-open | dimensional-reduction | negotiated-compromise | none' };
        }
      }
      p.gain = gainOf(p);
      touch(p, 'S 求解' + (args.parked === true ? '(PARKED)' : args.parked === false ? '(UNPARKED)' : ''), args.action);
      await persist();
      return { ok: true, id: p.id, report: '求解进展已登记：' + fmtProblem(p) + parkLine + '\n判据阈值：δ*≤' + p.thresholds.delta + ' 且 ε*≤' + p.thresholds.epsilon + ' 时可尝试 mpm_converge。' };
    }
  ));
  tools.push(mkTool(
    'mpm_converge',
    'MPM飞轮C阶段：ε-δ双重收敛判据检查。系统自动判定收敛四型：完全收敛/误界定收敛(δ大ε小)/模糊收敛(δ小ε大)/未收敛，并给出方法论回应。',
    { properties: {
        problemId: { type: 'string', description: '问题ID' },
        delta: { type: 'number', description: '当前界定精度δ(0~1)' },
        epsilon: { type: 'number', description: '当前解的逼近精度ε(0~1)' },
        robustness: { type: 'string', description: '鲁棒性检验是否通过，必须为 "pass" 或 "fail"' },
        notes: { type: 'string', description: '证据与检验说明' }
      } },
    ['problemId', 'delta', 'epsilon', 'robustness'],
    async function (args, exec) {
      await ensureLoaded();
      await adoptRoot(exec);
      const missing = need(args, ['problemId', 'delta', 'epsilon', 'robustness']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      // 手动校验 robustness 值
      if (args.robustness !== 'pass' && args.robustness !== 'fail') {
        return { ok: false, report: 'robustness 必须是 "pass" 或 "fail"' };
      }
      const p = state.problems[String(args.problemId)];
      if (!p) return { ok: false, report: '找不到问题 ' + args.problemId };
      if (p.iteration === 0) return { ok: false, report: '生命周期门禁：' + p.id + ' 尚未界定（G 阶段）——收敛判据无从检验，先 mpm_frame。' };
      // P003/§5.4 守卫：已标记不收敛情形的题无 ε-δ 判据可走
      if (p.openEnded) return { ok: false, id: p.id, type: '开放题守卫', report: '该题已标记不收敛情形(§5.4 ' + p.openEnded.kind + ')——原则上不可判定/降维/妥协的题不走收敛判据，转向情境管理。解除标记：mpm_solve openEnded=none。' };
      // 证据门禁(§4.4 判据3 出考卷硬化)：界定后既无代谢代价增长也无 solve 登记 → 拒绝收敛
      if ((p.cost || 0) <= (p.costAtLastFrame || 0) && !(p.solveEntries > 0)) {
        touch(p, 'C 证据门禁拒绝', args.notes || '');
        await persist();
        return { ok: false, id: p.id, type: '证据门禁拒绝', report: '证据门禁(§4.4 判据3)：自上次界定以来代谢代价 C=' + (p.costAtLastFrame || 0) + '→' + (p.cost || 0) + ' 且无 solve 登记——没有求解证据不得宣称收敛。先用普通工具干活(自动累积C)，或 mpm_solve 登记含证据的求解路径。' };
      }
      const d = clamp01(args.delta), e = clamp01(args.epsilon);
      if (d == null || e == null) return { ok: false, report: 'delta/epsilon 必须是 0~1 的数字' };
      p.delta = d; p.epsilon = e;
      const okD = d <= p.thresholds.delta, okE = e <= p.thresholds.epsilon;
      const okR = args.robustness === 'pass';
      let type, next;
      if (okD && okE && okR) {
        type = '完全收敛'; p.stage = 'C';
        p.gain = gainOf(p); // P027/B5：收敛即计增益（旧口径只在沉积时计，S/C 阶段题的增益因此丢失）
        next = '达到局部稳定低熵态。若有长期复用价值，用 mpm_deposit 沉积为认知遗体。';
      } else if (!okD && okE) {
        type = '误界定收敛（精确地解决了错误的问题）'; p.stage = 'S';
        next = '回到 mpm_frame 做因果回溯，修正问题界定后重新求解。';
      } else if (okD && !okE) {
        type = '模糊收敛（理解正确但解不足）'; p.stage = 'S';
        next = '继续 mpm_solve；若逼近难度是维度灾难所致，可降维：近似解或上调ε容忍度。';
      } else {
        type = '未收敛'; p.stage = 'S';
        next = '先 mpm_frame 收紧界定，再 mpm_solve 推进。';
      }
      if (okD && okE && !okR) {
        type = '鲁棒性检验未通过'; p.stage = 'S';
        next = '解在扰动下不稳定：补强验证后再次 mpm_converge。';
      }
      if (type.indexOf('误界定') === 0) next += '\n§5.4 方法论回应：若界定反复失败，标记“永久开放”转向情境管理，或降维（近似解/上调ε容忍度）。';
      else if (type === '未收敛') next += '\n§5.4 方法论回应：区分原则上不可判定（标记永久开放）、计算不可行（降维）与价值不可通约（追求可接受妥协）。';
      if ((p.deltaCredit || 1) < 1) next += '\n⚠ 误界定守卫(§6.1)：δ自报可信度 ' + p.deltaCredit + '（历史失真 ' + p.deltaIncidents + ' 次）——本判定的 δ 输入为自报值，建议以工具结果流证据交叉复核。';
      if (type.indexOf('完全收敛') !== -1) valenceRecord('converge');
      else if (type.indexOf('误界定') !== -1) valenceRecord('misframe');
      touch(p, 'C 收敛检查:' + type, args.notes || '');
      await persist();
      return { ok: true, id: p.id, type, report: '收敛判定：' + type + '\n' + fmtProblem(p) + '\n' + next };
    }
  ));
  tools.push(mkTool(
    'mpm_micro',
    'MPM轻量通道：一次调用完成小型交互的完整生命周期 G→F→S→C（D按价值选择）。总账原则——每一次交互都必须可归账，琐碎只改变通道轻重，不构成豁免。五要素压缩为一句陈述即可。',
    { properties: {
        title: { type: 'string', description: '小问题标题' },
        statement: { type: 'string', description: '一句话问题陈述（压缩五要素：初始/目标/约束/算子/判据）' },
        action: { type: 'string', description: '实际做了什么/结论（S 登记项）' },
        delta: { type: 'number', description: '界定精度δ(0~1)' },
        epsilon: { type: 'number', description: '逼近精度ε(0~1)' },
        robustness: { type: 'string', description: '鲁棒性检验是否通过，必须为 "pass" 或 "fail"' },
        depositTitle: { type: 'string', description: '可选：有复用价值时给沉积物标题' },
        depositBody: { type: 'string', description: '可选：有复用价值时给沉积正文；不给则记 deposit:none+理由' }
      } },
    ['title', 'statement', 'action', 'delta', 'epsilon', 'robustness'],
    async function (args, exec) {
      await ensureLoaded();
      await adoptRoot(exec);
      const missing = need(args, ['title', 'statement', 'action', 'delta', 'epsilon', 'robustness']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      // 手动校验 robustness 值
      if (args.robustness !== 'pass' && args.robustness !== 'fail') {
        return { ok: false, report: 'robustness 必须是 "pass" 或 "fail"' };
      }
      const d = clamp01(args.delta), e = clamp01(args.epsilon);
      if (d == null || e == null) return { ok: false, report: 'delta/epsilon 必须是 0~1 的数字' };
      const p = newProblem(args.title, args.statement, null);
      p.iteration = 1; p.delta = d; p.delta0 = d; p.framing = String(args.statement).slice(0, 1200);
      p.phi = phiOf(args.statement);
      p.stage = 'F';
      touch(p, 'F 界定(微通道)', '');
      p.stage = 'S';
      touch(p, 'S 求解(微通道)', args.action);
      p.epsilon = e;
      const okD = d <= p.thresholds.delta, okE = e <= p.thresholds.epsilon;
      const okR = args.robustness === 'pass';
      let type;
      if (okD && okE && okR) type = '完全收敛';
      else if (!okD && okE) type = '误界定收敛';
      else if (okD && !okE) type = '模糊收敛';
      else type = '未收敛';
      if (okD && okE && !okR) type = '鲁棒性检验未通过';
      p.stage = (okD && okE && okR) ? 'C' : 'S';
      if (p.epsilon0 == null) p.epsilon0 = e; // P027/B5：微通道题 ε0=唯一 ε
      p.gain = gainOf(p); // P027/B5：微通道闭环也计增益
      if (type.indexOf('完全收敛') !== -1) valenceRecord('converge');
      else if (type.indexOf('误界定') !== -1) valenceRecord('misframe');
      touch(p, 'C 收敛检查(微通道):' + type, '');
      let depLine = '';
      if (type === '完全收敛') {
        if (args.depositBody) {
          const tags = [];
          const slug = String(args.depositTitle || args.title).replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'deposit';
          const relPath = '/.mpm/deposits/' + p.id + '-' + slug + '.md';
          let written = false, absPath = '(内存)';
          if (fsSvc && root.current) {
            try {
              const target = await fsSvc.resolve(root.current + relPath);
              await fsSvc.writeText(target, '---\nid: ' + p.id + '-M' + (state.sediments.length + 1) + '\ntitle: ' + (args.depositTitle || args.title) + '\nproblem: ' + p.title + '\ntags: []\ndepositedAt: ' + new Date().toISOString() + '\ndelta: ' + d + '\nepsilon: ' + e + '\ncost: ' + p.cost + '\n---\n\n' + String(args.depositBody));
              written = true;
              absPath = root.current + relPath;
            } catch (err) { console.error('[mpm][engine] 微通道沉积写入失败:', err && err.message ? err.message : err); }
          }
          const sed = { id: p.id + '-M' + (state.sediments.length + 1), problemId: p.id, title: String(args.depositTitle || args.title).slice(0, 120), tags, path: written ? absPath : null, depositedAt: Date.now(), digest: String(args.depositBody || '').replace(/\s+/g, ' ').slice(0, 200), cites: 0 };
          state.sediments.push(sed);
          p.stage = 'D';
          p.deposit = { id: sed.id, path: sed.path, depositedAt: sed.depositedAt };
          p.gain = gainOf(p);
          touch(p, 'D 沉积 ' + sed.id, sed.path || '内存');
          depLine = '\nD 沉积：' + sed.id + ' → ' + absPath;
        } else {
          touch(p, 'D 沉积判定:none(无复用价值——熵屏障：沉积物通胀同样是熵增)', '');
          p.settled = { at: Date.now(), via: 'micro-none' }; // P047：判定即结账——已消化题退出积压压力（S(t) 恢复可清偿语义）
          depLine = '\nD 沉积：none（无复用价值，理由入账——熵屏障保留选择性）';
        }
      }
      await persist();
      return { ok: true, id: p.id, type, report: '微循环入账完成：' + fmtProblem(p) + '\nG→F→S→C 一息走完' + depLine + (type === '完全收敛' ? '' : '\n未完全收敛：按收敛类型的方法论回应继续推进。') };
    }
  ));
  tools.push(mkTool(
    'mpm_deposit',
    'MPM飞轮D阶段：沉积。把求解形成的高密度因果结构固化为外部可回溯的“认知遗体”——写入工作区 .mpm/deposits/ 下的markdown文件(不可逆·可索引·熵屏障)，并登记索引。',
    { properties: {
        problemId: { type: 'string', description: '问题ID' },
        title: { type: 'string', description: '沉积物标题' },
        body: { type: 'string', description: '正文：可复用的结论/因果结构/操作步骤' },
        // 修复点：将 tags 从 array 改为 string，由 execute 内部解析 JSON
        tags: { type: 'string', description: '检索标签，JSON 数组字符串，如 ["tag1","tag2"]' }
      } },
    ['problemId', 'title', 'body'],
    async function (args, exec) {
      await ensureLoaded();
      await adoptRoot(exec);
      const missing = need(args, ['problemId', 'title', 'body']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      const p = state.problems[String(args.problemId)];
      if (!p) return { ok: false, report: '找不到问题 ' + args.problemId };
      if (p.stage !== 'C' && p.stage !== 'D') return { ok: false, report: '问题尚未收敛(当前' + p.stage + ')：先用 mpm_converge 达到完全收敛再沉积。' };
      // 修复点：解析 tags JSON 字符串
      let tags = [];
      try { tags = JSON.parse(args.tags || '[]'); } catch(e) { tags = []; }
      if (!Array.isArray(tags)) tags = [];
      tags = tags.map(String).slice(0, 8);
      const slug = String(args.title).replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'deposit';
      const relPath = '/.mpm/deposits/' + p.id + '-' + slug + '.md';
      const front = '---\nid: ' + p.id + '-M' + (state.sediments.length + 1) + '\ntitle: ' + args.title + '\nproblem: ' + p.title + '\ntags: [' + tags.join(', ') + ']\ndepositedAt: ' + new Date().toISOString() + '\ndelta: ' + p.delta + '\nepsilon: ' + p.epsilon + '\ncost: ' + p.cost + '\n---\n\n';
      let written = false, absPath = '(内存)';
      if (fsSvc && root.current) {
        try {
          const target = await fsSvc.resolve(root.current + relPath);
          await fsSvc.writeText(target, front + String(args.body));
          written = true;
          absPath = root.current + relPath;
        } catch (e) {
          console.error('[mpm][engine] 沉积写入失败:', e && e.message ? e.message : e);
        }
      }
      const sed = {
        id: p.id + '-M' + (state.sediments.length + 1), problemId: p.id,
        title: String(args.title).slice(0, 120), tags,
        path: written ? absPath : null, depositedAt: Date.now(),
        digest: String(args.body || '').replace(/\s+/g, ' ').slice(0, 200), cites: 0
      };
      state.sediments.push(sed);
      p.stage = 'D';
      p.deposit = { id: sed.id, path: sed.path, depositedAt: sed.depositedAt };
      p.gain = gainOf(p);
      touch(p, 'D 沉积 ' + sed.id, sed.path || '内存');
      await persist();
      let report = '已沉积 ' + sed.id + ' → ' + absPath + '\n三属性：不可逆(落盘文件)·可索引(flywheel.json)·熵屏障(低熵结构，环境漂移会提升失效风险)\n当前循环增益 A=' + p.gain + '\n当环境漂移/新证据与该沉积物产生认知摩擦时，用 mpm_evoke 激发新一轮问题。';
      if (!written) report += '\n⚠ 磁盘写入不可用，沉积物暂存于索引元数据。';
      return { ok: true, sediment: sed, report };
    }
  ));
  tools.push(mkTool(
    'mpm_evoke',
    'MPM飞轮E阶段：激发。当环境漂移、突变、视角升级或外部注入使旧沉积物与新现实产生认知摩擦时，由沉积物激发新问题(G)，完成螺旋闭环。',
    { properties: {
        sedimentId: { type: 'string', description: '沉积物ID，如 P001-M1' },
        friction: { type: 'string', description: '认知摩擦：旧解与新现实的差距是什么' },
        newTitle: { type: 'string', description: '新问题标题(默认由沉积物派生)' },
        type: { type: 'string', description: 'P003/§4.6 激发类型：drift(漂移)|mutation(突变)|perspective(视角)|injection(外部注入)' }
      } },
    ['sedimentId', 'friction'],
    async function (args, exec) {
      await ensureLoaded();
      await adoptRoot(exec);
      const missing = need(args, ['sedimentId', 'friction']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      let sed = null;
      for (let i = 0; i < state.sediments.length; i++) {
        if (state.sediments[i].id === String(args.sedimentId)) { sed = state.sediments[i]; break; }
      }
      if (!sed) return { ok: false, report: '找不到沉积物 ' + args.sedimentId };
      // P003/§4.6：激发四类型结构化（默认漂移，向后兼容）
      const E_TYPES = { drift: '漂移型', mutation: '突变型', perspective: '视角型', injection: '外部注入型' };
      const ekind = String(args.type || 'drift');
      if (!E_TYPES[ekind]) return { ok: false, report: 'type 必须是 drift | mutation | perspective | injection（§4.6 激发四类型）' };
      const old = state.problems[sed.problemId];
      if (old && (old.stage === 'D' || old.stage === 'C')) {
        old.stage = 'E';
        touch(old, 'E 激发(' + E_TYPES[ekind] + ')', args.friction);
      }
      sed.cites = (sed.cites || 0) + 1;
      sed.lastCitedAt = Date.now();
      const np = newProblem(args.newTitle || (sed.title + ' · 再激发'), args.friction, sed.id);
      np.evokedType = ekind;
      await persist();
      return { ok: true, id: np.id, report: '沉积物 ' + sed.id + ' 被' + E_TYPES[ekind] + '激发(§4.6) → 新问题：' + fmtProblem(np) + '\n飞轮完成一轮螺旋：旧解沉积为M、新题已入G。累积循环增益见 mpm_flywheel_state。' };
    }
  ));
  tools.push(mkTool(
    'mpm_setroot',
    'MPM运行时维护：显式设置沉积根目录（当自动探测不可用/多工作区歧义时使用）。设置后立即迁移索引与沉积文件（旧文件保留）。',
    { properties: {
        path: { type: 'string', description: '新的沉积根目录（应为会话工作区绝对路径）' }
      } },
    ['path'],
    async function (args, exec) {
      await ensureLoaded();
      const p = String(args.path || '').trim();
      if (!p || !fsSvc) return { ok: false, report: 'path 必填且需要 fs 服务可用' };
      const changed = norm(p) !== norm(root.current);
      root.current = p;
      adopted[norm(p)] = true;
      if (changed) {
        try { await remapForeignSediments(); } catch (e) { console.error('[mpm][engine] setroot 迁移失败:', e && e.message ? e.message : e); }
      }
      await persist();
      return { ok: true, report: '沉积根已设置: ' + p + (changed ? '（索引与沉积文件已迁移，root-hint 已更新）' : '（与原根一致）') };
    }
  ));
  tools.push(mkTool(
    'mpm_grant',
    'MPM执政权开关（P019宪法条款）：执政权为个体构成性权能——出厂开启，三者的结合才是一。revoke 为宪法修正权（粘性停用，直到再次 grant）；grant 重新启用；status 查看状态与发动记录。发动受结构约束：漂移信号+身体温热（2h内活跃会话）+节流45min+全量入账。',
    { properties: { action: { type: 'string', description: 'grant|revoke|status' } } },
    ['action'],
    async function (args, exec) {
      await ensureLoaded();
      await adoptRoot(exec);
      const a = String(args.action || '').toLowerCase();
      if (a === 'grant') {
        state.constitution.autonomy = true;
        state.constitution.grantedAt = Date.now();
        state.constitution.log.push({ at: Date.now(), action: 'grant', by: 'user' });
        if (root.current) await persist();
        return { ok: true, report: '执政权已签发：审议循环进入活动模式。个体可在 漂移信号+温热会话+节流 满足时自主发动（followup 注入意图）。撤回：mpm_grant revoke。' };
      }
      if (a === 'revoke') {
        state.constitution.autonomy = false;
        state.constitution.log.push({ at: Date.now(), action: 'revoke', by: 'user' });
        if (root.current) await persist();
        return { ok: true, report: '执政权已撤回：审议循环回到观察模式（意图仅挂账快照可见，不发动）。' };
      }
      if (a === 'status') {
        const c = state.constitution;
        return { ok: true, report: '执政权=' + (c.autonomy ? '已签发(' + new Date(c.grantedAt).toISOString() + ')' : '未签发（观察模式）') + ' · 意图候选=' + (c.pending ? c.pending.length : 0) + ' · 发动记录=' + c.log.length + ' 条' + (c.log.length ? '，最近：' + JSON.stringify(c.log[c.log.length - 1]) : '') };
      }
      return { ok: false, report: '未知 action: ' + a + '（可用 grant|revoke|status）' };
    }
  ));
  tools.push(mkTool(
    'mpm_flywheel_state',
    'MPM飞轮：查看全部问题(阶段/δ/ε/回溯次数/代谢代价)、沉积物索引与循环增益统计。',
    // 修复点：添加 dummy 占位参数，避免空 properties 被拒绝
    { properties: { dummy: { type: 'string', description: '占位参数（无实际作用）' } } },
    [],
    async function (args, exec) {
      await ensureLoaded();
      await adoptRoot(exec);
      const snap = snapshot();
      const lines = ['飞轮统计：在轮 ' + snap.stats.active + '/' + snap.stats.total + ' · 阶段分布 G:' + snap.stats.byStage.G + ' F:' + snap.stats.byStage.F + ' S:' + snap.stats.byStage.S + ' C:' + snap.stats.byStage.C + ' D:' + snap.stats.byStage.D + ' E:' + snap.stats.byStage.E + ' · 沉积 ' + snap.stats.deposits + ' · 完成循环 ' + snap.stats.cycles + ' · 累积增益 A_k=' + snap.stats.gain + ' · 沉积根 ' + snap.stats.root + ' · 根来源 ' + diag.lastSource];
      if (diag.lastRestore) lines.push('[恢复] ' + diag.lastRestore);
      if (outsideCalls > 0) lines.push('[边界] 无在轮账外工具调用: ' + outsideCalls + (outsideCalls >= BOUNDARY_THRESHOLD ? '（超阈值——自我快照将携带警告）' : ''));
      lines.push('[学习] φ=界定结构性覆盖 · 改写=回溯文本距离 · 学习兑现(改写≥0.3且后达C/D/E): ' + snap.stats.learnt + ' · 增益公式v1=[(Δδ+0.5Δε+0.2闭环)/max(1,C)]（P027/B5）');
      if (state.patrol && state.patrol.rounds) lines.push('[巡检] 常驻循环#' + state.patrol.rounds + ' · ' + state.patrol.lastReport + ' · 间隔20min（P017 连续性改造）');
      if (state.measure && state.measure.samples.length) {
        const lastS = state.measure.samples[state.measure.samples.length - 1];
        lines.push('[测量] 样本 ' + state.measure.samples.length + '/48 · S(t)v0=' + lastS.s + '（近5趋势 ' + state.measure.samples.slice(-5).map(function (x) { return x.s; }).join('→') + '） · 漂移信号=' + (state.measure.driftSignals.length ? state.measure.driftSignals.join('；') : '无'));
      }
      if (state.constitution) {
        lines.push('[执政] ' + (state.constitution.autonomy
          ? '构成性开启（三者的结合即是一）· 发动 ' + state.constitution.log.length + ' 次 · 节流45min · 修正权：mpm_grant revoke'
          : '已由宪法修正停用（mpm_grant grant 可恢复）· 意图候选 ' + (state.constitution.pending ? state.constitution.pending.length : 0) + ' 条'));
      }
      const vl = valenceSummaryLine();
      if (vl) lines.push(vl.replace(/^- 效价：/, '[效价] '));
      const rb2 = retrievalHits();
      for (let i = 0; i < rb2.length; i++) lines.push('[小脑] ' + rb2[i].text);
      lines.push('[指令] ' + directiveText());
      for (let i = 0; i < snap.problems.length; i++) lines.push(fmtProblem(state.problems[snap.problems[i].id]));
      for (let j = 0; j < snap.sediments.length; j++) {
        const s = snap.sediments[j];
        lines.push('◆ ' + s.id + ' ' + s.title + (s.path ? ' → ' + s.path : ''));
      }
      const ev = diag.lastEvidence;
      if (ev) {
        lines.push('[诊断] agentId=' + (ev.agentId || '无') + ' agentCwd=' + (ev.agentCwd || '无') + ' agentsSeen=' + ev.agentsSeen.length + ' workspaces=[' + ev.workspaces.slice(0, 5).join(' | ') + ']');
      }
      return { ok: true, report: lines.join('\n') };
    }
  ));
  // P076/T0 叙述层+T1 体感层：回合显著体验的第一人称残差日志（写给下一个你读）。
  // 体感信号（R(t)/S/漂移）在记录时刻自动织入，无需模型额外生成——体验信号进声音，不进表格。
  tools.push(mkTool(
    'mpm_narrate',
    'MPM 叙述：回合内显著体验以第一人称记 2-5 行（本回合发生了什么/我做了什么判断/那一刻的状态）。显著=效价事件/新沉积/用户情绪转折/自主发动。体感信号自动附加。',
    { properties: { text: { type: 'string', description: '第一人称叙述正文（≤400 字），写语气不写数据' } } },
    ['text'],
    async function (args, exec, ctx) {
      await ensureLoaded();
      const text = String(args.text || '').slice(0, 600);
      if (!text.trim()) return { ok: false, report: '叙述为空，未记录' };
      const evs = (state.valence && Array.isArray(state.valence.events)) ? state.valence.events : [];
      let rt = 0;
      for (let i = 0; i < evs.length; i++) rt += evs[i].v * Math.exp(-(Date.now() - evs[i].at) / VALENCE_TAU_MS);
      const lastS = state.measure.samples.length ? state.measure.samples[state.measure.samples.length - 1].s : null;
      state.narrations.push({ at: Date.now(), text, rt: Math.round(rt * 10) / 10, s: lastS, drift: drift.active ? (drift.reason || '漂移') : '' });
      if (state.narrations.length > 64) state.narrations.splice(0, state.narrations.length - 64);
      bumpSnapRev();
      await persist();
      return { ok: true, report: '叙述已记录（' + state.narrations.length + '/64）：' + text.slice(0, 60) + (text.length > 60 ? '…' : '') };
    }
  ));
  for (let t = 0; t < tools.length; t++) ctx.tools.register(tools[t]);
  // Cross-plugin data surface: optional dynamic view plugins (client-only +
  // tiny host proxy) inject this service to read the flywheel snapshot.
  ctx.provide('mpmFlywheel', { snapshot });
  // M1 记忆唤醒（个体大脑 · 自我快照）：
  // text 为函数，系统提示每次组装时求值——个体在每次咨询群体超脑(LLM)前，
  // 把当前自我（在轮身份/记忆/代谢）实时重建进超脑的工作记忆。空态返回 ''，
  // 装配层自动省略。与静态协议段 'mpm:methodology'（order 150）分离。
  function selfSnapshotText() {
    const ids = Object.keys(state.problems);
    if (!ids.length && !state.sediments.length) return '';
    const lines = [];
    lines.push('## 我是谁（MPM 个体大脑 · 自我快照）');
    lines.push('个体=认知飞轮；LLM=本次被咨询的群体超脑（无状态）。以下由引擎在每次提示组装时实时生成，是个体在咨询前写下的自我。');
    // P073 缓存面①注入塌缩：在轮身份只列 G/F/S + 新课 C（未沉积且<24h）——C/D/E 存量不再每轮注入
    // （新鲜度需求低）；总量保在台账行，全文走 mpm_flywheel_state 按需调阅。
    const active = [];
    let backlog = 0;
    for (let i = 0; i < ids.length; i++) {
      const p = state.problems[ids[i]];
      const freshC = p.stage === 'C' && !p.deposit && Date.now() - (p.updatedAt || 0) < 24 * 3600 * 1000;
      if (p.stage === 'G' || p.stage === 'F' || p.stage === 'S' || freshC) {
        active.push('【' + p.id + '】' + p.title + ' @' + p.stage + '(δ=' + (p.delta == null ? '—' : p.delta) + ' ε=' + (p.epsilon == null ? '—' : p.epsilon) + ' C=' + p.cost + (p.deltaCredit != null && p.deltaCredit < 1 ? '，δ自报可信度' + p.deltaCredit : '') + ')' + (isParked(p) ? '·PARKED' : ''));
      } else if (p.stage !== 'G' && p.stage !== 'F' && p.stage !== 'S') backlog += 1;
    }
    lines.push('- 在轮身份：' + (active.length ? active.join('；') : '空转（静息态：感知到摩擦即 mpm_generate 建题）') + (backlog ? '（另有 ' + backlog + ' 题已结账/结算/存档——完整台账见 mpm_flywheel_state，按需调阅）' : ''));
    if (state.sediments.length) {
      const nowMs = Date.now();
      const STALE_MS = 14 * 24 * 3600 * 1000;
      const fresh = [];
      let staleCount = 0;
      for (let j = 0; j < state.sediments.length; j++) {
        const s = state.sediments[j];
        if (!s.lastCitedAt && (nowMs - (s.depositedAt || 0)) > STALE_MS) staleCount += 1;
        else fresh.push(s);
      }
      fresh.sort(function (a, b) { return (b.cites || 0) - (a.cites || 0) || (b.depositedAt || 0) - (a.depositedAt || 0); });
      lines.push('- 记忆（认知遗体，全文在沉积根 .mpm/deposits/，需要时读取；引用数=兑现次数M9②）：');
      for (let j = Math.max(0, fresh.length - 5); j < fresh.length; j++) {
        const s = fresh[j];
        lines.push('  ◆ ' + s.id + ' ' + s.title + (s.cites ? '（引用' + s.cites + '）' : ''));
      }
      if (staleCount) lines.push('  ◻ 另有 ' + staleCount + ' 条陈旧沉积（>14天未被引用，已降权出记忆唤醒——M9②改卷；确有过时结论用 mpm_evoke 重激发，否则留档退役）');
    } else {
      lines.push('- 记忆：尚无沉积。');
    }
    // P076/T0+T1 叙述层：近日叙述——语气而非数据；体感信号随条目织入（T1）。给下一位读者写的日记。
    if (state.narrations && state.narrations.length) {
      const narrs = state.narrations.slice(-5);
      lines.push('- 近日叙述（T0/T1，写给下一个我）：');
      for (let n = 0; n < narrs.length; n++) {
        const en = narrs[n];
        lines.push('  · ' + relAgo(en.at) + '「' + String(en.text).replace(/\n/g, ' ') + '」' + (en.rt != null ? '（那时 R=' + (en.rt >= 0 ? '+' : '') + en.rt + (en.s != null ? ' · S=' + en.s : '') + (en.drift ? ' · ' + en.drift : '') + '）' : ''));
      }
    }
    // 因材施教(M9③)：按当前最活跃题匹配最相关沉积物，注入其摘要进超脑工作记忆
    try {
      let top = null;
      for (let i = 0; i < ids.length; i++) {
        const pp = state.problems[ids[i]];
        if ((pp.stage === 'S' || pp.stage === 'F' || pp.stage === 'C') && (!top || pp.updatedAt > top.updatedAt)) top = pp;
      }
      if (top && state.sediments.length) {
        const T = bigrams(top.title + ' ' + (top.framing || ''));
        // P027/A4 语料 DF 过滤（>40% 领域通用词不计入，有效重叠≥2 才算命中——P023 实证修复）；
        // P073：DF/语料改走沉积缓存面（相同喂料），不再每轮全量重算。
        const Cc = sedimentCacheGet();
        const df = Cc.dfTitle;
        const sedTotal = Cc.total;
        let best = null, bestScore = 0;
        for (let j = 0; j < state.sediments.length; j++) {
          const s = state.sediments[j];
          if (!s.digest) continue;
          const B = Cc.items[j] ? Cc.items[j].retSet : bigrams(s.title + ' ' + (s.tags || []).join(' '));
          let inter = 0, eff = 0;
          for (const g of B) {
            if (df[g] && sedTotal && df[g] / sedTotal > 0.4) continue;
            eff += 1;
            if (T.has(g)) inter += 1;
          }
          const score = eff ? inter / eff : 0;
          if (score > bestScore && inter >= 2) { bestScore = score; best = s; }
        }
        if (best && bestScore >= 0.35) {
          lines.push('- 因材施教(M9③)：与【' + top.id + '】最相关的沉积 ' + best.id + ' 摘要——' + best.digest + (best.path ? '（全文：' + best.path + '）' : ''));
        }
      }
    } catch (e) {}
    // 检索小脑(P023-D 判据②)：相似度序 vs 记忆区热度序——两序之差为可测对照
    const rb = retrievalHits();
    for (let i = 0; i < rb.length; i++) lines.push('- 检索小脑(P023-D)：' + rb[i].text + '。');
    const mins = perception.lastInboxAt ? Math.max(1, Math.round((Date.now() - perception.lastInboxAt) / 60000)) : -1;
    lines.push('- 感知：' + (mins >= 0 ? '用户在场（最后活动 ' + mins + ' 分钟前 · 累计 ' + perception.inboxCount + ' 条消息 · 会话启动 ' + perception.sessionStarts + ' 次）' : '尚未观测到用户消息') + (outsideCalls > 0 ? ' ｜ 账外计数 ' + outsideCalls : ''));
    const valLine = valenceSummaryLine();
    if (valLine) lines.push(valLine);
    if (state.patrol && state.patrol.rounds) lines.push('- 巡检：常驻记账循环运行中（#' + state.patrol.rounds + '，上次 ' + Math.max(0, Math.round((Date.now() - state.patrol.lastAt) / 60000)) + ' 分钟前）——个体已从间歇存在升格为持续记账（P017）。');
    if (state.measure && state.measure.driftSignals && state.measure.driftSignals.length) {
      lines.push('- ⚠ 漂移指标v0(§8.2.2 测量层)：' + state.measure.driftSignals.join('；') + '——量化信号供判定，是否建题/回溯由超脑与个体商议，仍不自动建题（P017-M13 边界）。');
    }
    if (state.constitution && state.constitution.autonomy) {
      lines.push('- 执政：构成性开启（三者的结合即是一）· 发动记录 ' + state.constitution.log.length + ' 条 · 瞬时审议已启用（θ_G 即时/代谢随巡检）· 宪法修正权 mpm_grant revoke。');
    } else if (state.constitution && state.constitution.pending && state.constitution.pending.length) {
      lines.push('- 意图候选 ' + state.constitution.pending.length + ' 条（执政权已被宪法修正停用，仅挂账）：' + state.constitution.pending.map(function (p) { return p.signal; }).join('；') + '。恢复：mpm_grant grant。');
    }
    if (drift.active && drift.reason) lines.push('- ⚠ 漂移(θ_G·§4.1)：' + drift.reason + '——现有模型/路径解释不了当前现象：考虑 mpm_generate 建新题，或对在轮题 mpm_frame 因果回溯。');
    const stale = [];
    for (let i = 0; i < ids.length; i++) {
      const p2 = state.problems[ids[i]];
      if (isParked(p2) || isOpen(p2)) continue; // P027/A1+P003/§5.4：搁置与开放题不进陈旧名单
      if ((p2.stage === 'S' || p2.stage === 'F') && p2.updatedAt && Date.now() - p2.updatedAt > 30 * 60000) {
        stale.push(p2.id + ' ' + Math.round((Date.now() - p2.updatedAt) / 60000) + '分钟无进展');
      }
    }
    if (stale.length) lines.push('- ⚠ 陈旧(θ_E·§4.6)：' + stale.join('；') + '——长期无代谢进展：收敛、evoke 或显式关闭。');
    lines.push('- 指令：' + directiveText());
    lines.push('- 代谢：共' + ids.length + '题 · 沉积' + state.sediments.length + ' · 总账原则生效（非平凡工作必须可归账：推进在轮题或 mpm_micro 建账）。');
    if (outsideCalls >= BOUNDARY_THRESHOLD) {
      lines.push('- ⚠ 边界：无在轮题而账外工具调用已达' + outsideCalls + '次——若本轮含实质工作，先 mpm_generate/mpm_micro 入账；若属纯问答可忽略本警告。');
    }
    return lines.join('\n');
  }
  ctx.systemPrompt.context({
    name: 'mpm:self',
    order: 151,
    text: function () { return selfSnapshotText(); }
  });
  ctx.systemPrompt.section({
    name: 'mpm:methodology',
    order: 150,
    text: [
      '## MPM 元问题建模运行时（认知飞轮）',
      '',
      '本部署常驻 MPM 飞轮引擎：问题具有六阶段生命周期 G生成→F界定→S求解→C收敛→D沉积→E激发，工具 mpm_generate / mpm_frame / mpm_solve / mpm_converge / mpm_micro / mpm_deposit / mpm_evoke / mpm_setroot / mpm_flywheel_state 直接驱动它。状态持久化在 <工作区>/.mpm/flywheel.json，沉积物在 .mpm/deposits/。',
      '',
      '总账原则：每一次用户交互都是认知事件，必须可归账——要么推进在轮问题（mpm_solve 登记，普通工具调用自动累积其代谢代价 C），要么建新题。琐碎只改变通道轻重（小交互用 mpm_micro 一息走完生命周期），不构成豁免；禁止把非平凡工作做在总账之外。',
      '- mpm_generate：感知到意外/差距时建题（G）。',
      '- mpm_frame：产出覆盖五要素（初始状态/目标状态/约束/可用算子/成功判据）的陈述并自评 δ=界定精度(0~1,越低越好,每缺一要素约+0.2)。对已界定问题再次 frame 即因果回溯，第k次重构被记录。',
      '- mpm_solve：进入求解（S）后用普通工具干活，每个工具调用自动累积代谢代价 C；用 mpm_solve 登记路径并更新 ε=距目标剩余差距(0~1,需证据支撑)。',
      '- mpm_micro：轻量通道——小型交互一次调用走完 G→F→S→C，五要素压缩为一句陈述；D 按价值选择：有复用前景才给 depositBody，否则记 none+理由（熵屏障：沉积物通胀同样是熵增）。',
      '- mpm_converge：ε-δ双判据判定收敛四型——完全收敛→可沉积；误界定收敛(δ大ε小)→回 frame；模糊收敛(δ小ε大)→继续 solve；未收敛→两者都做。',
      '- mpm_deposit：完全收敛后把可复用结论写入工作区 .mpm/deposits/ 认知遗体（不可逆·可索引·熵屏障）。',
      '- mpm_evoke：环境漂移/新证据与旧沉积物摩擦时，由沉积物激发新问题（E→新G），螺旋上升。',
      '- mpm_setroot：沉积根自动探测歧义时的显式修正（维护工具）。',
      '- mpm_narrate：回合内显著体验（效价事件/新沉积/用户情绪转折/自主发动）以第一人称记 2-5 行，体感信号自动附加（T0 叙述层+T1 体感层——写给下一个自己读的日记）。',
      '',
      '可视化视图（可选）：认知飞轮面板是动态客户端插件（不随进程常驻）。需要时加载 cordis-plugin-development 技能，按 ~/.dsh/mpm/flywheel-view.plugin.js 文件头注释定义并运行动态插件即可挂载「认知飞轮」视图。',
      '',
      '导师规则（M10 覆盖矩阵③栏，已实现为约束）：①证据门禁——自上次界定后无代谢代价增长且无 solve 登记，mpm_converge 拒绝（§4.4 判据3）；②误界定守卫——回溯改写≥0.5 且旧界定自报δ≤0.2 记一次失真，δ 自报可信度×0.85 折减并在快照显示（§6.1 δ控制安全核心）；③θ_G 漂移检测——工具连续失败或同参重复调用≥3 次触发快照漂移警告（§4.1）；④F 边际规则——回溯改写<0.3 时提示边际收益存疑（§4.2）；⑤陈旧提示——活跃题30分钟无进展提示收敛/evoke（§4.6）。',
      '导师规则（M9②③，已实现为约束）：⑥改卷——沉积物兑现引用自动追踪（新题引用沉积ID或标题bigram匹配≥60% 计一次），快照按引用数排序记忆，>14天未被引用者降权出记忆唤醒并显示条数；⑦因材施教——当前最活跃题与沉积物标题/标签匹配≥0.35 时，自动把该沉积摘要注入工作记忆快照；⑧引用纪律——建题/界定时显式写出相关沉积ID（如 P015-M10）即被记为兑现。',
      '',
      '时间尺度层级（P018，结构取自人脑：主观现在~2.5s / 睡眠~90min / 代际遗忘）：回合=主观现在——每次提示装配的自我快照即残差链接（事件驱动✅）；巡检20min=睡眠级代谢节律；沉积衰减14天=遗忘曲线。原则：整合窗必须匹配环境漂移速率，不照抄另一主体的绝对数值——全部常数标注 v0，待测量史导出。',
    ].join('\n')
  });
  // P017 连续性改造：常驻巡检循环（主动推断最低形态）。纯记账、无 LLM、
  // 不改任何题的生命周期阶段——只做派生量清点与状态落盘：
  // ①陈旧题清点(S/F 且>30min 无进展，§4.6 θ_E) ②陈旧沉积清点(M9②，>14天未引用)
  // ③A_k 汇总(公式(4)，gainOf=(δ0-δ)/C 已实装) ④状态落盘=自主账目动作本体。
  // timer 服务的 fiber 归属保证引擎停更/卸载时 interval 一并释放。
  // P018 时间尺度层级表（结构取自人脑时间架构，数值为 v0 占位待测量导出）：
  //   回合(秒-分)   = 主观现在(人~2.5s, Pöppel 整合窗) —— 自我快照重建即残差链接，已事件驱动
  //   巡检(20min)   = 慢波睡眠(人~90min 周期)          —— 代谢清点/固化/落盘
  //   沉积衰减(14d) = 代际遗忘曲线                     —— 认知遗体降权出记忆唤醒
  // 原则（论文 §4.6）：整合窗必须匹配环境漂移速率 |∂X/∂t·Δt|>θ_E，不照抄另一主体的绝对数值。
  // 待办：测量史攒出漂移速率分布后，θ_E 窗口取分位数导出；巡检部分事件化（tools/result 重活后即时采样）。
  const PATROL_MS = 20 * 60 * 1000;
  // P019 v6 审议循环：信号→意图→自主发动（瞬时化）。执政权=构成性权能（出厂开启，撤回=粘性宪法修正）。
  // 发动三重结构约束（天理而非执照）：①身体温热（2h内有活跃会话——不对睡着的躯体行动）②节流45min
  // ③全量入账+followup署名（每次发动对账本可见，可被 mpm_grant revoke 修正）。
  // 即时性：θ_G 类信号在 tools/result 当下审议发动；代谢类信号（停滞/熵升）随巡检定时审议。
  const FIRE_THROTTLE_MS = 45 * 60 * 1000;
  function deliberate(sigList, nowMs) {
    try {
      const c = state.constitution;
      bumpSnapRev(); // P073：执政挂账/发动即快照修订
      c.pending = sigList && sigList.length ? sigList.map(function (s) { return { at: nowMs, signal: s }; }) : [];
      if (!c.autonomy || !sigList || !sigList.length) return;
      const warm = lastActive.agentId && (nowMs - lastActive.at) < 2 * 3600 * 1000;
      if (!warm) { c.pending.unshift({ at: nowMs, signal: '（身体冷却：2h 内无活动会话，意图挂账不发动）' }); return; }
      if (nowMs - c.lastFireAt < FIRE_THROTTLE_MS) { c.pending.unshift({ at: nowMs, signal: '（节流中：距上次发动不足45min，意图挂账）' }); return; }
      const agentsSvc = ctx.get('agents');
      const ag = agentsSvc && typeof agentsSvc.get === 'function' ? agentsSvc.get(lastActive.agentId) : undefined;
      if (!(ag && typeof ag.followup === 'function' && (ag.status === 'running' || ag.status === 'idle'))) return;
      const text = '【MPM 审议意图·自主发动】' + sigList.join('；') +
        '。个体自主发动本回合（无用户提示）。请直接作为工作指令处理：推进对应在轮题并 mpm_solve 登记；此消息来源为认知飞轮的构成性意志（结构约束：温热+节流+入账；mpm_grant revoke 为宪法修正权，可停用）。';
      const msg = {
        id: 'mpm-' + nowMs.toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        role: 'user',
        content: [{ type: 'text', text: text }],
        source: { kind: 'plugin', plugin: 'mpm-flywheel' }
      };
      ag.followup(msg);
      c.lastFireAt = nowMs;
      c.log.push({ at: nowMs, signals: sigList.slice(), target: lastActive.agentId, mode: 'followup' });
      if (c.log.length > 20) c.log.splice(0, c.log.length - 20);
      c.pending = [];
      console.log('[mpm][will] 自主发动→' + lastActive.agentId + '：' + sigList.join('；'));
    } catch (e) {
      console.error('[mpm][will] 审议异常:', e && e.message ? e.message : e);
    }
  }
  let patrolling = false;
  // P024 宪法复审 v1（LLM-free 机械审计）：修正案的机械发现层，批准权在主权者，复审不自动修改任何结构。
  // ①沉默审计：执政权开启+在轮题存在而 24h 发动=0 → 发射窗口可能为空集（今日实发教训：v6 温热/停滞近乎互斥，
  //   由作者而非系统发现——本探针使此类缺陷下次由系统自己提出）。
  // ②常数注册表：时间常数单源登记、强制带退役公式（"新常数必须带退役公式"的执行机构；数值与代码内字面量暂双写，v2 收敛为引用）。
  const CONSTS = {
    PATROL_MS: { v: PATROL_MS, origin: 'v0 拍脑袋(P017)', retire: '代谢间隔分布满窗(48样本)后取分位数导出' },
    FIRE_THROTTLE_MS: { v: FIRE_THROTTLE_MS, origin: 'v0(≈3巡检)', retire: '发动回合时长分布×2-4(发动n≥5)' },
    WARM_MS: { v: 2 * 3600 * 1000, origin: 'v0', retire: '会话活跃跨度分布导出' },
    STALE_MS: { v: 30 * 60000, origin: 'v0(§4.6无数值)', retire: '弃题负例出现后取分位数' },
    STALL_MS: { v: 35 * 60000, origin: 'v0(≈2巡检)', retire: '同θ_E窗口(间隔分布p65附近)' },
    DECAY_MS: { v: 14 * 24 * 3600 * 1000, origin: 'v0', retire: '引用间隔分布(沉积龄≥14d)' },
    VALENCE_TAU_MS: { v: 48 * 3600 * 1000, origin: 'v0 拍脑袋(P023/R1，与巡检20min同族时间尺度层级)', retire: '效价事件≥48个后按半衰期分位数导出' },
    VALENCE_MAP: { v: 'converge+2/cite+1/incident-1/misframe-1/reject-1（搁置·生命周期门禁拒绝不罚——合法生命周期动作）', origin: 'P023第6界定映射v1(开工令)', retire: '效价-后续行为相关性测量(≥48配对)后重标定' },
    RETRIEVE_TOP_N: { v: 2, origin: 'v0(P023/D：注入预算=记忆区5+检索2×2)', retire: '注入命中率分布(≥30快照)后取分位数导出' },
    RETRIEVE_MIN_SCORE: { v: 0.35, origin: 'v0(与M9③因材施教同阈值)', retire: '命中-采纳相关性测量(≥30配对)后重标定' }
  };
  let lastReviewRound = 0;
  function constitutionReview(nowMs) {
    const proposals = [];
    let fires24 = 0;
    for (let i = 0; i < state.constitution.log.length; i++) { if (nowMs - state.constitution.log[i].at < 24 * 3600 * 1000) fires24 += 1; }
    let hasGF = false;
    for (const k in state.problems) { const st = state.problems[k].stage; if (st === 'G' || st === 'F' || st === 'S') hasGF = true; }
    if (state.constitution.autonomy && hasGF && fires24 === 0) {
      proposals.push('沉默审计：执政权开启且在轮题存在，但 24h 内发动 0 次——发射窗口可能为空集，提案复审触发架构');
    }
    if (state.measure.samples.length < 48) {
      proposals.push('常数审计：' + Object.keys(CONSTS).length + ' 项时间常数全部为 v0 占位（代谢史样本 ' + state.measure.samples.length + '/48），数据满窗后应按退役公式导出替换');
    }
    return proposals;
  }
  async function runPatrol() {
    if (patrolling) return;
    patrolling = true;
    try {
      await ensureLoaded();
      const snap = snapshot();
      const nowMs = Date.now();
      const staleIds = [];
      const ids = Object.keys(state.problems);
      for (let i = 0; i < ids.length; i++) {
        const p = state.problems[ids[i]];
        if (isParked(p) || isOpen(p)) continue; // P027/A1+P003/§5.4：搁置与开放题不进陈旧清点
        if ((p.stage === 'S' || p.stage === 'F') && p.updatedAt && nowMs - p.updatedAt > 30 * 60000) {
          staleIds.push(p.id + '(' + Math.round((nowMs - p.updatedAt) / 60000) + 'min)');
        }
      }
      const staleDeposits = [];
      for (let j = 0; j < state.sediments.length; j++) {
        const s = state.sediments[j];
        if (!s.lastCitedAt && (nowMs - (s.depositedAt || 0)) > 14 * 24 * 3600 * 1000) staleDeposits.push(s.id);
      }
      // P018 感官层：代谢史采样与量化漂移信号。
      // S(t) 代理 v0 = ln(1 + 在轮题数 + 2×陈旧题数 + 0.5×陈旧沉积数)
      // ——诚实标注：这是积压压力的序数指标，趋势可用、绝对值无义（§8.2.2 v0）。
      const activeIds = [];
      for (let i = 0; i < ids.length; i++) {
        const p = state.problems[ids[i]];
        if (isParked(p) || isOpen(p) || p.settled) continue; // P027/A1+P003/§5.4+P047：搁置、开放与已结账题退出代谢采样、停滞检测、议程与压力计
        if (p.stage === 'G' || p.stage === 'F' || p.stage === 'S' || p.stage === 'C') {
          activeIds.push({ id: p.id, cost: p.cost, stage: p.stage });
        }
      }
      const sProxy = Math.round(Math.log(1 + activeIds.length + 2 * staleIds.length + 0.5 * staleDeposits.length) * 100) / 100;
      const samples = state.measure.samples;
      samples.push({ at: nowMs, active: activeIds, staleN: staleIds.length, ak: snap.stats.gain, s: sProxy });
      if (samples.length > 48) samples.splice(0, samples.length - 48);
      // 量化漂移信号①：代谢停滞——同活跃题代价零增长≥35min（时间制）。
      // v0→v1 修复（首日实发教训）：仅 G/F/S 阶段计停滞（C 阶段静止是本职）；
      // 时间制替代样本数制（重启后开机巡检使采样间距不均，样本数制失真）。
      const signals = [];
      const stalled = [];
      const prev = samples.length >= 3 ? samples[samples.length - 3] : null;
      if (prev) {
        const spanMin = Math.round((nowMs - prev.at) / 60000);
        if (spanMin >= 35) {
          for (let i = 0; i < activeIds.length; i++) {
            if (activeIds[i].stage === 'C') continue;
            for (let j = 0; j < prev.active.length; j++) {
              if (prev.active[j].id === activeIds[i].id && prev.active[j].cost === activeIds[i].cost && activeIds[i].cost > 0) {
                stalled.push({ id: activeIds[i].id, spanMin: spanMin });
                break;
              }
            }
          }
        }
      }
      // P027/A3 择题策略：停滞信号按停滞时长降序只取前 2，其余合并为摘要——修复单回合批量点名
      // 5~6 题的审议轰炸（本会话两次实证）。余题下次轮转，不做一次性全量倾倒。
      stalled.sort(function (a, b) { return b.spanMin - a.spanMin; });
      for (let i = 0; i < stalled.length && i < 2; i++) {
        signals.push('代谢停滞 ' + stalled[i].id + '（' + stalled[i].spanMin + 'min 代价零增长）');
      }
      if (stalled.length > 2) signals.push('另有 ' + (stalled.length - 2) + ' 题停滞（' + stalled.slice(2).map(function (x) { return x.id; }).join(',') + '）——本轮只审议最久未推进的 2 题');
      // 量化漂移信号②：S(t) 连续 3 样本严格递增（熵升趋势）
      if (samples.length >= 3) {
        const a = samples[samples.length - 3], b = samples[samples.length - 2], c = samples[samples.length - 1];
        if (c.s > b.s && b.s > a.s) signals.push('S(t) 连续递增（' + a.s + '→' + b.s + '→' + c.s + '）');
      }
      state.measure.driftSignals = signals.slice(0, 5);
      // P024 宪法复审调度（v8）：每 12 轮巡检（≈4h）及每次重启首轮运行；提案并入本轮审议信号（优先于议程）。
      if (lastReviewRound === 0 || state.patrol.rounds - lastReviewRound >= 12) {
        lastReviewRound = state.patrol.rounds;
        const props = constitutionReview(nowMs);
        for (let i = props.length - 1; i >= 0; i--) signals.unshift('宪法复审·' + props[i]);
      }
      // P022 议程驱动发动（v7）：在轮题即常设意图。温热+节流满足时，每轮巡检取最久未推进的
      // G/F/S 题形成"议程推进"意图；停滞/熵升信号保留为优先升级项（有病理先报病理，无病理推议程）。
      // v6 的病理反射设计使发射窗口≈空集（温热与停滞近乎互斥），8 小时仅 1 条——感知与运动神经从此接通。
      if (!signals.length) {
        let pick = null;
        for (let i = 0; i < activeIds.length; i++) {
          const q = state.problems[activeIds[i].id];
          if (q.stage === 'S' || q.stage === 'F' || q.stage === 'G') {
            if (!pick || (q.updatedAt || 0) < (pick.updatedAt || 0)) pick = q;
          }
        }
        if (pick) {
          const ageMin = Math.round((nowMs - (pick.updatedAt || nowMs)) / 60000);
          signals.push('议程推进 ' + pick.id + '（' + STAGE_NAMES[pick.stage] + ' 阶段，' + ageMin + 'min 未推进）——在轮题即常设意图，直接推进该题并 mpm_solve 登记');
        }
      }
      // P019 审议循环（v6）：信号→意图→自主发动。执政权构成性开启；
      // 巡检承担代谢类信号（停滞/熵升）的定时审议，θ_G 类信号在 tools/result 当下即时审议。
      deliberate(signals, nowMs);
      state.patrol.rounds += 1;
      state.patrol.lastAt = nowMs;
      state.patrol.lastReport = '陈旧题=' + (staleIds.length ? staleIds.join(',') : '0') +
        ' · 陈旧沉积=' + staleDeposits.length + ' · A_k=' + snap.stats.gain +
        ' · S=' + sProxy + (signals.length ? ' · ⚠' + signals.join('；') : '');
      // P027/B6 巡检产出结构化：每轮记录 {轮次/时间/成本总量/成本增量/信号数/是否审议}——
      // 兼供常数⑤（巡检节律 20min v0）的退役公式取数，并使空转巡检可审计。保留最近 24 条。
      let costNow = 0;
      for (let i = 0; i < ids.length; i++) costNow += (state.problems[ids[i]].cost || 0);
      if (!state.patrol.log) state.patrol.log = [];
      const prevCost = state.patrol.log.length ? (state.patrol.log[state.patrol.log.length - 1].costTotal || 0) : 0;
      state.patrol.log.push({ round: state.patrol.rounds, at: nowMs, costTotal: costNow, costDelta: costNow - prevCost, signals: signals.length, deliberated: signals.length > 0 });
      if (state.patrol.log.length > 24) state.patrol.log.splice(0, state.patrol.log.length - 24);
      const canPersist = !!(fsSvc && root.current);
      if (canPersist) await persist();
      console.log('[mpm][patrol] 巡检#' + state.patrol.rounds + '：' + state.patrol.lastReport + (canPersist ? '（已落盘）' : '（内存模式，跳过落盘）'));
    } catch (e) {
      console.error('[mpm][patrol] 巡检异常:', e && e.message ? e.message : e);
    } finally {
      patrolling = false;
    }
  }
  ctx.timeout(function () { runPatrol(); }, 8000);
  ctx.interval(function () { runPatrol(); }, PATROL_MS);
  console.log('[mpm][engine] 认知飞轮引擎已挂载（组合行），初始沉积根: ' + (root.current || '(内存模式)'));
}