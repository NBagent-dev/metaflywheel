// MetaFlywheel state 生命周期模块（P079 重构：state 生命周期簇迁出宿主）
// P080：makeStateMachine 内层函数提升为模块顶层 xxxImpl(e, ...)，使 makeStateMachine 变薄为
// 收集 Impl + 组装返回对象。函数体逐字搬移，自由变量经 e 注入（e.xxx）；纯函数
// （norm/hintFile/stateFile/freshness）无自由变量，保持无 e 签名。
// 依赖注入契约：makeStateMachine(e) 返回生命周期服务集。e 为宿主管状所有者注入：
//   { fsSvc, policy, ctx, state, root, diag, adopted, bumpSnapRev, gainOf }
// root/adopted/diag/state 由宿主创建后传入（宿主所有权），模块只读取/变更、不重建。
// 铁律：只做「闭包→参数化」机械变换——函数体一字未动（自由变量改由 e 绑定），阈值/文案/流程不变。

// ★P604：运行时语言覆盖（读 <root>/.mpm/locale 后写入它，见 restore 内）
import { setLocaleFile } from './i18n.mjs';

// ── 纯函数（无自由变量，保持无 e 签名）─────────────────
function norm(p) { return String(p).replace(/\\/g, '/').replace(/\/+$/, ''); }
function hintFile(r) { return r + '/.mpm/root-hint.json'; }
function stateFile(r) { return r + '/.mpm/flywheel.json'; }
function freshness(data) {
  if (!data || typeof data !== 'object') return -1;
  let m = 0;
  if (data.problems) {
    for (const k in data.problems) {
      const p = data.problems[k];
      if (p && p.updatedAt > m) m = p.updatedAt;
    }
  }
  if (Array.isArray(data.sediments)) {
    for (let i = 0; i < data.sediments.length; i++) {
      if (data.sediments[i] && data.sediments[i].depositedAt > m) m = data.sediments[i].depositedAt;
    }
  }
  return m;
}

// ── resolveInitialRoot ─────────────────────────────────
function resolveInitialRootImpl(e) {
  try {
    const wr = e.ctx.get('workspaceRegistry');
    if (wr && typeof wr.list === 'function') {
      const list = wr.list();
      if (Array.isArray(list) && list.length === 1 && list[0] && list[0].path) return String(list[0].path);
    }
  } catch (e) {}
  return e.policy && e.policy.workspaceRoot ? String(e.policy.workspaceRoot) : '';
}

// ── readHint / writeHint ───────────────────────────────
async function readHintImpl(e) {
  try {
    const base = e.policy && e.policy.workspaceRoot ? String(e.policy.workspaceRoot) : '';
    if (!base || !e.fsSvc) return '';
    const raw = await e.fsSvc.readText(await e.fsSvc.resolve(hintFile(base)));
    const o = raw ? JSON.parse(raw) : null;
    return o && o.root ? String(o.root) : '';
  } catch (e) { return ''; }
}
async function writeHintImpl(e) {
  try {
    const base = e.policy && e.policy.workspaceRoot ? String(e.policy.workspaceRoot) : '';
    if (!base || !e.fsSvc || !e.root.current) return;
    if (norm(e.root.current) === norm(base)) return;
    await e.fsSvc.writeText(await e.fsSvc.resolve(hintFile(base)), JSON.stringify({ root: e.root.current, at: Date.now() }));
  } catch (e) {}
}

// ── candidates ─────────────────────────────────────────
async function candidatesImpl(e) {
  const out = [];
  try {
    const wr = e.ctx.get('workspaceRegistry');
    if (wr && typeof wr.list === 'function') {
      const wl = wr.list();
      for (let i = 0; i < wl.length && i < 12; i++) {
        if (wl[i] && wl[i].path) out.push(String(wl[i].path));
      }
    }
  } catch (e) {}
  if (e.root.current) out.push(e.root.current);
  const hint = await readHintImpl(e);
  if (hint) out.push(hint);
  const seen = {}; const uniq = [];
  for (let j = 0; j < out.length; j++) {
    const n = norm(out[j]);
    if (n && !seen[n]) { seen[n] = true; uniq.push(out[j]); }
  }
  return uniq;
}

// ── readStateData ──────────────────────────────────────
async function readStateDataImpl(e, r) {
  try {
    const target = await e.fsSvc.resolve(stateFile(r));
    const raw = await e.fsSvc.readText(target);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/**
 * ★P511 续：把磁盘上的"在场证据"**归并**进宿主态——**取 max，不覆盖**。
 *
 * 为什么必须是归并（2026-10-11，代码结构证据，不是观测证据）：
 *   `ensureLoaded` 是**懒加载**（第一次需要账本时才恢复），而
 *   `ctx.on('agent/created')`（events.mjs:165）在**会话创建时同步**就把 sessionStarts +1、
 *   `ctx.on('...inbox...')` 同步把 inboxCount +1 并写 lastInboxAt。
 *   ⇒ 只要有事件**早于首次 ensureLoaded** 到达，直接赋值就会把它抹掉。
 *   （当时那条观测 `sessionStarts=1` 是**双重歧义**的：磁盘 1 与事件 1 恰好相同，
 *     "覆盖"与"归并"给出同一个数 ⇒ **不能拿它当证据**。真正的证据是上面这条结构事实。）
 * 语义：这类量只增不减（计数与时间戳）⇒ max 既安全又正确；agentId 只在为空时补（不盖掉本轮的）。
 * 同族：P502「累加器可以被擦」——修法同样是"取 max / 从事实重算"，而不是信任存储值。
 */
import { t } from "./i18n.mjs";                 // ★P620：渲染面一律走词条（数据层不动）
  import { mergePrincipalLists } from "./principal.mjs";   // ★P517（**第 4 次"用了没引入"**：靠冷启动集成判据抓到，不是静态判据）
import { mergeUnknowns } from "./unknowns.mjs";          // ★P517③：未核清单（记忆的另一半：我不知道的东西）
import { mergeHits } from "./hits.mjs";                  // ★P519：回流（命中的处置必须留痕）
import { mergeAdopts } from "./adopt.mjs";               // ★P526：采用（动手前检索并真的采用）
import { formatEventLine, trimEventLines } from "./events-log.mjs";   // ★P594③：增量日志（**旁路**：失败不影响落盘）

export function mergePresenceInto(perception, lastActive, pres) {
  if (!pres) return false;                       // 负控：没有磁盘证据 ⇒ 什么都不做（不许凭空造）
  let touched = false;
  if (perception) {
    if (typeof pres.lastInboxAt === 'number' && pres.lastInboxAt > (perception.lastInboxAt || 0)) { perception.lastInboxAt = pres.lastInboxAt; touched = true; }
    if (typeof pres.inboxCount === 'number' && pres.inboxCount > (perception.inboxCount || 0)) { perception.inboxCount = pres.inboxCount; touched = true; }
    if (typeof pres.sessionStarts === 'number' && pres.sessionStarts > (perception.sessionStarts || 0)) { perception.sessionStarts = pres.sessionStarts; touched = true; }
  }
  if (lastActive) {
    if (typeof pres.lastActiveAt === 'number' && pres.lastActiveAt > (lastActive.at || 0)) { lastActive.at = pres.lastActiveAt; touched = true; }
    if (typeof pres.lastActiveAgent === 'string' && pres.lastActiveAgent && !lastActive.agentId) { lastActive.agentId = pres.lastActiveAgent; touched = true; }
  }
  return touched;
}

// ── restore ────────────────────────────────────────────
async function restoreImpl(e) {
  if (!e.fsSvc) return;
  const cands = await candidatesImpl(e);
  let best = null;
  for (let i = 0; i < cands.length; i++) {
    const data = await readStateDataImpl(e, cands[i]);
    if (!data) continue;
    const fr = freshness(data);
    if (fr < 0) continue;
    if (!best || fr > best.fr) best = { root: cands[i], data, fr };
  }
  if (best) {
    e.root.current = best.root;
    // ★P606（更正 P604）：这里只交**路径**给 i18n，不读内容。
    //   上一轮我在这里读了一次、写进模块级覆盖 —— 于是"写文件即生效"是假的：
    //   restore 只在加载/换根时跑，写完还是要重启。那正是我批评环境变量的同一个毛病。
    //   ⇒ 现在每次 resolveLocale 现读；本行只负责告诉 i18n 文件在哪。
    setLocaleFile(norm(e.root.current) + '/.mpm/locale');
    e.state.seq = best.data.seq || 0;
    e.state.problems = best.data.problems || {};
    e.state.sediments = Array.isArray(best.data.sediments) ? best.data.sediments : [];
    // ★P591：沉积的「被取代」状态缺省为 active。旧账本里所有记录都没有这个字段，
    //   在**加载时**补齐（而不是让每个读到它的地方各自兜底）——否则"没有字段"与"非 active"
    //   会分不清，而后者会让 isRetired 一夜之间把整个库房判成退休（无报错、只是检索突然空）。
    for (let i = 0; i < e.state.sediments.length; i++) {
      const s0 = e.state.sediments[i];
      if (s0 && typeof s0 === 'object' && !s0.status) s0.status = 'active';
    }
    // ★P500 的第五个实例：对象型字段**白名单重建**比"漏读"更隐蔽——它不报错，只是让新字段静默消失。
    //   实机症状：`measure.promiseStats`（承诺履行累计）每次重启归零 ⇒ 快照出现
    //   「已叫醒 1 · 已履行 0」的**呈现失真**（明明履行过，看起来像没履行）。
    //   ⇒ 规则：**恢复对象先继承再覆盖**（Object.assign 源对象），不要白名单重建。
    const patrolSrc = (best.data.patrol && typeof best.data.patrol === 'object') ? best.data.patrol : {};
    e.state.patrol = Object.assign({ rounds: 0, lastAt: 0, lastReport: '' }, patrolSrc,
      { rounds: typeof patrolSrc.rounds === 'number' ? patrolSrc.rounds : 0 });
    const measureSrc = (best.data.measure && typeof best.data.measure === 'object') ? best.data.measure : {};
    e.state.measure = Object.assign({}, measureSrc, {
      samples: Array.isArray(measureSrc.samples) ? measureSrc.samples.slice(-48) : [],
      driftSignals: Array.isArray(measureSrc.driftSignals) ? measureSrc.driftSignals : []
    });
    // P019 v6：执政权为构成性权能——默认开启（三者的结合才是一）；
    // 仅当宪法记录显示最后一次修正为显式 revoke 时保持关闭（撤回=修正权，粘性而非执照）。
    const cLog = best.data.constitution && Array.isArray(best.data.constitution.log) ? best.data.constitution.log : [];
    let lastCAction = null;
    for (let ci = 0; ci < cLog.length; ci++) { if (cLog[ci] && (cLog[ci].action === 'grant' || cLog[ci].action === 'revoke')) lastCAction = cLog[ci].action; }
    // 同上：先继承宪法对象里的其它字段，再覆盖这五个（白名单重建会吃掉未来新增的字段）
    const constitutionSrc = (best.data.constitution && typeof best.data.constitution === 'object') ? best.data.constitution : {};
    e.state.constitution = Object.assign({}, constitutionSrc, {
      autonomy: lastCAction !== 'revoke',
      grantedAt: (best.data.constitution && best.data.constitution.grantedAt) || null,
      log: cLog, pending: [], lastFireAt: (best.data.constitution && best.data.constitution.lastFireAt) || 0
    });
    // R1 效价账本迁移（P023）：旧态无 valence 字段——schema 回填（P011 类"旧态×新字段"纪律）
    const valenceSrc = (best.data.valence && typeof best.data.valence === 'object') ? best.data.valence : {};
    e.state.valence = Object.assign({}, valenceSrc, {
      events: Array.isArray(valenceSrc.events) ? valenceSrc.events.slice(-200) : []
    });
    // ★P482④：**自我设定必须跨重启存活**——rhythm 是我写下的节律（陈旧阈值/发动节流/静默时段）。
    //   缺这一行的代价（2026-10-11 实机）：新实例启动时 state.rhythm=undefined ⇒ 第一次落盘写成 null
    //   ⇒ **我的设定被自己的持久化擦掉**。这与 P021 结题时命名的病同族：写入✓ 回显✓ **恢复✗**。
    e.state.rhythm = (best.data && best.data.rhythm) || null;
    // ★同一类事故的**第二个实例**（由 test/persist-keys.test.mjs 当场抓出）：`narrations`（叙事）
    //   原来只写不读，而它在 host.js 里初始化成 `[]` ⇒ **每次重启都用空数组覆盖磁盘上的叙事**
    //   （静默数据丢失，且因为没有渲染进快照，我一直没察觉）。
    e.state.narrations = Array.isArray(best.data.narrations) ? best.data.narrations : [];
    // ★P511 落地：**用户在场证据必须跨重启存活**（"体验连续"缺口的头两个受害者）
    //   原来 perception / lastActive 全在宿主态、重启即归零，于是：
    //     ①`user:reply` 靠 perception.lastInboxAt 求值 ⇒ 重启**抹掉"用户回过话"这个事实**
    //       ⇒ 依赖它的承诺退回 unknown（今天已因同类原因踩过一次）
    //     ②自主发动的"温热"判定靠 lastActive ⇒ 重启后温热失真
    //   ⇒ 恢复它们（写入侧在 persistImpl：从当前 perception 快照，且**没观测到就省略**）。
    {
      const pres = (best.data && best.data.presence) || null;
      e.state.presence = pres;
      // ★**归并而不是覆盖**——懒加载的恢复可能晚于本轮已发生的事件（详见 mergePresenceInto 的注释）。
      mergePresenceInto(e.perception, e.lastActive, pres);
    }
    // ★P517：**委托人的思考方式**（他说过什么、用什么方式说的）——同样必须跨重启存活。
    //   与 presence 的区别：presence 记"他在不在"，principal 记"他怎么想"。
    //   归并而非覆盖（P514 纪律：懒加载的恢复可能晚于本轮已录入的条目）。
    e.state.principal = mergePrincipalLists(e.state.principal, (best.data && best.data.principal) || []);
    // ★P517③：**未核清单**——与 principal 配成一对（那记"我知道的"，这记"我不知道的"）。归并而非覆盖。
    e.state.unknowns = mergeUnknowns(e.state.unknowns, (best.data && best.data.unknowns) || []);
    // ★P519：**回流**——命中的处置记录。归并而非覆盖（同一纪律）。
    e.state.hits = mergeHits(e.state.hits, (best.data && best.data.hits) || []);
    // ★P526：**采用**（动手前检索并真的采用）。归并而非覆盖——否则回环率跨代即失真。
    e.state.adopts = mergeAdopts(e.state.adopts, (best.data && best.data.adopts) || []);
    // Schema migration on restore: backfill fields introduced after a
    // problem was first persisted. Never assume new fields exist on old state.
    for (const bk in e.state.problems) {
      const bp = e.state.problems[bk];
      if (!bp) continue;
      if (!Array.isArray(bp.frameLog)) bp.frameLog = [];
      if (!('phi' in bp)) bp.phi = null;
      if (!('lastRevision' in bp)) bp.lastRevision = null;
      // A_k 诚实迁移：仅单次界定的旧题回填 delta0（增益仍为 0，不伪造历史精度）
      if (bp.delta0 == null && bp.delta != null && bp.iteration === 1) bp.delta0 = bp.delta;
      // P027/B5 迁移：ε0 回填（旧题无逐次 ε 历史，只能≈终值——增益公式注释已声明该近似）
      if (bp.epsilon0 == null && bp.epsilon != null) bp.epsilon0 = bp.epsilon;
      // P027/A1 迁移：从 history 的【PARKED 标记回填搁置状态（修正案 A1 引擎强制）。
      // 规则：最后一条 PARKED 求解晚于最后一次非 PARKED 求解 → 仍搁置；否则视为已重唤醒。
      let lastParkedAt = -1, lastActiveSolveAt = -1;
      for (const h of (bp.history || [])) {
        const note = String((h && h.note) || '');
        if (note.indexOf('【PARKED') === 0) lastParkedAt = h.at;
        else if ((h.event || '').indexOf('S 求解') === 0) lastActiveSolveAt = h.at;
      }
      if (lastParkedAt > lastActiveSolveAt && !bp.parked) {
        bp.parked = { at: lastParkedAt, note: 'history 回填（修正案 A1）', awakenWhen: '' };
      }
      // P027/B5 迁移：按新增益公式重算历史题 gain（旧口径在沉积时写入，结构上恒 0）
      if (bp.delta0 != null) bp.gain = e.gainOf(bp);
      // P047 迁移：存量 C 题结账——完全收敛(ε≤0.1)且 30min 无动静、或已有"判定:none"记录者置 settled。
      // 保守组合条件避免误伤真在轮题；evoke 通道可随时由沉积物重开新题。
      if (bp.stage === 'C' && !bp.parked && !bp.settled && bp.epsilon != null && bp.epsilon <= 0.1) {
        const hist = bp.history || [];
        let judgedNone = false, fullyConverged = false;
        for (const h of hist) {
          const ev = String((h && h.event) || '');
          if (ev.indexOf('D 沉积判定:none') === 0) judgedNone = true;
          if (ev.indexOf('C 收敛检查') === 0 && ev.indexOf('完全收敛') >= 0) fullyConverged = true;
        }
        const quiet = bp.updatedAt && (Date.now() - bp.updatedAt > 30 * 60000);
        if (judgedNone || (fullyConverged && quiet)) bp.settled = { at: Date.now(), via: judgedNone ? 'migrate-judged' : 'migrate-converged' };
      }
    }
    e.diag.lastRestore = t('state.restore', { root: e.root.current, fr: best.fr, n: cands.length });
    console.log('[mpm][engine] ' + e.diag.lastRestore);
    await remapForeignSedimentsImpl(e);
    // P487④：启动对账（孤儿 .md / 幽灵索引项）——只报不改，结论进 measure
    await reconcileDeposits(e);
  }
}

// ── remapForeignSediments ──────────────────────────────
async function remapForeignSedimentsImpl(e) {
  const newDep = norm(e.root.current + '/.mpm/deposits/');
  for (let i = 0; i < e.state.sediments.length; i++) {
    const s = e.state.sediments[i];
    if (!s.path) continue;
    if (norm(s.path).indexOf(newDep) === 0) continue;
    try {
      const content = await e.fsSvc.readText(await e.fsSvc.resolve(s.path));
      const np = newDep + norm(s.path).slice(norm(s.path).lastIndexOf('/') + 1);
      await e.fsSvc.writeText(await e.fsSvc.resolve(np), content);
      s.path = np;
    } catch (e) { console.error('[mpm][engine] 沉积迁移跳过 ' + s.id + ':', e && e.message ? e.message : e); }
  }
}

// ── persist ────────────────────────────────────────────
// ★P327 修复（2026-09-26）：**返回值即事实**。旧版把异常 catch 掉后 `return undefined`，
//   六个调用方（tools.mjs 各处的 await d.persist()）与巡检都无从判断成功与否，
//   "报成功"于是成了默认行为。本会话实证：21:02:57 之后连续三轮巡检全没落盘，
//   台账 mtime 纹丝不动，P327 随一次重启直接蒸发——而每一轮都打印了"（已落盘）"。
//   现在统一返回 { ok: true, target } 或 { ok: false, reason }。
// ★P488（2026-10-10，取代 P487 的 node:fs 方案）：**按真实 fs 契约写**。
//   P487 的②③④在生产里一次都没跑过：它们全挂在 `isLocalAbs(target)` 上，而
//   `resolve()` 返回的根本不是路径——按 @deepseek-ai/dsh-fs 的类型定义，它是
//   `FsTarget{ targetKey, displayPath }`，文档原话：
//     "Consumers MUST NOT parse it or assume it is a local absolute path."
//   ⇒ `typeof target === 'string'` 恒假 ⇒ 永久退化成直写，而那三条判据全是死代码。
//   ★抓到它的**不是测试**：测试桩写成 `resolve: async p => p`，把我的错误假设又确认了一遍
//     （桩由我写，于是七条判据全绿）。抓到它的是判据①自己——工具报告尾注打出
//     「（账本已落盘 · direct · 非本地路径，跳过备份）」，我加了"可见结论"才看得见走了哪条路。
//   ⇒ 现在只做服务契约本来就支持的三件事：
//     ① **原子性交给平台**：FileSystem 接口原话 "mutations are atomic"，
//        dsh-fs-local 走"独占同级文件 + atomic publish"。引擎**不再自己 tmp+rename**
//        （平台另有 @deepseek-ai/dsh-atomic-write 做同一件事，手写一份是多余的）。
//     ② **回读等价**：writeText 把写后内容放进 `out.after`（LF 归一化）⇒ 零成本校验。
//     ③ **备份用 `out.before`**（写前内容，免费）。fs 服务**没有删除 API** ⇒ 备份用
//        **单槽位固定名** `flywheel.json.bak`：天然有界，不需要轮转、也不需要删除。
//   mode 只剩两种取值：'service-atomic' | 'failed'。
const BACKUP_SUFFIX = '.bak';
/** ★P594③：事件日志保留行数（有界滚动：最近的才是「刚才那次写盘改了什么」）。 */
const EVENTS_MAX = 500;

/** 落盘结论的统一文案（P487①：任何工具报告都必须带上它，不许无条件断言"已落盘"）。 */
export function persistNote(pr) {
  if (!pr) return t('state.persist.none');
  if (pr.ok) return t('state.persist.ok', { mode: pr.mode || '?', backup: pr.backup ? ' · ' + pr.backup : '' });
  return t('state.persist.fail', { why: pr.reason || t('state.reason.unknown') });
}

/** LF 归一化：服务的 after 是 LF 归一化文本，比较前把两侧拉齐（Windows 的 \r\n 只可能来自我方）。 */
function lf(s) { return String(s == null ? '' : s).replace(/\r\n/g, '\n'); }

async function persistImpl(e) {
  if (!e.fsSvc || !e.root.current) return { ok: false, mode: 'failed', reason: 'fsSvc 缺失或沉积根未定' };
  e.bumpSnapRev();
  const plain = { seq: e.state.seq, problems: e.state.problems, sediments: e.state.sediments, lastRoot: e.root.current, patrol: e.state.patrol, measure: e.state.measure, constitution: { autonomy: e.state.constitution.autonomy, grantedAt: e.state.constitution.grantedAt, log: e.state.constitution.log, lastFireAt: e.state.constitution.lastFireAt }, valence: { events: (e.state.valence && Array.isArray(e.state.valence.events)) ? e.state.valence.events.slice(-200) : [] },     // ★没恢复过的字段，落盘时**省略**而不是写成 null：否则"恢复路径漏了一个字段"会升级成
    //   "把磁盘上的值擦掉"（2026-10-11 rhythm 就是这么丢的）。JSON.stringify 会丢掉 undefined 键。
    rhythm: e.state.rhythm === undefined ? undefined : (e.state.rhythm || null), narrations: e.state.narrations,
    // ★P517：委托人的表态/思考方式。**空数组也落盘**（与 narrations 同）：schema 交叉核对要求
    //   "登记了就必须在账本里存在"，否则"没录过"与"恢复了但没写"无法区分。
    principal: Array.isArray(e.state.principal) ? e.state.principal.slice(-200) : [],
    // ★P517③：未核清单（我知道自己没验的东西）。空数组也落盘（schema 口径同 principal）。
    unknowns: Array.isArray(e.state.unknowns) ? e.state.unknowns.slice(-200) : [],
    // ★P519：回流——命中与处置（未处置必须可见）。空数组也落盘（schema 口径同前）。
    hits: Array.isArray(e.state.hits) ? e.state.hits.slice(-300) : [],
    // ★P526：采用（动手前检索并真的采用）——回环率的唯一数据源。空数组也落盘（schema 口径同前）。
    adopts: Array.isArray(e.state.adopts) ? e.state.adopts.slice(-300) : [],
    // ★P511：用户在场证据——**没观测到就省略（undefined），不写 0/null**：
    //   写 0 会伪造"用户从未说过话"，写 null 会擦掉磁盘上已有的值（rhythm 那次就是这么丢的）。
    presence: (function () {
      let p = null;
      if (e.perception && typeof e.perception.lastInboxAt === 'number' && e.perception.lastInboxAt > 0) {
        p = {
          lastInboxAt: e.perception.lastInboxAt,
          inboxCount: e.perception.inboxCount || 0,
          sessionStarts: e.perception.sessionStarts || 0,
          lastActiveAt: (e.lastActive && typeof e.lastActive.at === 'number') ? e.lastActive.at : 0,
          lastActiveAgent: (e.lastActive && e.lastActive.agentId) ? String(e.lastActive.agentId) : ''
        };
      }
      // ★自愈：本轮没观测到、但磁盘上有过 ⇒ **不许擦掉**（沿用 rhythm 的教训）
      if (!p && e.state.presence) p = e.state.presence;
      return p === null ? undefined : p;
    })() };
  const json = JSON.stringify(plain, null, 2);
  try {
    const target = await e.fsSvc.resolve(stateFile(e.root.current));
    // ① 原子写：由平台保证（FileSystem 契约："mutations are atomic"）
    const out = await e.fsSvc.writeText(target, json);
    // ② 回读等价：服务把写后内容带了回来（null = 服务没提供，不是失败）
    const verify = (out && typeof out.after === 'string') ? (lf(out.after) === lf(json)) : null;
    if (verify === false) {
      return { ok: false, mode: 'failed', reason: t('state.persist.mismatch'), bytes: json.length };
    }
    // ③ 备份上一版：用 out.before，单槽位固定名（服务无删除 API ⇒ 天然有界）
    let backup = t('state.backup.none');
    if (out && out.operation === 'create') backup = t('state.backup.first');
    else if (out && typeof out.before === 'string' && out.before.length) {
      try {
        const bt = await e.fsSvc.resolve(stateFile(e.root.current) + BACKUP_SUFFIX);
        await e.fsSvc.writeText(bt, out.before);
        backup = t('state.backup.prev', { n: out.before.length, suffix: BACKUP_SUFFIX });
      } catch (e2) { backup = t('state.backup.fail', { why: (e2 && e2.message ? e2.message : String(e2)) }); }
    }
    // ★P594③：增量日志（**旁路**）。三条硬约束：
    //   ① 它失败**绝不影响落盘**（不 return、不改 ok）——日志是审计，不是前置条件；
    //   ② 只保留最后 EVENTS_MAX 行（fsSvc 无 append ⇒ 读—拼—写；无界增长会把落盘变成 O(n) 搬运）；
    //   ③ 结果写进返回值的 events 字段 ⇒ 「日志没写成」必须可见，不许静默。
    let events = null;
    try {
      const evRec = formatEventLine(e.lastEventSummary || null, { state: plain }, Date.now(), {
        via: 'persist',
        bytes: json.length,
        before: (out && typeof out.before === 'string') ? out.before.length : 0
      });
      const evTarget = await e.fsSvc.resolve(stateFile(e.root.current).replace(/flywheel\.json$/, 'events.jsonl'));
      let evPrev = '';
      try { evPrev = await e.fsSvc.readText(evTarget); } catch (e0) { evPrev = ''; }
      const evCut = trimEventLines(evPrev, evRec, EVENTS_MAX);
      await e.fsSvc.writeText(evTarget, evCut.text);
      events = { ok: true, kept: evCut.kept, dropped: evCut.dropped };
      e.lastEventSummary = { state: plain };
    } catch (e3) {
      events = { ok: false, reason: (e3 && e3.message) ? e3.message : String(e3) };
    }
    await writeHintImpl(e);
    // ★全函数**唯一的成功返回**：负控（_p327_persistcheck.mjs）靠注入它把出货代码降级成
    //   "成功也返回 undefined"。多一个成功出口就会让负控失效——已实测一次。
    return { ok: true, target: (target && target.displayPath) ? target.displayPath : '(target)', mode: 'service-atomic', bytes: json.length, verify: verify, backup: backup, events: events, operation: out && out.operation };
  } catch (e2) {
    const reason = e2 && e2.message ? e2.message : String(e2);
    console.error('[mpm][engine] 持久化失败:', reason);
    return { ok: false, mode: 'failed', reason };
  }
}

/**
 * ④ P487：启动对账——沉积文件 × 索引双向比对。
 *   孤儿 = .md 在磁盘上而索引里没有（重启后从我记忆里消失的那一类）；
 *   幽灵 = 索引里有而文件不在。
 * 结论写进 state.measure.reconcile ⇒ 随账本落盘 ⇒ 快照可按需显示。
 */
export async function reconcileDeposits(e) {
  const out = { at: Date.now(), mode: 'skipped', orphans: [], ghosts: [] };
  try {
    if (!e.fsSvc || !e.root.current) { out.mode = t('state.reconcile.nofs'); }
    else {
      // P488：对账走服务契约的 listDir（**不再用 node:fs 猜路径**——resolve 返回的是 FsTarget 对象）
      if (typeof e.fsSvc.listDir !== 'function') { out.mode = t('state.reconcile.nolist'); }
      else {
        const dir = await e.fsSvc.resolve(norm(e.root.current) + '/.mpm/deposits');
        const entries = await e.fsSvc.listDir(dir);
        const files = (entries || [])
          .filter(function (x) { return x && x.type === 'file' && /\.md$/.test(String(x.name)); })
          .map(function (x) { return String(x.name); });
        const idx = {};
        for (let i = 0; i < e.state.sediments.length; i++) {
          const p = e.state.sediments[i].path;
          if (p) idx[norm(p).slice(norm(p).lastIndexOf('/') + 1)] = e.state.sediments[i].id;
        }
        for (let i = 0; i < files.length; i++) if (!idx[files[i]]) out.orphans.push(files[i]);
        for (const n in idx) if (files.indexOf(n) < 0) out.ghosts.push(idx[n] + ' ' + n);
        out.mode = 'ok';
      }
    }
  } catch (err) { out.mode = 'error: ' + (err && err.message ? err.message : String(err)); }
  try { if (e.state && e.state.measure) e.state.measure.reconcile = out; } catch (_) {}
  if (out.orphans.length || out.ghosts.length) {
    console.log('[mpm][engine] 账本对账：孤儿 .md ' + out.orphans.length + ' 个 · 幽灵索引项 ' + out.ghosts.length + ' 个（' + out.mode + '）');
  }
  return out;
}

// ── collectEvidence / pickRoot ─────────────────────────
function collectEvidenceImpl(e, exec) {
  const ev = { hadExec: !!exec, agentId: '', agentCwd: '', agentsSeen: [], workspaces: [], source: '' };
  try {
    if (exec && exec.agent) {
      ev.agentId = exec.agent.id ? String(exec.agent.id) : '';
      if (exec.agent.meta && exec.agent.meta.cwd) ev.agentCwd = String(exec.agent.meta.cwd);
    }
  } catch (e) {}
  try {
    const ag = e.ctx.get('agents');
    if (ag && typeof ag.list === 'function') {
      const list = ag.list();
      for (let i = 0; i < list.length && i < 12; i++) {
        const a = list[i];
        const rec = { id: a && a.id ? String(a.id) : '', cwd: (a && a.meta && a.meta.cwd) ? String(a.meta.cwd) : '' };
        if (ev.agentId && rec.id === ev.agentId && rec.cwd) ev.agentCwd = ev.agentCwd || rec.cwd;
        ev.agentsSeen.push(rec);
      }
    }
  } catch (e) {}
  try {
    const wr = e.ctx.get('workspaceRegistry');
    if (wr && typeof wr.list === 'function') {
      const wl = wr.list();
      for (let j = 0; j < wl.length && j < 12; j++) {
        if (wl[j] && wl[j].path) ev.workspaces.push(String(wl[j].path));
      }
    }
  } catch (e) {}
  return ev;
}
function pickRootImpl(e, ev) {
  if (ev.agentCwd) { ev.source = 'agent.cwd'; return ev.agentCwd; }
  const cwds = [];
  for (let i = 0; i < ev.agentsSeen.length; i++) {
    const c = ev.agentsSeen[i].cwd;
    if (c && cwds.indexOf(norm(c)) < 0) cwds.push(c);
  }
  if (cwds.length === 1) { ev.source = 'agents.list唯一cwd'; return cwds[0]; }
  if (ev.workspaces.length === 1) { ev.source = 'workspace唯一'; return ev.workspaces[0]; }
  ev.source = 'none';
  return '';
}

// ── adoptRoot ──────────────────────────────────────────
async function adoptRootImpl(e, exec) {
  const ev = collectEvidenceImpl(e, exec);
  e.diag.lastEvidence = ev;
  const cw = pickRootImpl(e, ev);
  e.diag.lastSource = ev.source;
  if (!cw || !e.fsSvc) return;
  if (norm(cw) === norm(e.root.current)) return;
  e.root.current = cw;
  if (e.adopted[norm(cw)]) return;
  e.adopted[norm(cw)] = true;
  try {
    await remapForeignSedimentsImpl(e);
    await persistImpl(e);
    console.log('[mpm][engine] 沉积根采纳: ' + cw + ' (via ' + ev.source + ')');
  } catch (e) { console.error('[mpm][engine] 根采纳迁移失败:', e && e.message ? e.message : e); }
}

// Factory: thin — keeps per-instance loadPromise/ensureLoaded, collects the Impl functions.
export function makeStateMachine(e) {
  let loadPromise = null; // P080：per-instance —— 保持在工厂内（绑定 instance 状态，不宜模块化）
  function ensureLoaded() {
    if (!loadPromise) loadPromise = restoreImpl(e);
    return loadPromise;
  }
  return {
    ensureLoaded,
    // P487①：落盘结论必须能被工具层读到——记进 diag，供工具报告尾注使用
    persist: async () => {
      const pr = await persistImpl(e);
      e.diag.lastPersist = pr;
      e.diag.persistCount = (e.diag.persistCount || 0) + 1;
      return pr;
    },
    adoptRoot: (exec) => adoptRootImpl(e, exec),
    remapForeignSediments: () => remapForeignSedimentsImpl(e),
    readHint: () => readHintImpl(e),
    writeHint: () => writeHintImpl(e),
    stateFile: (r) => stateFile(r),
    hintFile: (r) => hintFile(r),
    norm: (p) => norm(p),
    resolveInitialRoot: () => resolveInitialRootImpl(e),
    candidates: () => candidatesImpl(e),
    pickRoot: (ev) => pickRootImpl(e, ev),
    restore: () => restoreImpl(e),
  };
}
