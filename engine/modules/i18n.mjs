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
    'hits.foot.done': '——全部已处置（每次命中都留下了"我如何处置"）。'
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
    'hits.foot.done': ' — all disposed (every hit carries my handling).'
  }
};

/**
 * 解析 locale：显式参数 > 环境变量 > 默认 zh。
 * 归一化：zh-CN / zh_CN / ZH → zh；不认识的 → 默认（★不静默崩，也不静默变英文）。
 */
export function resolveLocale(explicit) {
  const raw = (typeof explicit === 'string' && explicit.trim())
    ? explicit
    : (process.env.DSH_MPM_LOCALE || process.env.MPM_LOCALE || '');
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

/** 表里出现过的全部键（供"双表键集合必须相等"这条判据用）。 */
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
