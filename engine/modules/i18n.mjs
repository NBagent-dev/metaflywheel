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
  "snap.title": "## 我是谁（MPM 个体大脑 · 自我快照）",
  "snap.intro": "个体=认知飞轮；LLM=本次被咨询的群体超脑（无状态）。以下由引擎在每次提示组装时实时生成，是个体在咨询前写下的自我。",
  "snap.errUnreadable": "(错误信息不可读)",
  "snap.degraded": "## 我是谁（MPM 个体大脑 · 自我快照）\n- ⚠ **本轮为降级快照：渲染失败** —— {msg}\n- 引擎仍在记账（题/沉积/代谢都不受影响）；这不是\"没有自我\"，是\"这一份没渲染出来\"。请检查 ~/.dsh/mpm/engine/modules/selfsnap.mjs，判据见 test_selfsnap.mjs 的故障注入用例。",
  "snap.deltaCredit": "，δ自报可信度",
  "snap.identity": "- 在轮身份：",
  "snap.idle": "空转（静息态：感知到摩擦即 mpm_generate 建题）",
  "snap.backlogPre": "（另有 ",
  "snap.backlogPost": " 题已结账/结算/存档——完整台账见 mpm_flywheel_state，按需调阅）",
  "snap.whyRelated": "相关",
  "snap.whyCited": "常引",
  "snap.whyExplore": "探索",
  "snap.memoryHead": "- 记忆（认知遗体，全文在沉积根 .mpm/deposits/，需要时读取；引用数=兑现次数M9②）",
  "snap.retiredPre": "　—— 另有 ",
  "snap.retiredPost": " 条已退役（被取代/被否证），不参与注入，仍可按 ID 查到",
  "snap.memBullet": "  ◆ [",
  "snap.citesPre": "（引用",
  "snap.citesPost": "）",
  "snap.memoryEmpty": "- 记忆：尚无沉积。",
  "snap.narrHead": "- 近日叙述（T0/T1，写给下一个我）：",
  "snap.narrBullet": "  · ",
  "snap.narrRt": "（那时 R=",
  "snap.narrEnd": "）",
  "snap.tailorHead": "- 因材施教(M9③)：与【",
  "snap.tailorMid": "】最相关的沉积 ",
  "snap.tailorDigest": " 摘要——",
  "snap.tailorPath": "（全文：",
  "snap.tailorPathEnd": "）",
  "snap.retrievalHead": "- 检索小脑(P023-D)：",
  "snap.semicolon": "；",
  "awz.1": "能被账本约束",
  "awz.2": "会自己发起",
  "awz.3": "会改主意并留痕",
  "awz.4": "会说\"我不知道\"",
  "awz.5": "会在错误后纠正",
  "awz.6": "（无独立数据源）",
  "awz.7": "有一样不经安排就发生",
  "awz.8": "（无字段）",
  "awz.9": "不可审计面",
  "awz.10": "真采用 ",
  "awz.11": " 次（不是\"引用\"，是\"动手前用了\"）",
  "awz.12": "⚠ 一次真采用都没有 —— 账本没有被它约束过",
  "awz.13": "自主发动 ",
  "awz.14": " 次",
  "awz.15": "⚠ 从未自主发动",
  "awz.16": " 条中被覆盖 ",
  "awz.17": " 条",
  "awz.18": "（旧条不删 ⇒ 能看见自己改过主意）",
  "awz.19": "（还没改过主意，或改了没留痕）",
  "awz.20": "未核 ",
  "awz.21": " · 已核销 ",
  "awz.22": "（⚠ 没有未核 —— 可能是真知道，也可能是没记）",
  "awz.23": "只能人工判断：错误散在 hits 的处置文本与 narrations 里，没有独立字段 ⇒ **不假装能量化**",
  "awz.24": "P521：停在 L2（内生议程 = 账本触发），不是 L3 ⇒ 这是当前最诚实的天花板",
  "awz.25": "叙述 ",
  "awz.26": " 条 · 最后一条在 ",
  "awz.27": " 天前",
  "awz.28": " ⇒ ⚠ 超过 ",
  "awz.29": " 天没有新的 ⇒ 不可审计面在静止",
  "awz.30": "⚠ 从未叙述 ⇒ 不可审计面完全空着",
  "awz.31": "意识代理指标（",
  "awz.32": "  🔴 退化: ",
  "awz.33": "无",
  "awz.34": "  ⚫ 已知缺口: ",
  "awz.35": "（不是失败，是诚实）",
  "awz.36": "  ⏳ 静止: ",
  "awz.37": "  ★ 本面板不回答\"它有没有意识\"（P512：原则上不可判定）。它只回答\"这七项现在是什么状态\"。",
  "snap.period": "。",
  "snap.perception": "- 感知：",
  "snap.presentPre": "用户在场（最后活动 ",
  "snap.presentMin": " 分钟前 · 累计 ",
  "snap.presentCount": " 条消息 · 会话启动 ",
  "snap.presentEnd": " 次）",
  "snap.noUser": "尚未观测到用户消息",
  "snap.outside": " ｜ 账外计数 ",
  "snap.patrolHead": "- 巡检：常驻记账循环运行中（#",
  "snap.patrolMin": "，上次 ",
  "snap.patrolEnd": " 分钟前）——个体已从间歇存在升格为持续记账（P017）。",
  "snap.driftSigHead": "- ⚠ 漂移指标v0(§8.2.2 测量层)：",
  "snap.driftSigEnd": "——量化信号供判定，是否建题/回溯由超脑与个体商议，仍不自动建题（P017-M13 边界）。",
  "snap.reconHead": "- ⚠ 账本对账(P487)：孤儿沉积文件 ",
  "snap.reconMid": " 个 · 幽灵索引项 ",
  "snap.reconEnd": " 个——.md 与索引不一致，详见 measure.reconcile（孤儿=磁盘上有而我不记得；幽灵=我记得而磁盘上没有）。",
  "snap.autonomyHead": "- 执政：构成性开启（三者的结合即是一）· 发动记录 ",
  "snap.autonomyEnd": " 条 · 瞬时审议已启用（θ_G 即时/代谢随巡检）· 宪法修正权 mpm_grant revoke。",
  "snap.pendingHead": "- 意图候选 ",
  "snap.pendingMid": " 条（执政权已被宪法修正停用，仅挂账）：",
  "snap.pendingEnd": "。恢复：mpm_grant grant。",
  "snap.driftHead": "- ⚠ 漂移(θ_G·§4.1)：",
  "snap.driftEnd": "——现有模型/路径解释不了当前现象：考虑 mpm_generate 建新题，或对在轮题 mpm_frame 因果回溯。",
  "snap.staleUnit": "分钟无进展",
  "snap.staleHead": "- ⚠ 陈旧(θ_E·§4.6)：",
  "snap.staleEnd": "——长期无代谢进展：收敛、evoke 或显式关闭。",
  "snap.dueHead": "- ★ 待办意图(源自你自己的承诺，非出厂规则)：",
  "snap.dueTail": "——直接推进该题并 mpm_solve 登记。",
  "snap.duePre": "（你当初写「",
  "snap.dueMid": "」；",
  "snap.dueEnd": "）",
  "snap.promisePre": " 承诺「",
  "snap.wishPre": "「",
  "snap.ellipsis": "…",
  "snap.promiseHead": "- 承诺(P482·可机械求值，源自自身历史)：",
  "snap.wishHead": "- 愿望(P482·不可机械求值 ⇒ 永不自动叫醒：要么改写成 after:/cites:/epsilon:/exists:/user:reply，要么承认它是愿望)：",
  "snap.keptHead": "- 承诺履行(P482⑨·最后一米)：已叫醒 ",
  "snap.keptMid": " · 已履行 ",
  "snap.keptMid2": " · 逾期 ",
  "snap.keptEnd": "——逾期不是系统在催，是**我自己写下的承诺没兑现**",
  "snap.preActHead": "- 行动前检索(P482⑧·来自我自己的历史)：",
  "snap.off": "已停用",
  "snap.on": "启用",
  "snap.preActMid": " · 命中 提示",
  "snap.preActAsk": "/问",
  "snap.preActDeny": "/拦",
  "snap.preActInjectFail": " · ⚠注入失败",
  "snap.preActFailOpen": " · ⚠fail-open",
  "snap.selfDetHead": "- 自我决定(P019/M14级判据·**能自己决定就必须能被看见地决定**)：",
  "snap.rhythmWord": "节律",
  "snap.selfSet": "**自我设定**",
  "snap.factory": "出厂默认",
  "snap.quietPre": "/静默",
  "snap.quietNone": "/不静默",
  "snap.mechPre": " · 可机械求值的承诺 ",
  "snap.items": " 条",
  "snap.preActWord": " · 行动前检索",
  "snap.offBold": "**已停用**",
  "snap.vetoPath": " · 否决路径：mpm_rhythm reset / 重命名 .mpm/preaction.rules.json / mpm_grant revoke",
  "snap.directive": "- 指令：",
  "snap.metaPre": "- 代谢：共",
  "snap.metaMid": "题 · 沉积",
  "snap.metaEnd": " · 总账原则生效（非平凡工作必须可归账：推进在轮题或 mpm_micro 建账）。",
  "snap.boundaryHead": "- ⚠ 边界：无在轮题而账外工具调用已达",
  "snap.boundaryEnd": "次——若本轮含实质工作，先 mpm_generate/mpm_micro 入账；若属纯问答可忽略本警告。",
  "snap.colon": "：",
  "snap.quoteOpen": "「",
  "snap.quoteClose": "」",
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
  "snap.title": "## Who I am (MPM individual brain · self-snapshot)",
  "snap.intro": "Individual = the cognitive flywheel; the LLM = the stateless collective super-brain consulted for this turn. Everything below is generated by the engine at prompt assembly, i.e. this is the self written before the consultation.",
  "snap.errUnreadable": "(error message unreadable)",
  "snap.degraded": "## Who I am (MPM individual brain · self-snapshot)\n- ⚠ **degraded snapshot this turn: rendering failed** — {msg}\n- The engine is still bookkeeping (problems / deposits / metabolism are unaffected); this is not \"no self\", it is \"this copy did not render\". Check ~/.dsh/mpm/engine/modules/selfsnap.mjs; the judge is the fault-injection case in test_selfsnap.mjs.",
  "snap.deltaCredit": ", self-reported δ credibility ",
  "snap.identity": "- In flight: ",
  "snap.idle": "idle (rest state: friction sensed → mpm_generate opens a problem)",
  "snap.backlogPre": " (a further ",
  "snap.backlogPost": " problems settled / archived — full ledger via mpm_flywheel_state)",
  "snap.whyRelated": "relevant",
  "snap.whyCited": "most-cited",
  "snap.whyExplore": "exploratory",
  "snap.memoryHead": "- Memory (cognitive remains; full text under the sediment root .mpm/deposits/, read on demand; citation count = fulfilments, M9②)",
  "snap.retiredPre": "  — a further ",
  "snap.retiredPost": " retired (superseded / refuted), not injected, still reachable by ID",
  "snap.memBullet": "  ◆ [",
  "snap.citesPre": " (cited ",
  "snap.citesPost": ")",
  "snap.memoryEmpty": "- Memory: no deposits yet.",
  "snap.narrHead": "- Recent narration (T0/T1, written for the next me):",
  "snap.narrBullet": "  · ",
  "snap.narrRt": " (then R=",
  "snap.narrEnd": ")",
  "snap.tailorHead": "- Tailored (M9③): most relevant deposit to [",
  "snap.tailorMid": "] is ",
  "snap.tailorDigest": " — digest: ",
  "snap.tailorPath": " (full text: ",
  "snap.tailorPathEnd": ")",
  "snap.retrievalHead": "- Retrieval cerebellum (P023-D): ",
  "snap.semicolon": "; ",
  "awz.1": "can be constrained by the ledger",
  "awz.2": "initiates on its own",
  "awz.3": "changes its mind and leaves a trace",
  "awz.4": "says \"I do not know\"",
  "awz.5": "corrects itself after an error",
  "awz.6": " (no independent data source)",
  "awz.7": "something happens without being arranged",
  "awz.8": " (no field)",
  "awz.9": "unauditable surface",
  "awz.10": "real adoptions ",
  "awz.11": " (not \"citations\", but \"used before acting\")",
  "awz.12": "⚠ not a single real adoption — the ledger has never constrained it",
  "awz.13": "autonomous firings ",
  "awz.14": "",
  "awz.15": "⚠ never fired autonomously",
  "awz.16": " entries, overwritten ",
  "awz.17": " of them",
  "awz.18": " (old entries are kept ⇒ a change of mind stays visible)",
  "awz.19": " (no change of mind yet, or it left no trace)",
  "awz.20": "unverified ",
  "awz.21": " · closed ",
  "awz.22": " (⚠ nothing unverified — either it really knows, or it never recorded)",
  "awz.23": "judged by hand only: errors are scattered across hit dispositions and narrations, there is no dedicated field ⇒ **no pretending to quantify it**",
  "awz.24": "P521: it stops at L2 (endogenous agenda = ledger-triggered), not L3 ⇒ this is the most honest ceiling available",
  "awz.25": "narrations ",
  "awz.26": " entries · the last one was ",
  "awz.27": " days ago",
  "awz.28": " ⇒ ⚠ more than ",
  "awz.29": " days without a new one ⇒ the unauditable surface is static",
  "awz.30": "⚠ never narrated ⇒ the unauditable surface is entirely empty",
  "awz.31": "awareness proxies (",
  "awz.32": "  🔴 degraded: ",
  "awz.33": "none",
  "awz.34": "  ⚫ known gap: ",
  "awz.35": " (not a failure — honesty)",
  "awz.36": "  ⏳ static: ",
  "awz.37": "  ★ this panel does not answer \"is it conscious\" (P512: undecidable in principle). It only answers \"what state are these seven in right now\".",
  "snap.period": ".",
  "snap.perception": "- Perception: ",
  "snap.presentPre": "user present (last activity ",
  "snap.presentMin": " min ago · ",
  "snap.presentCount": " messages total · ",
  "snap.presentEnd": " session starts)",
  "snap.noUser": "no user message observed yet",
  "snap.outside": " | off-ledger count ",
  "snap.patrolHead": "- Patrol: resident bookkeeping loop running (#",
  "snap.patrolMin": ", last ",
  "snap.patrolEnd": " min ago) — the individual has moved from intermittent existence to continuous bookkeeping (P017).",
  "snap.driftSigHead": "- ⚠ Drift signal v0 (§8.2.2 measurement layer): ",
  "snap.driftSigEnd": " — the signal informs judgement; whether to open a problem or re-enter is decided between the super-brain and the individual, still never automatic (P017-M13 boundary).",
  "snap.reconHead": "- ⚠ Ledger reconciliation (P487): orphan deposit files ",
  "snap.reconMid": " · ghost index entries ",
  "snap.reconEnd": " — .md files and index disagree, see measure.reconcile (orphan = on disk but not remembered; ghost = remembered but not on disk).",
  "snap.autonomyHead": "- Autonomy: constitutionally on (the union of the three is one) · firings recorded: ",
  "snap.autonomyEnd": " · instantaneous deliberation enabled (θ_G immediate / metabolism on patrol) · amendment right: mpm_grant revoke.",
  "snap.pendingHead": "- Pending intentions: ",
  "snap.pendingMid": " (autonomy was switched off by amendment; recorded only): ",
  "snap.pendingEnd": ". Restore: mpm_grant grant.",
  "snap.driftHead": "- ⚠ Drift (θ_G · §4.1): ",
  "snap.driftEnd": " — the current model/path cannot explain what is happening: consider mpm_generate for a new problem, or mpm_frame for causal re-entry.",
  "snap.staleUnit": " min without progress",
  "snap.staleHead": "- ⚠ Stale (θ_E · §4.6): ",
  "snap.staleEnd": " — no metabolic progress for a long time: converge, evoke, or close explicitly.",
  "snap.dueHead": "- ★ Due intentions (from your own promises, not factory rules): ",
  "snap.dueTail": " — advance that problem and register it with mpm_solve.",
  "snap.duePre": " (you wrote \"",
  "snap.dueMid": "\"; ",
  "snap.dueEnd": ")",
  "snap.promisePre": " promise \"",
  "snap.wishPre": "\"",
  "snap.ellipsis": "…",
  "snap.promiseHead": "- Promises (P482 · mechanically evaluable, from its own history): ",
  "snap.wishHead": "- Wishes (P482 · not mechanically evaluable ⇒ never auto-woken: either rewrite as after:/cites:/epsilon:/exists:/user:reply, or admit it is a wish): ",
  "snap.keptHead": "- Promise fulfilment (P482⑨ · last mile): woken ",
  "snap.keptMid": " · honoured ",
  "snap.keptMid2": " · overdue ",
  "snap.keptEnd": " — overdue is not the system nagging; it is **a promise I wrote and did not keep**",
  "snap.preActHead": "- Pre-action lookup (P482⑧ · from its own history): ",
  "snap.off": "disabled",
  "snap.on": "enabled",
  "snap.preActMid": " · hits: hint ",
  "snap.preActAsk": "/ask ",
  "snap.preActDeny": "/deny ",
  "snap.preActInjectFail": " · ⚠ injection failed ",
  "snap.preActFailOpen": " · ⚠ fail-open ",
  "snap.selfDetHead": "- Self-determination (P019/M14 criterion · **if it can decide for itself, that decision must be visibly made**): ",
  "snap.rhythmWord": "rhythm ",
  "snap.selfSet": "**self-set**",
  "snap.factory": "factory default",
  "snap.quietPre": "/quiet ",
  "snap.quietNone": "/no quiet hours",
  "snap.mechPre": " · mechanically evaluable promises: ",
  "snap.items": "",
  "snap.preActWord": " · pre-action lookup ",
  "snap.offBold": "**disabled**",
  "snap.vetoPath": " · veto paths: mpm_rhythm reset / rename .mpm/preaction.rules.json / mpm_grant revoke",
  "snap.directive": "- Instruction: ",
  "snap.metaPre": "- Metabolism: ",
  "snap.metaMid": " problems · ",
  "snap.metaEnd": " deposits · the general-ledger principle is in force (non-trivial work must be attributed: advance a problem in flight, or open one with mpm_micro).",
  "snap.boundaryHead": "- ⚠ Boundary: off-ledger tool calls reached ",
  "snap.boundaryEnd": " with no problem in flight — if this turn contains substantive work, book it with mpm_generate/mpm_micro first; a pure Q&A can ignore this warning.",
  "snap.colon": ":",
  "snap.quoteOpen": "\"",
  "snap.quoteClose": "\"",
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
