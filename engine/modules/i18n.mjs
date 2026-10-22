// i18n —— 输出层可切换语言；★**认知遗体不可翻译**
//
// ★P603 为什么需要它：这个插件要发布给全球用户，而实测 39/39 个模块的中文写在渲染处。
//   但"翻译一遍"是错的：沉积正文是认知遗体，翻它就毁了它。所以要做的是**分层**——
//     · 数据层（沉积 body / myAction / 叙述）：**任何 locale 下逐字节不变**
//     · 渲染层（快照行 / 工具返回 / 报告）：走 t(key, params)
//     · 判据层：断言结构（键 / 计数 / 布尔），不断言中文子串
//
// ★设计取舍：
//   · 零依赖（CI 的设计前提：随库提交测试替身，不做 npm install）
//   · 不做复数规则 / 不做 ICU：v0 只要"能切 + 缺键能看见"
//   · ★缺键返回 '⟨key⟩' 而不是 key 本身 —— **缺键必须肉眼可见**，
//     否则 en 用户会看到中文串里嵌着英文 key，或者更糟：什么都没发现。

export const DEFAULT_LOCALE = 'zh';
export const LOCALES = ['zh', 'en'];

const TABLES = {
  zh: {
    'hits.head': '- 命中回流(P519·**源→行为→记录→源**)：命中 {total} 次 · **未处置 {open} 次**',
    'hits.still': ' · **处置了但仍未解决 {n} 次**',
    'hits.dirs': ' · **方向 {n} 条（不参与欠账，仍可按 ID 查到）**：',
    'hits.dirsItem': '「{text}」({key})',
    'hits.recent': '：{items}',
    'hits.item': '「{text}」({key}·{verdict}·{mark})',
    'hits.mark.open': '**未处置**',
    'hits.mark.still': '**处置了但仍未解决**',
    'hits.mark.done': '已处置',
    'hits.foot.owed': '——**未处置是我欠的账**：命中了却没说清怎么处置，等于没被约束过（用 `mpm_hit action=dispose` 留痕）。',
    'hits.foot.done': '——全部已处置（每次命中都留下了"我如何处置"）。',
    // ★P605 意识代理指标那一行（每轮都在提示里）
    'aware.head': '意识代理指标',
    'aware.head.degraded': '⚠ 意识代理指标（退化）',
    'aware.none': '无',
    'aware.age': '（{n} 天未叙述）',
    'aware.never': 'A7（从未叙述）',
    'aware.gaps': '（{list} 无数据源或无字段，不是失败）',
    'aware.line': '- {head}：退化 {deg} · 静止 {still} · 可量 {m}/{t}{gaps}。',
    // ★P608 节律那一行（快照里每轮都出现）
    'rhythm.self': '自我设定',
    'rhythm.factory': '出厂默认',
    'rhythm.quiet': ' · 静默 {a}-{b} 时',
    'rhythm.floor': ' · 效价门槛 {n}（低于它不自主发动）',
    'rhythm.floor.none': ' · 效价门槛未设',
    'rhythm.line': '- 节律({src})：陈旧 {stale}min · 发动节流 {thr}min{q}{vf}{tail}',
    'rhythm.tail.self': '——**由我自己写下，非出厂常数**（mpm_rhythm 可改，reset 回出厂）',
    'rhythm.tail.factory': '（未被改写；mpm_rhythm 可改写自己的节律）',
    'rhythm.gate.none': '未设效价门槛',
    'rhythm.gate.pass': 'R(t)={r} ≥ 门槛 {f}',
    'rhythm.gate.block': 'R(t)={r} 低于门槛 {f}',
    'rhythm.reject.unknown': '{k}：不认识的项',
    'rhythm.reject.range': '{k}={v}：越界或非整数（允许 {a}~{b}）',
    // ★P610 巡检（patrol）自己开口的地方：报告行 + 全部信号
    'patrol.report': '陈旧题={stale} · 陈旧沉积={dep} · A_k={ak} · S={s}{sig}',
    'patrol.sig.join': ' · ⚠{list}',
    'patrol.sigSep': '；',
    "state.restore": "已加载最新状态 {root} (freshness {fr}，扫描 {n} 个候选根)",
  "state.persist.none": "\n（本轮未发生落盘）",
  "state.persist.ok": "\n（账本已落盘 · {mode}{backup}）",
  "state.persist.fail": "\n⚠ **账本未落盘**：{why}（改动只在内存里，重启即失——不要当作已记账）",
  "state.persist.mismatch": "回读内容与写出内容不一致（服务返回的 after ≠ 本次 json）",
  "state.reason.unknown": "未知原因",
  "state.backup.none": "未提供写前内容",
  "state.backup.first": "首写，无上一版",
  "state.backup.prev": "上一版 {n} 字符 → flywheel.json{suffix}",
  "state.backup.fail": "备份失败：{why}",
  "state.reconcile.nofs": "skipped(无 fsSvc 或沉积根未定)",
  "state.reconcile.nolist": "skipped(服务无 listDir)",
  'patrol.persist.ok': '（已落盘）',
    'patrol.persist.fail': '（未落盘：{why}）',
    'patrol.noFs': '无 fsSvc 或沉积根未定',
    'patrol.log': '[mpm][patrol] 巡检#{n}：{report}{note}',
    'patrol.silence.noobs': '沉默审计·观测前提缺失：24h 内发动 0 次，但巡检仅 {r}/{e} 轮 ⇒ 归因"不在场（进程未运行）"，不判"发射窗口为空集"。本条只报事实。',
    'patrol.silence.empty': '沉默审计：执政权开启且在轮题存在，但 24h 内发动 0 次——发射窗口可能为空集，提案复审触发架构（在场 {r}/{e}，观测前提成立）',
    'patrol.constAudit': '常数审计：{n} 项时间常数全部为 v0 占位（代谢史样本 {m}/48），数据满窗后应按退役公式导出替换',
    'patrol.stall': '代谢停滞 {id}（{span}min 代价零增长）',
    'patrol.stall.more': '另有 {n} 题停滞（{ids}）——本轮只审议最久未推进的 2 题',
    'patrol.entropy': 'S(t) 连续递增（{a}→{b}→{c}）',
    'patrol.review': '宪法复审·{p}',
    'patrol.promise.fired': '★ 自己承诺的唤醒条件已成立：{id}（你当初写下「{expr}」；{why}）——发起理由终止于你自己的历史，不是出厂规则；直接推进该题并 mpm_solve 登记',
    'patrol.promise.deferred': '另有 {n} 条自己承诺的唤醒条件也成立，本轮只叫醒 {k} 条（防承诺炮，最老的优先），其余下轮——不会被丢掉',
    'patrol.promise.overdue': '⚠ 承诺逾期未履行：{id} {why}（**这是我自己的承诺没兑现，不是系统在催**）——要么现在推进并 mpm_solve 登记，要么明确改写或放弃这条承诺',
    'patrol.agenda': '议程推进 {id}（{stage} 阶段，{age}min 未推进）——在轮题即常设意图，直接推进该题并 mpm_solve 登记',
    'patrol.inner': '内生议程(出处 {ref})：{text}——{because}（**级别：L2 内生议程——规则触发，触发源是我自己的账本状态；不是"我想要"（L3）**）——认为值得就立题或推进，并 mpm_solve 登记',
    'patrol.quiet': '静默时段(自我设定 {a}-{b} 时)：本轮不发动，信号留到静默结束后',
    'patrol.valence': '效价门禁(自我设定·门槛 {f})：R(t)={r} 低于门槛 ⇒ 本轮不自主发动（心情差时不自己找事；你说话不受此约束）'
  },
  en: {
    'hits.head': '- Hit feedback loop (P519·**source→behaviour→record→source**): {total} hits · **{open} undisposed**',
    'hits.still': ' · **{n} disposed but still unresolved**',
    'hits.dirs': ' · **{n} directions (not debts; still retrievable by ID)**: ',
    'hits.dirsItem': '"{text}" ({key})',
    'hits.recent': ': {items}',
    'hits.item': '"{text}" ({key}·{verdict}·{mark})',
    'hits.mark.open': '**undisposed**',
    'hits.mark.still': '**disposed, still unresolved**',
    'hits.mark.done': 'disposed',
    'hits.foot.owed': ' — **undisposed hits are debts I owe**: a hit whose handling I never stated never constrained me (use `mpm_hit action=dispose`).',
    'hits.foot.done': ' — all disposed (every hit carries my handling).',
    // ★P605 the awareness-proxy line (shown every turn)
    'aware.head': 'awareness proxies',
    'aware.head.degraded': '⚠ awareness proxies (degraded)',
    'aware.none': 'none',
    'aware.age': ' ({n} days without narration)',
    'aware.never': 'A7 (never narrated)',
    'aware.gaps': ' ({list}: no data source or no field - not a failure)',
    'aware.line': '- {head}: degraded {deg} · static {still} · measurable {m}/{t}{gaps}.',
    // ★P608 the rhythm line (shown in every snapshot)
    'rhythm.self': 'self-set',
    'rhythm.factory': 'factory default',
    'rhythm.quiet': ' · quiet {a}-{b}h',
    'rhythm.floor': ' · valence floor {n} (no self-initiated fire below it)',
    'rhythm.floor.none': ' · valence floor: not set',
    'rhythm.line': '- Rhythm ({src}): stale {stale}min · fire throttle {thr}min{q}{vf}{tail}',
    'rhythm.tail.self': ' - **written by me, not a factory constant** (mpm_rhythm can change it; reset restores the factory values)',
    'rhythm.tail.factory': ' (never rewritten; mpm_rhythm can rewrite its own rhythm)',
    'rhythm.gate.none': 'no valence floor set',
    'rhythm.gate.pass': 'R(t)={r} >= floor {f}',
    'rhythm.gate.block': 'R(t)={r} below floor {f}',
    'rhythm.reject.unknown': '{k}: unknown key',
    'rhythm.reject.range': '{k}={v}: out of range or not an integer (allowed {a}~{b})',
    // ★P610 where patrol speaks for itself: the report line and every signal
    'patrol.report': 'stale problems={stale} · stale deposits={dep} · A_k={ak} · S={s}{sig}',
    'patrol.sig.join': ' · ⚠{list}',
    'patrol.sigSep': '; ',
    "state.restore": "loaded latest state {root} (freshness {fr}, scanned {n} candidate roots)",
  "state.persist.none": "\n(nothing was persisted this round)",
  "state.persist.ok": "\n(ledger persisted · {mode}{backup})",
  "state.persist.fail": "\n⚠ **ledger NOT persisted**: {why} (changes are only in memory and are lost on restart — do not treat them as recorded)",
  "state.persist.mismatch": "read-back content differs from what was written (service returned after ≠ this json)",
  "state.reason.unknown": "unknown reason",
  "state.backup.none": "no pre-write content provided",
  "state.backup.first": "first write, no previous version",
  "state.backup.prev": "previous version {n} chars → flywheel.json{suffix}",
  "state.backup.fail": "backup failed: {why}",
  "state.reconcile.nofs": "skipped(no fsSvc or sediment root undecided)",
  "state.reconcile.nolist": "skipped(service has no listDir)",
  'patrol.persist.ok': ' (persisted)',
    'patrol.persist.fail': ' (NOT persisted: {why})',
    'patrol.noFs': 'no fsSvc, or the sediment root is undetermined',
    'patrol.log': '[mpm][patrol] patrol #{n}: {report}{note}',
    'patrol.silence.noobs': 'Silence audit, missing observation premise: 0 fires in 24h, but only {r}/{e} patrol rounds ⇒ attributed to "not present (process not running)", NOT judged as "empty launch window". This line reports facts only.',
    'patrol.silence.empty': 'Silence audit: executive power is on and open problems exist, yet 0 fires in 24h - the launch window may be empty; proposing a review of the trigger architecture (present {r}/{e}, observation premise holds)',
    'patrol.constAudit': 'Constant audit: {n} time constants are all v0 placeholders (metabolic samples {m}/48); once the sample window fills they should be derived by the retirement formula',
    'patrol.stall': 'Metabolic stall {id} ({span}min with zero cost growth)',
    'patrol.stall.more': '{n} more stalled ({ids}) - only the 2 longest-stalled are deliberated this round',
    'patrol.entropy': 'S(t) rising for three consecutive samples ({a}→{b}→{c})',
    'patrol.review': 'Constitutional review · {p}',
    'patrol.promise.fired': '★ A wake condition you promised yourself has come true: {id} (you wrote "{expr}"; {why}) - the reason ends in your own history, not in a factory rule; advance that problem and register it with mpm_solve',
    'patrol.promise.deferred': '{n} more promised wake conditions also hold; only {k} are awakened this round (oldest first, to avoid a promise barrage), the rest next round - none are dropped',
    'patrol.promise.overdue': '⚠ Promise overdue: {id} {why} (**this is my own promise unfulfilled, not the system nagging**) - either advance it now and register with mpm_solve, or explicitly rewrite or drop the promise',
    'patrol.agenda': 'Agenda advance {id} ({stage} stage, {age}min without progress) - an open problem is a standing intention; advance it and register with mpm_solve',
    'patrol.inner': 'Endogenous agenda (source {ref}): {text} - {because} (**level: L2 endogenous agenda - rule-triggered from my own ledger state; not "I want" (L3)**) - open a problem or advance it if it is worth it, and register with mpm_solve',
    'patrol.quiet': 'Quiet hours (self-set {a}-{b}h): no fire this round; the signals are kept until quiet hours end',
    'patrol.valence': 'Valence gate (self-set, floor {f}): R(t)={r} is below the floor ⇒ no self-initiated fire this round (I do not go looking for work when low; your messages are not restricted by this)'
  }
};

// ★★P606 更正 P604 的一个设计错误：语言文件必须**在用到时读**，不是启动时读一次。
//
//   上一轮我把读取放在 state 的 restore 里（启动时）——于是"写 .mpm/locale 即生效"
//   这句话是**假的**：restore 只在加载/换根时跑，写完文件仍要重启。
//   那正是我上一轮批评环境变量时的同一个毛病，我只是把它换成了文件形式。
//   ⇒ 现在：把**路径**交给 i18n，每次 resolveLocale 现读（一个小文件，代价可忽略）。
import fs from 'node:fs';

let localeFilePath = '';

/** 记录语言文件路径（引擎在确定沉积根后调用；空串表示没有这个文件）。 */
export function setLocaleFile(p) {
  localeFilePath = (typeof p === 'string' && p.trim()) ? p.trim() : '';
  return localeFilePath;
}

/** 现读语言文件第一行；读不到 ⇒ 空串（**缺文件是正常情形，不许抛**）。 */
function readLocaleFile() {
  if (!localeFilePath) return '';
  try {
    const txt = fs.readFileSync(localeFilePath, 'utf8');
    return String(txt || '').trim().split(/\r?\n/)[0] || '';
  } catch (err) {
    return '';   // 文件不存在/不可读 ⇒ 当作没设置
  }
}

let overrideLocale = '';

/** 设置/清空运行时覆盖（非字符串或空串 ⇒ 清空）。返回落地值（未归一化）。 */
export function setLocaleOverride(v) {
  overrideLocale = (typeof v === 'string' && v.trim()) ? v.trim() : '';
  return overrideLocale;
}

/** 当前覆盖值（供诊断：语言是谁定的）。 */
export function getLocaleOverride() { return overrideLocale; }

/**
 * 解析 locale：**显式参数 > 环境变量 > 语言文件 > 进程内覆盖 > 默认 zh**。
 * 归一化：zh-CN / zh_CN / ZH → zh；不认识的 → 默认（★不静默崩，也不静默变英文）。
 */
export function resolveLocale(explicit) {
  const raw = (typeof explicit === 'string' && explicit.trim())
    ? explicit
    : (process.env.DSH_MPM_LOCALE || process.env.MPM_LOCALE || readLocaleFile() || overrideLocale || '');
  const norm = String(raw || '').trim().toLowerCase().split(/[-_]/)[0];
  return (norm && TABLES[norm]) ? norm : DEFAULT_LOCALE;
}

/**
 * 取一条文案。缺键返回 '⟨key⟩'（可见），缺参保留 {name}（也可见）。
 */
export function t(key, params, locale) {
  const L = resolveLocale(locale);
  const table = TABLES[L] || TABLES[DEFAULT_LOCALE];
  let s = table[key];
  if (typeof s !== 'string') return '⟨' + String(key) + '⟩';
  if (params && typeof params === 'object') {
    const names = Object.keys(params);
    for (let i = 0; i < names.length; i++) {
      const k = '{' + names[i] + '}';
      if (s.indexOf(k) !== -1) s = s.split(k).join(String(params[names[i]]));
    }
  }
  return s;
}

/**
 * ★P603② 工具描述的英文表。
 *
 * ★为什么是独立表而不是并进 TABLES：中文原文**留在 tools.mjs 里**（它是给模型看的详细说明，
 *   引号密集、逐字翻译会把它变成第二个真相源）。所以策略是：
 *     zh  → 用源码里的原文（一个字节都不动）
 *     en  → 用本表；缺条目时**运行时回退到中文**（插件仍可用），但**判据会红**（不许发布）
 *   ⇒ 运行时宽容、发布严格：缺一条英文不会让插件崩，但会让 CI 红。
 *
 * ★质量标准：中文是"写给模型看的详尽说明"，英文这里先做到**准确 + 可操作**，
 *   不追求与中文等长。等长翻译是后续工作，不是这一轮的门槛。
 */
export const TOOL_EN = {
  'mpm_generate': 'Open a problem (G): register an anomaly or gap as a formal problem worth pursuing, and say why it is a problem.',
  'mpm_frame': 'Frame a problem (F): state initial state, goal, constraints, available operators and success criteria, then give delta (0-1, lower is better). Re-framing an already framed problem is a causal re-entry, not an error.',
  'mpm_solve': 'Enter solving (S): normal tools do the work; this call registers the path and updates epsilon (distance to goal, 0-1).',
  'mpm_converge': 'Check the epsilon-delta convergence criterion (C): fully converged / mis-framed / fuzzy / unconverged, each with the methodology it demands.',
  'mpm_deposit': 'Deposit (D): turn the solved structure into an irreversible, indexable cognitive remain under the sediment root. Requires links or an explicit linkReason.',
  'mpm_evoke': 'Evoke (E): when the world drifts or new evidence rubs against an old deposit, let that deposit open a new problem.',
  'mpm_micro': 'Lightweight channel: the whole lifecycle G-F-S-C in one call for small interactions. Deposit only if there is reuse value.',
  'mpm_hit': 'Read and settle hits: what was surfaced before acting, how I handled it. dispose requires myAction; stillOpen marks a promise with a re-check date; direction marks something that is a direction, not a debt.',
  'mpm_adopt': 'Record real adoption BEFORE acting: which sediment changed what I did, and what I would have done without it. Post-hoc links never count.',
  'mpm_principal': 'Record the principal\'s own way of thinking (his words, the object it constrains, the occasion). Only after he explicitly confirms.',
  'mpm_unknown': 'Unverified list: things I marked as "not verified", each with a retirement condition. Resolving requires evidence, not a feeling.',
  'mpm_weights': 'Show or adjust agenda weights, printing each source\'s contribution as a share and warning above 60% for a single source.',
  'mpm_rank_eval': 'Re-runnable retrieval metric: use recorded adoptions as ground truth to judge whether the weighting surfaces what should have been recalled.',
  'mpm_index': 'Offline word-surface index: report / write / verify. Deterministic by design, so it can be rebuilt and diffed byte for byte.',
  'mpm_supersede': 'Mark a deposit as superseded or refuted (ADR style): retired from injection, still retrievable by ID. Retirement is not deletion.',
  'mpm_enrich': 'Append keywords or aliases to a deposit\'s searchable surface. The original text is never touched - it is the judge\'s baseline.',
  'mpm_flywheel_state': 'Show the whole flywheel: stages, delta/epsilon, re-framings, metabolic cost, deposit index and loop gain.',
  'mpm_rhythm': 'Show or rewrite my own rhythm: staleness threshold, fire throttle, quiet hours. Bounded, visible, resettable to factory values.',
  'mpm_grant': 'Constitutive executive power: grant / revoke / status. Revocation is sticky until granted again.',
  'mpm_narrate': 'Narrate 2-5 first-person lines about a salient in-turn experience. Signals are attached automatically.',
  'mpm_setroot': 'Maintenance: set the sediment root explicitly when auto-detection is ambiguous. Migrates the index and files; old files are kept.'
};

/**
 * ★P607 参数描述的英文表（82 个参数，**按工具显式列全，不做共享词汇**）。
 *
 * ★为什么不按参数名共享：`action` 在 rhythm 里是 show/set/reset，在 unknown 里是
 *   add/resolve/list，在 hit 里是 list/dispose —— 同一个名字，三种语义。
 *   共享词汇会让"看起来都翻了"变成"翻错了一半"。
 * ★缺条目 ⇒ 运行时回退中文（不崩），但 test/tool-i18n.test.mjs 会红（不许发布）。
 */
export const TOOL_PARAM_EN = {
  // mpm_rhythm
  'mpm_rhythm.action': 'show (default) | set | reset',
  'mpm_rhythm.staleMinutes': 'How many minutes count as stale (5-1440).',
  'mpm_rhythm.fireThrottleMinutes': 'Minimum gap between two self-initiated fires (5-720 minutes).',
  'mpm_rhythm.quietFrom': 'Quiet hours start (0-23); same as quietTo or omitted means no quiet window.',
  'mpm_rhythm.quietTo': 'Quiet hours end (0-23; may cross midnight, e.g. 23 to 7).',
  'mpm_rhythm.valenceFloor': 'Valence floor (0-100): do not self-initiate below it. Omit = unchanged, null = disabled.',
  'mpm_rhythm.note': 'Why the change (recorded in history and reports).',
  // mpm_principal
  'mpm_principal.text': "His own words (or a reliable summary) - not my interpretation.",
  'mpm_principal.key': 'The thing it constrains, e.g. "project positioning" / "model boundary" / "delivery bar".',
  'mpm_principal.mode': 'Optional: essence | boundary | direction | meaning | veto. Omit = auto-detect; if unsure, do not force a category.',
  'mpm_principal.note': 'Required: on what occasion he said it, and what I understand it to constrain.',
  // mpm_unknown
  'mpm_unknown.action': 'add | resolve (needs evidence) | list',
  'mpm_unknown.text': 'What I do not know, phrased so it can be tested.',
  'mpm_unknown.key': 'What it attaches to (problem ID / repo / topic); it resurfaces before related work starts.',
  'mpm_unknown.until': 'Required: the condition under which this no longer counts as unverified.',
  'mpm_unknown.why': 'Optional: why it was not verified at the time.',
  'mpm_unknown.source': 'Optional: where it came from (which round / which criterion / which conversation).',
  'mpm_unknown.evidence': 'Required for resolve: what evidence means it is no longer unverified.',
  // mpm_hit
  'mpm_hit.action': 'list (default) | dispose (needs myAction)',
  'mpm_hit.key': 'dispose: settle the newest hit whose constrained object matches this key.',
  'mpm_hit.id': 'dispose: settle exactly this hit id (takes precedence over key).',
  'mpm_hit.myAction': 'Required for dispose: how I handled it, stated so the next observation can check it.',
  'mpm_hit.stillOpen': 'I handled it, but the matter is still unresolved - keeps it counted as an open debt.',
  'mpm_hit.stillOpenDays': 'Re-check window in days when stillOpen is true (default 14). After it expires the row stops counting as debt but is still recorded.',
  'mpm_hit.redo': 'Allow re-disposing an already disposed row (explicit confirmation / new wording / new deadline). Default false.',
  'mpm_hit.direction': 'This row is a direction, not a task: it never counts as debt, but stays visible.',
  // mpm_adopt
  'mpm_adopt.action': 'add (record one adoption) | list (loop rate and recent adoptions)',
  'mpm_adopt.sedimentId': 'Required for add: which sediment I adopted (e.g. P521-M438).',
  'mpm_adopt.forWhat': 'Required for add: which decision or output it was used for.',
  'mpm_adopt.withoutIt': 'Required for add: what I would have done WITHOUT it. No counterfactual, no adoption.',
  // mpm_generate
  'mpm_generate.title': 'Short title of the problem.',
  'mpm_generate.observation': 'What anomaly or gap was observed, and why it is a problem.',
  // mpm_frame
  'mpm_frame.problemId': 'Problem id, e.g. P001.',
  'mpm_frame.statement': 'Structured problem statement covering all five elements: initial state / goal / constraints / operators / success criteria.',
  'mpm_frame.delta': 'Framing precision delta (0-1, lower is better): self-assessed over the five elements, about +0.2 per missing element.',
  'mpm_frame.reasoning': 'Why this framing or re-framing; stronger when it is a re-entry.',
  // mpm_solve
  'mpm_solve.problemId': 'Problem id.',
  'mpm_solve.action': 'This solve path / action / finding.',
  'mpm_solve.epsilon': 'Distance to the goal epsilon (0-1, lower is better); needs evidence.',
  'mpm_solve.parked': 'Park the problem: it leaves staleness, stall and agenda triggers until re-awakened.',
  'mpm_solve.awakenWhen': 'Re-awaken condition (recommended when parking).',
  'mpm_solve.openEnded': 'Mark as non-converging: permanently-open | dimensional-reduction | negotiated-compromise. none clears it.',
  // mpm_converge
  'mpm_converge.problemId': 'Problem id.',
  'mpm_converge.delta': 'Current framing precision delta (0-1).',
  'mpm_converge.epsilon': 'Current distance to the goal epsilon (0-1).',
  'mpm_converge.robustness': 'Whether the robustness check passed: "pass" or "fail".',
  'mpm_converge.notes': 'Evidence and what was actually tested.',
  // mpm_enrich
  'mpm_enrich.action': 'add (default) | show',
  'mpm_enrich.id': 'Sediment id for add, e.g. P028-M18.',
  'mpm_enrich.keywords': 'Optional: keywords, comma or space separated.',
  'mpm_enrich.aliases': 'Optional: aliases / synonymous phrasings, comma or space separated.',
  'mpm_enrich.reason': 'Optional: why these words were added (kept as a trace).',
  // mpm_supersede
  'mpm_supersede.sedimentId': 'The sediment whose status changes, e.g. P572-M473.',
  'mpm_supersede.status': 'superseded | refuted | active. Only these three values.',
  'mpm_supersede.bySedimentId': 'The sediment that replaces it (recommended for superseded; must already exist).',
  'mpm_supersede.reason': 'Required: why. A status change with no reason is a status change with no account.',
  // mpm_weights
  'mpm_weights.action': 'show (default) | set | reset',
  'mpm_weights.weights': 'JSON when setting, e.g. {"hit-open":{"base":40,"per":1}}. Omitted fields keep their values; illegal values fall back and are reported.',
  // mpm_rank_eval
  'mpm_rank_eval.weights': 'Optional JSON, e.g. {"relevance":1,"recency":0.3,"importance":0.2}; defaults are used when omitted.',
  // mpm_index
  'mpm_index.action': 'report (default, computes only) | write | verify (rebuild and compare bytes on disk).',
  // mpm_micro
  'mpm_micro.title': 'Short title for the small problem.',
  'mpm_micro.statement': 'One sentence covering the five elements: initial / goal / constraints / operators / criterion.',
  'mpm_micro.action': 'What was actually done, or the conclusion reached.',
  'mpm_micro.delta': 'Framing precision delta (0-1).',
  'mpm_micro.epsilon': 'Distance to the goal epsilon (0-1).',
  'mpm_micro.robustness': 'Whether the robustness check passed: "pass" or "fail".',
  'mpm_micro.depositTitle': 'Optional: title, if there is reuse value.',
  'mpm_micro.depositBody': 'Optional: deposit body. Omit to record deposit:none plus the reason.',
  // mpm_deposit
  'mpm_deposit.problemId': 'Problem id.',
  'mpm_deposit.title': 'Title of the deposit.',
  'mpm_deposit.body': 'Reusable conclusions / causal structure / operational steps.',
  'mpm_deposit.tags': 'Retrieval tags as a JSON array string, e.g. ["tag1","tag2"].',
  'mpm_deposit.links': 'JSON array string of the sediments this one grew out of, e.g. ["P482-M400"]. If there is genuinely no ancestor, pass "none" and give linkReason.',
  'mpm_deposit.linkReason': 'Required when links is "none": why this sediment has no ancestor.',
  // mpm_evoke
  'mpm_evoke.sedimentId': 'Sediment id, e.g. P001-M1.',
  'mpm_evoke.friction': 'The cognitive friction: what the old solution no longer covers.',
  'mpm_evoke.newTitle': 'New problem title (derived from the sediment by default).',
  'mpm_evoke.type': 'Evocation type: drift | mutation | perspective | injection.',
  // mpm_setroot
  'mpm_setroot.path': 'The new sediment root (should be an absolute path inside the session workspace).',
  // mpm_grant
  'mpm_grant.action': 'grant | revoke | status',
  // mpm_flywheel_state
  'mpm_flywheel_state.dummy': 'Placeholder parameter (no effect).',
  // mpm_narrate
  'mpm_narrate.text': 'First-person narration body (up to 400 characters); write the tone, not the data.'
};

/**
 * 把工具 description 换成本地语言。zh ⇒ 原样返回（**一个字节都不动**）。
 * 缺英文条目 ⇒ 回退中文（不崩），但 test/i18n.test.mjs 会红 ⇒ 不许发布。
 */
export function localizeTools(tools, locale) {
  const L = resolveLocale(locale);
  if (!Array.isArray(tools)) return tools;
  if (L === DEFAULT_LOCALE) return tools;
  return tools.map(function (t) {
    if (!t || typeof t !== 'object') return t;
    const out = Object.assign({}, t);
    const en = TOOL_EN[t.name];
    if (typeof en === 'string') out.description = en;
    // ★P607：参数描述也要换 —— 参数名不是可翻译的自由文本，但它的 description 是。
    if (t.parameters && typeof t.parameters === 'object') {
      const ps = {};
      for (const k of Object.keys(t.parameters)) {
        const p = t.parameters[k];
        if (!p || typeof p !== 'object') { ps[k] = p; continue; }
        const pen = TOOL_PARAM_EN[t.name + '.' + k];
        ps[k] = (typeof pen === 'string') ? Object.assign({}, p, { description: pen }) : p;
      }
      out.parameters = ps;
    }
    return out;
  });
}

/**
 * 表里出现过的全部键（供"双表键集合必须相等"这条判据用）。 */
export function allKeys() {
  const seen = {};
  for (let i = 0; i < LOCALES.length; i++) {
    const tb = TABLES[LOCALES[i]] || {};
    const ks = Object.keys(tb);
    for (let j = 0; j < ks.length; j++) seen[ks[j]] = true;
  }
  return Object.keys(seen).sort();
}

/**
 * ★缺键差异：返回 { onlyInLocale: {..}, missing: {..} }。
 * 判据用它保证：加一条 zh 文案却忘了 en ⇒ 立刻可红。
 */
export function keyDiff() {
  const onlyIn = {}, missing = {};
  const base = TABLES[DEFAULT_LOCALE] || {};
  for (let i = 0; i < LOCALES.length; i++) {
    const L = LOCALES[i];
    const tb = TABLES[L] || {};
    const o = [], m = [];
    for (const k of Object.keys(base)) if (!(k in tb)) m.push(k);
    for (const k of Object.keys(tb)) if (!(k in base)) o.push(k);
    onlyIn[L] = o.sort();
    missing[L] = m.sort();
  }
  return { defaultLocale: DEFAULT_LOCALE, onlyInLocale: onlyIn, missing: missing };
}
