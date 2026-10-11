// P482⑧ 行动前检索（pre-action recall）：让"过去的我"在**动手那一刻**出现。
//
// 用户的设计判断：**回合开始时我知道什么 ≠ 我动手那一刻我知道什么。** 今晚所有事故都落在这条缝里
// （写桩用错契约 / 改渲染层没判据 / edit 连撞守卫 8 次 / 6 条判据全靠手写）。
//
// ★宿主契约（先读契约再写实现——P488 的教训）：
//   'tools/pre-execute'(exec, next) → allow | deny{reason} | cancel | ask{reason}
//        **allow 不能携带内容** ⇒ 这里只能"拦"（档2 ask / 档3 deny）
//   'tools/post-execute'(exec, result, next) → accept{content?, additionalContexts?}
//        ⇒ 注入在这里（档1：把教训挂到结果上、并带进下一轮上下文）
//
// ★规则表驱动，而不是模糊检索：**先让它确定**。模糊检索留到有证据时再加（否则会变噪声源，
//   而且不可判据——今晚"检索最弱（一直是老数字）"就是前车之鉴）。
//
// ★安全边界（这是**全局钩子**：一个 bug 会让整个宿主不可用，比 selfsnap 那次严重一个量级）：
//   ① fail-open：钩子内部任何异常 ⇒ 一律 allow（绝不因为我的钩子坏掉而卡住工具）；
//   ② kill switch：`{off:true}` ⇒ 立即完全停用；
//   ③ 坏规则表 ⇒ 当空表（**不是**当拒绝）；
//   ④ 档3 只认规则里**显式写着**的 deny，不做自动推断。

const ACTIONS = ['hint', 'ask', 'deny'];

/** 规则表校验：坏条目一律丢弃（坏输入不炸），返回干净表。 */
export function normalizeRules(input) {
  try {
    if (!Array.isArray(input)) return [];
    const out = [];
    for (let i = 0; i < input.length; i++) {
      const r = input[i];
      if (!r || typeof r !== 'object') continue;
      const tool = String(r.tool || '').trim();
      const text = String(r.text || '').trim();
      const action = String(r.action || '').trim().toLowerCase();
      if (!tool || !text || ACTIONS.indexOf(action) < 0) continue;
      out.push({
        tool: tool,                                        // 工具名，或 '*' 表示所有工具
        contains: String(r.contains == null ? '' : r.contains),  // 参数 JSON 里必须出现的子串；空=该工具全部调用
        action: action,
        text: text
      });
    }
    return out;
  } catch (e) { return []; }
}

function matches(rule, ctx) {
  if (!rule || !ctx) return false;
  if (rule.tool !== '*' && rule.tool !== ctx.tool) return false;
  if (!rule.contains) return true;
  let s = '';
  try { s = JSON.stringify(ctx.args || {}); } catch (e) { s = ''; }
  return s.indexOf(rule.contains) >= 0;
}

/**
 * 三档判定。**永远返回一个决定，永不抛**（fail-open）。
 * @returns {{kind:'allow'|'ask'|'deny', hint?:string, reason?:string, rule?:object, failOpen?:string}}
 */
export function decide(rules, ctx, opts) {
  try {
    if (opts && opts.off) return { kind: 'allow' };
    const list = Array.isArray(rules) ? rules : [];       // 坏规则表 ⇒ 空表，不是拒绝
    const hits = [];
    for (let i = 0; i < list.length; i++) if (matches(list[i], ctx || {})) hits.push(list[i]);
    if (!hits.length) return { kind: 'allow' };
    for (let k = 0; k < ACTIONS.length; k++) {             // 强度序：deny > ask > hint
      const want = ACTIONS[ACTIONS.length - 1 - k];
      for (let i = 0; i < hits.length; i++) {
        if (hits[i].action !== want) continue;
        if (want === 'hint') return { kind: 'allow', hint: hits[i].text, rule: hits[i] };
        return { kind: want, reason: '动手前检索(P482⑧)：' + hits[i].text, rule: hits[i] };
      }
    }
    return { kind: 'allow' };
  } catch (e) {
    return { kind: 'allow', failOpen: String((e && e.message) || e) };
  }
}

/** 档1 专用：只取提示（post-execute 注入用），未命中返回 null。 */
export function hintFor(rules, ctx, opts) {
  const d = decide(rules, ctx, opts);
  return d && d.hint ? d.hint : null;
}

/** 结果行文案（post-execute 注入用）：必须标明**这是从我的历史里来的**，不是出厂提示。 */
export function hintLine(hint) {
  return hint ? '动手前检索(P482⑧·来自我自己的历史)：' + hint : '';
}
