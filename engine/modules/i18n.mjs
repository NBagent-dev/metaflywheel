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
    'aware.line': '- {head}：退化 {deg} · 静止 {still} · 可量 {m}/{t}{gaps}。'
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
    'aware.line': '- {head}: degraded {deg} · static {still} · measurable {m}/{t}{gaps}.'
  }
};

/**
 * ★P604 运行时语言切换：模块级覆盖值。
 *
 * 为什么需要它：`MPM_LOCALE` 只有进程启动时设一次 —— 而"发布给全球用户"的产品里，
 * 切语言不该需要重启整个宿主。所以多一层：引擎在读沉积根时顺带读 `<root>/.mpm/locale`
 * （一行字），写文件 ⇒ **下一次调用生效，不重启**。
 *
 * ★优先级刻意是 **显式参数 > 环境变量 > 本覆盖 > 默认 zh**：
 *   环境变量代表"运维已经决定了"，不该被一个文件悄悄盖掉；显式参数代表"这一次调用要什么"。
 */
let overrideLocale = '';

/** 设置/清空运行时覆盖（非字符串或空串 ⇒ 清空）。返回落地值（未归一化）。 */
export function setLocaleOverride(v) {
  overrideLocale = (typeof v === 'string' && v.trim()) ? v.trim() : '';
  return overrideLocale;
}

/** 当前覆盖值（供诊断：语言是谁定的）。 */
export function getLocaleOverride() { return overrideLocale; }

/**
 * 解析 locale：显式参数 > 环境变量 > 运行时覆盖 > 默认 zh。
 * 归一化：zh-CN / zh_CN / ZH → zh；不认识的 → 默认（★不静默崩，也不静默变英文）。
 */
export function resolveLocale(explicit) {
  const raw = (typeof explicit === 'string' && explicit.trim())
    ? explicit
    : (process.env.DSH_MPM_LOCALE || process.env.MPM_LOCALE || overrideLocale || '');
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
 * 把工具 description 换成本地语言。zh ⇒ 原样返回（**一个字节都不动**）。
 * 缺英文条目 ⇒ 回退中文（不崩），但 test/i18n.test.mjs 会红 ⇒ 不许发布。
 */
export function localizeTools(tools, locale) {
  const L = resolveLocale(locale);
  if (!Array.isArray(tools)) return tools;
  if (L === DEFAULT_LOCALE) return tools;
  return tools.map(function (t) {
    if (!t || typeof t !== 'object') return t;
    const en = TOOL_EN[t.name];
    if (typeof en !== 'string') return t;
    return Object.assign({}, t, { description: en });
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
