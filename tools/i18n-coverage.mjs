// i18n 覆盖度量测器（**不是判据**：只报数字，不做判定）
//
// ★这个量测改过三次口径，每次都是因为上一次量错了东西 —— 这条历史本身就是结论：
//
//   第一版：数"全部模块里含中文的代码行" ⇒ 把 awareness 的字符串搬进 i18n.mjs 后，
//           再量**还是 959**。字符串没有消失，只是搬了家。那个数根本不会动。
//   第二版：数"渲染文件里的中文行（i18n.mjs 不算分母）" ⇒ 对，但仍然在数**源码**。
//           于是 P607 把 82 个参数描述接上英文表之后，源码里那些中文一行没少，
//           而量测会继续报"324 行待迁移"——**而那 324 行用户已经看不见了**。
//   第三版（现在）：**直接渲染**，数"en 下还看得见的中日韩字符数"。
//           ⇒ 这个数只会因为用户真的少看见中文而下降。
//
// 用法：node tools/i18n-coverage.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const CJK = /[\u3040-\u30ff\u4e00-\u9fff\uff00-\uffef]/;
const MOD = path.join(ROOT, 'engine', 'modules');

/** 数一个字符串里的 CJK 字符数（不是行数：一行里可能有 30 个汉字） */
function cjkCount(s) {
  const m = String(s || '').match(new RegExp(CJK.source, 'g'));
  return m ? m.length : 0;
}

const load = async (f) => import(pathToFileURL(path.join(MOD, f)).href);

const { makeTools } = await load('tools.mjs');
const { localizeTools } = await load('i18n.mjs');
const H = await load('hits.mjs');
const A = await load('awareness.mjs');

const TOOLS = makeTools({});
const NOW = 1792500000000;
const DAY = 86400000;
const HITS = { hits: [
  { id: 'A1', key: '愿景', text: 'k1', verdict: 'hint', at: NOW - 5 * DAY, disposedAt: NOW - DAY, direction: true },
  { id: 'A2', key: '项目定位', text: 'k2', verdict: 'hint', at: NOW - 5 * DAY }
] };
const STATE = { adopts: [], constitution: { log: [] }, principal: [], unknowns: [], narrations: [] };

const rows = [];

// ① 工具面：21 条描述 + 82 条参数描述
for (const L of ['zh', 'en']) {
  const ts = localizeTools(TOOLS, L);
  let n = 0;
  for (const t of ts) {
    n += cjkCount(t.description);
    const ps = t.parameters || {};
    for (const k of Object.keys(ps)) n += cjkCount(ps[k] && ps[k].description);
  }
  rows.push({ surface: '工具面（21 工具 + 82 参数）', locale: L, cjk: n });
}

// ② 快照里的两行
for (const L of ['zh', 'en']) {
  rows.push({
    surface: '快照两行（hits + awareness）',
    locale: L,
    cjk: cjkCount(H.hitsLine(HITS, 3, L)) + cjkCount(A.awarenessLine(STATE, {}, L))
  });
}

// ②b 节律那一行（快照里也每轮出现）
const RHY = await load('rhythm.mjs');
const RSTATE = { rhythm: { staleMinutes: 90, fireThrottleMinutes: 45, quietFrom: 23, quietTo: 8, valenceFloor: 40 } };
for (const L of ['zh', 'en']) {
  rows.push({ surface: '快照·节律行（rhythmLine）', locale: L, cjk: cjkCount(RHY.rhythmLine(RSTATE, L)) });
}

// ②c 巡检：**不作为字符数计入**（要跑一轮巡检才有真输出，而那是巨重的注入）。
//   改为静态计数：还有多少处 push 直接写字面量（应为 0，由 patrol-i18n 判据守）。
const patrolSrc = fs.readFileSync(path.join(MOD, 'patrol.mjs'), 'utf8');
const literalPushes = (patrolSrc.match(/(signals|proposals)\.push\((?!S\()/g) || []).length;
const keyedPushes = (patrolSrc.match(/(signals|proposals)\.push\(S\('/g) || []).length;

// ③ 参考：源码里还剩多少"渲染行"（**不作分母**）
let srcLines = 0;
for (const f of fs.readdirSync(MOD)) {
  if (!f.endsWith('.mjs') || f.startsWith('_') || f === 'i18n.mjs') continue;
  for (const l of fs.readFileSync(path.join(MOD, f), 'utf8').split(/\r?\n/)) {
    const t = l.trim();
    if (t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    if (CJK.test(t)) srcLines++;
  }
}

console.log('=== i18n 覆盖度（口径：en 下**还看得见**的中日韩字符数）===');
console.log('');
for (const r of rows) {
  console.log('  ' + r.surface.padEnd(30) + r.locale + ' : ' + String(r.cjk).padStart(6));
}
const sum = function (L) {
  return rows.filter(function (r) { return r.locale === L; })
    .reduce(function (s, r) { return s + r.cjk; }, 0);
};
const zhTotal = sum('zh');
const enTotal = sum('en');
console.log('');
console.log('  已渲染面合计  zh ' + zhTotal + ' → en ' + enTotal
  + '  ⇒ 覆盖 ' + Math.round((1 - enTotal / zhTotal) * 1000) / 10 + '%');
console.log('');
console.log('  ★参考（不作分母）：源码里还剩 ' + srcLines + ' 行含中文的渲染代码；');
console.log('    多数是 zh 分支里的字面量 —— 是否"用户还看得见"，以上面 en 的实测为准。');
console.log('');
console.log('  巡检（patrol）：信号 ' + keyedPushes + ' 处走 S() · 直接写字面量 ' + literalPushes + ' 处');
console.log('    —— 它不进上面的字符数（跑一轮巡检才出真输出，注入太重）；');
console.log('       它的守门人是 test/patrol-i18n.test.mjs（字面量处数必须为 0）。');
