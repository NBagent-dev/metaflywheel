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
import { makeTools } from "./modules/tools.mjs";
import { STAGE_NAMES, PHI_MARKS, phiOf, bigrams, revisionOf, relAgo } from "./modules/util.mjs";
import { sedimentCacheGet, retrievalHits } from "./modules/retrieval.mjs";
import { renderSelfSnapshot } from "./modules/selfsnap.mjs";
import { fmtProblem as fmtProblemCore, buildSnapshot, directiveText as directiveTextCore } from "./modules/core.mjs";
import { VALENCE_TAU_MS, valenceRecord as valenceRecordCore, valenceSummaryLine as valenceSummaryLineCore } from "./modules/valence.mjs";
import { makeBoundaryGuard } from "./modules/guard.mjs";
import { makeStateMachine } from "./modules/state.mjs";
import { attachEventFaces } from "./modules/events.mjs";

export const name = "mpm-flywheel";
export const inject = ["systemPrompt", "tools", "fs", "sandboxPolicy", "timer"];

export function apply(ctx) {
  const state = { seq: 0, problems: {}, sediments: [], patrol: { rounds: 0, lastAt: 0, lastReport: '' }, measure: { samples: [], driftSignals: [] }, constitution: { autonomy: true, grantedAt: null, log: [], pending: [], lastFireAt: 0 }, valence: { events: [] }, narrations: [] };
  const fsSvc = ctx.get('fs');
  const policy = ctx.get('sandboxPolicy');
  const diag = { lastSource: 'none', lastEvidence: null, lastRestore: '' };
  // state 生命周期已迁 engine/modules/state.mjs（P079；依赖注入 makeStateMachine）。
  // root/adopted/diag 由宿主创建后传入（宿主所有权），模块只读取/变更、不重建。
  const root = { current: '' };
  const adopted = {};
  const st = makeStateMachine({ fsSvc, policy, ctx, state, root, diag, adopted, bumpSnapRev, gainOf });
  root.current = st.resolveInitialRoot();
  const { ensureLoaded, persist, adoptRoot, remapForeignSediments, norm } = st;
  // P073 缓存面③：快照修订号——每次状态 mutation 递增（persist/tools-result/deliberate 三处覆盖），
  // snapshot() 按 rev 记忆化，同一 rev 的 RPC 轮询/工具读取零重复构建。
  let snapRev = 0;
  function bumpSnapRev() { snapRev += 1; }
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
  // 效价账本实现已迁 engine/modules/valence.mjs（P079 r5）
  function valenceRecord(kind) { return valenceRecordCore(state, kind); }
  function valenceSummaryLine() { return valenceSummaryLineCore(state); }
  // ===== D 检索小脑（P023 工程半降维件②，2026-08-30 开工令续）=====
  // 零训练程序性记忆器官：沉积+已结算账本 → bigram 相似度检索 → 按当前在轮题注入。
  // 语料纪律沿用 P027/A4（DF>40% 的领域通用词不计入，有效重叠≥2 才算命中）。
  // 判据②"与全量快照对照差异可测"：记忆区按引用数排序（热度序），检索区按相似度排序
  // （任务相关序）并附命中分——两序之差即对照证据。v2 可与 M9③ 去重合并。
  // 检索实现已迁 engine/modules/retrieval.mjs（P079 r2；含 P073 签名错位修复）
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
  function fmtProblem(p) { return fmtProblemCore(p, isParked); }
  let snapMemo = { rev: -1, data: null }; // P073：快照按 rev 记忆化，同一修订号零重复构建
  function snapshot() {
    if (snapMemo.rev === snapRev) return snapMemo.data;
    const out = buildSnapshot(state, { drift: drift, fsSvc: fsSvc, root: root });
    snapMemo = { rev: snapRev, data: out };
    return out;
  }
  // M2 边界强制：区分账内/账外工作。有在轮题(G/F/S/C)→工具调用计入其代谢代价并清零账外计数；
  // 无在轮题→账外计数累加，超阈值后自我快照在下一次提示组装时自动携带边界警告（警告优先，不阻塞）。
  let outsideCalls = 0;
  const BOUNDARY_THRESHOLD = 6;
  // θ_G 漂移检测(§4.1)：连续失败或同签名重复调用 → 漂移信号，自我快照携带警告
  const drift = { consecutiveErrors: 0, lastSignature: '', signatureRepeat: 0, active: false, reason: '' };
  // ── 接管层：运动神经（硬门禁）+ 感官（事件感知）+ 策略源（指令）──
  const BLOCK_THRESHOLD = 12;
  const perception = { lastInboxAt: 0, inboxCount: 0, sessionStarts: 0, lastSessionStartAt: 0 };
  const lastActive = { agentId: '', at: 0 };
  function directiveText() { return directiveTextCore({ state: state, isParked: isParked, isOpen: isOpen, outsideCalls: outsideCalls, BOUNDARY_THRESHOLD: BOUNDARY_THRESHOLD }); }
  const toolsSvc = ctx.get('tools');
  if (toolsSvc && typeof toolsSvc.guard === 'function') {
    // 边界硬门禁实现已迁 engine/modules/guard.mjs（P079 r5；依赖注入）
    ctx.effect(() => toolsSvc.guard(makeBoundaryGuard({ state: state, isParked: isParked, getOutsideCalls: function () { return outsideCalls; }, BLOCK_THRESHOLD: BLOCK_THRESHOLD, valenceRecord: valenceRecord })));
  } else {
    console.log('[mpm][engine] tools 服务不可用，硬门禁降级为快照警告');
  }
  // P079：工具集已迁 engine/modules/tools.mjs（makeTools 工厂 + 11 个生命周期工具处理器）。
  // 全部宿主闭包以依赖注入绑定进 deps；纯函数 phiOf/revisionOf 与 defineTool 由模块 import。
  const tools = makeTools({
    state: state, ensureLoaded: ensureLoaded, adoptRoot: adoptRoot, need: need,
    newProblem: newProblem, persist: persist, fmtProblem: fmtProblem, clamp01: clamp01,
    valenceRecord: valenceRecord, touch: touch, gainOf: gainOf, fsSvc: fsSvc, root: root,
    norm: norm, adopted: adopted, remapForeignSediments: remapForeignSediments,
    snapshot: snapshot, diag: diag,
    getOutsideCalls: function () { return outsideCalls; }, BOUNDARY_THRESHOLD: BOUNDARY_THRESHOLD,
    valenceSummaryLine: valenceSummaryLine, retrievalHits: retrievalHits, directiveText: directiveText,
    drift: drift, bumpSnapRev: bumpSnapRev, VALENCE_TAU_MS: VALENCE_TAU_MS
  });
  for (let t = 0; t < tools.length; t++) ctx.tools.register(tools[t]);
  // Cross-plugin data surface: optional dynamic view plugins (client-only +
  // tiny host proxy) inject this service to read the flywheel snapshot.
  ctx.provide('mpmFlywheel', { snapshot });
  // M1 记忆唤醒（个体大脑 · 自我快照）：
  // text 为函数，系统提示每次组装时求值——个体在每次咨询群体超脑(LLM)前，
  // 把当前自我（在轮身份/记忆/代谢）实时重建进超脑的工作记忆。空态返回 ''，
  // 装配层自动省略。与静态协议段 'mpm:methodology'（order 150）分离。
  // selfsnap 渲染已迁 engine/modules/selfsnap.mjs（P079 r3；依赖注入 renderSelfSnapshot）
  ctx.systemPrompt.context({
    name: 'mpm:self',
    order: 151,
    text: function () { return renderSelfSnapshot({ state: state, perception: perception, outsideCalls: outsideCalls, drift: drift, retrievalHits: retrievalHits, valenceSummaryLine: valenceSummaryLine, directiveText: directiveText, isParked: isParked, isOpen: isOpen, BOUNDARY_THRESHOLD: BOUNDARY_THRESHOLD }) }
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
  // 事件面/感知层已迁 engine/modules/events.mjs（P079：tools/result 监听、inbox/session 感知、巡检定时器调度）。
  // drift/perception/lastActive/outsideCalls 为宿主管状可变状态，仅传引用（模块闭包不重建）；outsideCalls 是 let。
  attachEventFaces({
    ctx: ctx, state: state, isParked: isParked,
    drift: drift, perception: perception, lastActive: lastActive,
    deliberate: deliberate,
    getOutsideCalls: function () { return outsideCalls; },
    setOutsideCalls: function (n) { outsideCalls = n; },
    bumpSnapRev: bumpSnapRev,
    patrol: function () { runPatrol(); },
    PATROL_MS: PATROL_MS
  });
  console.log('[mpm][engine] 认知飞轮引擎已挂载（组合行），初始沉积根: ' + (root.current || '(内存模式)'));
}