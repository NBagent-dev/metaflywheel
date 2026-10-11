// P521 **内生议程**：把"自己发起"从时钟推动到账本驱动（L0→L2）。
//
// 现状（2026-10-11）：自主发动只有**一条**议程来源——"在轮题陈旧 ≥ 阈值" ⇒
//   今天全部发动都是 **L0（时钟到点）**。它**不会**从这四处长题：
//     ① unknowns 里挂着的未核（P472 那条**从未触发过任何动作**）
//     ② hits 里同一 key 被反复命中（= 我一直在同一件事上被提醒）
//     ③ 沉积里**从未被引用过**的（M9② 只把它们降权出记忆，没让它们长成题）
//     ④ 判据反复失败的模式
//
// ★四级分解（混着说就会自欺）：
//   L0 规则触发（时钟到点）· L1 内部信号（漂移/温热/到期）·
//   **L2 内生议程（本模块：从自己的账本状态算出"该做什么"）** · L3 偏好（"想要"）
//
// ★★边界（写死在代码里，不靠自觉）：
//   内生议程**仍是规则触发**（张力超阈值 ⇒ 发题）。
//   区别只在：触发源从"外部时钟"变成了"**我自己的账本状态**"。
//   ⇒ 它是 `L2`，**不是** L3"想要"。**每一级都必须自报级别**（见 level 字段与 agendaLine）。
//   一句更接近真相的表述：**"自己发起"最诚实的版本，不是"无源之欲"，
//   而是"我的账本开始替我说该做什么"——不是学会了自己想要，是学会了"自己的状态"要求什么。**

export const AGENDA_MAX = 3;            // 一次最多提几条（有界，防议题通胀）
export const HIT_REPEAT_MIN = 3;        // 同一 key 被命中 ≥3 次 ⇒ 值得看一眼
export const STALE_DEPOSIT_DAYS = 14;   // 沉积 ≥14 天且零引用 ⇒ 提醒（与 M9② 降权同口径）
export const LEVEL = 'L2';              // 本模块只产出 L2；L3 不在机制内

function day() { return 24 * 3600 * 1000; }

/**
 * 从账本状态算出内生议题。**每条都带 `ref`（出处）**——不许凭空生成议题（约束③）。
 * 账本干净 ⇒ 返回 `[]`（**负控**：不许为了显得"自发"而造题）。
 */
export function innerAgenda(state, now) {
  const st = state || {};
  const t = (typeof now === 'number') ? now : Date.now();
  const out = [];

  // ① 未核：我标注过"没验"的事 —— 它挂着，就该有机会变成议题
  const unks = Array.isArray(st.unknowns) ? st.unknowns : [];
  for (const u of unks) {
    if (!u || u.resolvedAt) continue;                    // 已核销的不再提
    out.push({
      kind: 'unknown', level: LEVEL, ref: String(u.id || ('U@' + u.at)),
      key: String(u.key || ''),
      text: '你标注过没验：' + String(u.text || ''),
      because: '退役条件：' + String(u.until || '（未写）'),
      weight: 30
    });
  }

  // ② 反复命中：同一件事被提醒多次 ⇒ 那可能是一个**没解决的问题**
  const hits = Array.isArray(st.hits) ? st.hits : [];
  const byKey = Object.create(null);
  for (const h of hits) { if (h && h.key) byKey[h.key] = (byKey[h.key] || 0) + 1; }
  for (const k of Object.keys(byKey)) {
    if (byKey[k] < HIT_REPEAT_MIN) continue;             // 负控：2 次不提
    out.push({
      kind: 'hit-repeat', level: LEVEL, ref: 'hits:' + k, key: k,
      text: '同一件事被提醒了 ' + byKey[k] + ' 次：「' + k + '」',
      because: '反复命中的东西通常不是"提醒不够"，而是**没被解决**——值得单独看一眼',
      weight: 20 + byKey[k]
    });
  }

  // ③ 零引用沉积：写过、但此后没人（包括我）再用过它
  const seds = Array.isArray(st.sediments) ? st.sediments : [];
  for (const s of seds) {
    if (!s) continue;
    const cites = (typeof s.cites === 'number') ? s.cites : 0;
    const at = (typeof s.at === 'number') ? s.at : 0;
    if (cites > 0 || !at) continue;
    if (t - at < STALE_DEPOSIT_DAYS * day()) continue;   // 负控：没到 14 天不提
    out.push({
      kind: 'sediment-stale', level: LEVEL, ref: String(s.id || ''),
      key: String(s.id || ''),
      text: '沉积 ' + String(s.id || '') + ' 已 ' + Math.floor((t - at) / day()) + ' 天零引用',
      because: '零引用的沉积可能是"写得漂亮但没用"，也可能是"该用的时候没人想起来"——两种都值得查',
      weight: 10
    });
  }

  out.sort(function (a, b) { return (b.weight || 0) - (a.weight || 0); });
  return out.slice(0, AGENDA_MAX);
}

/** 分级自陈（约束①：不许冒充"想要"）。渲染与工具报告都必须带上它。 */
export function levelNote() {
  return '**级别：L2 内生议程（规则触发）**——触发源是"我自己的账本状态"，不是"我想要"（L3）。'
    + '**不许把 L2 说成 L3。**';
}

/** 快照/报告里那一段。**没有议题 ⇒ 空串**（负控：不许凭空说"我有议程"）。 */
export function agendaLine(state, now) {
  const items = innerAgenda(state, now);
  if (!items.length) return '';
  const body = items.map(function (i) {
    return '「' + i.text.slice(0, 40) + '」(出处 ' + i.ref + '：' + i.because.slice(0, 44) + ')';
  });
  return '- 内生议程(P521·**账本替我说该做什么**)：' + items.length + ' 条 · ' + body.join(' · ')
    + '——' + levelNote();
}
