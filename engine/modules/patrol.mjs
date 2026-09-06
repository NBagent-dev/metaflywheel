// MetaFlywheel 巡检主体模块（P079 重构：runPatrol 常驻巡检 + it 专属的宪法复审助手）
// 依赖注入契约：makePatrol(p) 返回 runPatrol 函数绑定（events.mjs 作为 patrol 回调调用）。
// p 为宿主管状所有者注入（仅闭包依赖→参数化：模块 import 只允许 "./util.mjs"）：
//   { state, isParked, isOpen, ensureLoaded, snapshot, persist, deliberate,
//     fsSvc, root, PATROL_MS, FIRE_THROTTLE_MS }
// state 为宿主所有权可变状态（只读取/变更，不重建）；snapshot/persist/ensureLoaded/deliberate
// 为宿主包装函数引用；CONSTS 借此拿到 PATROL_MS/FIRE_THROTTLE_MS（仍需宿主单源）。
// 铁律：只做「闭包→参数化」机械变换——函数体一字未动（自由变量改由 p 绑定），阈值/文案/流程不变。
// 调度代码（8s 首巡 + PATROL_MS 循环）留在 events.mjs，本模块只搬 runPatrol 主体与其专属助手。

import { STAGE_NAMES } from "./util.mjs";

export function makePatrol(p) {
  const { state, isParked, isOpen, ensureLoaded, snapshot, persist, deliberate, fsSvc, root, PATROL_MS, FIRE_THROTTLE_MS } = p;

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
  return runPatrol;
}
