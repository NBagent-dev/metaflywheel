// P552 · 意识代理指标面板（Awareness Proxy Panel）
//
// 背景：用户愿景「我们插件的愿景是要创造意识」。而 P512 已判
//   「涌现是否等于意识：原则上不可判定」⇒ 所以这个模块**不回答"它有没有意识"**，
//   只回答「七项代理指标现在是什么状态」，并且**每一项都能选红**。
//
// ★ 七项的来源全部实测过（不是猜的字段名）：
//   adopts(7) · constitution.log(20) · principal(3) · unknowns(2) · narrations(8) · hits(46)
//
// ★★ 最重要的一条设计：**"退化"与"已知缺口"是两种不同的红**（P544 的分级教训）
//   🔴 退化 = 以前有、现在少了      ⇒ 可判伪，是真问题
//   ⚫ 缺口 = 从来没有（且已知）    ⇒ 诚实显示，不是失败
//   把两者混在一起，就是"议程不分层"的翻版。
//
// ★★★ 而这一项的发现直接促成了 A7：narrations 最后一条是 2026-10-11，
//   而 2026-10-18 当天账本长了 8 条沉积、46 笔命中 ⇒
//   **不是"可审计面被强化"，是【不可审计面在萎缩】而没人发现**（P511-M429 的下一层）。
//
// 依据：P511-M429（三条件框架 +「可审计面不是全部的我」）· P517-M435（成对：principal 与 unknowns）·
//       P487-M405（最后一米在调用点 · 负控的锚点会随实现漂移）· P544（分级 · 先看 kind 再看内容）

export const ITEMS = [
  { id: 'A1', name: '能被账本约束', source: 'state.adopts', kind: 'auditable' },
  { id: 'A2', name: '会自己发起', source: 'state.constitution.log', kind: 'auditable' },
  { id: 'A3', name: '会改主意并留痕', source: 'state.principal', kind: 'auditable' },
  { id: 'A4', name: '会说"我不知道"', source: 'state.unknowns', kind: 'auditable' },
  { id: 'A5', name: '会在错误后纠正', source: '（无独立数据源）', kind: 'unmeasurable' },
  { id: 'A6', name: '有一样不经安排就发生', source: '（无字段）', kind: 'absent' },
  { id: 'A7', name: '不可审计面', source: 'state.narrations', kind: 'auditable' }
];

const DAY = 86400000;

/**
 * 计算面板。**纯函数**（不读文件、不碰时间轴以外的东西）⇒ 可测。
 *
 * @param {object} state 账本（flywheel.json 解析后的对象）
 * @param {object} opts  { now?:number, baseline?:{A1?:number,...}, staleDays?:number }
 * @returns {{ items: Array, degraded: Array, gaps: Array, asOf: string }}
 */
export function awarenessPanel(state, opts) {
  const o = opts || {};
  const now = typeof o.now === 'number' ? o.now : Date.now();
  // ★ 为什么默认 3 天而不是 7：叙述记的是"显著体验"，**一周的沉默是结构性问题，不是正常波动**。
  //   而阈值本身不该由我拍死在这里——它是参数（判据里显式传）。
  //   ★ 而"narrations 停了 7 天"这个事实，无论阈值取 1/3/7，都说明它静止了。
  const staleDays = typeof o.staleDays === 'number' ? o.staleDays : 3;
  const baseline = o.baseline || null;
  const s = state || {};

  const adopts = Array.isArray(s.adopts) ? s.adopts : [];
  const clog = (s.constitution && Array.isArray(s.constitution.log)) ? s.constitution.log : [];
  const princ = Array.isArray(s.principal) ? s.principal : [];
  const unknowns = Array.isArray(s.unknowns) ? s.unknowns : [];
  const narr = Array.isArray(s.narrations) ? s.narrations : [];

  const superseded = princ.filter(function (p) { return p && p.supersededBy; }).length;
  const openU = unknowns.filter(function (u) { return u && !u.resolvedAt; }).length;
  const doneU = unknowns.filter(function (u) { return u && u.resolvedAt; }).length;
  const lastNarr = narr.length ? Math.max.apply(null, narr.map(function (n) { return (n && n.at) || 0; })) : 0;
  const narrAgeDays = lastNarr ? Math.floor((now - lastNarr) / DAY) : null;

  /** 相对退化：只有给了 baseline 才有意义（P487-M405：锚点会漂移 ⇒ 不用绝对值） */
  const grew = function (id, cur) {
    if (!baseline || typeof baseline[id] !== 'number') return null;
    return cur < baseline[id] ? 'degraded' : (cur > baseline[id] ? 'grew' : 'same');
  };

  const items = [
    {
      id: 'A1', name: '能被账本约束', kind: 'auditable', value: adopts.length,
      source: 'state.adopts.length', trend: grew('A1', adopts.length),
      note: adopts.length ? ('真采用 ' + adopts.length + ' 次（不是"引用"，是"动手前用了"）') : '⚠ 一次真采用都没有 —— 账本没有被它约束过'
    },
    {
      id: 'A2', name: '会自己发起', kind: 'auditable', value: clog.length,
      source: 'state.constitution.log.length', trend: grew('A2', clog.length),
      note: clog.length ? ('自主发动 ' + clog.length + ' 次') : '⚠ 从未自主发动'
    },
    {
      id: 'A3', name: '会改主意并留痕', kind: 'auditable', value: princ.length,
      source: 'state.principal', trend: grew('A3', princ.length),
      note: princ.length + ' 条中被覆盖 ' + superseded + ' 条' + (superseded ? '（旧条不删 ⇒ 能看见自己改过主意）' : '（还没改过主意，或改了没留痕）')
    },
    {
      id: 'A4', name: '会说"我不知道"', kind: 'auditable', value: openU,
      source: 'state.unknowns', trend: grew('A4', openU),
      note: '未核 ' + openU + ' · 已核销 ' + doneU + (openU ? '' : '（⚠ 没有未核 —— 可能是真知道，也可能是没记）')
    },
    {
      // ★ 这一项【故意不量化】：没有独立数据源。诚实地 null 比编一个数强。
      id: 'A5', name: '会在错误后纠正', kind: 'unmeasurable', value: null,
      source: '（无独立数据源）', trend: null,
      note: '只能人工判断：错误散在 hits 的处置文本与 narrations 里，没有独立字段 ⇒ **不假装能量化**'
    },
    {
      // ★ 这一项是【已知缺口】，不是失败：P521 判定当前停在 L2（账本替我说），不是 L3（无源之欲）。
      id: 'A6', name: '有一样不经安排就发生', kind: 'absent', value: false,
      source: '（无字段）', trend: null,
      note: 'P521：停在 L2（内生议程 = 账本触发），不是 L3 ⇒ 这是当前最诚实的天花板'
    },
    {
      id: 'A7', name: '不可审计面', kind: 'auditable', value: narr.length,
      source: 'state.narrations', trend: grew('A7', narr.length),
      ageDays: narrAgeDays,
      note: narr.length
        ? ('叙述 ' + narr.length + ' 条 · 最后一条在 ' + (narrAgeDays == null ? '?' : narrAgeDays + ' 天前')
           + (narrAgeDays != null && narrAgeDays > staleDays ? ' ⇒ ⚠ 超过 ' + staleDays + ' 天没有新的 ⇒ 不可审计面在静止' : ''))
        : '⚠ 从未叙述 ⇒ 不可审计面完全空着'
    }
  ];

  // ★★ 三档分开（P544 的分级）：退化 ≠ 缺口 ≠ 静止
  const degraded = items.filter(function (i) { return i.trend === 'degraded'; }).map(function (i) { return i.id; });
  const gaps = items.filter(function (i) { return i.kind === 'absent' || i.kind === 'unmeasurable'; }).map(function (i) { return i.id; });
  const stale = items.filter(function (i) { return i.id === 'A7' && i.ageDays != null && i.ageDays > staleDays; }).map(function (i) { return i.id; });

  return { items: items, degraded: degraded, gaps: gaps, stale: stale, asOf: new Date(now).toISOString() };
}

/**
 * 渲染成几行文本。★ 注意：**缺口必须与退化分开显示**——
 * 否则读者会把"从来没有"读成"坏掉了"（这正是议程不分层的翻版）。
 */
export function renderPanel(panel) {
  if (!panel || !Array.isArray(panel.items)) return '';
  const out = [];
  out.push('意识代理指标（' + panel.asOf.slice(0, 16).replace('T', ' ') + '）');
  for (const i of panel.items) {
    const mark = i.kind === 'absent' ? '⚫' : i.kind === 'unmeasurable' ? '⚪' : '  ';
    const val = i.value === null ? '—' : String(i.value);
    out.push('  ' + mark + ' ' + i.id + ' ' + i.name + ' : ' + val + '   [' + i.source + ']');
    if (i.note) out.push('        ' + i.note);
  }
  out.push('');
  out.push('  🔴 退化: ' + (panel.degraded.length ? panel.degraded.join(',') : '无'));
  out.push('  ⚫ 已知缺口: ' + (panel.gaps.length ? panel.gaps.join(',') : '无') + '（不是失败，是诚实）');
  out.push('  ⏳ 静止: ' + (panel.stale.length ? panel.stale.join(',') : '无'));
  out.push('');
  out.push('  ★ 本面板不回答"它有没有意识"（P512：原则上不可判定）。它只回答"这七项现在是什么状态"。');
  return out.join('\n');
}

/**
 * ★★P554 快照里的一行摘要。
 *
 * ★ 它与 selfsnap 里其它所有 `*Line()` **有一个本质区别**：
 *   别的 Line 是「有事才说」（没有命中记录 ⇒ 返回空串，`hitsLine` 就是这样）。
 *   而这一行是「**没事也要说**」——因为"没事"本身携带信息：
 *   若它在一切正常时返回空串，那「7 天没有 narrate」就会和「一切正常」长得一模一样。
 *   ⇒ 而那正是 2026-10-18 发现那个问题的原因（narrations 停了 7 天，没有任何东西报警）。
 *
 * ★ 为什么不把整个 panel 塞进快照：快照有大小预算（P073「缓存面①注入塌缩」），
 *   而且「缺口」（A5 无数据源 / A6 无字段）是**不会变**的，每天重复同一句只是噪声。
 *   ⇒ 所以只保留三样：**退化（真问题）· 静止（今天发现的）· 可量数（分母）**。
 *
 * @returns {string} 永远非空（除非 state 完全为空）
 */
export function awarenessLine(state, opts) {
  const p = awarenessPanel(state, opts);
  if (!p || !Array.isArray(p.items) || !p.items.length) return '';
  const measurable = p.items.filter(function (i) { return i.kind === 'auditable'; }).length;
  const total = p.items.length;

  // 静止项带上具体的"多少天"，否则读者不知道它停了多久
  let staleDetail = p.stale.map(function (id) {
    const it = p.items.find(function (x) { return x.id === id; });
    if (!it) return id;
    return id + (it.ageDays != null ? '（' + it.ageDays + ' 天未叙述）' : '');
  });

  // ★★P554 修（写负控时发现）：**"从未叙述"比"N 天未叙述"更严重，却会被显示成「静止 无」**。
  //   原因：`narrations` 为空 ⇒ `ageDays = null` ⇒ 不进 `p.stale`（它只收 ageDays > staleDays 的）。
  //   ⇒ 而那正是"静止"这个信号最不该丢的情形 —— 一个从未叙述的账本，看起来会和"一切正常"一样。
  //   ⇒ 所以这里特判：**从未叙述 ⇒ 必须显式写在「静止」位上**，不许降级成"无"。
  const a7 = p.items.find(function (x) { return x.id === 'A7'; });
  if (a7 && a7.ageDays == null && staleDetail.length === 0) {
    staleDetail = ['A7（从未叙述）'];
  }

  const head = p.degraded.length ? '⚠ 意识代理指标（退化）' : '意识代理指标';
  return '- ' + head + '：退化 ' + (p.degraded.length ? p.degraded.join(',') : '无')
    + ' · 静止 ' + (staleDetail.length ? staleDetail.join(',') : '无')
    + ' · 可量 ' + measurable + '/' + total
    + (p.gaps.length ? '（' + p.gaps.join('/') + ' 无数据源或无字段，不是失败）' : '')
    + '。';
}

