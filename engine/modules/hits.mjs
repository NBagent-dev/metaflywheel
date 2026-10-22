// P519 **回流**：命中的"处置"必须入账——否则闭环只通前半。
//
// 缺口的形状（2026-10-11 实测）：
//   `consultPrincipal` 接进 pre-execute 后，**源能影响行为**了（命中 0 → 7 → 10 → 11），
//   但只有 `state.preAction.hint/ask/deny` **三个整数**：
//     · 不知道**哪一条**命中了
//     · 不知道命中后**我做了什么**
//     · 而且这三个整数**不在 persist 的 plain 里** ⇒ 跨重启归零
//   ⇒ 一句话：**"我被他提醒了 11 次，但明天没有任何人知道我当时是怎么处置的。"**
//
// ★这一条与 P482⑨「承诺的最后一米」同构：写下→叫醒→履行→清账 四段，缺的是**清账**。
//   所以本模块的核心判据不是"记了没有"，而是：**未处置必须可见**。
//   否则回流只是台账装饰——"我没违反"永远无法被检验。
//
// 边界：只记**事实**（哪条命中、什么判决、我如何处置），不记辩护。
//   处置留痕（`myAction`）由调用方给出，**必须可被下一次观测校验**。

export const HIT_MAX = 300;

/**
 * ★P583 `stillOpen` 的承诺复查期（天）。
 *
 * 为什么需要它：`stillOpen` 原本是一个**永久旗标**，而它的语义是
 * 「我处置了，但这件事仍未解决」。对一个**长期方向**（例如「还不是与你共同
 * 演化的个体」）这个判断**永远为真**，于是它会永久占用"欠账"名额。
 *
 * 2026-10-21 实测现场：81 条命中里 24 条 stillOpen、**未处置 0 条**，
 * 而内生议程连续多轮报「有 24 笔命中还没清账」。那 24 条**全部已处置**，
 * 而它们只是我在 2026-10-18 那天密集处置同一件事留下的 21 个痕迹。
 * ⇒ 那不是债，是一个**永不过期的自我标记**。
 *
 * 修法不是加"时间窗看新旧"（那会把「是否欠」偷换成「是否新」），而是
 * 让 `stillOpen` 从**永久旗标**变成**会过期的承诺**：
 *   处置时记 `stillOpenUntil = now + N 天`；到期后**不再计入欠账**，
 *   但记录仍在 hits 里（仍然可见、仍然可查、仍然可以重新确认）。
 *
 * ★ 为什么是 14 天：与沉积衰减同期（P018 时间尺度层级的"遗忘曲线"那一层）。
 *   **这是一个 v0 常数，不是自然律**——它的依据是"该重新确认一次"的间隔，
 *   而不是任何测量结果。要改它就有意识改，不要当它是不变的。
 *
 * ★ 负控：**没有 `stillOpenUntil` 的旧记录保持旧行为**（仍然算欠账）。
 *   否则这条改动会静默抹掉历史——而"不许用代码改动悄悄抹掉历史"是硬纪律。
 */
export const STILL_OPEN_DEFAULT_DAYS = 14;

const MS_PER_DAY = 86400000;

function mkId(at) { return 'H' + String(at); }

/** 归一化一条命中记录。`key` 与 `tool` 必填——不知道命中哪条、什么动作触发的，不许进表。 */
export function normalizeHit(e) {
  if (!e || typeof e !== 'object') return null;
  const key = String(e.key || '').trim();
  const tool = String(e.tool || '').trim();
  if (!key || !tool) return null;
  const at = (typeof e.at === 'number') ? e.at : Date.now();
  return {
    id: String(e.id || mkId(at)),
    at: at, key: key, tool: tool,
    verdict: (e.verdict === 'ask' || e.verdict === 'hint') ? e.verdict : 'hint',
    text: String(e.text || '').trim(),
    entryId: String(e.entryId || '').trim(),
    myAction: String(e.myAction || '').trim(),
    disposedAt: (typeof e.disposedAt === 'number') ? e.disposedAt : null,
    // ★P523：处置时勾选"我处置了，但这件事仍未解决" —— **结构化字段，不靠猜文本**
    stillOpen: e.stillOpen === true
  };
}

/** 记一次命中。**无 key/tool ⇒ 不记**（负控：不许刷量）。有界：超限丢最旧。 */
export function recordHit(list, hit) {
  const arr = Array.isArray(list) ? list.slice() : [];
  const rec = normalizeHit(hit);
  if (!rec) return { list: arr, entry: null };
  // 同一时刻同一 key 同一工具只记一次（防重复计数污染）
  if (arr.some(function (e) { return e && e.id === rec.id; })) return { list: arr, entry: null };

  // ★P574：同一 key 在【上一次处置之前】只保留一条 —— 因为第二条不携带新信息。
  //
  //   缺口的形状（2026-10-18 实测）：principal 的两条（「愿景」「项目定位」）每次提示都注入
  //     ⇒ 每次注入都记一条 hit。23 分钟里记了 18 条，**原文完全相同**，
  //     而每一条都要求逐条写"我怎么处置" ⇒ 账本报「你有 18 笔债没还」，
  //     而实际欠的是**一次处置**，不是一个阵列。
  //
  //   ★ 判断依据：如果那是 18 次真实的背离，18 次处置【应该各不相同】；而它们全一样
  //     ⇒ 全一样的东西不可能是 18 件事。**一个数在说 A，其实在说 B。**
  //
  //   规则：同一 key 若【最近一条尚未处置】⇒ 不新增，只把它的 `count` 加一。
  //     而【处置之后】再命中才记新的一条 —— 那才是新的一次背离。
  //   ⇒ 这样"未处置"的数量等于【真正欠着的处置数】，而不是注入频率。
  const lastOpen = (function () {
    for (let i = arr.length - 1; i >= 0; i--) {
      const e = arr[i];
      if (!e || e.key !== rec.key) continue;
      if (!e.disposedAt) return e;      // 该 key 最近一条未处置 ⇒ 合并进它
      return null;                      // 最近一条已处置 ⇒ 这是新的一次，该记
    }
    return null;
  })();
  if (lastOpen) {
    lastOpen.count = (typeof lastOpen.count === 'number' ? lastOpen.count : 1) + 1;
    lastOpen.lastAt = rec.at;
    return { list: arr, entry: null, merged: lastOpen };
  }

  rec.count = 1;
  rec.lastAt = rec.at;
  arr.push(rec);
  return { list: arr.length > HIT_MAX ? arr.slice(-HIT_MAX) : arr, entry: rec };
}

/** 处置留痕（"我如何处置"）。**必须给 myAction** —— 空处置不算处置。
 *  ★P523 第 5 参 `stillOpen`：**我处置了，但这件事仍未解决**——
 *  它是 hit-repeat 区分器的唯一结构化依据（见 outstandingHits）。
 *  ★P583 第 6/7 参：
 *    `stillOpenDays` —— 承诺复查期（天），缺省 STILL_OPEN_DEFAULT_DAYS。
 *    `redo`          —— 允许对**已处置**的条目重新处置（显式确认/改口径）。
 *                      缺省 false ⇒ 保持"一次处置一条、不碰已处置"的老语义。 */
export function disposeHit(list, idOrKey, myAction, at, stillOpen, stillOpenDays, redo, direction) {
  const act = String(myAction || '').trim();
  const arr = Array.isArray(list) ? list.slice() : [];
  if (!act) return { list: arr, disposed: [] };
  const now = (typeof at === 'number') ? at : Date.now();
  const days = (typeof stillOpenDays === 'number' && stillOpenDays > 0)
    ? stillOpenDays : STILL_OPEN_DEFAULT_DAYS;
  const disposed = [];
  for (let i = arr.length - 1; i >= 0; i--) {          // 从最新往前，命中即停（一次处置一条）
    const e = arr[i];
    if (!e) continue;
    if (e.disposedAt && redo !== true) continue;       // 已处置且未要求重处置 ⇒ 跳过（老语义）
    if (e.id === idOrKey || e.key === idOrKey) {
      const next = Object.assign({}, e, {
        myAction: act,
        disposedAt: now,
        stillOpen: stillOpen === true
      });
      // ★P601：第三层处置——**方向**（direction）。方向不是任务：它没有完成状态。
      //   用 stillOpen 表达它只有两个结果：false = 撒谎，true = 无尽（每 45 分钟报一次）。
      if (direction === true) {
        next.direction = true;
        next.stillOpen = false;          // "不适用"，不是"未解决"
        delete next.stillOpenUntil;      // 方向不需要复查期
      } else if (stillOpen === true) {
        delete next.direction;           // ★负控：取消方向必须真清掉，不许残留成隐性豁免
        next.stillOpenUntil = now + days * MS_PER_DAY;  // ★P583 会过期的承诺
      } else {
        delete next.direction;
        delete next.stillOpenUntil;                     // 真的解决了 ⇒ 清掉期限
      }
      arr[i] = next;
      disposed.push(next);
      break;
    }
  }
  return { list: arr, disposed: disposed };
}

/** 未处置的命中（**回流的核心可见面**）。 */
export function openHits(list) {
  return (Array.isArray(list) ? list : []).filter(function (e) { return e && !e.disposedAt; });
}

/**
 * ★P523 **欠账**（hit-repeat 区分器的唯一判据，单一真源）：
 *   `未处置` **或** `stillOpen === true` 且在**承诺复查期内**（P583）。
 *
 * ★为什么必须是结构化字段而不是关键词：
 *   今天已栽过三次"判据量的是代理词"（`/我想要/` · `/内生议程/` · 断言范围越界）。
 *   若用"处置文本里有没有'未解决'"去猜，等于**又量了一次代理词**——字段不携带歧义。
 *
 * 现场（2026-10-11）：内生议程报「同一件事被提醒了 28 次…而是没被解决」，
 *   而 28 次**全部已处置**、无一处标 stillOpen ⇒ **那是误报**（它只是我这一轮的工作主题）。
 *
 * ★P583 现场（2026-10-21）：81 条命中 / 未处置 0 / stillOpen 24，而议程连报多轮
 *   「有 24 笔命中还没清账」。那 24 条全部已处置，只是 stillOpen 永不过期。
 *   ⇒ **过期的不算欠账，但记录仍在 hits 里，仍然可见、仍然可查、仍然可以重新确认。**
 *
 * ★负控（这条最重要）：**没有 `stillOpenUntil` 的旧记录保持旧行为**（仍然算欠账）。
 *   否则这条改动会静默抹掉 24 条历史 —— 而"不许用代码改动悄悄抹掉历史"是硬纪律。
 *   旧记录要退出欠账，必须**显式重新处置一次**（dispose 时带 redo），由我签字。
 */
export function outstandingHits(list, now) {
  const t = (typeof now === 'number') ? now : Date.now();
  return (Array.isArray(list) ? list : []).filter(function (e) {
    if (!e) return false;
    // ★P601：**方向不是欠账**。★负控：只看 e.direction，**不按 key 连坐**
    //   —— 否则"方向"会变成"这个话题以后都免检"的永久豁免。
    if (e.direction === true) return false;
    if (!e.disposedAt) return true;                    // 未处置 ⇒ 永远算欠账（没有期限可言）
    if (e.stillOpen !== true) return false;            // 已处置且真解决了 ⇒ 不是欠账
    // 处置了但标了"仍未解决"：有期限就按期限判；没期限 = 旧数据 ⇒ 保持旧行为
    if (typeof e.stillOpenUntil !== 'number') return true;
    return t < e.stillOpenUntil;
  });
}

/**
 * ★P601：方向条目（不参与欠账，但**必须可见**——消失比误报更糟）。
 * 与 outstandingHits 互补：两者合起来应当覆盖"处置过的全部记录"。
 */
export function directionHits(list) {
  return (Array.isArray(list) ? list : []).filter(function (e) { return !!(e && e.direction === true); });
}

/** 归并（恢复纪律：并集 + 按 id 去重，沿用 P514/P517/P519 同一条）。 */
export function mergeHits(a, b) {
  const out = [], seen = Object.create(null);
  const push = function (e) {
    const r = normalizeHit(e);
    if (!r || seen[r.id]) return;
    seen[r.id] = 1; out.push(r);
  };
  for (const e of (Array.isArray(a) ? a : [])) push(e);
  for (const e of (Array.isArray(b) ? b : [])) push(e);
  out.sort(function (x, y) { return (x.at || 0) - (y.at || 0); });
  return out.length > HIT_MAX ? out.slice(-HIT_MAX) : out;
}

/**
 * ★★P546 **登记类工具豁免**：`mpm_*` 是我自己的记账通道，**不该产生"命中"**。
 *
 * 现场（2026-10-18 实测）：45 笔命中里 **29 笔（64.4%）来自 mpm_\* 工具**
 *   （micro 9 · solve 7 · converge 4 · deposit 4 · generate 2 · frame 2 · narrate 1）。
 *   更糟的是**死循环**：清账动作本身也是 mpm_*，每清一笔它又记一笔
 *   （时间戳精确对应 13:49:24 → 被 13:49:47 清 → 13:49:47 又产生 → …）
 *   ⇒ **未处置永远 ≥ 1** ⇒ `hit-open` 永久占用一个议程名额（P537 判据的极限）。
 *
 * ★旧实现为何失效：host.js 用的是**4 个具体工具名的白名单**
 *   （mpm_principal / mpm_flywheel_state / mpm_hit / mpm_unknown），
 *   而意图是"登记类调用不算" ⇒ **之后新增的登记类工具全部漏网**。
 *
 * ★同源依据（P004-M3）：「工具调用自动累积 C 的监听器对 `mpm_*` 前缀工具豁免计价——
 *   登记类调用本身不计入被登记问题的求解成本」。
 *   ⇒ **那条给 C 计价豁免了 mpm_\*，而命中记录没跟上**；现在统一为前缀判断。
 *
 * ★为什么是"前缀"而不是"白名单"：**前缀覆盖未来新增的登记类工具**（判据②钉住这一点）。
 * 为什么它不该被计入：**登记不是"我对外做的一次动作"**——
 *   `consultPrincipal` 问的是"我这次动作用到源了吗"，记账动作问不出任何东西。
 */
export function isLedgerTool(name) {
  return /^mpm_/.test(String(name == null ? '' : name));
}

/**
 * 快照那一行。**没有命中记录 ⇒ 空串**（负控：不许凭空说"命中过"）。
 * ★关键：**未处置数必须显示出来**——这就是"对源负责"的可见面。
 */
export function hitsLine(state, limit) {
  const all = (state && Array.isArray(state.hits)) ? state.hits : [];
  if (!all.length) return '';
  const open = openHits(all);
  const n = (typeof limit === 'number' && limit > 0) ? limit : 3;
  const stillN = all.filter(function (e) { return e && e.disposedAt && e.stillOpen === true; }).length;
  const recent = all.slice(-n).map(function (e) {
    const mark = !e.disposedAt ? '**未处置**' : (e.stillOpen === true ? '**处置了但仍未解决**' : '已处置');
    return '「' + String(e.text || e.key).slice(0, 30) + '」(' + e.key + '·' + e.verdict + '·' + mark + ')';
  });
  return '- 命中回流(P519·**源→行为→记录→源**)：命中 ' + all.length + ' 次 · **未处置 ' + open.length + ' 次**'
    + (stillN ? ' · **处置了但仍未解决 ' + stillN + ' 次**' : '')
    + (recent.length ? '：' + recent.join(' · ') : '')
    + (open.length
      ? '——**未处置是我欠的账**：命中了却没说清怎么处置，等于没被约束过（用 `mpm_hit action=dispose` 留痕）。'
      : '——全部已处置（每次命中都留下了"我如何处置"）。');
}
