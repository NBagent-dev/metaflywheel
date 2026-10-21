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
// ★P523：hit-repeat 的区分器要用【欠账】的唯一定义（单一真源在 hits.mjs）——
//   绝不在这里再写一遍"什么算欠账"，否则两处同义代码会各自漂移（P507 的教训）。
import { outstandingHits } from './hits.mjs';
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

// ② 反复命中：**但"反复出现"不等于"没被解决"**（P523-M440 的教训）。
//   ★区分器（**结构化，不猜文本**）：欠账 = `未处置` 或 `stillOpen === true`（单一真源在 hits.mjs）。
//     2026-10-11 实测现场：28 次命中**全部已处置**、无一处标"仍未解决" ⇒ 它只是我这一轮的**工作主题**；
//     而上一版照样报了「同一件事被提醒了 28 次……而是没被解决」——**那是误报**。
//   ★★并且：`because` 从【格言】改成【账本里可核对的事实】——
//     旧：「反复命中的东西通常不是"提醒不够"，而是**没被解决**」（这是猜测）
//     新：「其中 M 次是未处置 / 处置时明确标了'仍未解决'」（这是账本）
  const hits = Array.isArray(st.hits) ? st.hits : [];
  const total = Object.create(null), owed = Object.create(null);
  // ★P574：`total` 数的是【被提醒次数】，而 `owed` 数的是【未处置的事件数】。
  //   在 P574 之前，hit 阵列是"一次注入一条" ⇒ 阵列长度同时充当这两个数，
  //   于是「同一句话被注入了 18 次」被读成「你欠了 18 笔债」。
  //   ⇒ 现在 recordHit 会把【同一 key 未处置期间的连续注入】合并进 `count`，
  //     所以 `total` 必须累加 `count`，而 `owed` 仍然数条（一笔事件算一笔欠账）。
  //   **这是两个不同的量第一次真的分开**：被提醒 N 次 ≠ 欠着 N 笔。
  for (const h of hits) {
    if (!h || !h.key) continue;
    const n = (typeof h.count === 'number' && h.count > 0) ? h.count : 1;
    total[h.key] = (total[h.key] || 0) + n;
  }
  for (const h of outstandingHits(hits, t)) { if (h && h.key) owed[h.key] = (owed[h.key] || 0) + 1; }
  for (const k of Object.keys(total)) {
    if (total[k] < HIT_REPEAT_MIN) continue;             // 负控：2 次不提
    if (!owed[k]) continue;                              // ★★负控：全已处置且无 stillOpen ⇒ 不产出
    out.push({
      kind: 'hit-repeat', level: LEVEL, ref: 'hits:' + k, key: k,
      text: '同一件事被提醒了 ' + total[k] + ' 次：「' + k + '」，其中 **' + owed[k] + ' 次仍未解决**',
      because: '其中 ' + owed[k] + ' 次是【未处置】或处置时明确标了"仍未解决"（账本里可核对，不是推测）',
      weight: 20 + owed[k]
    });
  }

  // ④ 未清账的命中（P537）：**"未处置必须可见"只做到了"可见"，没做到"会被推动"**。
  //   现场（2026-10-11 自主发动）：快照连续四轮显示「未处置 4 次」，而我连续四轮没清它
  //     ⇒ 根因：② 的门槛在【总命中数】上（`total[k] < HIT_REPEAT_MIN`）
  //     ⇒ **单笔欠账永远不会变成议程**（除非同一件事欠够 3 次）
  //   ★本来源只看"有没有欠账"，**与它被提醒过几次无关**——欠账是硬的，不取决于次数。
  //   ★权重高于 ②：**"真的欠着"比"反复出现"更硬**（否则后者会盖过前者）。
  // ★P583 修：`hit-open` 报**欠账对象数**，记录数放括号里。
  //
  //   现场（2026-10-21）：81 条命中里 24 条 stillOpen，而它们只落在**两个 key** 上
  //   （「项目定位」17 · 「愿景」7）。而议程报的是 `open.length` = 24 —— 于是
  //   「一件事被记录 17 次」被读成「17 笔债」。
  //
  //   ★这是 P574 修过的那个病的**第二个形态**：
  //     P574 修了 `recordHit` 的合并（同一 key 未处置期间的连续注入 → `count`），
  //     但 `owed` / `open.length` 仍然数**记录条数**，而不是**欠账对象数**。
  //   ⇒ 一句话：**记录数是账本的形状，欠账对象数才是"我欠几件事"。**
  //
  //   而这也让文字与数字一致：旧版报「24 笔……「项目定位」·「愿景」」，
  //   数字是 24 而列出的对象只有 2 个 —— 那种不一致本身就是判据失灵的味道。
  const open = outstandingHits(hits, t);
  if (open.length) {
    const keys = [], seen = Object.create(null), perKey = Object.create(null);
    for (const h of open) {
      const k = String((h && h.key) || '').trim();
      if (!k) continue;
      perKey[k] = (perKey[k] || 0) + 1;
      if (!seen[k]) { seen[k] = 1; keys.push(k); }
    }
    const nObj = keys.length;                 // 欠账【对象】数
    const nRec = open.length;                 // 欠账【记录】数
    out.push({
      kind: 'hit-open', level: LEVEL, ref: 'hits:open', key: keys[0] || '',
      text: (nObj === nRec)
        ? ('有 ' + nObj + ' 笔命中还没清账：'
           + keys.slice(0, 3).map(function (k) { return '「' + k + '」'; }).join(' · ')
           + (keys.length > 3 ? ' 等 ' + keys.length + ' 个对象' : ''))
        : ('有 ' + nObj + ' 个对象还没清账（共 ' + nRec + ' 条记录）：'
           + keys.slice(0, 3).map(function (k) {
             return '「' + k + '」×' + perKey[k];
           }).join(' · ')
           + (keys.length > 3 ? ' 等 ' + keys.length + ' 个对象' : '')),
      because: '**未处置是我欠的账**——命中了却没说清怎么处置，等于没被约束过'
        + '（用 `mpm_hit action=dispose` 留痕；处置了但它仍挂着 ⇒ 传 `stillOpen: true`，'
        + '而它会带一个**承诺复查期**（缺省 14 天）——到期后不再计入欠账，但记录仍在）',
      weight: 40 + nObj
    });
  }

  // ③ 零引用沉积：写过、但此后没人（包括我）再用过它
  const seds = Array.isArray(st.sediments) ? st.sediments : [];
  for (const s of seds) {
    if (!s) continue;
    const cites = (typeof s.cites === 'number') ? s.cites : 0;
    // ★★P539 修：真实沉积记录的字段是 `depositedAt`（实测 455/455 条有它、【0 条】有 `at`）。
    //   旧代码只读 `s.at` ⇒ 恒为 0 ⇒ 下面的 `!at` 把 **455 条全部跳过** ⇒
    //   **sediment-stale 这个来源从上线起从未产出过任何一条**（实测：够格 257 条，产出 0 条）。
    //   ⇒ 教训：判据的夹具用了 `at`（**我假设的字段名**），于是**判据绿、功能死**——
    //     判据与真实数据不同构，比"判据恒真"更隐蔽（它看起来真的在测东西）。
    const at = (typeof s.depositedAt === 'number') ? s.depositedAt
      : (typeof s.at === 'number') ? s.at : 0;
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
