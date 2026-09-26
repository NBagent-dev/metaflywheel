// P247 判决测试 v2：θ_G「同签名重复」判据的判别力检验
// 用法: node _p247_sigtest.mjs
//
// ★v2 的关键修正（2026-09-18）：**import 出货文件里的 signatureOf**，不再自带副本。
//   v1 的测试内联了一份 newSig，验证的是副本而不是出货文件——签名规则怎么改，测试都全绿。
//   这正是 P095「验证对象必须等于用户会打开的那个文件」的复发。测试必须与被测对象同源。
//
// 通过判据：
//   A  4×read 四个不同文件         → 不报警
//   B  4×read exec 不带参数        → 不报警（判据不可观测，显式跳过）
//   C  4×完全相同的调用            → **必须报警**（这是判据存在的唯一理由）
//   D  4×edit 同文件不同位置       → 不报警
//   E  4×pwsh 不同命令但共享 240 字符前缀 → 不报警（v1 前缀法在此误报，v2 必须过）
//   F  真实失败样本回放（2026-09-21 本会话实际触发的 edit×3 / pwsh×4）→ 不报警
//   G  已知盲区固化：同核心动作、外围字段措辞不同 → 不报警（**有意接受**，见 G 段注释）
//   反向对照：v1 前缀法在 A/E 上必须报警，否则说明 A/E 没有区分力（对照本身要有效）

import { signatureOf } from './events.mjs';

const DIR = 'C:\\Users\\Administrator\\.dsh\\mpm\\engine\\modules\\';
const FILES = ['guard', 'util', 'valence', 'core'].map(n => DIR + n + '.mjs');

// ---- 旧实现 v0（判别力恒为零那版，备份于 events.mjs.bak-p247 之前）----
function sigV0(name, exec) {
  let sig = name;
  try { sig = name + '|' + JSON.stringify((exec && (exec.args || exec.input)) || {}).slice(0, 120); } catch (e) { }
  return sig;
}
// ---- 中间版 v1（取对了 arguments，但仍做 240 字符前缀比较）----
function sigV1(name, exec) {
  let sig = null;
  try {
    const raw = exec && (exec.arguments != null ? exec.arguments
      : (exec.args != null ? exec.args : exec.input));
    if (raw != null) sig = name + '|' + JSON.stringify(raw).slice(0, 240);
  } catch (e) { sig = null; }
  return sig;
}
// ---- 出货版 v2：直接来自 events.mjs（同源）----
const sigV2 = signatureOf;

function simulate(sigOf, calls) {
  let last, repeat = 0, fired = false, seen = [];
  for (const [name, exec] of calls) {
    const s = sigOf(name, exec);
    if (s !== null) {
      if (s === last) repeat += 1; else { last = s; repeat = 0; }
    }
    seen.push(s === null ? '<null:不可观测>' : s);
    if (repeat >= 3) fired = true;
  }
  return { fired, distinct: new Set(seen).size, seen };
}

// E 的两条长命令：前 240 字符逐字相同，只在尾部不同。
// 构造要点（v2 首跑即栽在这里）：公共头必须**自身就超过 240 字符**，
// 否则 slice(0,240) 会切进尾部差异段，用例就不再有区分力。
// 当时对照组如实报出"前提成立: 否"并 FAIL —— 这正是对照该有的行为：
// 宁愿用例自己报无效，也不要一个静默通过的假证明。
const PAD = 'x'.repeat(260);
const LONG_HEAD = 'ssh huawei "cd /opt/etf-strategy && python3 -c ' + PAD + ' && echo ';
const LONG = ['TAIL_AAA', 'TAIL_BBB', 'TAIL_CCC', 'TAIL_DDD'].map(t => LONG_HEAD + t);
const LONG_COLLIDES = LONG[0].length > 240 && LONG.every(s => s.slice(0, 240) === LONG[0].slice(0, 240));

const CASES = [
  ['A 4x read 四个不同文件',
    FILES.map(f => ['read', { name: 'read', arguments: { file_path: f } }])],
  ['B 4x read，exec 完全不带参数', [1, 2, 3, 4].map(() => ['read', { name: 'read' }])],
  ['C 4x 完全相同的调用（真病态，必须报警）',
    [1, 2, 3, 4].map(() => ['edit', { name: 'edit', arguments: { file_path: 'x.py', old_string: 'a', new_string: 'b' } }])],
  ['D 4x 改同一文件、不同位置',
    ['rem Usage: run_daily.cmd morning', 'if /i "%1"=="c7verify" goto c7verify', ':c7verify\npython c7_live.py verify', 'if /i "%1"=="c7morning" goto c7morning']
      .map(o => ['edit', { name: 'edit', arguments: { file_path: DIR + 'run_daily.cmd', old_string: o, new_string: o + 'X' } }])],
  ['E 4x pwsh 不同命令、共享 240 字符前缀',
    LONG.map(c => ['pwsh', { name: 'pwsh', arguments: { command: c, description: 'probe' } }])],
];

// ---------------------------------------------------------------------------
// F  真实失败样本回放（2026-09-21 本会话实际触发过一次自主发动）
// ---------------------------------------------------------------------------
// 为什么必须有这一组：A–E 全是**合成夹具**（我构造的短串）。
// 真实的误报长什么样，测试从没考过。合成用例证明"方法可以失败"，
// 真实样本才能证明"方法**确实**失败过、且修的是这一处"。
//
// 夹具状态声明：**重建，非字节级抓取**。宿主不落盘 exec 参数，事后无法逐字节复原，
// 因此这里保留真实 file_path 与真实 old_string/new_string 的起首原文，
// 尾部省略。这足以复现触发条件（同文件、连续、内容各异、长参数），
// 但不得声称它与当时的 payload 完全一致。
//
// 它指认的是哪一对实现：**v0 → v1**（与 D 同一对，但用真实样本）。
//   真实 payload 只有 exec.arguments，v0 读 exec.args||exec.input ⇒ 恒为 {} ⇒ 常量比较 ⇒ 必然误报。
//   这正是当天那条「同签名重复调用 3 次(edit)」的成因。
const DSH_PORT = 'C:\\Users\\Administrator\\Desktop\\daima\\hikyuu-master\\dsh-port\\';
const REAL_EDITS = [
  '③ 真实可下单腿数 = 资金约束 ∩ 最小合约约束。装不下的腿**如实报「资金不足」**，\n   不能悄悄按 0 张推出去（那等于给了一个无法执行的信号）。\n\n用法',
  '    python3 crypto_signal.py            # 出信号并入队（08:05 定时器用）\n    python3 crypto_signal.py --dry      # 只打印，不入队\n    python3 crypto_signal.py --force    # 忽略当日去重\n"""',
  'def tsmom(sym, lb):\n    bars = closed_daily(sym, lb + 2)\n    if len(bars) < lb + 1:\n        raise RuntimeError("%s 已收盘日线不足：%d < %d" % (sym, len(bars), lb + 1))',
  '        case("明晨收盘 = flip → 恰好空仓（下一根窗口基准 == 今日 flip）",\n             bars_signal(bars + [(t_next, d["flip"])], lb)["pos"] == 0),',
];
// 真实 pwsh：本轮部署加密反转价时实际执行的四条（前两条共享 `ssh huawei "` 与脚本路径前缀）
const REAL_PWSH = [
  '$p="C:\\Users\\Administrator\\Desktop\\daima\\hikyuu-master\\dsh-port\\crypto_signal.py"\n$b=[System.IO.File]::ReadAllBytes($p)\n$crlf=0; for($i=0;$i -lt $b.Length-1;$i++){ if($b[$i] -eq 13 -and $b[$i+1] -eq 10){$crlf++} }\n"CRLF pairs: $crlf"; "bytes: $($b.Length)"',
  'ssh huawei "cp -a /opt/etf-strategy/crypto_signal.py /opt/etf-strategy/crypto_signal.py.bak-$(date +%Y%m%d-%H%M) && ls -la /opt/etf-strategy/crypto_signal.py*"\nscp $p huawei:/opt/etf-strategy/crypto_signal.py\nssh huawei "md5sum /opt/etf-strategy/crypto_signal.py; python3 /opt/etf-strategy/crypto_signal.py --selftest"',
  'ssh huawei "mv /opt/etf-strategy/crypto_signal.py.bak- /opt/etf-strategy/crypto_signal.py.bak-20260921 && python3 /opt/etf-strategy/crypto_signal.py --dry"',
  'ssh huawei "python3 /opt/etf-strategy/crypto_signal.py --force; echo ---; sleep 25; ls -la /opt/etf-strategy/.live/sent_crypto/ | tail -5; echo ---; cat /opt/etf-strategy/.live/crypto.log; echo ---; tail -6 /opt/etf-strategy/.live/bridge.log"',
];
CASES.push(['F 真实样本回放：4x edit 同一文件、内容各异',
  REAL_EDITS.map(o => ['edit', { name: 'edit', arguments: { file_path: DSH_PORT + 'crypto_signal.py', old_string: o, new_string: o + '\n# patched' } }])]);
CASES.push(['F 真实样本回放：4x pwsh 长命令、共享 ssh 前缀',
  REAL_PWSH.map(c => ['pwsh', { name: 'pwsh', arguments: { command: c, description: 'deploy crypto flip price' } }])]);

// ---------------------------------------------------------------------------
// G  v2 的代价：**字面不同、语义相同**的重复落进盲区（有意接受）
// ---------------------------------------------------------------------------
// 首版这里我写的是"同 command、不同 description"，**前提就错了**：description 是参数的一部分，
// 参数不同 ⇒ v2 判定为不同调用，那是**对的**，不是盲区。差点把一条假断言钉进测试里。
//
// 真正的代价在另一头：判据从 v0 的「任何 4 次连续同名工具调用」收窄为「逐字节同参」。
// 于是语义等价但字面有别的重试（换个引号、多个空格、换个临时文件名）不再触发。
//   · v0 的"敏感"是假的：它对一切都敏感 ⇒ 判别力为零（见 A/E/F）。
//   · v1 在同前缀长参上是反方向的错（误报，见 E）。
//   所以这是从"恒真"换到"逐字节同参"的必然代价，不是回归。
// 本组不指认新的实现对（与 A 同属 v0→v1/v2），它钉住的是**这条判据看不见什么**——
// 防止将来有人以为它已经能抓所有重复，也防止有人无意中改得在这里敏感而没人知道。
CASES.push(['G v2 代价：语义相同、字面不同的重复（同一动作换引号）',
  ['ssh huawei "date"', "ssh huawei 'date'", 'ssh huawei "date" ', 'ssh huawei  "date"'].map(c =>
    ['pwsh', { name: 'pwsh', arguments: { command: c, description: '探针' } }])]);

console.log(`E 前缀碰撞前提成立: ${LONG_COLLIDES ? '是' : '否（本用例无区分力，需修正构造）'}`);
if (!LONG_COLLIDES) process.exit(1);

let bad = 0;
for (const [label, calls] of CASES) {
  const v0 = simulate(sigV0, calls);
  const v1 = simulate(sigV1, calls);
  const v2 = simulate(sigV2, calls);
  const want = label.startsWith('C');           // 只有 C 应当报警
  const ok = v2.fired === want;
  if (!ok) bad += 1;
  console.log(`\n=== ${label} ===`);
  console.log(`  v0(常量比较): 报警=${v0.fired ? '是' : '否'}  互异签名数=${v0.distinct}/${calls.length}`);
  console.log(`  v1(240前缀):  报警=${v1.fired ? '是' : '否'}  互异签名数=${v1.distinct}/${calls.length}`);
  console.log(`  v2(全串哈希): 报警=${v2.fired ? '是' : '否'}  互异签名数=${v2.distinct}/${calls.length}`);
  console.log(`  期望=${want ? '报警' : '不报警'}  →  ${ok ? 'PASS' : 'FAIL'}`);
  console.log(`  v2 签名[0]: ${v2.seen[0]}`);
}
// 对照有效性（v2 首跑时这里 FAIL 了一次，值得留档）：
//   我最初写的是"v1 必须在 A 上误报"。实测 v1 在 A 上**不**误报 —— 断言写错了，代码是对的。
//   原因：A（四个不同文件）是 **v0→v1 的判别器**，v1 取对 arguments 字段后就已经修好了；
//   真正的 **v1→v2 判别器是 E**（长参数共享 240 字符前缀），v1 在 E 上如实误报。
//   教训：对照组要指认"这一版修的是哪一段"，把两段修复混成一个断言，就会把正确的代码判成 FAIL。
//   每个 A/B/C/D/E 都必须能指认它区分的是哪一对实现，否则它只是陪跑。
const checks = [
  ['A 是 v0→v1 判别器：v0 误报', simulate(sigV0, CASES[0][1]).fired === true],
  ['A 已被 v1 修好：v1 不误报', simulate(sigV1, CASES[0][1]).fired === false],
  ['E 是 v1→v2 判别器：v1 误报', simulate(sigV1, CASES[4][1]).fired === true],
  ['E 已被 v2 修好：v2 不误报', simulate(sigV2, CASES[4][1]).fired === false],
  ['C 真病态仍被 v2 抓到', simulate(sigV2, CASES[2][1]).fired === true],
  ['B 不可观测时不判（v2 签名=null）', simulate(sigV2, CASES[1][1]).seen[0] === '<null:不可观测>'],
  // F：真实样本。v0 在真实 payload 上必然误报，这才是当天那条自主发动的成因。
  ['F(edit) 是 v0→v1 判别器：v0 在真实样本上误报（当天误报的成因）',
    simulate(sigV0, CASES[5][1]).fired === true],
  ['F(edit) 真实样本四条签名互异（v2）', simulate(sigV2, CASES[5][1]).distinct === 4],
  ['F(edit) 已被 v2 修好：不误报', simulate(sigV2, CASES[5][1]).fired === false],
  ['F(pwsh) 是 v0→v1 判别器：v0 误报', simulate(sigV0, CASES[6][1]).fired === true],
  ['F(pwsh) 已被 v2 修好：不误报', simulate(sigV2, CASES[6][1]).fired === false],
  // G：v2 的代价备案。断言它**仍然**看不见 —— 将来若变得敏感，这条会 FAIL，逼出显式决策。
  ['G 代价成立：字面不同的同义重复 → v2 静默（有意接受，非回归）', simulate(sigV2, CASES[7][1]).fired === false],
  ['G 有区分力：v0 在此确实误报（该用例不是空跑）', simulate(sigV0, CASES[7][1]).fired === true],
];
console.log('\n对照有效性:');
for (const [label, ok2] of checks) {
  if (!ok2) bad += 1;
  console.log(`  ${ok2 ? 'OK  ' : 'FAIL'}  ${label}`);
}

console.log(bad === 0 ? '\n全部 PASS' : `\n${bad} 个 FAIL`);
process.exit(bad === 0 ? 0 : 1);
