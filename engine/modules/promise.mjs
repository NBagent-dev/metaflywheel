// P482「承诺-履行闭环」求值器：把 `awakenWhen` 从"只写只显示"变成"可机械求值、到期会叫醒我"。
//
// ★为什么需要这个模块（2026-10-10 全引擎 grep 查实）：
//   `awakenWhen`（搁置时的重唤醒条件）—— 写入 ✓（tools.mjs）· 回显 ✓ · 进快照结构 ✓（core.mjs）
//   **求值 ✗（零处）· 在快照文本里渲染 ✗**；而 `parked` 的语义恰恰是
//   "退出陈旧/停滞/议程触发与指令流"（注释原话），议程显式排除搁置题。
//   ⇒ **我写下的承诺，自己看不见、想不起、也不会被叫醒。**
//   字段齐备、通路断裂——这是「结构性之合」的活体样本；P021「冷时段的意志：睡眠期意图的
//   延迟交付与自驱动」的题目就是它自己的病。
//
// ★这个模块在 P482 里的位置：它是本引擎**第一处让"发起理由"终止于个体自己的历史**的通道。
//   在此之前，一切自主发动都可溯源到出厂规则（陈旧阈值 θ_E、议程选取、执政权条款）。
//
// ★语义（写死在这里，避免两处解释）：
//   ① 子句用 `;`/`；`/换行分隔，**任一成立即唤醒**（承诺里列的通常是备选触发条件）。
//   ② 只认四种机械形式：`after:<日期>` · `cites:<沉积ID>` · `epsilon:<题ID><比较符><值>` · `exists:<路径>`。
//   ③ **不可机械判定的子句记入 `unknown` 并忽略，绝不当成"已到期"**；若所有子句都不可判定，
//      则永不唤醒——即"行为与引入本模块之前逐字一致"（反例判据）。
//   ④ 引用/题不存在、没有探测器 ⇒ 记 `unknown`（**不确定 ≠ 成立**）。
export const AWAKEN_FORMS = ['after', 'cites', 'epsilon', 'exists', 'user'];
// 防"承诺炮"：用户一说话，所有"等用户答复"的承诺会同时成立（实测这一族有 6 条）。
// 故每轮最多叫醒 AWAKEN_MAX_PER_ROUND 条，按承诺写下时间从老到新；其余条数报 deferred，下轮接着叫。
// （这与巡检里既有的择题策略同源：P027/A3「一次点名 5~6 题的审议轰炸」不许再犯。）
export const AWAKEN_MAX_PER_ROUND = 2;

/** 单个子句的形式识别（与 evalAwaken 同源口径：认不出的不算机械形式）。 */
function clauseKind(c) {
  const m = /^(after|cites|epsilon|exists|user)\s*[:：]\s*(.+)$/i.exec(String(c || '').trim());
  if (!m) return null;
  const kind = m[1].toLowerCase(), arg = m[2].trim();
  if (kind === 'after') return isFinite(Date.parse(arg.replace(/\//g, '-'))) ? 'after' : null;
  if (kind === 'cites') return /^P\d+-M\d+$/i.test(arg) ? 'cites' : null;
  if (kind === 'epsilon') return /^P\d+\s*(<=|>=|<|>)\s*[0-9]*\.?[0-9]+$/i.test(arg) ? 'epsilon' : null;
  if (kind === 'exists') return arg ? 'exists' : null;
  if (kind === 'user') return (arg.toLowerCase() === 'reply' || arg === '回复') ? 'user' : null;
  return null;
}

/**
 * ★P482 清单第⑥项：**承诺 vs 愿望**——账本读数正确性。
 * 实测 13 条"承诺"里 12 条是不可机械判定的自由文本 ⇒ 语义上"永不唤醒"，
 * 但快照把它们与真承诺混在同一行显示 ⇒ **把愿望当承诺读**（与 P339「历史记录被当当前状态读」同族）。
 * 本函数只做**形式分类**（不判真假、不看环境）：有没有至少一个认得出的机械子句。
 * - kind='promise'：至少一个机械子句（可被求值；其余子句记 unknown）
 * - kind='wish'   ：全是自由文本 ⇒ 永不自动叫醒（要么改写，要么承认）
 * - kind='empty'  ：没写
 */
export function shapeOfPromise(expr) {
  const text = String(expr == null ? '' : expr).trim();
  if (!text) return { kind: 'empty', mechanical: 0, free: 0, freeClauses: [] };
  const clauses = text.split(/[;；\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
  const freeClauses = clauses.filter(function (c) { return !clauseKind(c); });
  const mechanical = clauses.length - freeClauses.length;
  return { kind: mechanical > 0 ? 'promise' : 'wish', mechanical: mechanical, free: freeClauses.length, freeClauses: freeClauses };
}

/**
 * 求值一条承诺表达式。
 * @param {string} expr - 个体自己写下的唤醒条件
 * @param {{now:number, sediments?:Array, problems?:Object, exists?:Function}} env
 * @returns {{matched:boolean, hits:Array, unknown:Array, evaluable:number}}
 */
export function evalAwaken(expr, env) {
  const e = env || {};
  const now = typeof e.now === 'number' ? e.now : Date.now();
  const text = String(expr == null ? '' : expr);
  const clauses = text.split(/[;；\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
  const hits = [], unknown = [];
  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i];
    const m = /^(after|cites|epsilon|exists|user)\s*[:：]\s*(.+)$/i.exec(c);
    if (!m) { unknown.push(c); continue; }
    const kind = m[1].toLowerCase();
    const arg = m[2].trim();
    if (kind === 'after') {
      const t = Date.parse(arg.replace(/\//g, '-'));
      if (!isFinite(t)) { unknown.push(c); continue; }
      if (now >= t) hits.push({ clause: c, why: '时间已到（' + arg + '）' });
    } else if (kind === 'cites') {
      const arr = e.sediments || [];
      let s = null;
      for (let j = 0; j < arr.length; j++) if (arr[j] && arr[j].id === arg) { s = arr[j]; break; }
      if (!s) { unknown.push(c); continue; }          // 沉积不存在 ⇒ 不确定，不是成立
      if ((s.cites || 0) > 0) hits.push({ clause: c, why: '沉积 ' + arg + ' 已被引用 ' + s.cites + ' 次' });
    } else if (kind === 'epsilon') {
      const mm = /^(P\d+)\s*(<=|>=|<|>)\s*([0-9]*\.?[0-9]+)$/i.exec(arg);
      if (!mm) { unknown.push(c); continue; }
      const p = (e.problems || {})[mm[1]];
      if (!p || p.epsilon == null) { unknown.push(c); continue; }
      const cur = Number(p.epsilon), v = Number(mm[3]), op = mm[2];
      const ok = op === '<' ? cur < v : op === '<=' ? cur <= v : op === '>' ? cur > v : cur >= v;
      if (ok) hits.push({ clause: c, why: mm[1] + ' 的 ε=' + cur + ' 满足 ' + op + v });
    } else if (kind === 'exists') {
      if (typeof e.exists !== 'function') { unknown.push(c); continue; }   // 没有探测器 ⇒ 不假装成立
      let yes = false;
      try { yes = !!e.exists(arg); } catch (_) { yes = false; }
      if (yes) hits.push({ clause: c, why: '路径已出现：' + arg });
    } else if (kind === 'user') {
      // `user:reply` = 用户**在我写下这条承诺之后**回过话。
      // 这一族（"用户给出答复时"）在账本里有 6 条，是自由文本里最多的一类；
      // 而引擎本来就在观测用户消息（perception.lastInboxAt）⇒ 它其实一直可观测，只是没人接上。
      // ★perception 是宿主管状可变状态（不随账本落盘、重启归零）⇒ 缺它时记 unknown，绝不假装成立。
      if (arg.toLowerCase() !== 'reply' && arg !== '回复') { unknown.push(c); continue; }
      const perc = e.perception;
      if (!perc || typeof perc.lastInboxAt !== 'number') { unknown.push(c); continue; }
      const since = typeof e.parkedAt === 'number' ? e.parkedAt : null;
      if (since == null) { unknown.push(c); continue; }
      if (perc.lastInboxAt > since) {
        hits.push({ clause: c, why: '用户在你写下这条承诺之后回过话（' + new Date(perc.lastInboxAt).toISOString().slice(0, 16).replace('T', ' ') + '）' });
      }
    }
  }
  return { matched: hits.length > 0, hits: hits, unknown: unknown, evaluable: clauses.length - unknown.length };
}

/** P482⑨：叫醒后多少轮没有推进 ⇒ 记一次逾期（不能冤枉自己，也不能无限等）。 */
export const OVERDUE_ROUNDS = 2;

/**
 * ★P482⑨ 最后一米：**让"履行"与"无视"在账本里长得不一样**。
 *
 * 缺口（auditAwaken 之前）：collectAwaken 叫醒后没有下文——我做了 ⇒ awake 不清；
 * 我无视 ⇒ 不升级、不计数、不进信号。两条路径状态相同 ⇒ 承诺成了"只出声不结账"的东西。
 *
 * 为什么这能算解决（而不是绕过）最后一米：**我改不了模型，所以"想不想做"不可控；
 * 但"做了没有"可以机械判定**——该题代价是否增长、updatedAt 是否推进，都是账本里的现成字段。
 * ⇒ 结构解不是"让我更自觉"，而是**让不做留下痕迹：可分辨、会累积、会升级**。
 *
 * 规则：①有推进 ⇒ 清账（标 done，且同一 expr 不再重复叫）②满 OVERDUE_ROUNDS 轮无推进
 * ⇒ 记逾期（次数累积 + 可读理由，由 patrol 变成 drift 信号）③从没叫醒的题永不被统计
 * ④已清账的不许被追认成逾期（**迟做 ≠ 没做**）。
 * @returns {{honored:Array, overdue:Array, stats:object, line:string}}
 */
export function auditAwaken(state, nowMs, opts) {
  const st = state || {};
  const round = (opts && typeof opts.round === 'number') ? opts.round : ((st.patrol && st.patrol.rounds) || 0);
  const problems = st.problems || {};
  const ids = Object.keys(problems);
  const honored = [], overdue = [];
  let woken = 0;
  for (let i = 0; i < ids.length; i++) {
    const p = problems[ids[i]];
    if (!p || !p.awake || !p.awake.at) continue;
    woken += 1;
    if (p.awake.done) continue;                                  // ④ 已清账：不再统计
    const at = p.awake.at;
    const costAt = (typeof p.awake.costAt === 'number') ? p.awake.costAt : null;
    const progressed = ((p.updatedAt || 0) > at) || (costAt !== null && (p.cost || 0) > costAt);
    if (progressed) {                                            // ① 履行 ⇒ 清账
      p.awake.done = true;
      p.awake.doneAt = (typeof nowMs === 'number') ? nowMs : Date.now();
      honored.push({ id: p.id || ids[i] });
      continue;
    }
    const since = round - ((typeof p.awake.round === 'number') ? p.awake.round : round);
    if (since >= OVERDUE_ROUNDS) {                                // ② 无视 ⇒ 逾期（累积）
      p.awake.overdue = (p.awake.overdue || 0) + 1;
      overdue.push({
        id: p.id || ids[i], since: since, times: p.awake.overdue,
        why: '被叫醒后 ' + since + ' 轮无推进（代价未增、未登记 solve、updatedAt 未动）'
      });
    }
  }
  const prev = (st.measure && st.measure.promiseStats) || {};
  const stats = {
    woken: woken,
    honored: honored.length, honoredThisRound: honored.length,
    overdue: overdue.length, overdueThisRound: overdue.length,
    honoredTotal: (prev.honoredTotal || 0) + honored.length,
    overdueTotal: (prev.overdueTotal || 0) + overdue.length
  };
  if (st.measure) st.measure.promiseStats = stats;
  const line = '- 承诺履行(P482⑨·最后一米)：已叫醒 ' + woken + ' · 已履行 ' + stats.honoredTotal + ' · 逾期 ' + stats.overdueTotal
    + (overdue.length ? '（本轮新增逾期 ' + overdue.length + '：' + overdue.map(function (o) { return o.id + '×' + o.times; }).join('、') + '）' : '');
  return { honored: honored, overdue: overdue, stats: stats, line: line };
}

/**
 * 扫描全部**搁置**题，求值各自写下的承诺，命中的打上 `awake` 标记（含溯源）。
 * 纯函数式：只改传入的 state，不碰 IO；同一承诺不重复叫；承诺被改写则重新求值。
 * @returns {Array<{id:string, why:string, expr:string}>} 本次新唤醒的题
 */
export function collectAwaken(state, now, opts) {
  const out = [];
  if (!state || !state.problems) return out;
  const env = {
    now: typeof now === 'number' ? now : Date.now(),
    sediments: state.sediments || [],
    problems: state.problems,
    exists: (opts && opts.exists) || null,
    perception: (opts && opts.perception) || null
  };
  // 按"承诺写下时间"升序：要叫就先叫最老的（配合上面的防承诺炮上限）
  const ids = Object.keys(state.problems).sort(function (a, b) {
    const pa = state.problems[a], pb = state.problems[b];
    return ((pa && pa.parked && pa.parked.at) || 0) - ((pb && pb.parked && pb.parked.at) || 0);
  });
  let deferred = 0;
  for (let i = 0; i < ids.length; i++) {
    const p = state.problems[ids[i]];
    if (!p || !p.parked) continue;                                   // 承诺只在搁置语境下有意义
    const expr = String((p.parked && p.parked.awakenWhen) || '').trim();
    if (!expr) continue;                                             // 没写承诺 ⇒ 与引入前一致
    if (p.awake && p.awake.expr === expr) continue;                   // 同一承诺不重复叫
    // ★user:reply 要把"用户最后说话时刻"与"这条承诺写下时刻"相比 —— 后者是逐题的，必须在这里设。
    //   第一版漏了这一行：env 里只有 perception，parkedAt 恒 undefined ⇒ user: 子句全记 unknown
    //   ⇒ 永不成立。判据当场抓到（run 15 项里 1 项红），而**更大的错是我带着红提交了**。
    env.parkedAt = (p.parked && typeof p.parked.at === 'number') ? p.parked.at : null;
    const r = evalAwaken(expr, env);
    if (r.evaluable === 0) continue;                                 // 全是自由文本 ⇒ 不求值、不唤醒
    if (!r.matched) { if (p.awake && p.awake.expr !== expr) p.awake = null; continue; }
    if (out.length >= AWAKEN_MAX_PER_ROUND) { deferred += 1; continue; }   // 防承诺炮：本轮先叫最老的几条
    // ★P482⑨：叫醒时记下 round 与当时的代价——否则"做了没有"无法机械判定（最后一米的前提）
    p.awake = { at: env.now, why: r.hits.map(function (h) { return h.why; }).join('；'), expr: expr, round: (state.patrol && state.patrol.rounds) || 0, costAt: p.cost || 0 };
    out.push({ id: p.id || ids[i], why: p.awake.why, expr: expr });
  }
  // 只在非零时挂属性：不给空结果加形状（既有判据里的 deepEqual [] 仍然成立）
  if (deferred) out.deferred = deferred;
  return out;
}
