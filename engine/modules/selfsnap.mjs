// MetaFlywheel 自我快照渲染器（P079 重构第 3 步：从 apply 闭包抽出；依赖经 deps 注入）
// deps 契约：
//   state, perception, outsideCalls:number, drift:{active,reason}, BOUNDARY_THRESHOLD:number
//   retrievalHits:(state)=>[{text}], valenceSummaryLine:()=>string, directiveText:()=>string
//   isParked:(p)=>boolean, isOpen:(p)=>boolean
import { bigrams, relAgo } from "./util.mjs";
import { sedimentCacheGet } from "./retrieval.mjs";

export function renderSelfSnapshot(d) {
  const state = d.state;
  const ids = Object.keys(state.problems);
  if (!ids.length && !state.sediments.length) return '';
  const lines = [];
  lines.push('## 我是谁（MPM 个体大脑 · 自我快照）');
  lines.push('个体=认知飞轮；LLM=本次被咨询的群体超脑（无状态）。以下由引擎在每次提示组装时实时生成，是个体在咨询前写下的自我。');
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
    const nowMs = Date.now();
    const STALE_MS = 14 * 24 * 3600 * 1000;
    const fresh = [];
    let staleCount = 0;
    for (let j = 0; j < state.sediments.length; j++) {
      const s = state.sediments[j];
      if (!s.lastCitedAt && (nowMs - (s.depositedAt || 0)) > STALE_MS) staleCount += 1;
      else fresh.push(s);
    }
    fresh.sort(function (a, b) { return (b.cites || 0) - (a.cites || 0) || (b.depositedAt || 0) - (a.depositedAt || 0); });
    lines.push('- 记忆（认知遗体，全文在沉积根 .mpm/deposits/，需要时读取；引用数=兑现次数M9②）：');
    for (let j = Math.max(0, fresh.length - 5); j < fresh.length; j++) {
      const s = fresh[j];
      lines.push('  ◆ ' + s.id + ' ' + s.title + (s.cites ? '（引用' + s.cites + '）' : ''));
    }
    if (staleCount) lines.push('  ◻ 另有 ' + staleCount + ' 条陈旧沉积（>14天未被引用，已降权出记忆唤醒——M9②改卷；确有过时结论用 mpm_evoke 重激发，否则留档退役）');
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
    if ((p2.stage === 'S' || p2.stage === 'F') && p2.updatedAt && Date.now() - p2.updatedAt > 30 * 60000) {
      stale.push(p2.id + ' ' + Math.round((Date.now() - p2.updatedAt) / 60000) + '分钟无进展');
    }
  }
  if (stale.length) lines.push('- ⚠ 陈旧(θ_E·§4.6)：' + stale.join('；') + '——长期无代谢进展：收敛、evoke 或显式关闭。');
  lines.push('- 指令：' + d.directiveText());
  lines.push('- 代谢：共' + ids.length + '题 · 沉积' + state.sediments.length + ' · 总账原则生效（非平凡工作必须可归账：推进在轮题或 mpm_micro 建账）。');
  if (d.outsideCalls >= d.BOUNDARY_THRESHOLD) {
    lines.push('- ⚠ 边界：无在轮题而账外工具调用已达' + d.outsideCalls + '次——若本轮含实质工作，先 mpm_generate/mpm_micro 入账；若属纯问答可忽略本警告。');
  }
  return lines.join('\n');
}
