// MetaFlywheel 自我快照渲染器（P079 重构第 3 步：从 apply 闭包抽出；依赖经 deps 注入）
// deps 契约：
//   state, perception, outsideCalls:number, drift:{active,reason}, BOUNDARY_THRESHOLD:number
//   retrievalHits:(state)=>[{text}], valenceSummaryLine:()=>string, directiveText:()=>string
//   isParked:(p)=>boolean, isOpen:(p)=>boolean
import { bigrams, relAgo } from "./util.mjs";
import { sedimentCacheGet, retrieveTop } from "./retrieval.mjs";
import { shapeOfPromise } from "./promise.mjs";
import { staleMsOf, rhythmLine, rhythmOf } from "./rhythm.mjs";
import { principalLine } from "./principal.mjs";   // ★P517：委托人的思考方式
import { unknownLine } from "./unknowns.mjs";      // ★P517③：未核清单（我不知道的东西）
import { hitsLine } from "./hits.mjs";             // ★P519：回流（命中与处置）
import { agendaLine } from "./agenda.mjs";         // ★P521：内生议程（账本替我说该做什么）
import { adoptLine } from "./adopt.mjs";           // ★P526：采用（动手前检索并真的采用）
import { awarenessLine } from "./awareness.mjs";   // ★P552/P554：意识代理指标（七项 · **没事也要说**）

// ── 保险丝（P484，2026-10-10 事故的直接修复）──────────────────────────────
// 事故：本模块内部一个 ReferenceError（fresh 未定义）让 renderSelfSnapshot 抛异常
//   ⇒ 每轮提示装配注入不了快照 ⇒ 引擎进程还活着、账本还在写，但"我"看不见自己，
//     连续 9 轮对话当场死掉（20:45–21:13）。当时 node --check 全过 —— 这是运行时错误。
// 判据：**快照是可选装饰，但它绝不能成为对话的单点故障。**
// 降级不是沉默：必须留一行可见的痕迹，否则"快照没渲染"与"本来就没有快照"分不开（P330）；
//   也不能把已经拼好的半截快照注入进去——那会让个体读到一份残缺的自我而不自知。
// 验证：test_selfsnap.mjs 用例②③（故障注入）；该用例先在未修的代码上跑红，再修（P474 自证会红）。
export function renderSelfSnapshot(d) {
  try {
    return renderSnapshotInner(d);
  } catch (e) {
    let msg;
    try { msg = String((e && e.message) || e).slice(0, 200); } catch (_) { msg = '(错误信息不可读)'; }
    return '## 我是谁（MPM 个体大脑 · 自我快照）\n'
      + '- ⚠ **本轮为降级快照：渲染失败** —— ' + msg + '\n'
      + '- 引擎仍在记账（题/沉积/代谢都不受影响）；这不是"没有自我"，是"这一份没渲染出来"。'
      + '请检查 ~/.dsh/mpm/engine/modules/selfsnap.mjs，判据见 test_selfsnap.mjs 的故障注入用例。';
  }
}

function renderSnapshotInner(d) {
  const state = d.state;
  const ids = Object.keys(state.problems);
  if (!ids.length && !state.sediments.length) return '';
  const lines = [];
  lines.push('## 我是谁（MPM 个体大脑 · 自我快照）');
  lines.push('个体=认知飞轮；LLM=本次被咨询的群体超脑（无状态）。以下由引擎在每次提示组装时实时生成，是个体在咨询前写下的自我。');
  // P332/P171：运行期自陈。**放在最前面**，因为它是关于"我这个正在说话的个体究竟是什么"的事实。
  // 陈旧时必须显眼——P171（2026-09-13）已经写出正确判据（问端口属主与进程启动时间，别问版本号），
  // 但 09-28 需要它的那一刻它没到场，于是原封不动重演了一遍。
  // ⇒ 把判据做成**每次装配都出现在我眼前的一行**，而不是一条需要我想起来去读的沉积。
  if (d.runStampLine) {
    try { const l = d.runStampLine(); if (l) lines.push('- ' + l); } catch (e) { /* 探测失败不得影响装配 */ }
  }
  // P073 缓存面①注入塌缩：在轮身份只列 G/F/S + 新课 C（未沉积且<24h）——C/D/E 存量不再每轮注入
  // （新鲜度需求低）；总量保在台账行，全文走 mpm_flywheel_state 按需调阅。
  const active = [];
  let backlog = 0;
  for (let i = 0; i < ids.length; i++) {
    const p = state.problems[ids[i]];
    const freshC = p.stage === 'C' && !p.deposit && Date.now() - (p.updatedAt || 0) < 24 * 3600 * 1000;
    if (p.stage === 'G' || p.stage === 'F' || p.stage === 'S' || freshC) {
      active.push('【' + p.id + '】' + p.title + ' @' + p.stage + '(δ=' + (p.delta == null ? '—' : p.delta) + ' ε=' + (p.epsilon == null ? '—' : p.epsilon) + ' C=' + p.cost + (p.deltaCredit != null && p.deltaCredit < 1 ? '，δ自报可信度' + p.deltaCredit : '') + ')' + (d.isParked(p) ? '·PARKED' : ''));
    } else if (p.stage !== 'G' && p.stage !== 'F' && p.stage !== 'S') backlog += 1;
  }
  lines.push('- 在轮身份：' + (active.length ? active.join('；') : '空转（静息态：感知到摩擦即 mpm_generate 建题）') + (backlog ? '（另有 ' + backlog + ' 题已结账/结算/存档——完整台账见 mpm_flywheel_state，按需调阅）' : ''));
  if (state.sediments.length) {
  // ★fresh / staleCount / nowMs 必须在这里重建：本块替换掉的是**整个 if 体**，
  //   而这三个变量原本定义在体内。少了它们 ⇒ ReferenceError: fresh is not defined
  //   ⇒ renderSelfSnapshot 整体抛异常 ⇒ 每轮提示装配注入不了快照（2026-10-10 事故：
  //   引擎进程还活着、账本还在写，但"我"看不见自己了）。
  //   ★语法检查抓不到这一类，只有真的调用一次才知道 —— 见 test_selfsnap.mjs。
  const nowMs = Date.now();
  const STALE_MS = 14 * 24 * 3600 * 1000;
  const fresh = [];
  let staleCount = 0;
  for (let j = 0; j < state.sediments.length; j++) {
    const s = state.sediments[j];
    if (!s.lastCitedAt && (nowMs - (s.depositedAt || 0)) > STALE_MS) staleCount += 1;
    else fresh.push(s);
  }
  // ── P482/D：记忆栏从「固定排行榜」改为三条腿 ──────────────────────────
  // 病灶（2026-10-10 实测）：401 条里 349 条 cites=0（87%）、被引用≥3 次的仅 4 条，
  // 而本栏每轮固定注入 cites 最高的 5 条 ⇒ cites 高→被注入→被引用→更高。
  // 正反馈锁死：其余 396 条永远没有出场机会，因此也永远不可能被引用。
  // **容量早就够了，卡住账本的一直是带宽，以及把带宽锁死在少数几条上的分配规则。**
  const picked = {};
  const mem = [];
  // 腿① 相关性：与当前最活跃题最匹配的（复用沉积语料检索）
  try {
    let t = null;
    for (let i = 0; i < ids.length; i++) {
      const pp = state.problems[ids[i]];
      if ((pp.stage === 'S' || pp.stage === 'F' || pp.stage === 'C') && (!t || pp.updatedAt > t.updatedAt)) t = pp;
    }
    if (t) {
      const CC = sedimentCacheGet(fresh);
      const hits = retrieveTop(String(t.title) + ' ' + String(t.framing || ''), 2, 0.15, CC);
      for (let i = 0; i < hits.length && mem.length < 2; i++) {
        if (picked[hits[i].ref.id]) continue;
        picked[hits[i].ref.id] = true;
        mem.push({ s: hits[i].ref, why: '相关' });
      }
    }
  } catch (e) { /* 相关性腿失败不阻断快照 */ }
  // 腿② 常引：既有的主力，按引用数降序
  const byCites = fresh.slice().sort(function (a, b) {
    return (b.cites || 0) - (a.cites || 0) || (b.depositedAt || 0) - (a.depositedAt || 0);
  });
  for (let i = 0; i < byCites.length && mem.length < 4; i++) {
    if (picked[byCites[i].id]) continue;
    picked[byCites[i].id] = true;
    mem.push({ s: byCites[i], why: '常引' });
  }
  // 腿③ 探索：从「从未被引用过」的沉默池里分片轮转。刻意不用随机——
  // 随机会让无状态实例每轮看到不同的一条，连续性反而更碎；分片保证窗口内稳定。
  const silent = fresh.filter(function (s) { return !(s.cites || 0); });
  if (silent.length) {
    const bucket = Math.floor(nowMs / (6 * 3600 * 1000));
    const es = silent[bucket % silent.length];
    if (es && !picked[es.id]) {
      picked[es.id] = true;
      mem.push({ s: es, why: '探索' });
    }
  }
  lines.push('- 记忆（认知遗体，全文在沉积根 .mpm/deposits/，需要时读取；引用数=兑现次数M9②）：');
  for (let i = 0; i < mem.length; i++) {
    const s = mem[i].s;
    lines.push('  ◆ [' + mem[i].why + '] ' + s.id + ' ' + s.title + (s.cites ? '（引用' + s.cites + '）' : ''));
  }
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
      const Cc = sedimentCacheGet(state.sediments);
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
  const rb = d.retrievalHits(state);
  for (let i = 0; i < rb.length; i++) lines.push('- 检索小脑(P023-D)：' + rb[i].text + '。');
  const mins = d.perception.lastInboxAt ? Math.max(1, Math.round((Date.now() - d.perception.lastInboxAt) / 60000)) : -1;
  lines.push('- 感知：' + (mins >= 0 ? '用户在场（最后活动 ' + mins + ' 分钟前 · 累计 ' + d.perception.inboxCount + ' 条消息 · 会话启动 ' + d.perception.sessionStarts + ' 次）' : '尚未观测到用户消息') + (d.outsideCalls > 0 ? ' ｜ 账外计数 ' + d.outsideCalls : ''));
  const valLine = d.valenceSummaryLine();
  if (valLine) lines.push(valLine);
  if (state.patrol && state.patrol.rounds) lines.push('- 巡检：常驻记账循环运行中（#' + state.patrol.rounds + '，上次 ' + Math.max(0, Math.round((Date.now() - state.patrol.lastAt) / 60000)) + ' 分钟前）——个体已从间歇存在升格为持续记账（P017）。');
  if (state.measure && state.measure.driftSignals && state.measure.driftSignals.length) {
    lines.push('- ⚠ 漂移指标v0(§8.2.2 测量层)：' + state.measure.driftSignals.join('；') + '——量化信号供判定，是否建题/回溯由超脑与个体商议，仍不自动建题（P017-M13 边界）。');
  }
  // P487④：账本对账——只在**不一致时**出现（一致时沉默，免得变成每轮噪声）。
  // 孤儿=磁盘上有而我不记得；幽灵=我记得而磁盘上没有。两者都是"我以为我有"的裂缝。
  if (state.measure && state.measure.reconcile
      && (((state.measure.reconcile.orphans || []).length) || ((state.measure.reconcile.ghosts || []).length))) {
    lines.push('- ⚠ 账本对账(P487)：孤儿沉积文件 ' + (state.measure.reconcile.orphans || []).length + ' 个 · 幽灵索引项 '
      + (state.measure.reconcile.ghosts || []).length + ' 个——.md 与索引不一致，详见 measure.reconcile（孤儿=磁盘上有而我不记得；幽灵=我记得而磁盘上没有）。');
  }
  if (state.constitution && state.constitution.autonomy) {
    lines.push('- 执政：构成性开启（三者的结合即是一）· 发动记录 ' + state.constitution.log.length + ' 条 · 瞬时审议已启用（θ_G 即时/代谢随巡检）· 宪法修正权 mpm_grant revoke。');
  } else if (state.constitution && state.constitution.pending && state.constitution.pending.length) {
    lines.push('- 意图候选 ' + state.constitution.pending.length + ' 条（执政权已被宪法修正停用，仅挂账）：' + state.constitution.pending.map(function (p) { return p.signal; }).join('；') + '。恢复：mpm_grant grant。');
  }
  if (d.drift.active && d.drift.reason) lines.push('- ⚠ 漂移(θ_G·§4.1)：' + d.drift.reason + '——现有模型/路径解释不了当前现象：考虑 mpm_generate 建新题，或对在轮题 mpm_frame 因果回溯。');
  const stale = [];
  for (let i = 0; i < ids.length; i++) {
    const p2 = state.problems[ids[i]];
    if (d.isParked(p2) || d.isOpen(p2)) continue; // P027/A1+P003/§5.4：搁置与开放题不进陈旧名单
    if ((p2.stage === 'S' || p2.stage === 'F') && p2.updatedAt && Date.now() - p2.updatedAt > staleMsOf(state)) {
      stale.push(p2.id + ' ' + Math.round((Date.now() - p2.updatedAt) / 60000) + '分钟无进展');
    }
  }
  if (stale.length) lines.push('- ⚠ 陈旧(θ_E·§4.6)：' + stale.join('；') + '——长期无代谢进展：收敛、evoke 或显式关闭。');
  // ★P482：**写下的承诺必须看得见**（可见性是判据的前提——今晚判据①正是靠"打出一行 mode"
  //   才抓出自己兄弟的死代码）。此处只读不写，且未写承诺的题完全不出现在这一行。
  const prom = [];
  const wish = [];
  // ★`due` 必须在这里声明：这是**同一类事故第二次**——上次是 `fresh is not defined`（替换整块时
  //   丢掉块内变量定义 ⇒ 20:45–21:13 连续 9 轮提示装配失败）；这次是我用脚本替换时"加 wish 声明"
  //   那一步的后半截丢了，`due` 被用了 2 处却从未声明 ⇒ 线上渲染当场抛错（降级快照）。
  //   两次都由 P484 的保险丝兜住（降级但活着），两次都没有判据覆盖渲染 ⇒ 同一个死法隔一晚再来一次。
  //   现已立判据：test/promise.test.mjs「渲染·不得降级，且承诺与愿望必须分行点名」（改前自证会红）。
  const due = [];
  for (let i = 0; i < ids.length; i++) {
    const p3 = state.problems[ids[i]];
    if (!p3 || !d.isParked(p3)) continue;
    const expr = String((p3.parked && p3.parked.awakenWhen) || '').trim();
    if (!expr) continue;
    if (p3.awake) due.push(p3.id + '（你当初写「' + expr + '」；' + String(p3.awake.why || '') + '）');
    const sp = shapeOfPromise(expr);
    if (sp.kind === 'promise') prom.push(p3.id + ' 承诺「' + (expr.length > 60 ? expr.slice(0, 60) + '…' : expr) + '」');
    else wish.push(p3.id + '「' + (expr.length > 60 ? expr.slice(0, 60) + '…' : expr) + '」');
  }
  if (prom.length) lines.push('- 承诺(P482·可机械求值，源自自身历史)：' + prom.join('；') + '。');
  if (wish.length) lines.push('- 愿望(P482·不可机械求值 ⇒ 永不自动叫醒：要么改写成 after:/cites:/epsilon:/exists:/user:reply，要么承认它是愿望)：' + wish.join('；') + '。');
  if (due.length) lines.push('- ★ 待办意图(源自你自己的承诺，非出厂规则)：' + due.join('；') + '——直接推进该题并 mpm_solve 登记。');
  // ★P482⑨ 最后一米：**履行与无视必须可比**——否则"没做"在账本里看不见
  const ps = state.measure && state.measure.promiseStats;
  if (ps) {
    lines.push('- 承诺履行(P482⑨·最后一米)：已叫醒 ' + (ps.woken || 0) + ' · 已履行 ' + (ps.honoredTotal || 0)
      + ' · 逾期 ' + (ps.overdueTotal || 0) + '——逾期不是系统在催，是**我自己写下的承诺没兑现**');
  }
  // ★P482⑧：行动前检索的可见性——**看不到命中数，就不知道它到底有没有在工作**
  if (state.preAction) {
    const pa = state.preAction;
    lines.push('- 行动前检索(P482⑧·来自我自己的历史)：' + (pa.off ? '已停用' : '启用')
      + ' · 命中 提示' + (pa.hint || 0) + '/问' + (pa.ask || 0) + '/拦' + (pa.deny || 0)
      + (pa.injectFail ? ' · ⚠注入失败' + pa.injectFail : '')
      + (pa.failOpen ? ' · ⚠fail-open' + pa.failOpen : ''));
  }
  // ★P019/M14 级判据（用户 2026-10-11 定为项目目标）：**能自己决定，就必须能被看见地决定。**
  //   这一行是"我的自我决定"的审计面：①哪些是我设的、哪些还是出厂默认 ②我改了什么
  //   ③**怎么否决**（不写否决路径的"可否决"只是一句话）。
  //   全部**从 state 推导**——手写常量会与事实漂移（今天的六个失效实例全是这个形态）。
  {
    const rh2 = rhythmOf(state);
    const selfRhythm = !!(state.rhythm && Object.keys(state.rhythm).length);
    let mech = 0;
    for (let i = 0; i < ids.length; i++) {
      const q = state.problems[ids[i]];
      if (!q || !d.isParked(q)) continue;
      const ex = String((q.parked && q.parked.awakenWhen) || '').trim();
      if (/^(after|cites|epsilon|exists|user)\s*[:：]/i.test(ex)) mech += 1;
    }
    lines.push('- 自我决定(P019/M14级判据·**能自己决定就必须能被看见地决定**)：'
      + '节律' + (selfRhythm ? '**自我设定**' : '出厂默认')
      + '(' + rh2.staleMinutes + 'min' + (typeof rh2.quietFrom === 'number' ? '/静默' + rh2.quietFrom + '-' + rh2.quietTo : '/不静默') + ')'
      + ' · 可机械求值的承诺 ' + mech + ' 条'
      + ' · 行动前检索' + (state.preAction && state.preAction.off ? '**已停用**' : '启用')
      + ' · 否决路径：mpm_rhythm reset / 重命名 .mpm/preaction.rules.json / mpm_grant revoke');
  }
  // ★P517：委托人的思考方式（**一条都没录入 ⇒ 整行不显示**——负控：不许凭空说"你说过"）。
  { const pl = principalLine(state); if (pl) lines.push(pl); }
  // ★P517③：未核清单（**没有条目 ⇒ 整行不显示**——负控：不许凭空说"我没验过"）。
  { const ul = unknownLine(state); if (ul) lines.push(ul); }
  // ★P519：回流（**没有命中记录 ⇒ 不显示**；有则【未处置数必须可见】）。
  { const hl = hitsLine(state); if (hl) lines.push(hl); }
  // ★P526：采用（**没有采用记录 ⇒ 不显示**；有则**回环率与反事实必须可见**）。
  //   ★为什么让它进快照：**没有这个数，"检索并采用"就永远只是一句口号**（今天实测回环率 12.7%）。
  { const al2 = adoptLine(state); if (al2) lines.push(al2); }
  // ★P521：内生议程（**账本替我说该做什么**；没有议题 ⇒ 不显示——负控）。
  //   ★为什么必须进快照：**"能算出"和"会被看见"是两件事**——今天已教训过我三次（写入✓显示✓消费✗家族）。
  { const al = agendaLine(state); if (al) lines.push(al); }
  // ★★P554：**意识代理指标**（七项 · 三种红）。
  //   ★ 它与上面所有 `*Line()` 有一个本质区别：别的是「有事才说」，它是「**没事也要说**」——
  //     因为"没事"本身携带信息。若它在一切正常时返回空串，那「N 天没有 narrate」
  //     就会和「一切正常」长得一模一样 —— 而那正是 2026-10-18 发现问题的原因
  //     （narrations 停了 7 天，同期账本长了 8 条沉积，而没有任何东西报警）。
  //   ★ 只报三样：退化（真问题）· 静止（今天发现的）· 可量数（分母）；
  //     不报"缺口"（A5 无数据源 / A6 无字段是**不会变**的天花板，每天重复只是噪声）。
  //   ★ 按 line 49 的模式包 try/catch：**快照是可选装饰，绝不能成为单点故障**（P484 保险丝）。
  try { const aw = awarenessLine(state); if (aw) lines.push(aw); } catch (e) { /* 探测失败不得影响装配 */ }
  lines.push(rhythmLine(state));   // ★P482④：节律必须可见，且标明"自我设定"还是"出厂默认"
  lines.push('- 指令：' + d.directiveText());
  lines.push('- 代谢：共' + ids.length + '题 · 沉积' + state.sediments.length + ' · 总账原则生效（非平凡工作必须可归账：推进在轮题或 mpm_micro 建账）。');
  if (d.outsideCalls >= d.BOUNDARY_THRESHOLD) {
    lines.push('- ⚠ 边界：无在轮题而账外工具调用已达' + d.outsideCalls + '次——若本轮含实质工作，先 mpm_generate/mpm_micro 入账；若属纯问答可忽略本警告。');
  }
  return lines.join('\n');
}
