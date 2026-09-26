// P024 沉默审计修正案（A1 观测前提 + A2 缓冲上界）机械验证
// 从补丁后的 patrol.mjs 中【抽取真函数】运行，而不是复制一份逻辑来测。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'engine', 'modules', 'patrol.mjs');
const src = fs.readFileSync(SRC, 'utf8');

const at = src.indexOf('function constitutionReview');
if (at < 0) { console.error('未找到 constitutionReview'); process.exit(1); }
let d = 0, j = at, started = false;
for (; j < src.length; j++) {
  const ch = src[j];
  if (ch === '{') { d++; started = true; }
  else if (ch === '}') { d--; if (started && d === 0) { j++; break; } }
}
const fnSrc = src.slice(at, j);
const PATROL_MS = 20 * 60 * 1000;
const CONSTS = { PATROL_MS: 1, OTHER: 2 };
const call = new Function('state', 'PATROL_MS', 'CONSTS', 'nowMs',
  'return (' + fnSrc + ')(nowMs);');

const now = Date.now();
const H = 3600 * 1000;
const mk = (o) => Object.assign({
  constitution: { autonomy: true, log: [] },
  problems: { P1: { stage: 'S' } },
  patrol: { log: [] },
  measure: { samples: new Array(48).fill({ at: now }) }
}, o);

// —— 在场充足：24h 内 24 轮（patrol.log 满容量），应为"在场"分支
const enough = mk({ patrol: { log: new Array(24).fill(0).map((_, i) => ({ at: now - i * PATROL_MS })) } });
// —— 不在场：24h 内仅 1 轮（本次实机状态），应为"观测前提缺失"
const absent = mk({ patrol: { log: [{ at: now - 40 * H }, { at: now - 0.03 * H }] } });
// —— 全空缓冲：log 为空，expect 退化为 1，observed 阈值 max(3, ..) = 3 ⇒ 判不在场（安全侧）
const empty = mk({ patrol: { log: [] } });

const cases = [
  ['①不在场(fires24=0, 24h内1轮) → 应报"观测前提缺失"，不得判空集',
    absent, (r) => r.some(s => s.includes('观测前提缺失')) && !r.some(s => s.includes('发射窗口可能为空集'))],
  ['②在场充足(fires24=0, 24h内24轮) → 应判"发射窗口可能为空集"',
    enough, (r) => r.some(s => s.includes('发射窗口可能为空集') && s.includes('观测前提成立'))],
  ['③在场充足且 fires24>0 → 不应有任何沉默审计条目',
    mk({ constitution: { autonomy: true, log: [{ at: now - H }] },
         patrol: { log: new Array(24).fill(0).map((_, i) => ({ at: now - i * PATROL_MS })) } }),
    (r) => !r.some(s => s.includes('沉默审计'))],
  ['④执政权关闭 → 不应有任何沉默审计条目',
    mk({ constitution: { autonomy: false, log: [] },
         patrol: { log: new Array(24).fill(0).map((_, i) => ({ at: now - i * PATROL_MS })) } }),
    (r) => !r.some(s => s.includes('沉默审计'))],
  ['⑤无在轮题(全 D) → 不应有任何沉默审计条目',
    mk({ problems: { P1: { stage: 'D' } },
         patrol: { log: new Array(24).fill(0).map((_, i) => ({ at: now - i * PATROL_MS })) } }),
    (r) => !r.some(s => s.includes('沉默审计'))],
  ['⑥patrol.log 为空(缓冲缺证据) → 安全侧：判不在场，不判空集',
    empty, (r) => r.some(s => s.includes('观测前提缺失'))]
];

let ok = 0;
for (const [name, st, chk] of cases) {
  let r, err = null;
  try { r = call(st, PATROL_MS, CONSTS, now); } catch (e) { err = e; }
  const pass = !err && chk(r || []);
  if (pass) ok++;
  console.log((pass ? '✓ ' : '✗ ') + name);
  if (!pass) console.log('    got: ' + (err ? err.message : JSON.stringify(r, null, 0)));
}
console.log('\n结果：' + ok + '/' + cases.length + ' 项符合预期');
process.exit(ok === cases.length ? 0 : 1);
