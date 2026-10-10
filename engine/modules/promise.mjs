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
export const AWAKEN_FORMS = ['after', 'cites', 'epsilon', 'exists'];

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
    const m = /^(after|cites|epsilon|exists)\s*[:：]\s*(.+)$/i.exec(c);
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
    }
  }
  return { matched: hits.length > 0, hits: hits, unknown: unknown, evaluable: clauses.length - unknown.length };
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
    exists: (opts && opts.exists) || null
  };
  const ids = Object.keys(state.problems);
  for (let i = 0; i < ids.length; i++) {
    const p = state.problems[ids[i]];
    if (!p || !p.parked) continue;                                   // 承诺只在搁置语境下有意义
    const expr = String((p.parked && p.parked.awakenWhen) || '').trim();
    if (!expr) continue;                                             // 没写承诺 ⇒ 与引入前一致
    if (p.awake && p.awake.expr === expr) continue;                   // 同一承诺不重复叫
    const r = evalAwaken(expr, env);
    if (r.evaluable === 0) continue;                                 // 全是自由文本 ⇒ 不求值、不唤醒
    if (!r.matched) { if (p.awake && p.awake.expr !== expr) p.awake = null; continue; }
    p.awake = { at: env.now, why: r.hits.map(function (h) { return h.why; }).join('；'), expr: expr };
    out.push({ id: p.id || ids[i], why: p.awake.why, expr: expr });
  }
  return out;
}
