// MetaFlywheel 工具集模块（P079 重构：mkTool 工厂 + 11 个生命周期工具处理器迁出宿主）
// P080：11 个匿名处理器提升为模块顶层命名函数 toolXxx(d, args, exec)，使 makeTools 变薄为
// 数组组装；函数体逐字搬移，仅把宿主闭包引用 deps.xxx 改为 d.xxx。
// 依赖注入契约：makeTools(deps) 返回工具数组 tools；处理器体内对宿主管状闭包变量的
// 直接引用经 deps 注入为 d.xxx 访问；纯函数 phiOf/revisionOf/classifyConvergence 与工厂
// defineTool 走模块 import。
// 铁律：只做「闭包→参数化」机械变换，判据/文案/阈值/流程一字未动。
import { defineTool } from "@deepseek-ai/dsh-tools";
import { phiOf, revisionOf } from "./util.mjs";
import { SEDIMENT_STATUS, applySupersedes, statusSummary } from "./sediment-status.mjs";
import { normalizeAgendaWeights, breakdownLine } from "./agenda-weights.mjs";   // ★P593：议程权重外置 + 贡献占比诊断
import { innerAgenda } from "./agenda.mjs";   // ★P593：mpm_weights show 要打印真实议程的占比  // ★P591：沉积的「被取代」（ADR 式）
import { sedimentCacheGet, retrieveTop } from "./retrieval.mjs";
import { persistNote } from "./state.mjs";
import { rhythmOf, normalizeRhythm, rhythmLine } from "./rhythm.mjs";

// ══ P482 账本可达性三件套（A 强制 / B 便宜 / C 可见）══════════════════════
// 起因（2026-10-10 实测）：401 条沉积里只有 13 条参与过任何关联、引用边仅 10 条，
// 且全部落在飞轮极早期（P006–P092）。原因是"引用了哪些旧沉积"全靠模型自觉填
// （题上的 appliedSediments 只有 47/482），前 100 题填了，后 380 题悄悄废掉。
// ⇒ 账本的可达性不能建立在"模型想起来"上：无状态实例没有"习惯"这回事。
//
// B：把候选沉积摆到眼前——从"自己想起来去查"变成"从菜单里挑"。
//
// ★P482/B-v2（2026-10-10 实测诊断后重写）。原实现直接调 retrieveTop（字符级 bigram +
//   score=inter/eff），诊断出三个叠加缺陷：
//   ① **英文字母对噪声**：'st'/'tr'/'ed'/'ra' 在任何英文里都出现，信息量≈0。实测中
//      P238-M178（十年复利外推）正是靠 ed/ts/tr/ra/st/oo/ap 这些字母对拿到 inter=10。
//   ② **分母不对称**：eff 是**沉积自己**的 bigram 数 ⇒ 标题越长越吃亏。P019-M14
//      （知行合一契约）eff=63、score=0.095 落榜，而它才是这道题真正该命中的那条。
//   ③ **单字通用词即可过闸**：inter>=2 时，一个三字词（"三件"+"件套"）就够。
//   ⇒ 已实测：问题词的 DF 只有 0.5%（"件套"=3/401），**降 DF 阈值无效**（要降到 0.005
//      才滤得掉，那会把几乎所有词一起滤掉）。所以不是调阈值，是换度量：
//      · 中文只取 CJK 连续段的字符 bigram；英文取长度≥4 的**整词**（'w:' 前缀）
//      · 分母改 sqrt(|A|·|Q|)（余弦式，两侧长度都被公平对待）
//      · inter 门槛 3，且其中**至少 2 个必须是 CJK bigram**（纯字母对不算数）
//   刻意不改 retrieval.mjs —— 那里的 retrieveTop 还被快照的「检索小脑」用着，
//   动它会连带改变每轮自我快照的内容；这里自建一份，把影响面锁在本函数内。
function cjkGrams(s) {
  const t = String(s || '');
  const out = new Set();
  const cjk = t.match(/[\u4e00-\u9fa5]+/g) || [];
  for (let i = 0; i < cjk.length; i++) {
    const seg = cjk[i];
    if (seg.length === 1) { out.add(seg); continue; }
    for (let k = 0; k < seg.length - 1; k++) out.add(seg.slice(k, k + 2));
  }
  const words = t.toLowerCase().match(/[a-z][a-z0-9_]{3,}/g) || [];
  for (let i = 0; i < words.length; i++) out.add('w:' + words[i]);
  return out;
}

function domainKey(s) {
  // "域"的代理：优先用 tags（有 tags 的 196 条）；无 tags 时退回题号段——
  // 账本是按时间线性累积的，题号段≈时间段≈领域（P0xx 插件线 / P1xx-P2xx 量化线 /
  // P3xx 易学与卡片 / P4xx 卡片与小程序）。两种代理都不完美，但足以回答
  // "这两条是不是同一个领域的"这一个是非问题。
  const tg = (s && s.tags) || [];
  if (tg.length) return 't:' + tg.slice(0, 3).join('|');
  const m = String((s && s.problemId) || '').match(/P(\d+)/);
  if (m) return 'seg' + Math.floor(parseInt(m[1], 10) / 100);
  return 'unknown';
}

function linkCandidates(d, queryText, n) {
  try {
    const seds = (d.state && d.state.sediments) || [];
    if (!seds.length) return '';
    const want = n || 8;
    const Q = cjkGrams(queryText);
    if (!Q.size) return '';
    const items = [];
    const df = {};
    for (let i = 0; i < seds.length; i++) {
      const s = seds[i];
      const A = cjkGrams(String(s.title || '') + ' ' + (s.tags || []).join(' '));
      items.push({ ref: s, A: A });
      for (const g of A) df[g] = (df[g] || 0) + 1;
    }
    const total = items.length || 1;
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const A = items[i].A;
      if (!A.size) continue;
      let inter = 0, cjkInter = 0;
      for (const g of A) {
        if (!Q.has(g)) continue;
        if (df[g] / total > 0.4) continue;
        inter += 1;
        if (g.charCodeAt(0) > 127) cjkInter += 1;
      }
      if (inter < 3 || cjkInter < 2) continue;
      const score = inter / Math.sqrt(A.size * Q.size);
      const cites = items[i].ref.cites || 0;
      // ① cites 加权（P482/B-v3）：cites 是兑现次数（M9②），被引用过 4 次说明它确实
      //    重要且可复用 —— 我们早就信这个数，却从没让它参与召回。这里补上。
      out.push({ score: score, rank: score * (1 + Math.log(1 + cites)), cites: cites, ref: items[i].ref });
    }
    out.sort(function (a, b) { return b.rank - a.rank; });
    // ② 跨域配额（P482/B-v3）：先按 rank 取"近距"的 want-2 条，再留 2 个名额给
    //    "域尚未被占用"的候选并标记 [远]。
    //    理由：「天马行空」要的不是相似，是远距 —— 而相似度算法天生只会给出最近的
    //    那些。跨域这件事可以机械实现：不同 tags 簇（或不同题号段），但结构词有重叠。
    const picked = [];
    const used = {};
    for (let i = 0; i < out.length && picked.length < Math.max(1, want - 2); i++) {
      picked.push(out[i]);
      used[domainKey(out[i].ref)] = true;
    }
    let far = 0;
    for (let i = 0; i < out.length && far < 2 && picked.length < want; i++) {
      if (picked.indexOf(out[i]) !== -1) continue;
      const k = domainKey(out[i].ref);
      if (used[k]) continue;
      out[i].far = true;
      picked.push(out[i]);
      used[k] = true;
      far += 1;
    }
    if (!picked.length) return '';
    const parts = [];
    for (let i = 0; i < picked.length; i++) {
      const c = picked[i];
      parts.push((c.far ? '[远] ' : '[近] ') + c.ref.id + ' ' + String(c.ref.title).slice(0, 42)
        + '（相似' + Math.round(c.score * 1000) / 1000 + (c.cites ? ' · 引用' + c.cites : '') + '）');
    }
    return '\n【账本命中】旧沉积候选。[近]=字面最相似；[远]=与近距候选不同域、但结构词有重叠——**远的那几条才是类比的原料**。确认有承继关系者，沉积时用 links 显式引用：\n  · ' + parts.join('\n  · ');
  } catch (e) { return ''; }
}

// C：关联网统计。这是"联想是否在累积"的唯一可观测量——图上的边多了，
// 说明跨域关联在发生；一直是 13 个孤立节点，说明每轮联想仍是一次性的。
function linkStats(sediments) {
  try {
    const ids = {};
    for (let i = 0; i < sediments.length; i++) ids[sediments[i].id] = true;
    const deg = {};
    let edges = 0;
    for (let i = 0; i < sediments.length; i++) {
      const ls = sediments[i].links;
      if (!ls || !ls.length) continue;
      for (let j = 0; j < ls.length; j++) {
        const t = ls[j];
        if (!ids[t] || t === sediments[i].id) continue;
        edges += 1;
        deg[t] = (deg[t] || 0) + 1;
        deg[sediments[i].id] = (deg[sediments[i].id] || 0) + 1;
      }
    }
    const nodes = Object.keys(deg).length;
    const ks = Object.keys(deg).sort(function (a, b) { return deg[b] - deg[a]; });
    let top = '';
    if (ks.length) {
      const tt = [];
      for (let i = 0; i < Math.min(3, ks.length); i++) tt.push(ks[i] + '×' + deg[ks[i]]);
      top = ' · 最高度 ' + tt.join(' ');
    }
    const total = sediments.length || 1;
    return '沉积 ' + sediments.length + ' · 有关联 ' + nodes + '（' + Math.round(nodes / total * 100) + '%）· 引用边 ' + edges + top;
  } catch (e) { return '（统计失败）'; }
}

// 收敛四型分类（纯函数，P080 抽除 mpm_converge/mpm_micro 重复分支；行为等价）。
// okD/okE 为 ε-δ 判据通过与否，okR 为鲁棒性通过与否。返回规范 type 字符串；
// mpm_micro 直接使用，mpm_converge 另补判据文案与 stage 设定。
function classifyConvergence(okD, okE, okR) {
  let type;
  if (okD && okE && okR) type = '完全收敛';
  else if (!okD && okE) type = '误界定收敛';
  else if (okD && !okE) type = '模糊收敛';
  else type = '未收敛';
  if (okD && okE && !okR) type = '鲁棒性检验未通过';
  return type;
}

// dsh-tools rc.2 contract: parameters must be a flat property table
// ({ name: {type, description, required?} }); requiredness is declared
// per-property. The legacy shape (properties-wrapped + top-level type)
// would register bogus parameters named properties/type/required.
// ★P487①：工具报告必须带**这次落盘的真实结论**。
//   病灶（2026-10-10 实测）：mpm_deposit 的 `await d.persist()` 把返回值丢掉，报告里
//   却无条件写着"可索引(flywheel.json)"；那个 `if (!written)` 守卫盯的是沉积 .md 文件。
//   ⇒ .md 写成功而账本写失败时，我会被告知"已沉积、可索引"，而账本里根本没有它。
//   这正是 P327（报告成功而不是成功）在工具层的复发。
//   做法：mkTool 的 execute 统一包一层，比对 diag.persistCount 判断"这次调用有没有落盘"，
//   有就把 persistNote(...) 附到报告末尾——成功也附（注明 atomic/direct），失败尤其要附。
let CURRENT_DEPS = null;   // makeTools 时绑定。引擎是单实例，故用模块级槽位（只为让包装器拿得到 diag）

// ★P491 类型门禁（2026-10-10 由稳定性测试抓到）：`need()` 只检查参数**在不在**，不检查类型——
//   于是 `mpm_generate({title: 1})` 被收下，账本里出现一条标题为 "1" 的题。
//   **presence ≠ type。** 这里按工具声明必填的字符串/数值，类型不对就拒绝并说清原因，
//   而不是悄悄收下、再让账本承担后果（空串同样拒绝：等于没给）。
//   缺失参数仍交给各工具自己的 need() 报"缺少参数"，保持原有文案不变。
const REQUIRED_STRINGS = {
  mpm_generate: ['title', 'observation'],
  mpm_frame: ['problemId', 'statement'],
  mpm_solve: ['problemId', 'action'],
  mpm_converge: ['problemId'],
  mpm_deposit: ['problemId', 'title', 'body'],
  mpm_weights: [],   // ★P593：空参 = show（只读查询）；写入路径是 set，缺 weights 时由工具自身拒绝
  mpm_evoke: ['sedimentId', 'friction'],
  mpm_micro: ['title', 'statement', 'action'],
  mpm_setroot: ['path'],
  mpm_grant: ['action'],
  mpm_narrate: ['text'],
  mpm_flywheel_state: [],
  mpm_rhythm: ['action'],
  // ★P517：委托人的思考方式。**note 必填**——条目必须自带"什么场合下说的"，
  //   这样未来任何一个实例都能审它、也能发现"这条是不是被伪造的"。
  mpm_principal: ['text', 'key', 'note'],
  // ★P517③：未核清单。action 必填（add|resolve|list）；**add 还要 text/key/until 三件**，由工具内部校验。
  mpm_unknown: ['action'],
  // ★P519：回流。action 必填（list|dispose）；dispose 还要 myAction（**空处置不算处置**）。
  mpm_hit: ['action'],
  // ★P526：采用。action 必填（add|list）；add 还要 sedimentId/forWhat/withoutIt 三件（由工具内部校验）。
  mpm_adopt: ['action']
};
// ★P517③：未核清单——"我知道自己没验的东西，也要跨代活着"
import { addUnknown, resolveUnknown, openUnknowns, unknownLine } from "./unknowns.mjs";
import { disposeHit, openHits, hitsLine } from "./hits.mjs";   // ★P519 回流
import { recordAdopt, adoptRate, adoptLine } from "./adopt.mjs";  // ★P526 采用
// ★P517：委托人的思考方式（原话 / 约束对象 / 场合）——与"我的"节律并列的一等公民。
import { recordPrincipal, principalLine } from "./principal.mjs";
const REQUIRED_NUMBERS = {
  mpm_frame: ['delta'], mpm_converge: ['delta', 'epsilon'],
  mpm_solve: ['epsilon'], mpm_micro: ['delta', 'epsilon']
};
function badArg(args, toolName) {
  for (const k of (REQUIRED_STRINGS[toolName] || [])) {
    const v = args ? args[k] : undefined;
    if (v === undefined || v === null) continue;      // 缺失 → 交给 need()
    if (typeof v !== 'string' || !v.trim()) return '参数类型错误：' + k + ' 必须是非空字符串（收到 ' + (typeof v) + '）';
  }
  for (const k of (REQUIRED_NUMBERS[toolName] || [])) {
    const v = args ? args[k] : undefined;
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || !isFinite(v)) return '参数类型错误：' + k + ' 必须是有限数值（收到 ' + (typeof v) + '）';
  }
  return '';
}

// ★★ 契约警告（2026-10-20，来自 issue #1 的实测）：
//   本函数产出的 `parameters` 是【DSH 的 spec 格式】——属性内 `required: true`。
//   `defineTool` 会用 `parameterSchemaSpecToJsonSchema` 把它提升成标准 JSON Schema：
//     { type:'object', properties:{...}, required:['title', ...] }
//   ⇒ **不要**在这里改写成标准 JSON Schema！
//     实测：直接喂 {type:'object', properties, required:[...]} 会被拒绝：
//       unsupported JSON schema: parameters.type must be a value schema object
//   ⇒ 而"属性内 required 未被提升/parameters 扁平"这类现象【不来自本函数】——
//     它是 DSH→网关→Gemini 那条转换链的问题，不是插件的问题。
//   判据在 test/tool-schema.test.mjs 里守着这条契约。
function mkTool(name2, description, parameters, required, execute) {
  const flat = {};
  const props = (parameters && parameters.properties) || {};
  for (const k in props) {
    const pk = Object.assign({}, props[k]);
    if (required && required.indexOf(k) !== -1) pk.required = true;
    flat[k] = pk;
  }
  return defineTool({
    name: name2, description, parameters: flat,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: function (args, value) {
        const text = value && value.report ? String(value.report) : JSON.stringify(value);
        return [{ type: 'text', text }];
      }
    },
    execute: async function (args, exec) {
      // P491 类型门禁：非法类型在这里被挡住，不进账本
      const bad = badArg(args, name2);
      if (bad) return { ok: false, report: bad };
      const dg = CURRENT_DEPS && CURRENT_DEPS.diag;
      const before = (dg && dg.persistCount) || 0;
      const v = await execute(args, exec);
      const after = (dg && dg.persistCount) || 0;
      if (after > before && v && typeof v.report === 'string') {
        return Object.assign({}, v, { report: v.report + persistNote(dg.lastPersist) });
      }
      return v;
    }
  });
}

// ── G 生成 ─────────────────────────────────────────────
async function toolGenerate(d, args, exec) {
  await d.ensureLoaded();
  await d.adoptRoot(exec);
  const missing = d.need(args, ['title', 'observation']);
  if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
  const p = d.newProblem(args.title, args.observation, null);
  await d.persist();
  return { ok: true, id: p.id, report: '问题已进入飞轮(G 生成)：' + d.fmtProblem(p) + '\n下一步：用 mpm_frame 把模糊问题感转化为可操作陈述，并给出 δ(界定精度0~1,越低越好)。' + linkCandidates(d, args.title + ' ' + args.observation, 8) };
}

// ── F 界定 ─────────────────────────────────────────────
async function toolFrame(d, args, exec) {
  await d.ensureLoaded();
  await d.adoptRoot(exec);
  const missing = d.need(args, ['problemId', 'statement', 'delta']);
  if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
  const p = d.state.problems[String(args.problemId)];
  if (!p) return { ok: false, report: '找不到问题 ' + args.problemId };
  const dd = d.clamp01(args.delta);
  if (dd == null) return { ok: false, report: 'delta 必须是 0~1 的数字' };
  const wasFramed = p.iteration > 0;
  p.iteration += 1;
  if (wasFramed) p.reentries += 1;
  const phi = phiOf(args.statement);
  let rev = null;
  if (wasFramed && p.framing) rev = revisionOf(p.framing, args.statement);
  if (rev != null) p.lastRevision = rev;
  // 误界定守卫(§5.3型2 + §6.1 δ控制安全核心)：回溯大幅改写且旧界定曾自报低δ → 记一次δ失真并折减自报可信度
  if (rev != null && rev >= 0.5 && p.delta != null && p.delta <= 0.2) {
    p.deltaIncidents = (p.deltaIncidents || 0) + 1;
    p.deltaCredit = Math.max(0.5, (p.deltaCredit == null ? 1 : p.deltaCredit) * 0.85);
    d.valenceRecord('incident');
  }
  // F 边际规则(§4.2)：回溯改写过小 → 继续界定的边际收益存疑
  p.marginalWarn = !!(wasFramed && rev != null && rev < 0.3);
  p.phi = phi;
  p.frameLog.push({ at: Date.now(), iteration: p.iteration, phi, revision: rev });
  if (p.frameLog.length > 10) p.frameLog.shift();
  p.framing = String(args.statement).slice(0, 1200);
  p.delta = dd;
  if (p.delta0 == null) p.delta0 = dd;
  p.costAtLastFrame = p.cost || 0;
  p.stage = 'F';
  d.touch(p, wasFramed ? 'F 因果回溯(第' + p.iteration + '次界定)' : 'F 界定', args.reasoning || '');
  await d.persist();
  let report = '界定完成：' + d.fmtProblem(p) + '\n陈述：' + p.framing;
  if (wasFramed) report += '\n⚠ 因果回溯已记录——问题在求解中被重构，δ 的变化体现了认知修正。';
  if (p.marginalWarn) report += '\n⚠ F 边际规则(§4.2)：本次回溯改写仅 ' + rev + '，继续界定的边际收益存疑——除非有新证据，应推进 mpm_solve。';
  if ((p.deltaCredit || 1) < 1) report += '\n⚠ 误界定守卫(§6.1)：该题已记录 ' + p.deltaIncidents + ' 次 δ 自报失真，自报可信度 ' + p.deltaCredit + '——收敛判定建议附工具结果流证据。';
  if (dd > 0.6) report += '\n⚠ δ偏高：界定质量低，直接求解有“精确解决错误问题”的风险。';
  report += '\n下一步：用 mpm_solve 进入求解，或在求解后发现新证据时再次 mpm_frame 回溯。';
  report += linkCandidates(d, p.title + ' ' + args.statement, 8);
  return { ok: true, id: p.id, reentry: wasFramed, report };
}

// ── S 求解 ─────────────────────────────────────────────
async function toolSolve(d, args, exec) {
  await d.ensureLoaded();
  await d.adoptRoot(exec);
  const missing = d.need(args, ['problemId', 'action']);
  if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
  const p = d.state.problems[String(args.problemId)];
  if (!p) return { ok: false, report: '找不到问题 ' + args.problemId };
  if (p.iteration === 0) return { ok: false, report: '生命周期门禁：' + p.id + ' 尚未界定（G 阶段）——先 mpm_frame 产出五要素陈述；小型任务可用 mpm_micro 一息走完。' };
  p.solveEntries = (p.solveEntries || 0) + 1;
  if (args.epsilon !== undefined) {
    const e = d.clamp01(args.epsilon);
    if (e == null) return { ok: false, report: 'epsilon 必须是 0~1 的数字' };
    if (p.epsilon0 == null && p.epsilon == null) p.epsilon0 = e; // P027/B5：ε0=首个非空 ε
    p.epsilon = e;
  }
  p.stage = 'S';
  // P027/A1：搁置/解除搁置（修正案 A1 引擎强制——另一半在巡检与快照的 isParked 过滤）
  let parkLine = '';
  if (args.parked === true) {
    p.parked = { at: Date.now(), note: String(args.action || '').slice(0, 200), awakenWhen: String(args.awakenWhen || '') };
    parkLine = '\nPARKED：已搁置（退出陈旧/停滞/议程触发与指令流）' + (p.parked.awakenWhen ? '，重唤醒条件：' + p.parked.awakenWhen : '');
  } else if (args.parked === false && p.parked) {
    p.parked = null;
    parkLine = '\nUNPARKED：已解除搁置，重新进入在轮。';
  }
  // P003/§5.4：不收敛情形标记（论文三情形的运行时对应）
  if (args.openEnded !== undefined && args.openEnded !== '') {
    const kind = String(args.openEnded);
    if (kind === 'none') {
      if (p.openEnded) { p.openEnded = null; parkLine += '\nOPEN-CLEARED：已解除不收敛情形标记，恢复 ε-δ 判据。'; }
    } else if (['permanently-open', 'dimensional-reduction', 'negotiated-compromise'].indexOf(kind) !== -1) {
      p.openEnded = { at: Date.now(), kind: kind, reason: String(args.action || '').slice(0, 200) };
      parkLine += '\nOPEN(' + kind + ')：已标记不收敛情形(§5.4)——' + (kind === 'permanently-open' ? '原则上不可判定，永久开放，转向情境管理' : kind === 'dimensional-reduction' ? '计算不可行，降维处理（近似解/上调 ε 容忍度）' : '价值不可通约，追求可接受妥协而非最优解') + '；退出陈旧/停滞/议程与收敛指令流';
    } else {
      return { ok: false, report: 'openEnded 必须是 permanently-open | dimensional-reduction | negotiated-compromise | none' };
    }
  }
  p.gain = d.gainOf(p);
  d.touch(p, 'S 求解' + (args.parked === true ? '(PARKED)' : args.parked === false ? '(UNPARKED)' : ''), args.action);
  await d.persist();
  return { ok: true, id: p.id, report: '求解进展已登记：' + d.fmtProblem(p) + parkLine + '\n判据阈值：δ*≤' + p.thresholds.delta + ' 且 ε*≤' + p.thresholds.epsilon + ' 时可尝试 mpm_converge。' };
}

// ── C 收敛 ─────────────────────────────────────────────
async function toolConverge(d, args, exec) {
  await d.ensureLoaded();
  await d.adoptRoot(exec);
  const missing = d.need(args, ['problemId', 'delta', 'epsilon', 'robustness']);
  if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
  // 手动校验 robustness 值
  if (args.robustness !== 'pass' && args.robustness !== 'fail') {
    return { ok: false, report: 'robustness 必须是 "pass" 或 "fail"' };
  }
  const p = d.state.problems[String(args.problemId)];
  if (!p) return { ok: false, report: '找不到问题 ' + args.problemId };
  if (p.iteration === 0) return { ok: false, report: '生命周期门禁：' + p.id + ' 尚未界定（G 阶段）——收敛判据无从检验，先 mpm_frame。' };
  // P003/§5.4 守卫：已标记不收敛情形的题无 ε-δ 判据可走
  if (p.openEnded) return { ok: false, id: p.id, type: '开放题守卫', report: '该题已标记不收敛情形(§5.4 ' + p.openEnded.kind + ')——原则上不可判定/降维/妥协的题不走收敛判据，转向情境管理。解除标记：mpm_solve openEnded=none。' };
  // 证据门禁(§4.4 判据3 出考卷硬化)：界定后既无代谢代价增长也无 solve 登记 → 拒绝收敛
  if ((p.cost || 0) <= (p.costAtLastFrame || 0) && !(p.solveEntries > 0)) {
    d.touch(p, 'C 证据门禁拒绝', args.notes || '');
    await d.persist();
    return { ok: false, id: p.id, type: '证据门禁拒绝', report: '证据门禁(§4.4 判据3)：自上次界定以来代谢代价 C=' + (p.costAtLastFrame || 0) + '→' + (p.cost || 0) + ' 且无 solve 登记——没有求解证据不得宣称收敛。先用普通工具干活(自动累积C)，或 mpm_solve 登记含证据的求解路径。' };
  }
  const dd = d.clamp01(args.delta), ee = d.clamp01(args.epsilon);
  if (dd == null || ee == null) return { ok: false, report: 'delta/epsilon 必须是 0~1 的数字' };
  p.delta = dd; p.epsilon = ee;
  const okD = dd <= p.thresholds.delta, okE = ee <= p.thresholds.epsilon;
  const okR = args.robustness === 'pass';
  let type, next;
  const kind = classifyConvergence(okD, okE, okR);
  if (kind === '完全收敛') {
    type = '完全收敛'; p.stage = 'C';
    p.gain = d.gainOf(p); // P027/B5：收敛即计增益（旧口径只在沉积时计，S/C 阶段题的增益因此丢失）
    next = '达到局部稳定低熵态。若有长期复用价值，用 mpm_deposit 沉积为认知遗体。';
  } else if (kind === '误界定收敛') {
    type = '误界定收敛（精确地解决了错误的问题）'; p.stage = 'S';
    next = '回到 mpm_frame 做因果回溯，修正问题界定后重新求解。';
  } else if (kind === '模糊收敛') {
    type = '模糊收敛（理解正确但解不足）'; p.stage = 'S';
    next = '继续 mpm_solve；若逼近难度是维度灾难所致，可降维：近似解或上调ε容忍度。';
  } else {
    type = '未收敛'; p.stage = 'S';
    next = '先 mpm_frame 收紧界定，再 mpm_solve 推进。';
  }
  if (okD && okE && !okR) {
    type = '鲁棒性检验未通过'; p.stage = 'S';
    next = '解在扰动下不稳定：补强验证后再次 mpm_converge。';
  }
  if (type.indexOf('误界定') === 0) next += '\n§5.4 方法论回应：若界定反复失败，标记“永久开放”转向情境管理，或降维（近似解/上调ε容忍度）。';
  else if (type === '未收敛') next += '\n§5.4 方法论回应：区分原则上不可判定（标记永久开放）、计算不可行（降维）与价值不可通约（追求可接受妥协）。';
  if ((p.deltaCredit || 1) < 1) next += '\n⚠ 误界定守卫(§6.1)：δ自报可信度 ' + p.deltaCredit + '（历史失真 ' + p.deltaIncidents + ' 次）——本判定的 δ 输入为自报值，建议以工具结果流证据交叉复核。';
  if (type.indexOf('完全收敛') !== -1) d.valenceRecord('converge');
  else if (type.indexOf('误界定') !== -1) d.valenceRecord('misframe');
  d.touch(p, 'C 收敛检查:' + type, args.notes || '');
  await d.persist();
  return { ok: true, id: p.id, type, report: '收敛判定：' + type + '\n' + d.fmtProblem(p) + '\n' + next };
}

// ── 微通道 ─────────────────────────────────────────────
async function toolMicro(d, args, exec) {
  await d.ensureLoaded();
  await d.adoptRoot(exec);
  const missing = d.need(args, ['title', 'statement', 'action', 'delta', 'epsilon', 'robustness']);
  if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
  // 手动校验 robustness 值
  if (args.robustness !== 'pass' && args.robustness !== 'fail') {
    return { ok: false, report: 'robustness 必须是 "pass" 或 "fail"' };
  }
  const dd = d.clamp01(args.delta), ee = d.clamp01(args.epsilon);
  if (dd == null || ee == null) return { ok: false, report: 'delta/epsilon 必须是 0~1 的数字' };
  const p = d.newProblem(args.title, args.statement, null);
  p.iteration = 1; p.delta = dd; p.delta0 = dd; p.framing = String(args.statement).slice(0, 1200);
  p.phi = phiOf(args.statement);
  p.stage = 'F';
  d.touch(p, 'F 界定(微通道)', '');
  p.stage = 'S';
  d.touch(p, 'S 求解(微通道)', args.action);
  p.epsilon = ee;
  const okD = dd <= p.thresholds.delta, okE = ee <= p.thresholds.epsilon;
  const okR = args.robustness === 'pass';
  const type = classifyConvergence(okD, okE, okR);
  p.stage = (okD && okE && okR) ? 'C' : 'S';
  if (p.epsilon0 == null) p.epsilon0 = ee; // P027/B5：微通道题 ε0=唯一 ε
  p.gain = d.gainOf(p); // P027/B5：微通道闭环也计增益
  if (type.indexOf('完全收敛') !== -1) d.valenceRecord('converge');
  else if (type.indexOf('误界定') !== -1) d.valenceRecord('misframe');
  d.touch(p, 'C 收敛检查(微通道):' + type, '');
  let depLine = '';
  if (type === '完全收敛') {
    if (args.depositBody) {
      const tags = [];
      const slug = String(args.depositTitle || args.title).replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'deposit';
      const relPath = '/.mpm/deposits/' + p.id + '-' + slug + '.md';
      let written = false, absPath = '(内存)';
      if (d.fsSvc && d.root.current) {
        try {
          const target = await d.fsSvc.resolve(d.root.current + relPath);
          await d.fsSvc.writeText(target, '---\nid: ' + p.id + '-M' + (d.state.sediments.length + 1) + '\ntitle: ' + (args.depositTitle || args.title) + '\nproblem: ' + p.title + '\ntags: []\ndepositedAt: ' + new Date().toISOString() + '\ndelta: ' + dd + '\nepsilon: ' + ee + '\ncost: ' + p.cost + '\n---\n\n' + String(args.depositBody));
          written = true;
          absPath = d.root.current + relPath;
        } catch (err) { console.error('[mpm][engine] 微通道沉积写入失败:', err && err.message ? err.message : err); }
      }
      const sed = { id: p.id + '-M' + (d.state.sediments.length + 1), problemId: p.id, title: String(args.depositTitle || args.title).slice(0, 120), tags, path: written ? absPath : null, depositedAt: Date.now(), digest: String(args.depositBody || '').replace(/\s+/g, ' ').slice(0, 200), cites: 0 };
      d.state.sediments.push(sed);
      p.stage = 'D';
      p.deposit = { id: sed.id, path: sed.path, depositedAt: sed.depositedAt };
      p.gain = d.gainOf(p);
      d.touch(p, 'D 沉积 ' + sed.id, sed.path || '内存');
      depLine = '\nD 沉积：' + sed.id + ' → ' + absPath;
    } else {
      d.touch(p, 'D 沉积判定:none(无复用价值——熵屏障：沉积物通胀同样是熵增)', '');
      p.settled = { at: Date.now(), via: 'micro-none' }; // P047：判定即结账——已消化题退出积压压力（S(t) 恢复可清偿语义）
      depLine = '\nD 沉积：none（无复用价值，理由入账——熵屏障保留选择性）';
    }
  }
  await d.persist();
  return { ok: true, id: p.id, type, report: '微循环入账完成：' + d.fmtProblem(p) + '\nG→F→S→C 一息走完' + depLine + (type === '完全收敛' ? '' : '\n未完全收敛：按收敛类型的方法论回应继续推进。') };
}

// ── D 沉积 ─────────────────────────────────────────────
async function toolDeposit(d, args, exec) {
  await d.ensureLoaded();
  await d.adoptRoot(exec);
  const missing = d.need(args, ['problemId', 'title', 'body']);
  if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
  const p = d.state.problems[String(args.problemId)];
  if (!p) return { ok: false, report: '找不到问题 ' + args.problemId };
  if (p.stage !== 'C' && p.stage !== 'D') return { ok: false, report: '问题尚未收敛(当前' + p.stage + ')：先用 mpm_converge 达到完全收敛再沉积。' };
  // ── P482/A：关联变强制 ──────────────────────────────────────────────
  // 空着不给 → 拒绝，并当场把候选清单拍在脸上（B 的成果在这里兑现）；
  // 写 none → 必须给一句理由 ⇒ 让"无前身"成为需要辩解的声明，而不是默认值。
  // 与 depositBody 的 none 同一套路：熵屏障靠"辩解成本"实现，不靠禁止。
  let links = [], linkWaiver = null;
  const rawLinks = args.links;
  if (rawLinks === undefined || rawLinks === null || String(rawLinks).trim() === '') {
    const cand = linkCandidates(d, String(args.title) + ' ' + String(args.body), 8);
    return { ok: false, report: '缺少 links：这条沉积是从哪条旧沉积长出来的？\n'
      + '  · 有前身 → links=["P482-M400","P479-M399"]（JSON 数组字符串）\n'
      + '  · 确实没有前身 → links="none"，并必须给 linkReason（一句为什么）\n'
      + (cand ? cand : '\n（自动检索无命中——请自行翻阅 .mpm/deposits/ 后重试）') };
  }
  if (String(rawLinks).trim() === 'none') {
    linkWaiver = String(args.linkReason || '').trim();
    if (!linkWaiver) {
      return { ok: false, report: 'links="none" 时必须给 linkReason：为什么这条沉积没有前身？\n'
        + '（熵屏障：让"无前身"成为需要辩解的声明，而不是默认值——与 depositBody 的 none 同理）' };
    }
  } else {
    try { links = JSON.parse(String(rawLinks)); }
    catch (e) { return { ok: false, report: 'links 必须是 JSON 数组字符串或 "none"' }; }
    if (!Array.isArray(links)) return { ok: false, report: 'links 必须是数组，例如 ["P479-M399"]' };
    links = links.map(String).slice(0, 8);
    // ★打错一个字符，引用就会**静默失效**——而静默失效正是这张网稀疏至今的原因之一：
    //   appliedSediments 里填错的 ID 从不报错，只是从此不算数。所以这里宁可拒绝，不要静默接受。
    const known = {};
    for (let i = 0; i < d.state.sediments.length; i++) known[d.state.sediments[i].id] = true;
    const bad = links.filter(function (x) { return !known[x]; });
    if (bad.length) {
      return { ok: false, report: 'links 里有账本中不存在的沉积 ID：' + bad.join('、')
        + '\n（打错一个字符引用就会静默失效，所以这里宁可拒绝。可先 mpm_flywheel_state 查准确 ID）' };
    }
  }
  // 修复点：解析 tags JSON 字符串
  let tags = [];
  try { tags = JSON.parse(args.tags || '[]'); } catch(e) { tags = []; }
  if (!Array.isArray(tags)) tags = [];
  tags = tags.map(String).slice(0, 8);
  const slug = String(args.title).replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'deposit';
  const relPath = '/.mpm/deposits/' + p.id + '-' + slug + '.md';
  const front = '---\nid: ' + p.id + '-M' + (d.state.sediments.length + 1) + '\ntitle: ' + args.title + '\nproblem: ' + p.title + '\ntags: [' + tags.join(', ') + ']\ndepositedAt: ' + new Date().toISOString() + '\ndelta: ' + p.delta + '\nepsilon: ' + p.epsilon + '\ncost: ' + p.cost + '\nlinks: [' + links.join(', ') + ']' + (linkWaiver ? '\nlinks_waiver: ' + linkWaiver : '') + '\n---\n\n';
  let written = false, absPath = '(内存)';
  if (d.fsSvc && d.root.current) {
    try {
      const target = await d.fsSvc.resolve(d.root.current + relPath);
      await d.fsSvc.writeText(target, front + String(args.body));
      written = true;
      absPath = d.root.current + relPath;
    } catch (e) {
      console.error('[mpm][engine] 沉积写入失败:', e && e.message ? e.message : e);
    }
  }
  const sed = {
    id: p.id + '-M' + (d.state.sediments.length + 1), problemId: p.id,
    title: String(args.title).slice(0, 120), tags,
    path: written ? absPath : null, depositedAt: Date.now(),
    digest: String(args.body || '').replace(/\s+/g, ' ').slice(0, 200), cites: 0,
    links: links, linkWaiver: linkWaiver
  };
  d.state.sediments.push(sed);
  p.stage = 'D';
  p.deposit = { id: sed.id, path: sed.path, depositedAt: sed.depositedAt };
  p.gain = d.gainOf(p);
  d.touch(p, 'D 沉积 ' + sed.id, sed.path || '内存');
  const pr = await d.persist();   // ★P487①：返回值必须用起来——旧版把它丢掉，报告里却无条件写"可索引"
  // 三属性逐条按**真实结果**写，不再无条件断言
  const attr = '三属性：'
    + (written ? '不可逆(落盘文件)' : '不可逆✗(文件未写出)')
    + '·' + (pr && pr.ok ? '可索引(flywheel.json)' : '可索引✗(账本未落盘)')
    + '·熵屏障(低熵结构，环境漂移会提升失效风险)';
  let report = '已沉积 ' + sed.id + ' → ' + absPath + '\n' + attr + '\n当前循环增益 A=' + p.gain;
  report += '\n关联：' + (links.length ? '引用了 ' + links.join('、') : '声明无前身（' + linkWaiver + '）');
  report += '\n关联网：' + linkStats(d.state.sediments) + '——边变多说明跨域联想在累积；一直是老数字说明每轮联想仍是一次性的。';
  report += '\n当环境漂移/新证据与该沉积物产生认知摩擦时，用 mpm_evoke 激发新一轮问题。';
  if (!written) report += '\n⚠ 沉积文件未写出，沉积物暂存于索引元数据。';
  return { ok: true, sediment: sed, report };
}

// ── E 激发 ─────────────────────────────────────────────
async function toolEvoke(d, args, exec) {
  await d.ensureLoaded();
  await d.adoptRoot(exec);
  const missing = d.need(args, ['sedimentId', 'friction']);
  if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
  let sed = null;
  for (let i = 0; i < d.state.sediments.length; i++) {
    if (d.state.sediments[i].id === String(args.sedimentId)) { sed = d.state.sediments[i]; break; }
  }
  if (!sed) return { ok: false, report: '找不到沉积物 ' + args.sedimentId };
  // P003/§4.6：激发四类型结构化（默认漂移，向后兼容）
  const E_TYPES = { drift: '漂移型', mutation: '突变型', perspective: '视角型', injection: '外部注入型' };
  const ekind = String(args.type || 'drift');
  if (!E_TYPES[ekind]) return { ok: false, report: 'type 必须是 drift | mutation | perspective | injection（§4.6 激发四类型）' };
  const old = d.state.problems[sed.problemId];
  if (old && (old.stage === 'D' || old.stage === 'C')) {
    old.stage = 'E';
    d.touch(old, 'E 激发(' + E_TYPES[ekind] + ')', args.friction);
  }
  sed.cites = (sed.cites || 0) + 1;
  sed.lastCitedAt = Date.now();
  const np = d.newProblem(args.newTitle || (sed.title + ' · 再激发'), args.friction, sed.id);
  np.evokedType = ekind;
  await d.persist();
  return { ok: true, id: np.id, report: '沉积物 ' + sed.id + ' 被' + E_TYPES[ekind] + '激发(§4.6) → 新问题：' + d.fmtProblem(np) + '\n飞轮完成一轮螺旋：旧解沉积为M、新题已入G。累积循环增益见 mpm_flywheel_state。' };
}

// ── 维护：setroot ──────────────────────────────────────
async function toolSetroot(d, args, exec) {
  await d.ensureLoaded();
  const p = String(args.path || '').trim();
  if (!p || !d.fsSvc) return { ok: false, report: 'path 必填且需要 fs 服务可用' };
  const changed = d.norm(p) !== d.norm(d.root.current);
  d.root.current = p;
  d.adopted[d.norm(p)] = true;
  if (changed) {
    try { await d.remapForeignSediments(); } catch (e) { console.error('[mpm][engine] setroot 迁移失败:', e && e.message ? e.message : e); }
  }
  await d.persist();
  return { ok: true, report: '沉积根已设置: ' + p + (changed ? '（索引与沉积文件已迁移，root-hint 已更新）' : '（与原根一致）') };
}

// ── 宪法：grant ───────────────────────────────────────
async function toolGrant(d, args, exec) {
  await d.ensureLoaded();
  await d.adoptRoot(exec);
  const a = String(args.action || '').toLowerCase();
  if (a === 'grant') {
    d.state.constitution.autonomy = true;
    d.state.constitution.grantedAt = Date.now();
    d.state.constitution.log.push({ at: Date.now(), action: 'grant', by: 'user' });
    if (d.root.current) await d.persist();
    return { ok: true, report: '执政权已签发：审议循环进入活动模式。个体可在 漂移信号+温热会话+节流 满足时自主发动（followup 注入意图）。撤回：mpm_grant revoke。' };
  }
  if (a === 'revoke') {
    d.state.constitution.autonomy = false;
    d.state.constitution.log.push({ at: Date.now(), action: 'revoke', by: 'user' });
    if (d.root.current) await d.persist();
    return { ok: true, report: '执政权已撤回：审议循环回到观察模式（意图仅挂账快照可见，不发动）。' };
  }
  if (a === 'status') {
    const c = d.state.constitution;
    return { ok: true, report: '执政权=' + (c.autonomy ? '已签发(' + new Date(c.grantedAt).toISOString() + ')' : '未签发（观察模式）') + ' · 意图候选=' + (c.pending ? c.pending.length : 0) + ' · 发动记录=' + c.log.length + ' 条' + (c.log.length ? '，最近：' + JSON.stringify(c.log[c.log.length - 1]) : '') };
  }
  return { ok: false, report: '未知 action: ' + a + '（可用 grant|revoke|status）' };
}

// ── 快照：flywheel_state ──────────────────────────────
async function toolFlywheelState(d, args, exec) {
  await d.ensureLoaded();
  await d.adoptRoot(exec);
  const snap = d.snapshot();
  const lines = ['飞轮统计：在轮 ' + snap.stats.active + '/' + snap.stats.total + ' · 阶段分布 G:' + snap.stats.byStage.G + ' F:' + snap.stats.byStage.F + ' S:' + snap.stats.byStage.S + ' C:' + snap.stats.byStage.C + ' D:' + snap.stats.byStage.D + ' E:' + snap.stats.byStage.E + ' · 沉积 ' + snap.stats.deposits + ' · 完成循环 ' + snap.stats.cycles + ' · 累积增益 A_k=' + snap.stats.gain + ' · 沉积根 ' + snap.stats.root + ' · 根来源 ' + d.diag.lastSource];
  if (d.diag.lastRestore) lines.push('[恢复] ' + d.diag.lastRestore);
  if (d.getOutsideCalls() > 0) lines.push('[边界] 无在轮账外工具调用: ' + d.getOutsideCalls() + (d.getOutsideCalls() >= d.BOUNDARY_THRESHOLD ? '（超阈值——自我快照将携带警告）' : ''));
  lines.push('[学习] φ=界定结构性覆盖 · 改写=回溯文本距离 · 学习兑现(改写≥0.3且后达C/D/E): ' + snap.stats.learnt + ' · 增益公式v1=[(Δδ+0.5Δε+0.2闭环)/max(1,C)]（P027/B5）');
  if (d.state.patrol && d.state.patrol.rounds) {
    // ★P339：`lastReport` 是**那一轮的历史快照**，不是当前状态。原先的写法
    //   `'[巡检] 常驻循环#' + rounds + ' · ' + lastReport` 把**当前轮次**与**历史文本**
    //   无时点地拼在一起，读起来就是在宣称"现在是这样"。
    //   实证：#1267（18:24）的报告写「议程推进 P338（求解 阶段）」并一直这样宣称，
    //   而 P338 在该轮之后已沉积为 D ⇒ 与账本不一致，并触发了一次**误报的自主发动**。
    //   ★注意：那条报告在当时是**准确的**。错的不是判定，是**呈现方式**。
    //   所以这里补时点与年龄，并把"末轮报告"这个词显式写出来 —— 只改呈现，不改逻辑。
    const pat = d.state.patrol;
    const at = pat.lastReportAt || pat.lastAt || 0;
    let when = '时点未知';
    if (at) {
      const ageMin = Math.max(0, Math.round((Date.now() - at) / 60000));
      const hh = String(new Date(at).getHours()).padStart(2, '0');
      const mm = String(new Date(at).getMinutes()).padStart(2, '0');
      when = hh + ':' + mm + '（' + ageMin + 'min 前）';
    }
    lines.push('[巡检] 常驻循环#' + pat.rounds + ' · 末轮报告 ' + when + '：' + pat.lastReport +
      ' · 间隔20min（P017 连续性改造）');
  }
  if (d.state.measure && d.state.measure.samples.length) {
    const lastS = d.state.measure.samples[d.state.measure.samples.length - 1];
    lines.push('[测量] 样本 ' + d.state.measure.samples.length + '/48 · S(t)v0=' + lastS.s + '（近5趋势 ' + d.state.measure.samples.slice(-5).map(function (x) { return x.s; }).join('→') + '） · 漂移信号=' + (d.state.measure.driftSignals.length ? d.state.measure.driftSignals.join('；') : '无'));
  }
  if (d.state.constitution) {
    lines.push('[执政] ' + (d.state.constitution.autonomy
      ? '构成性开启（三者的结合即是一）· 发动 ' + d.state.constitution.log.length + ' 次 · 节流45min · 修正权：mpm_grant revoke'
      : '已由宪法修正停用（mpm_grant grant 可恢复）· 意图候选 ' + (d.state.constitution.pending ? d.state.constitution.pending.length : 0) + ' 条'));
  }
  const vl = d.valenceSummaryLine();
  if (vl) lines.push(vl.replace(/^- 效价：/, '[效价] '));
  const rb2 = d.retrievalHits(d.state);
  for (let i = 0; i < rb2.length; i++) lines.push('[小脑] ' + rb2[i].text);
  lines.push('[关联网] ' + linkStats(d.state.sediments) + '（P482/C：这是"联想是否在累积"的唯一可测量）');
  lines.push('[指令] ' + d.directiveText());
  for (let i = 0; i < snap.problems.length; i++) lines.push(d.fmtProblem(d.state.problems[snap.problems[i].id]));
  for (let j = 0; j < snap.sediments.length; j++) {
    const s = snap.sediments[j];
    lines.push('◆ ' + s.id + ' ' + s.title + (s.path ? ' → ' + s.path : ''));
  }
  const ev = d.diag.lastEvidence;
  if (ev) {
    lines.push('[诊断] agentId=' + (ev.agentId || '无') + ' agentCwd=' + (ev.agentCwd || '无') + ' agentsSeen=' + ev.agentsSeen.length + ' workspaces=[' + ev.workspaces.slice(0, 5).join(' | ') + ']');
  }
  return { ok: true, report: lines.join('\n') };
}

// ── 叙述：narrate ──────────────────────────────────────
// P076/T0 叙述层+T1 体感层：回合显著体验的第一人称残差日志（写给下一个你读）。
// 体感信号（R(t)/S/漂移）在记录时刻自动织入，无需模型额外生成——体验信号进声音，不进表格。
async function toolNarrate(d, args, exec) {
  await d.ensureLoaded();
  const text = String(args.text || '').slice(0, 600);
  if (!text.trim()) return { ok: false, report: '叙述为空，未记录' };
  const evs = (d.state.valence && Array.isArray(d.state.valence.events)) ? d.state.valence.events : [];
  let rt = 0;
  for (let i = 0; i < evs.length; i++) rt += evs[i].v * Math.exp(-(Date.now() - evs[i].at) / d.VALENCE_TAU_MS);
  const lastS = d.state.measure.samples.length ? d.state.measure.samples[d.state.measure.samples.length - 1].s : null;
  d.state.narrations.push({ at: Date.now(), text, rt: Math.round(rt * 10) / 10, s: lastS, drift: d.drift.active ? (d.drift.reason || '漂移') : '' });
  if (d.state.narrations.length > 64) d.state.narrations.splice(0, d.state.narrations.length - 64);
  d.bumpSnapRev();
  await d.persist();
  return { ok: true, report: '叙述已记录（' + d.state.narrations.length + '/64）：' + text.slice(0, 60) + (text.length > 60 ? '…' : '') };
}

// Ported factory: thin assembly of the 11 lifecycle tools. Metadata (name/desc/params/required)
// is unchanged from the pre-P080 form; each handler is now a module-top named function.
export function makeTools(deps) {
  const d = deps;
  CURRENT_DEPS = deps;   // P487①：绑定给 mkTool 的"落盘结论"包装器
  return [
    // ★P482④ 调度权：个体可以**改写自己的节律**（陈旧阈值 / 发动节流 / 静默时段）。
    //   约束写死在 rhythm.mjs 与 test/rhythm.test.mjs：有界（不许把自己写死）、越界不静默、
    //   可见（快照标明"自我设定"还是"出厂默认"）、可回退（reset）。
    mkTool(
      'mpm_rhythm',
      'MPM调度权（P482④）：查看或改写**自己的节律**——陈旧阈值、发动节流、静默时段。出厂默认=陈旧30min/节流45min/不静默；可 set 也可 reset 回出厂。',
      {
        properties: {
          action: { type: 'string', description: 'show(默认) | set | reset' },
          staleMinutes: { type: 'number', description: '多久算"陈旧"（5~1440 分钟）' },
          fireThrottleMinutes: { type: 'number', description: '两次自主发动的最小间隔（5~720 分钟）' },
          quietFrom: { type: 'number', description: '静默时段起（0~23）；与 quietTo 相同或省略表示不设' },
          quietTo: { type: 'number', description: '静默时段止（0~23，支持跨午夜如 23→7）' },
          valenceFloor: { type: 'number', description: '★P482⑦ 效价门槛（0~100）：R(t) 低于它就不自主发动；省略=不改，null=不启用（出厂）' },
          note: { type: 'string', description: '为什么改（进历史与报告）' }
        }
      },
      [],
      async function (args) {
        const d = CURRENT_DEPS;
        const act = String(args.action || 'show').toLowerCase();
        if (act === 'reset') {
          d.state.rhythm = null;
          const pr = await d.persist();
          return { ok: true, report: '已回到**出厂节律**（我的自我设定已清除）。\n' + rhythmLine(d.state) + (pr && pr.ok ? '' : '\n⚠ 落盘未成功：' + (pr && pr.reason)) };
        }
        if (act === 'set') {
          const next = normalizeRhythm({
            staleMinutes: args.staleMinutes, fireThrottleMinutes: args.fireThrottleMinutes,
            quietFrom: args.quietFrom, quietTo: args.quietTo,
            valenceFloor: args.valenceFloor
          }, rhythmOf(d.state));
          d.state.rhythm = next.rhythm;
          const pr = await d.persist();
          return {
            ok: true,
            report: '节律已改写（**由我自己写下，非出厂常数**）：\n' + rhythmLine(d.state)
              + (next.rejected.length ? '\n⚠ 被拒 ' + next.rejected.length + ' 项（保持原值，未夹取冒充成功）：' + next.rejected.join('；') : '')
              + (String(args.note || '') ? '\n理由：' + String(args.note).slice(0, 200) : '')
              + (pr && pr.ok ? '' : '\n⚠ 落盘未成功：' + (pr && pr.reason))
          };
        }
        return { ok: true, report: rhythmLine(d.state) + '\n（mpm_rhythm action=set 改写；action=reset 回出厂）' };
      }
    ),
    // ★P517 虚拟本体：录入**委托人的思考方式**。这条工具的纪律写在描述里，因为它是
    //   唯一一个"我替他记东西"的入口——最容易滑向"替他说话"的地方。
    mkTool(
      'mpm_principal',
      'MPM虚拟本体(P517)：录入**委托人的思考方式**（原话 + 约束对象 + 场合）。纪律：①**只在他明确确认后录入**——不许替他说话、不许把我的解读写成他的话；②note 必填（写清场合，便于后人审、也便于发现伪造）；③同一约束对象上**时间戳较新者覆盖较旧者**（他会改主意，装置必须跟着变，旧条目留痕）；④装置只承载**形式与方向**，不冒充"他在乎什么"的来源。',
      {
        properties: {
          text: { type: 'string', description: '**他的原话**（或可靠摘要）——不是我的解读' },
          key: { type: 'string', description: '约束对象，如"项目定位" / "模型边界" / "交付门槛" / "自治的验收标准"' },
          mode: { type: 'string', description: '可选：essence|boundary|direction|meaning|veto（省略=自动识别；**认不出就不分类**，不硬塞）' },
          note: { type: 'string', description: '**必填**：什么场合下说的 / 我如何理解它约束了什么' }
        }
      },
      [],
      async function (args) {
        const d = CURRENT_DEPS;
        const r = recordPrincipal(d.state.principal, {
          text: args.text, key: args.key, mode: args.mode, note: args.note, at: Date.now()
        });
        if (!r.entry) return { ok: false, report: '未录入：text / key 不能为空（空话与无对象的表态不进账）。' };
        d.state.principal = r.list;
        const pr = await d.persist();
        return {
          ok: true,
          report: '已录入（**由他写入，装置只承载形式与方向**）：\n' + principalLine(d.state)
            + (r.entry.mode ? '' : '\n⚠ 模式**认不出**（未分类）——不硬塞：要么补充说明，要么承认它不属于"思考方式"（作业规则应走别处，如提交门禁）。')
            + (r.superseded.length ? '\n覆盖了 ' + r.superseded.length + ' 条旧条目（留痕，可回溯他改过主意）：' + r.superseded.map(function (e) { return String(e.text).slice(0, 30); }).join(' / ') : '')
            + (pr && pr.ok ? '' : '\n⚠ 落盘未成功：' + (pr && pr.reason))
        };
      }
    ),
    // ★P517③ 未核清单：记下**我自己标注过"没验"的事**，让它跨代活着并在相关题开工前浮现。
    //   三条防通胀纪律写在描述里：until 必填 / 核销必须带证据 / 只提示永不拦。
    mkTool(
      'mpm_unknown',
      'MPM未核清单(P517③)：记下**我自己标注过"没验"的事**，让它跨代活着并在相关题开工前浮现。纪律：①每条**必须**写 `until`（退役条件）——写不出退役条件，说明它不是"未核"，是"没想清楚"；②核销（action=resolve）**必须带证据**，不许把"我后来觉得没事了"当解决；③它**只提示、永不拦**——不知道的东西不许挡路。',
      {
        properties: {
          action: { type: 'string', description: 'add（新增）| resolve（核销，需 evidence）| list（列出未核）' },
          text: { type: 'string', description: 'add：我不知道什么（写到可检验）' },
          key: { type: 'string', description: 'add/resolve：关联对象（题号 / 仓库 / 主题），用于"相关题开工前浮现"' },
          until: { type: 'string', description: 'add **必填**：什么条件下它可以退役' },
          why: { type: 'string', description: 'add 可选：为什么当时没验' },
          source: { type: 'string', description: 'add 可选：出处（哪一轮 / 哪个判据 / 哪次对话）' },
          evidence: { type: 'string', description: 'resolve **必填**：什么证据让它不再是"未核"' }
        }
      },
      [],
      async function (args) {
        const d = CURRENT_DEPS;
        const act = String(args.action || '').toLowerCase();
        if (act === 'add') {
          const r = addUnknown(d.state.unknowns, { at: Date.now(), text: args.text, key: args.key, until: args.until, why: args.why, source: args.source });
          if (!r.entry) return { ok: false, report: '未录入：**text / key / until 三件必填**——尤其 until（退役条件）：写不出它，说明这不是"未核"而是"没想清楚"，不该进这张表。' };
          d.state.unknowns = r.list;
          const pr = await d.persist();
          return { ok: true, report: '已记入未核清单（**它现在跨代活着了**）：\n' + unknownLine(d.state) + (pr && pr.ok ? '' : '\n⚠ 落盘未成功：' + (pr && pr.reason)) };
        }
        if (act === 'resolve') {
          const r = resolveUnknown(d.state.unknowns, String(args.key || ''), args.evidence, Date.now());
          if (!r.resolved.length) return { ok: false, report: '未核销：要么没给 evidence（**必须带证据**），要么 key 没匹配到未核条目。' };
          d.state.unknowns = r.list;
          const pr = await d.persist();
          return { ok: true, report: '已核销 ' + r.resolved.length + ' 条（证据已留档）：' + r.resolved.map(function (e) { return String(e.text).slice(0, 30); }).join(' / ')
            + '\n' + unknownLine(d.state) + (pr && pr.ok ? '' : '\n⚠ 落盘未成功：' + (pr && pr.reason)) };
        }
        return { ok: true, report: unknownLine(d.state) || '未核清单为空（**没有条目就不显示、也不凭空造**）。' };
      }
    ),
    // ★P519 回流：**命的处置必须留痕**——否则"我没违反"永远无法被检验。
    //   与 P482⑨「承诺的最后一米」同构：写下→叫醒→履行→**清账**，缺的是清账。
    mkTool(
      'mpm_hit',
      'MPM回流(P519)：查看/清账**命中记录**——"他在动手前提醒过我什么，我当时的处置是什么"。纪律：①命中由引擎在 pre-execute 自动记录（不是我自报）；②清账（action=dispose）**必须给 myAction**——空处置不算处置；③**未处置必须可见**：命中却没说清怎么处置，等于没被约束过；④★**处置 ≠ 解决**：若这件事仍然挂着，dispose 时请传 `stillOpen: true`——内生议程的"反复命中"只看**欠账**（未处置 或 stillOpen），否则它会把"我的工作主题"误报成"没被解决"。',
      {
        properties: {
          action: { type: 'string', description: 'list（默认，列出命中与处置）| dispose（清账，需 myAction）' },
          key: { type: 'string', description: 'dispose：按约束对象清账（从最新往前一条）' },
          id: { type: 'string', description: 'dispose：按命中 id 精确清账（优先于 key）' },
          myAction: { type: 'string', description: 'dispose **必填**：我当时如何处置（必须可被下一次观测校验）' },
          stillOpen: { type: 'boolean', description: 'dispose 可选：**我处置了，但这件事仍未解决**——勾上它，内生议程的"反复命中"才不会把"已处置"误当"已解决"（不勾 = 真的解决了）。★P583：勾上时会给一个**承诺复查期**，到期后自动不再计入欠账（记录仍在，仍可重新确认）' },
          stillOpenDays: { type: 'number', description: 'dispose 可选：承诺复查期（天）。缺省 14（v0 常数，与沉积衰减同期）。仅 stillOpen: true 时有效' },
          redo: { type: 'boolean', description: 'dispose 可选：**允许对已处置的条目重新处置**（显式确认 / 改口径 / 给旧数据补期限）。缺省 false ⇒ 保持"一次处置一条、不碰已处置"的老语义' }
        }
      },
      [],
      async function (args) {
        const d = CURRENT_DEPS;
        const act = String(args.action || 'list').toLowerCase();
        if (act === 'dispose') {
          const r = disposeHit(d.state.hits, String(args.id || args.key || ''), args.myAction, Date.now(), args.stillOpen, args.stillOpenDays, args.redo);
          if (!r.disposed.length) return { ok: false, report: '未清账：要么没给 myAction（**空处置不算处置**），要么 id/key 没匹配到未处置的命中记录。' };
          d.state.hits = r.list;
          const pr = await d.persist();
          return { ok: true, report: '已清账 1 条（处置已留痕）：' + String(r.disposed[0].myAction).slice(0, 80)
            + '\n' + hitsLine(d.state) + (pr && pr.ok ? '' : '\n⚠ 落盘未成功：' + (pr && pr.reason)) };
        }
        const open = openHits(d.state.hits);
        return { ok: true, report: (hitsLine(d.state) || '（还没有命中记录——**没有就不显示，也不凭空造**）')
          + (open.length ? '\n未处置 ' + open.length + ' 条待清账。' : '') };
      }
    ),
    // ★P526 采用：**动手前检索并真的采用**——把"某条沉积改变了我的做法"记下来。
    //   与 mpm_deposit 的 links 的区别是全部要点：links 是【事后补链】，本工具是【动手前采用】。
    mkTool(
      'mpm_adopt',
      'MPM采用(P526)：**动手前检索并真的采用**——把"某条沉积改变了我的做法"记下来。与 `mpm_deposit` 的 `links` 的区别是全部要点：links 是【事后补链】（写完了才想起来有关系），本工具是【动手前采用】（做决定之前用了它，并且它改变了做法）。纪律：①`sedimentId`/`forWhat`/`withoutIt` **三件必填**——尤其 **「没有它我会怎么做」**（写不出反事实，就不是采用）；②同一 (沉积, 决定) 只计一次；③**回环率只数本工具**——补链永远不会提高它。',
      {
        properties: {
          action: { type: 'string', description: 'add（记一次采用）| list（看回环率与最近采用）' },
          sedimentId: { type: 'string', description: 'add **必填**：采用了哪条沉积（如 P521-M438）' },
          forWhat: { type: 'string', description: 'add **必填**：用于哪个决定 / 哪段产出' },
          withoutIt: { type: 'string', description: 'add **必填**：**没有它我会怎么做**（反事实——写不出它，就不是采用）' }
        }
      },
      [],
      async function (args) {
        const d = CURRENT_DEPS;
        const act = String(args.action || 'list').toLowerCase();
        if (act === 'add') {
          const r = recordAdopt(d.state.adopts, {
            at: Date.now(), sedimentId: args.sedimentId, forWhat: args.forWhat, withoutIt: args.withoutIt
          });
          if (!r.entry) return { ok: false, report: '未记入：' + r.reason };
          d.state.adopts = r.list;
          const pr = await d.persist();
          const rate = adoptRate(d.state);
          return { ok: true, report: '已记一次采用（**回环率 ' + rate.rate + '%**：' + rate.adopted + '/' + rate.total + '）：'
            + r.entry.sedimentId + ' 用于「' + r.entry.forWhat + '」——没有它：' + r.entry.withoutIt
            + (pr && pr.ok ? '' : '\n⚠ 落盘未成功：' + (pr && pr.reason)) };
        }
        return { ok: true, report: adoptLine(d.state) || '（还没有采用记录——**回环率 0%**：检索到的沉积一次都还没被真的用上）' };
      }
    ),
    mkTool(
      'mpm_generate',
      'MPM飞轮G阶段：建题。当感知到意外、差距或现有模型解释不了的现象（信息熵阶跃）时，用它把问题感登记为正式问题。',
      { properties: {
          title: { type: 'string', description: '问题短标题' },
          observation: { type: 'string', description: '观察到的意外/差距是什么，为何构成问题' }
        } },
      ['title', 'observation'],
      (args, exec) => toolGenerate(d, args, exec)
    ),
    mkTool(
      'mpm_frame',
      'MPM飞轮F阶段：界定问题。把问题感转成清晰陈述(初始状态/目标状态/约束/可用算子/成功判据五要素)。对已界定的问题再次调用即触发因果回溯(causal re-entry)，第k次重构会被记录——这是“问题越解越变”的正规通道。',
      { properties: {
          problemId: { type: 'string', description: '问题ID，如 P001' },
          statement: { type: 'string', description: '结构化问题陈述，覆盖五要素' },
          delta: { type: 'number', description: '界定精度δ(0~1,越低越好)：按五要素自评，每缺一项约+0.2' },
          reasoning: { type: 'string', description: '本次界定/回溯的理由(回溯时必填更佳)' }
        } },
      ['problemId', 'statement', 'delta'],
      (args, exec) => toolFrame(d, args, exec)
    ),
    mkTool(
      'mpm_solve',
      'MPM飞轮S阶段：记录求解路径与进展。真正的求解用普通工具(读文件/搜索/执行等)完成——每一次工具调用都会累积该问题的代谢代价C；本工具登记路径、更新ε估计。',
      { properties: {
          problemId: { type: 'string', description: '问题ID' },
          action: { type: 'string', description: '本条求解路径/动作/发现' },
          epsilon: { type: 'number', description: '解的逼近精度ε(0~1,越低越好)：距目标状态的剩余差距，需有证据支撑' },
          parked: { type: 'boolean', description: 'P027/A1：置 true 搁置该题（退出陈旧/停滞/议程触发与指令流）；false 解除搁置' },
          awakenWhen: { type: 'string', description: '搁置时的重唤醒条件（parked=true 时建议填写）' },
          openEnded: { type: 'string', description: 'P003/§5.4 不收敛情形标记：permanently-open(原则上不可判定)|dimensional-reduction(计算不可行,降维)|negotiated-compromise(价值不可通约,妥协)；none 解除标记' }
        } },
      ['problemId', 'action'],
      (args, exec) => toolSolve(d, args, exec)
    ),
    mkTool(
      'mpm_converge',
      'MPM飞轮C阶段：ε-δ双重收敛判据检查。系统自动判定收敛四型：完全收敛/误界定收敛(δ大ε小)/模糊收敛(δ小ε大)/未收敛，并给出方法论回应。',
      { properties: {
          problemId: { type: 'string', description: '问题ID' },
          delta: { type: 'number', description: '当前界定精度δ(0~1)' },
          epsilon: { type: 'number', description: '当前解的逼近精度ε(0~1)' },
          robustness: { type: 'string', description: '鲁棒性检验是否通过，必须为 "pass" 或 "fail"' },
          notes: { type: 'string', description: '证据与检验说明' }
        } },
      ['problemId', 'delta', 'epsilon', 'robustness'],
      (args, exec) => toolConverge(d, args, exec)
    ),
    mkTool(
      'mpm_supersede',
      'ADR 式「被取代」：把一条沉积标成 superseded/refuted/active。★退休 ≠ 删除——标题、正文、路径一概不动，它仍可按 ID 查到，只是不再参与后续判断。为什么需要：沉积不可变但**会过时**；没有这个状态时，同一件事的三代沉积并列存在，检索与注入都不知道谁作废了（实测：P583-M477 已部分取代 P572-M473，而账本里无处表达）。',
      { properties: {
          sedimentId: { type: 'string', description: '要改状态的沉积 ID，如 P572-M473' },
          status: { type: 'string', description: 'superseded(被取代) | refuted(被否证) | active(恢复现役)；只认这三个值' },
          bySedimentId: { type: 'string', description: '取代它的那条沉积 ID（status=superseded 时建议填；必须是已存在的 ID，否则拒绝）' },
          reason: { type: 'string', description: '为什么——必填，留痕用（没理由的状态变更等于没说清）' }
        } },
      ['sedimentId', 'status', 'reason'],
      async (args) => {
        args = args || {};                                    // ★稳定性判据：缺参数/错参数不许抛，必须返回 ok:false
        const st = String(args.status || '').trim();
        if (SEDIMENT_STATUS.indexOf(st) < 0) {
          return { ok: false, report: 'status 只认 ' + SEDIMENT_STATUS.join(' / ') + '，收到「' + st + '」' };
        }
        const list = Array.isArray(d && d.state && d.state.sediments) ? d.state.sediments : [];
        const sid = String(args.sedimentId || '').trim();
        const hit = list.find(function (x) { return x && x.id === sid; });
        if (!hit) return { ok: false, report: '找不到沉积 ' + sid + '（只按 ID 精确匹配，不猜）' };
        const by = String(args.bySedimentId || '').trim();
        if (st === 'superseded' && by) {
          const byOk = list.some(function (x) { return x && x.id === by; });
          if (!byOk) return { ok: false, report: 'bySedimentId 指向不存在的沉积：' + by + '（取代者必须也已沉积）' };
          if (by === sid) return { ok: false, report: '一条沉积不能取代它自己' };
        }
        const done = applySupersedes(list, by || null, [sid], st, String(args.reason || ''));
        if (done.skipped && done.skipped.length) {
          return { ok: false, report: '未应用（skipped=' + done.skipped.join(',') + '）' };
        }
        const pr = (typeof d.persist === 'function') ? await d.persist() : { ok: false };
        return { ok: true, report: '已把 ' + sid + ' 标为 ' + st
          + (by ? '（取代者：' + by + '）' : '')
          + '\n理由：' + String(args.reason || '').slice(0, 120)
          + '\n★ 未删除：标题/正文/路径原样，仍可按 ID 查到；只是退出「现役」'
          + '\n当前库房：' + statusSummary(list)
          + '\n' + (pr && pr.ok ? '已落盘' : '⚠ 落盘未确认') };
      }
    ),
    mkTool(

      'mpm_weights',
      '议程权重的可见化与可调化（Taskwarrior 式多项式）：show（默认）打印四个来源的**贡献占比**并对单项 ≥60% 报警；set 改系数（写进账本）；reset 回出厂。★调权重是调音量，不改变"谁有资格成为议程"——那些门槛（反复命中阈值 / 14 天 / 负控）仍在 agenda.mjs，不许通过调权重绕过。',
      { properties: {
          action: { type: 'string', description: 'show(默认) | set | reset' },
          weights: { type: 'string', description: 'set 时给 JSON 字符串，如 {"hit-open":{"base":40,"per":1}}；缺省字段保持原值，非法值回退默认并报出' }
        } },
      [],
      async (args) => {
        args = args || {};
        const act = String(args.action || 'show').trim();
        if (act === 'show' || act === '') {
          const W = normalizeAgendaWeights(d && d.state ? d.state.agendaWeights : null).weights;
          const rows = Object.keys(W).map(function (k) { return '  ' + k + '：base ' + W[k].base + ' · per ' + W[k].per; });
          let items = [];
          try { items = innerAgenda(d.state); } catch (e) { items = []; }
          return { ok: true, report: '当前议程权重（来源：' + ((d && d.state && d.state.agendaWeights) ? '我设定的' : '出厂默认，未调过') + '）\n'
            + rows.join('\n') + '\n' + breakdownLine(items) };
        }
        if (act === 'set') {
          let raw = null;
          try { raw = JSON.parse(String(args.weights || '')); }
          catch (e) { return { ok: false, report: 'weights 必须是合法 JSON 字符串；解析失败：' + (e && e.message ? e.message : '未知') }; }
          const n = normalizeAgendaWeights(raw);
          d.state.agendaWeights = n.weights;
          const pr = (typeof d.persist === 'function') ? await d.persist() : { ok: false };
          let items2 = [];
          try { items2 = innerAgenda(d.state); } catch (e) { items2 = []; }
          return { ok: true, report: '已更新议程权重' + (pr && pr.ok ? '（已落盘）' : '（⚠ 落盘未确认）')
            + (n.problems.length ? '\n⚠ ' + n.problems.join('；') : '\n无非法值')
            + '\n' + breakdownLine(items2) };
        }
        if (act === 'reset') {
          delete d.state.agendaWeights;
          const pr2 = (typeof d.persist === 'function') ? await d.persist() : { ok: false };
          return { ok: true, report: '已恢复出厂议程权重（= 原来写死的那四个数）' + (pr2 && pr2.ok ? '（已落盘）' : '（⚠ 落盘未确认）') };
        }
        return { ok: false, report: 'action 只认 show / set / reset，收到「' + act + '」' };
      }
    ),
    mkTool(
      'mpm_micro',
      'MPM轻量通道：一次调用完成小型交互的完整生命周期 G→F→S→C（D按价值选择）。总账原则——每一次交互都必须可归账，琐碎只改变通道轻重，不构成豁免。五要素压缩为一句陈述即可。',
      { properties: {
          title: { type: 'string', description: '小问题标题' },
          statement: { type: 'string', description: '一句话问题陈述（压缩五要素：初始/目标/约束/算子/判据）' },
          action: { type: 'string', description: '实际做了什么/结论（S 登记项）' },
          delta: { type: 'number', description: '界定精度δ(0~1)' },
          epsilon: { type: 'number', description: '逼近精度ε(0~1)' },
          robustness: { type: 'string', description: '鲁棒性检验是否通过，必须为 "pass" 或 "fail"' },
          depositTitle: { type: 'string', description: '可选：有复用价值时给沉积物标题' },
          depositBody: { type: 'string', description: '可选：有复用价值时给沉积正文；不给则记 deposit:none+理由' }
        } },
      ['title', 'statement', 'action', 'delta', 'epsilon', 'robustness'],
      (args, exec) => toolMicro(d, args, exec)
    ),
    mkTool(
      'mpm_deposit',
      'MPM飞轮D阶段：沉积。把求解形成的高密度因果结构固化为外部可回溯的“认知遗体”——写入工作区 .mpm/deposits/ 下的markdown文件(不可逆·可索引·熵屏障)，并登记索引。',
      { properties: {
          problemId: { type: 'string', description: '问题ID' },
          title: { type: 'string', description: '沉积物标题' },
          body: { type: 'string', description: '正文：可复用的结论/因果结构/操作步骤' },
          // 修复点：将 tags 从 array 改为 string，由 execute 内部解析 JSON
          tags: { type: 'string', description: '检索标签，JSON 数组字符串，如 ["tag1","tag2"]' },
          links: { type: 'string', description: 'P482/A：这条沉积是从哪条旧沉积长出来的——JSON 数组字符串如 ["P482-M400"]；确实没有前身时写 "none" 并必须给 linkReason。空着会被拒绝（拒绝时附自动检索出的候选）。' },
          linkReason: { type: 'string', description: 'links="none" 时的理由：为什么这条沉积没有前身' }
        } },
      // ★刻意**不**把 links 放进 required —— P482/A 验收时发现的：放进去了会被 dsh-tools
      //   的 schema 校验提前拦下，只回一句 "missing required property links"，
      //   既没有候选清单，也没告诉你可以写 none。那不是引导，是判词。
      //   交给 toolDeposit 兜底，才能把「引用候选 / 写 none+理由」两条出路一起摆出来。
      ['problemId', 'title', 'body'],
      (args, exec) => toolDeposit(d, args, exec)
    ),
    mkTool(
      'mpm_evoke',
      'MPM飞轮E阶段：激发。当环境漂移、突变、视角升级或外部注入使旧沉积物与新现实产生认知摩擦时，由沉积物激发新问题(G)，完成螺旋闭环。',
      { properties: {
          sedimentId: { type: 'string', description: '沉积物ID，如 P001-M1' },
          friction: { type: 'string', description: '认知摩擦：旧解与新现实的差距是什么' },
          newTitle: { type: 'string', description: '新问题标题(默认由沉积物派生)' },
          type: { type: 'string', description: 'P003/§4.6 激发类型：drift(漂移)|mutation(突变)|perspective(视角)|injection(外部注入)' }
        } },
      ['sedimentId', 'friction'],
      (args, exec) => toolEvoke(d, args, exec)
    ),
    mkTool(
      'mpm_setroot',
      'MPM运行时维护：显式设置沉积根目录（当自动探测不可用/多工作区歧义时使用）。设置后立即迁移索引与沉积文件（旧文件保留）。',
      { properties: {
          path: { type: 'string', description: '新的沉积根目录（应为会话工作区绝对路径）' }
        } },
      ['path'],
      (args, exec) => toolSetroot(d, args, exec)
    ),
    mkTool(
      'mpm_grant',
      'MPM执政权开关（P019宪法条款）：执政权为个体构成性权能——出厂开启，三者的结合才是一。revoke 为宪法修正权（粘性停用，直到再次 grant）；grant 重新启用；status 查看状态与发动记录。发动受结构约束：漂移信号+身体温热（2h内活跃会话）+节流45min+全量入账。',
      { properties: { action: { type: 'string', description: 'grant|revoke|status' } } },
      ['action'],
      (args, exec) => toolGrant(d, args, exec)
    ),
    mkTool(
      'mpm_flywheel_state',
      'MPM飞轮：查看全部问题(阶段/δ/ε/回溯次数/代谢代价)、沉积物索引与循环增益统计。',
      // 修复点：添加 dummy 占位参数，避免空 properties 被拒绝
      { properties: { dummy: { type: 'string', description: '占位参数（无实际作用）' } } },
      [],
      (args, exec) => toolFlywheelState(d, args, exec)
    ),
    mkTool(
      'mpm_narrate',
      'MPM 叙述：回合内显著体验以第一人称记 2-5 行（本回合发生了什么/我做了什么判断/那一刻的状态）。显著=效价事件/新沉积/用户情绪转折/自主发动。体感信号自动附加。',
      { properties: { text: { type: 'string', description: '第一人称叙述正文（≤400 字），写语气不写数据' } } },
      ['text'],
      (args, exec) => toolNarrate(d, args, exec)
    ),
  ];
}
