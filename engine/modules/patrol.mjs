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

import { collectAwaken } from './promise.mjs';
import { isQuiet, rhythmOf } from './rhythm.mjs';

export function makePatrol(p) {
  const { state, isParked, isOpen, ensureLoaded, snapshot, persist, deliberate, fsSvc, root, PATROL_MS, FIRE_THROTTLE_MS, perception } = p;

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
    const WIN = 24 * 3600 * 1000;
    let fires24 = 0;
    for (let i = 0; i < state.constitution.log.length; i++) { if (nowMs - state.constitution.log[i].at < WIN) fires24 += 1; }
    // P024/A1 观测前提：没有观测，就没有"沉默"可言。
    //   实机教训（2026/9/6）：会话结束 33h 后重启，fires24=0 被判为"发射窗口为空集"，
    //   但真因是"进程不在场"——24h 内巡检仅 1 轮，且 32.5h→0.03h 为整段空白。
    const plog = (state.patrol && state.patrol.log) ? state.patrol.log : [];
    let rounds24 = 0;
    for (let i = 0; i < plog.length; i++) { if (nowMs - plog[i].at < WIN) rounds24 += 1; }
    // P024/A2 阈值上界：审计窗(24h)长于证据缓冲容量（patrol.log 24 条=8h），
    //   若用 WIN/PATROL_MS=72 做期望值，则即使全程在场也恒判"不在场"。期望值必须被缓冲容量截断。
    const cap = plog.length || 1;
    const expect = Math.min(Math.floor(WIN / PATROL_MS), cap);
    const observed = rounds24 >= Math.max(3, Math.floor(expect / 3));
    let hasGF = false;
    for (const k in state.problems) { const st = state.problems[k].stage; if (st === 'G' || st === 'F' || st === 'S') hasGF = true; }
    if (state.constitution.autonomy && hasGF && fires24 === 0) {
      if (!observed) {
        proposals.push('沉默审计·观测前提缺失：24h 内发动 0 次，但巡检仅 ' + rounds24 + '/' + expect +
          ' 轮 ⇒ 归因"不在场（进程未运行）"，不判"发射窗口为空集"。本条只报事实。');
      } else {
        proposals.push('沉默审计：执政权开启且在轮题存在，但 24h 内发动 0 次——发射窗口可能为空集，提案复审触发架构（在场 ' +
          rounds24 + '/' + expect + '，观测前提成立）');
      }
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
      // ★P482：求值**个体自己写下的唤醒条件**（awakenWhen）。
      //   这是本引擎第一处让"发起理由"终止于**个体自己的历史**而非出厂规则的通道：
      //   在此之前，一切自主发动都可溯源到 θ_E 陈旧阈值 / 议程选取 / 执政权条款。
      //   语义边界（写死在 promise.mjs 并配判据）：未写承诺、或写了不可机械判定的自由文本时，
      //   **行为与引入本通道之前逐字一致**——不确定绝不当成"已到期"。
      try {
        const fired = collectAwaken(state, nowMs, { exists: null, perception: perception });
        for (let i = 0; i < fired.length; i++) {
          signals.push('★ 自己承诺的唤醒条件已成立：' + fired[i].id + '（你当初写下「' + fired[i].expr + '」；' + fired[i].why + '）——发起理由终止于你自己的历史，不是出厂规则；直接推进该题并 mpm_solve 登记');
        }
        if (fired.deferred) {
          signals.push('另有 ' + fired.deferred + ' 条自己承诺的唤醒条件也成立，本轮只叫醒 ' + fired.length + ' 条（防承诺炮，最老的优先），其余下轮——不会被丢掉');
        }
      } catch (e) { /* 承诺求值永不阻断巡检（P484：装饰件不得成为单点故障） */ }
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
      // ★P482④ 调度权：**静默时段**是自我设定的——此刻不该发动就不发动，信号留在本轮报告里。
      //   范围诚实标注：只挡 patrol 驱动的发动（议程/陈旧）；θ_G 即时审议（tools/result 当下）
      //   不受它约束，那条通路仍由执政权条款管。
      const rh = rhythmOf(state);
      if (isQuiet(rh, nowMs)) {
        signals.push('静默时段(自我设定 ' + rh.quietFrom + '-' + rh.quietTo + ' 时)：本轮不发动，信号留到静默结束后');
      } else {
        deliberate(signals, nowMs);
      }
      // ★P339：`lastReport` 是**历史记录**（本轮那一刻的快照），但 tools.mjs 的提示装配
      //   把它与当前 rounds 拼在一行、无时点地宣称「当前巡检状态」。
      //   实证（2026-09-30 18:24 #1267）：报告写「议程推进 P338（求解 阶段，7min 未推进）」，
      //   而 P338 在**同一轮之后**被沉积，之后每一轮提示仍那样宣称 ⇒ 与账本 stage=D 不一致。
      //   ★关键区分：那条报告**在当时是准确的**——错的不是它算得不对，
      //     而是它**被当成当前状态读**。所以这里只**加时点**，不改任何判定逻辑。
      //   （P339 界定的目标③：历史记录被呈现时必须带时点或历史标注。）
      state.patrol.rounds += 1;
      state.patrol.lastAt = nowMs;
      state.patrol.lastReportAt = nowMs;
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
      // ★P327 修复（2026-09-26）：旧写法用 canPersist = !!(fsSvc && root.current) 冒充"落盘成功"——
      //   它只检查**服务是否存在**，不看**写入结果**；而 persistImpl 内部把异常 catch 掉，
      //   于是巡检每一轮都照打"（已落盘）"，哪怕磁盘上一个字节都没动。
      //   本会话实证：21:02:57 之后连续三轮巡检（1003/1004/1005）全没落盘，
      //   台账 mtime 纹丝不动，P327 随一次重启直接蒸发。
      //   判据必须是 persist 的真实返回值，不是"服务在不在"。
      const canPersist = !!(fsSvc && root.current);
      const pr = canPersist ? await persist() : { ok: false, reason: '无 fsSvc 或沉积根未定' };
      const persistNote = (pr && pr.ok) ? '（已落盘）' : ('（未落盘：' + ((pr && pr.reason) || '未知') + '）');
      console.log('[mpm][patrol] 巡检#' + state.patrol.rounds + '：' + state.patrol.lastReport + persistNote);
    } catch (e) {
      console.error('[mpm][patrol] 巡检异常:', e && e.message ? e.message : e);
    } finally {
      patrolling = false;
    }
  }
  return runPatrol;
}
