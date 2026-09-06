// MetaFlywheel 核心纯逻辑模块（P079 重构第 4 步：快照构建/指令生成/问题格式化）
// 依赖经参数注入：fmtProblem(p, isParked)；buildSnapshot(state, {drift, fsSvc, root})；
// directiveText({state, isParked, isOpen, outsideCalls, BOUNDARY_THRESHOLD})
import { STAGE_NAMES } from "./util.mjs";

export function fmtProblem(p, isParked) {
  return '【' + p.id + '】' + p.title + '｜阶段 ' + p.stage + '(' + STAGE_NAMES[p.stage] + ')｜δ=' +
    (p.delta == null ? '—' : p.delta) + ' ε=' + (p.epsilon == null ? '—' : p.epsilon) +
    (p.phi == null ? '' : ' φ=' + p.phi) +
    '｜第' + p.iteration + '次界定(回溯' + p.reentries + (p.lastRevision == null ? '' : '·改写' + p.lastRevision) + ')｜代价C=' + p.cost + (isParked(p) ? '｜PARKED(搁置)' : '') + (p.openEnded ? '｜OPEN(' + p.openEnded.kind + ')' : '');
}

export function buildSnapshot(state, env) {
  const drift = env.drift;
  const fsSvc = env.fsSvc;
  const root = env.root;
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
  return {
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
}

export function directiveText(d) {
  // P027/A2 指令清仓修复：①动作阶段(S/F/G)优先于 C——旧排序 C:0 使收敛题永久霸占指令位
  // （本会话实证：P022 收敛后指令行挂了十几轮）；②C 题有沉积或超 24h 不再提示（复用价值判定机会已给过）；
  // ③搁置题跳过（修正案 A1 引擎强制）。
  const state = d.state;
  const ids = Object.keys(state.problems);
  const rank = { S: 0, F: 1, G: 2, C: 3 };
  let pick = null;
  for (let i = 0; i < ids.length; i++) {
    const p = state.problems[ids[i]];
    if (d.isParked(p) || d.isOpen(p)) continue; // P027/A1+P003/§5.4：搁置与开放题不进指令流
    if (!(p.stage in rank)) continue;
    if (p.stage === 'C' && (p.deposit || Date.now() - (p.updatedAt || 0) > 24 * 3600 * 1000)) continue;
    if (!pick || rank[p.stage] < rank[pick.stage] || (rank[p.stage] === rank[pick.stage] && p.updatedAt > pick.updatedAt)) pick = p;
  }
  if (!pick) {
    if (d.outsideCalls >= d.BOUNDARY_THRESHOLD) return '先入账再工作：mpm_micro 一息入账或 mpm_generate 建题（纯问答可直接回答）';
    return '静息——纯问答直接回答；实质工作先 mpm_generate/mpm_micro 建账';
  }
  if (pick.stage === 'C') return '【' + pick.id + '】已收敛：判定复用价值——mpm_deposit 或记 none';
  if (pick.stage === 'S') return '【' + pick.id + '】继续求解；ε≤0.25 且 δ≤0.35 且证据充分时 mpm_converge';
  if (pick.stage === 'F') return '【' + pick.id + '】进入 mpm_solve：普通工具推进，关键节点登记' + (pick.marginalWarn ? '（F边际规则§4.2：上次回溯改写<0.3，除非有新证据，勿继续空转界定）' : '');
  return '【' + pick.id + '】立即 mpm_frame：五要素陈述+δ，未界定不得求解';
}
