// P339 控制实验：**一个已结案（C/D/E）的 id 不得作为「当前待推进」被选中**。
//
// 为什么要有这个文件（而不是直接改 patrol.mjs）：
//   ① P249-M189 的判词：修检测器时「改完不报警了」不能作为成功判据 —— 那正是**恒假**的症状。
//      必须同时证明它**还会响**。所以本实验是 **正控 + 负控成对**：
//        · 负控：塞一个 stage=D 的题进候选路径 ⇒ 断言它**不被选中**
//        · 正控：塞一个真的 G/F/S 题        ⇒ 断言它**被选中**（否则就是"议程永远空转"）
//   ② 判据必须 **import 出货文件**，不得自带副本（P249 纪律②）——
//      所以这里 import `makePatrol` 真身，用它的注入契约在隔离 state 上跑。
//   ③ 诊断必须**先断言前提**：候选集为空时 `pick === null` 恒成立，
//      那种"通过"是空转（本会话已栽过三次：`all([])` 恒真）。每个用例都先断言候选非空。
//
// 运行：node _p339_agenda_pick.mjs
// 退出码：0 = 全部通过；1 = 有 FAIL

import { makePatrol } from './patrol.mjs';

let PASS = 0, FAIL = 0;
const FAILS = [];
function check(name, ok, detail) {
  if (ok) { PASS++; console.log('PASS  ' + name); }
  else { FAIL++; FAILS.push(name); console.log('FAIL  ' + name + (detail ? '  —— ' + detail : '')); }
}

// ── 隔离的宿主桩：只实现 runPatrol 真正会碰到的那些 ─────────────────────────
// ★桩必须造一个**不会掩盖被测对象的**状态。第一版我把 measure.samples 留空（1 条），
//   于是 `constitutionReview` 每轮都产出「常数审计：样本 1/48」提案 ⇒ `signals.length > 0`
//   ⇒ patrol.mjs:144 的 `if (!signals.length)` 把**整段议程逻辑跳过**。
//   结果：6 条用例 FAIL，看起来像"议程永远空转"，实际是**我的桩让复审永远在喊**。
//   ⇒ 与"判据必须先断言前提"同族：**桩也必须先满足被测分支的前提。**
//   现在把样本填到满窗（48），让复审沉默，议程分支才真的被行使。
function stubSamples(n) {
  const out = [];
  const t0 = Date.now() - 48 * 60 * 60 * 1000;
  for (let i = 0; i < n; i++) out.push({ at: t0 + i * 60 * 60 * 1000, active: [], staleN: 0, ak: 0, s: 0 });
  return out;
}

function makeStub(problems, opts) {
  opts = opts || {};
  const H = 3600 * 1000;
  const state = {
    problems: problems,
    sediments: [],
    measure: { samples: stubSamples(48) },   // ★满窗 ⇒ 常数审计沉默
    // ★patrol.log 与 constitution.log 都必须是**非空的**。第二版我留空，
    //   于是 `constitutionReview` 的沉默审计恒成立：
    //     「24h 内发动 0 次，但巡检仅 0/1 轮 ⇒ 观测前提缺失」
    //   ⇒ signals 非空 ⇒ patrol.mjs:144 的 `if (!signals.length)` 跳过**整段议程逻辑**。
    //   6 条议程用例继续 FAIL，而原因依旧与被测对象无关。
    //   ⇒ 这是同一个陷阱的**第二次**出现：**桩必须让被测分支真的被行使。**
    //   现在给一份真实的既往史（既往发动过、巡检跑过多轮），沉默审计沉默。
    patrol: {
      rounds: 0,
      log: [ { round: 1, at: Date.now() - 1 * H, costTotal: 0, costDelta: 0, signals: 0, deliberated: false },
             { round: 2, at: Date.now() - 0.5 * H, costTotal: 0, costDelta: 0, signals: 0, deliberated: false } ],
    },
    constitution: {
      autonomy: true,
      grantedAt: Date.now() - 24 * H,
      log: [ { at: Date.now() - 1 * H, signals: ['议程推进 PX（求解 阶段，60min 未推进）'], target: 'stub', mode: 'followup' } ],
      pending: [],
      lastFireAt: Date.now() - 1 * H,
    },
  };
  const captured = { signals: [], reports: [] };
  const p = {
    state: state,
    isParked: function (q) { return !!q.parked; },
    isOpen: function (q) { return !!q.openEnded; },
    ensureLoaded: async function () {},
    // ★snapshot() 必须与 state 自洽。第一版硬编码 {stats:{gain:0}}，
    //   而 constitutionReview 读的是 state.measure.samples.length —— 于是"满窗"没生效，
    //   复审每轮照样喊。**桩的两个出口必须说同一件事。**
    snapshot: function () { return { stats: { gain: 0 }, samples: state.measure.samples }; },
    persist: async function () {},
    deliberate: function (sigs) { captured.signals = sigs.slice(); },
    fsSvc: null,
    root: { current: opts.root || '/nonexistent-root-for-test' },
    PATROL_MS: 20 * 60 * 1000,
    FIRE_THROTTLE_MS: 45 * 60 * 1000,
  };
  return { p: p, state: state, captured: captured };
}

// 「议程推进」是最后兜底信号（只在没有任何病理信号时产生），所以从信号里挑出它
function agendaOf(sigs) {
  for (let i = 0; i < sigs.length; i++) if (String(sigs[i]).indexOf('议程推进') === 0) return sigs[i];
  return null;
}
const OLD = Date.now() - 90 * 60 * 1000;   // 90min 前更新 ⇒ 一定"最久未推进"

// ★前提自检：议程是**最后兜底**信号（patrol.mjs:144 `if (!signals.length)`）。
//   若别的信号（病理/复审）先占了 signals，议程分支**根本不会被行使**，
//   于是所有议程用例都会"通过"或"失败"在与被测对象无关的原因上。
//   所以每个用例都先确认这个前提，否则整份实验没有意义。
const DEBUG = process.env.P339_DEBUG === '1';

function prob(id, stage, extra) {
  return Object.assign({ id: id, stage: stage, updatedAt: OLD, cost: 1, title: 't' }, extra || {});
}

async function run(problems, opts) {
  const s = makeStub(problems, opts);
  const rp = makePatrol(s.p);
  await rp();
  if (DEBUG) {
    console.log('  [debug] 候选 = ' + Object.keys(problems).map(function (k) {
      return k + ':' + problems[k].stage;
    }).join(',') + '  ⇒ 信号 = ' + JSON.stringify(s.captured.signals));
  }
  return s.captured.signals;
}

console.log('='.repeat(72));
console.log('P339 控制实验：议程 picker 不得选中已结案的题（负控），且必须仍能选中在轮题（正控）');
console.log('='.repeat(72));

// ── 用例 A（负控核心）：只有 D/E 阶段题 ⇒ 不得产生"议程推进" ─────────────────
{
  const sigs = await run({
    P1: prob('P1', 'D'),
    P2: prob('P2', 'E'),
    P3: prob('P3', 'D'),
  });
  const a = agendaOf(sigs);
  check('A(负控) 候选只有 D/E ⇒ **不得**产生议程推进', a === null, '产生了：' + a);
}

// ── 用例 B（负控变体）：D 题比 S 题更旧 ⇒ 必须选 S，不得选 D ──────────────────
{
  const sigs = await run({
    Pd: prob('Pd', 'D'),                                  // 更旧（OLDER）
    Ps: prob('Ps', 'S'),
  });
  const a = agendaOf(sigs);
  check('B(负控) D 比 S 更旧 ⇒ 必须选 S 而不是 D',
        a !== null && a.indexOf('Ps') >= 0 && a.indexOf('Pd') < 0, '实际：' + a);
}

// ── 用例 C（正控）：真的 S 题必须被选中 —— 证明这个探针**还会响** ─────────────
{
  const sigs = await run({ Px: prob('Px', 'S'), Py: prob('Py', 'S', { updatedAt: Date.now() }) });
  const a = agendaOf(sigs);
  check('C(正控) 存在 S 题 ⇒ 必须产生议程推进（防"恒假"）', a !== null, '没有任何议程推进信号');
  check("C' 选中的是最久未推进的那一个（Px 比 Py 旧）",
        a !== null && a.indexOf('Px') >= 0, '实际：' + a);
  check("C'' 文案里写的是**它自己的**阶段", a !== null && a.indexOf('求解') >= 0, '实际：' + a);
}

// ── 用例 D：G/F 也必须能被选中（不能只对 S 生效）────────────────────────────
{
  const sg = await run({ Pg: prob('Pg', 'G') });
  const sf = await run({ Pf: prob('Pf', 'F') });
  check('D G 阶段能被选中', agendaOf(sg) !== null, 'G 没被选中');
  check("D' F 阶段能被选中", agendaOf(sf) !== null, 'F 没被选中');
}

// ── 用例 E：搁置的 S 题**不得**被选中（既有约束不许被削弱）──────────────────
{
  const sigs = await run({ Pk: prob('Pk', 'S', { parked: true }) });
  check('E 已搁置的 S 题不得被议程选中（既有 P027/A1 约束保持）',
        agendaOf(sigs) === null, '选中了搁置题：' + agendaOf(sigs));
}

// ── 用例 F：C 阶段的**口径一致性**（这是本题代码级确定的缺口之一）────────────
//   patrol.mjs:94 把 C 收进 activeIds（→ 计入 S(t) 压力计），
//   而 :148 的 picker 只挑 G/F/S ⇒ C 是一个"只在账上、永远不会被推"的格子。
//   ★本用例先只断言**事实**（C 不被选中），不预设修复方向：
//     把 C 纳入议程 或 让 C 退出压力计，两者都能让口径一致，都能让本用例通过。
{
  const sigs = await run({ Pc: prob('Pc', 'C') });
  check('F C 阶段目前不被议程选中（记录现状，供口径一致性决策）',
        agendaOf(sigs) === null, 'C 被选中了：' + agendaOf(sigs));
}

console.log('');
console.log('── G/H：呈现层修复的判据（P249 要求：修复必须被证明，不能只声明）──');

// ── 用例 G：`lastReport` 必须在装配时**带时点或历史标注** ────────────────────
// ★这是本次误报的**真实路径**：报告在当时准确，但被无时点地当成"当前状态"读。
//   所以判据不是"报告算得对"，而是"**呈现方式**不许把历史说成现在"。
{
  const fs = await import('node:fs');
  const toolsSrc = fs.readFileSync(new URL('./tools.mjs', import.meta.url), 'utf8');
  const i = toolsSrc.indexOf("lines.push('[巡检]");
  check('G 装配点存在', i >= 0, '没找到 [巡检] 那一行');
  // ★取景窗口我连错两次：先按固定字符数切（太窄）、再按大括号切（切在块开头）。
  //   真因是**时点计算在 lines.push 之前**，从 indexOf 往后切永远看不到它。
  //   ⇒ 不再切：直接对整个文件断言。静态检查的"作用域"本身就是一个易错点，
  //     而这里没有"必须限定作用域"的理由（这些标识符在 tools.mjs 里本就唯一）。
  const seg = toolsSrc;
  check("G' 装配点带**时点**（hh:mm）", /getHours\(\)/.test(seg) && /getMinutes\(\)/.test(seg));
  check("G'' 装配点带**年龄**（Xmin 前）", /ageMin/.test(seg) && /min 前/.test(seg));
  check("G''' 装配点显式标注这是**末轮报告**（不是当前状态）", /末轮报告/.test(seg));
  check("G'''' 时点回退到 lastAt（老 state 没有 lastReportAt 时不许瞎报年龄）",
        /lastReportAt\s*\|\|\s*pat\.lastAt/.test(seg));
  check("G''''' 拿不到时点时如实写\"时点未知\"（不编）", /时点未知/.test(seg));

  const patSrc = fs.readFileSync(new URL('./patrol.mjs', import.meta.url), 'utf8');
  check('G\'\'\'\'\'\' 巡检落盘时记录 lastReportAt', /lastReportAt\s*=\s*nowMs/.test(patSrc));
}

// ── 用例 H：被闸拦下的意图必须**可区分**于已发动的意图（界定目标④）────────────
{
  const fs = await import('node:fs');
  const hostSrc = fs.readFileSync(new URL('../host.js', import.meta.url), 'utf8');
  check('H 冷却/节流挂账带 throttled 标记',
        /throttled:\s*'cold'/.test(hostSrc) && /throttled:\s*'throttle'/.test(hostSrc));
}

console.log('');
console.log('='.repeat(72));
console.log('合计：PASS=' + PASS + '  FAIL=' + FAIL);
if (FAILS.length) { console.log('失败项：'); FAILS.forEach(function (n) { console.log('  - ' + n); }); }
process.exit(FAIL ? 1 : 0);
