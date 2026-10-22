// MetaFlywheel 自我快照渲染器（P079 重构第 3 步：从 apply 闭包抽出；依赖经 deps 注入）
// deps 契约：
//   state, perception, outsideCalls:number, drift:{active,reason}, BOUNDARY_THRESHOLD:number
//   retrievalHits:(state)=>[{text}], valenceSummaryLine:()=>string, directiveText:()=>string
//   isParked:(p)=>boolean, isOpen:(p)=>boolean
import { t } from "./i18n.mjs";   // ★P621：快照正文走词条（语言可切；数据层不动）
import { bigrams, relAgo } from "./util.mjs";
import { isRetired } from "./sediment-status.mjs";   // ★P592：退役的沉积退出记忆栏与陈旧账
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
    try { msg = String((e && e.message) || e).slice(0, 200); } catch (_) { msg = t('snap.errUnreadable'); }
    return t('snap.degraded', { msg: msg });
  }
}

function renderSnapshotInner(d) {
  const state = d.state;
  const ids = Object.keys(state.problems);
  if (!ids.length && !state.sediments.length) return '';
  const lines = [];
  lines.push(t('snap.title'));
  lines.push(t('snap.intro'));
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
      active.push('【' + p.id + '】' + p.title + ' @' + p.stage + '(δ=' + (p.delta == null ? '—' : p.delta) + ' ε=' + (p.epsilon == null ? '—' : p.epsilon) + ' C=' + p.cost + (p.deltaCredit != null && p.deltaCredit < 1 ? t('snap.deltaCredit') + p.deltaCredit : '') + ')' + (d.isParked(p) ? '·PARKED' : ''));
    } else if (p.stage !== 'G' && p.stage !== 'F' && p.stage !== 'S') backlog += 1;
  }
  lines.push(t('snap.identity') + (active.length ? active.join(t('snap.period')) : t('snap.idle')) + (backlog ? t('snap.backlogPre') + backlog + t('snap.backlogPost') : ''));
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
  let retiredCount = 0;   // ★P592：被取代/被否证 ⇒ 不是「欠引用」，是「已退休」
  for (let j = 0; j < state.sediments.length; j++) {
    const s = state.sediments[j];
    if (isRetired(s)) { retiredCount += 1; continue; }   // ★P592
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
        mem.push({ s: hits[i].ref, why: t('snap.whyRelated') });
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
    mem.push({ s: byCites[i], why: t('snap.whyCited') });
  }
  // 腿③ 探索：从「从未被引用过」的沉默池里分片轮转。刻意不用随机——
  // 随机会让无状态实例每轮看到不同的一条，连续性反而更碎；分片保证窗口内稳定。
  const silent = fresh.filter(function (s) { return !(s.cites || 0); });
  if (silent.length) {
    const bucket = Math.floor(nowMs / (6 * 3600 * 1000));
    const es = silent[bucket % silent.length];
    if (es && !picked[es.id]) {
      picked[es.id] = true;
      mem.push({ s: es, why: t('snap.whyExplore') });
    }
  }
  lines.push(t('snap.memoryHead') + (retiredCount ? t('snap.retiredPre') + retiredCount + t('snap.retiredPost') : '') + t('snap.colon'));
  for (let i = 0; i < mem.length; i++) {
    const s = mem[i].s;
    lines.push(t('snap.memBullet') + mem[i].why + '] ' + s.id + ' ' + s.title + (s.cites ? t('snap.citesPre') + s.cites + t('snap.citesPost') : ''));
  }
} else {
    lines.push(t('snap.memoryEmpty'));
  }
  // P076/T0+T1 叙述层：近日叙述——语气而非数据；体感信号随条目织入（T1）。给下一位读者写的日记。
  if (state.narrations && state.narrations.length) {
    const narrs = state.narrations.slice(-5);
    lines.push(t('snap.narrHead'));
    for (let n = 0; n < narrs.length; n++) {
      const en = narrs[n];
      lines.push(t('snap.narrBullet') + relAgo(en.at) + t('snap.quoteOpen') + String(en.text).replace(/\n/g, ' ') + t('snap.quoteClose') + (en.rt != null ? t('snap.narrRt') + (en.rt >= 0 ? '+' : '') + en.rt + (en.s != null ? ' · S=' + en.s : '') + (en.drift ? ' · ' + en.drift : '') + t('snap.narrEnd') : ''));
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
        lines.push(t('snap.tailorHead') + top.id + t('snap.tailorMid') + best.id + t('snap.tailorDigest') + best.digest + (best.path ? t('snap.tailorPath') + best.path + t('snap.tailorPathEnd') : ''));
      }
    }
  } catch (e) {}
  // 检索小脑(P023-D 判据②)：相似度序 vs 记忆区热度序——两序之差为可测对照
  const rb = d.retrievalHits(state);
  for (let i = 0; i < rb.length; i++) lines.push(t('snap.retrievalHead') + rb[i].text + t('snap.period'));
  const mins = d.perception.lastInboxAt ? Math.max(1, Math.round((Date.now() - d.perception.lastInboxAt) / 60000)) : -1;
  lines.push(t('snap.perception') + (mins >= 0 ? t('snap.presentPre') + mins + t('snap.presentMin') + d.perception.inboxCount + t('snap.presentCount') + d.perception.sessionStarts + t('snap.presentEnd') : t('snap.noUser')) + (d.outsideCalls > 0 ? t('snap.outside') + d.outsideCalls : ''));
  const valLine = d.valenceSummaryLine();
  if (valLine) lines.push(valLine);
  if (state.patrol && state.patrol.rounds) lines.push(t('snap.patrolHead') + state.patrol.rounds + t('snap.patrolMin') + Math.max(0, Math.round((Date.now() - state.patrol.lastAt) / 60000)) + t('snap.patrolEnd'));
  if (state.measure && state.measure.driftSignals && state.measure.driftSignals.length) {
    lines.push(t('snap.driftSigHead') + state.measure.driftSignals.join(t('snap.period')) + t('snap.driftSigEnd'));
  }
  // P487④：账本对账——只在**不一致时**出现（一致时沉默，免得变成每轮噪声）。
  // 孤儿=磁盘上有而我不记得；幽灵=我记得而磁盘上没有。两者都是"我以为我有"的裂缝。
  if (state.measure && state.measure.reconcile
      && (((state.measure.reconcile.orphans || []).length) || ((state.measure.reconcile.ghosts || []).length))) {
    lines.push(t('snap.reconHead') + (state.measure.reconcile.orphans || []).length + t('snap.reconMid')
      + (state.measure.reconcile.ghosts || []).length + t('snap.reconEnd'));
  }
  if (state.constitution && state.constitution.autonomy) {
    lines.push(t('snap.autonomyHead') + state.constitution.log.length + t('snap.autonomyEnd'));
  } else if (state.constitution && state.constitution.pending && state.constitution.pending.length) {
    lines.push(t('snap.pendingHead') + state.constitution.pending.length + t('snap.pendingMid') + state.constitution.pending.map(function (p) { return p.signal; }).join(t('snap.period')) + t('snap.pendingEnd'));
  }
  if (d.drift.active && d.drift.reason) lines.push(t('snap.driftHead') + d.drift.reason + t('snap.driftEnd'));
  const stale = [];
  for (let i = 0; i < ids.length; i++) {
    const p2 = state.problems[ids[i]];
    if (d.isParked(p2) || d.isOpen(p2)) continue; // P027/A1+P003/§5.4：搁置与开放题不进陈旧名单
    if ((p2.stage === 'S' || p2.stage === 'F') && p2.updatedAt && Date.now() - p2.updatedAt > staleMsOf(state)) {
      stale.push(p2.id + ' ' + Math.round((Date.now() - p2.updatedAt) / 60000) + t('snap.staleUnit'));
    }
  }
  if (stale.length) lines.push(t('snap.staleHead') + stale.join(t('snap.period')) + t('snap.staleEnd'));
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
    if (p3.awake) due.push(p3.id + t('snap.duePre') + expr + t('snap.dueMid') + String(p3.awake.why || '') + t('snap.dueEnd'));
    const sp = shapeOfPromise(expr);
    if (sp.kind === 'promise') prom.push(p3.id + t('snap.promisePre') + (expr.length > 60 ? expr.slice(0, 60) + t('snap.ellipsis') : expr) + t('snap.quoteClose'));
    else wish.push(p3.id + t('snap.wishPre') + (expr.length > 60 ? expr.slice(0, 60) + t('snap.ellipsis') : expr) + t('snap.quoteClose'));
  }
  if (prom.length) lines.push(t('snap.promiseHead') + prom.join(t('snap.period')) + t('snap.period'));
  if (wish.length) lines.push(t('snap.wishHead') + wish.join(t('snap.period')) + t('snap.period'));
  if (due.length) lines.push(t('snap.dueHead') + due.join(t('snap.period')) + t('snap.dueTail'));
  // ★P482⑨ 最后一米：**履行与无视必须可比**——否则"没做"在账本里看不见
  const ps = state.measure && state.measure.promiseStats;
  if (ps) {
    lines.push(t('snap.keptHead') + (ps.woken || 0) + t('snap.keptMid') + (ps.honoredTotal || 0)
      + t('snap.keptMid2') + (ps.overdueTotal || 0) + t('snap.keptEnd'));
  }
  // ★P482⑧：行动前检索的可见性——**看不到命中数，就不知道它到底有没有在工作**
  if (state.preAction) {
    const pa = state.preAction;
    lines.push(t('snap.preActHead') + (pa.off ? t('snap.off') : t('snap.on'))
      + t('snap.preActMid') + (pa.hint || 0) + t('snap.preActAsk') + (pa.ask || 0) + t('snap.preActDeny') + (pa.deny || 0)
      + (pa.injectFail ? t('snap.preActInjectFail') + pa.injectFail : '')
      + (pa.failOpen ? t('snap.preActFailOpen') + pa.failOpen : ''));
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
    lines.push(t('snap.selfDetHead')
      + t('snap.rhythmWord') + (selfRhythm ? t('snap.selfSet') : t('snap.factory'))
      + '(' + rh2.staleMinutes + 'min' + (typeof rh2.quietFrom === 'number' ? t('snap.quietPre') + rh2.quietFrom + '-' + rh2.quietTo : t('snap.quietNone')) + ')'
      + t('snap.mechPre') + mech + t('snap.items')
      + t('snap.preActWord') + (state.preAction && state.preAction.off ? t('snap.offBold') : t('snap.on'))
      + t('snap.vetoPath'));
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
  lines.push(t('snap.directive') + d.directiveText());
  lines.push(t('snap.metaPre') + ids.length + t('snap.metaMid') + state.sediments.length + t('snap.metaEnd'));
  if (d.outsideCalls >= d.BOUNDARY_THRESHOLD) {
    lines.push(t('snap.boundaryHead') + d.outsideCalls + t('snap.boundaryEnd'));
  }
  return lines.join('\n');
}
