// P328 判决实验 + 修复验收：θ_G 的同签名判据为何恒假 —— 「宿主的重复提醒把 MPM 的计数清零了」。
//
// 背景（全部已取证，不是猜）：
//   · 现场：4 次完全同参 read 之后 θ_G 既不报警也不发动，而 deliberate 的三项落盘证据均为证。
//   · P328 诊断 dump 已排除两个假设：sig 非 null（"pwsh|1122|3znv6k"）、arguments 里只有模型给的参数。
//   · 宿主 dsh-repeat-tool-reminder 源码自述 "without vetoing or rewriting calls" ⇒ 不拦截 dispatch；
//     且它确实数到了 3（本会话收到的那条 gentle reminder 就是 count === thresholds[0] === 3）
//     ⇒ 4 次 dispatch 真实发生，MPM 的 signatureRepeat 在第 4 次本应达到 3 并触发。
//   · 嫌疑落到 MPM 自己的 agent/inbox/inserted handler：它**无条件清零 signatureRepeat**，
//     而宿主那条提醒正是以 createUserMessage 注入的（source.kind === 'repeat-tool-reminder'）。
//     两者阈值都是 3 —— 宿主先响，把 MPM 的判据抹掉。
//
// 四条时间线（唯一差别是第 3 次之后插什么）：
//   B  4×read 连续                              ⇒ 必须触发 1 次（判据活着，基线）
//   C  3×read                                   ⇒ 必须 0 次（未达阈值）
//   A  3×read → inbox(用户/未知来源) → 1×read    ⇒ 必须 0 次（真用户仍应重置，原行为保持）
//   A' 3×read → inbox(宿主提醒来源) → 1×read     ⇒ 修复后必须 1 次（★修复生效的判据）
import { attachEventFaces } from './events.mjs';

let fails = 0;
function chk(label, cond) {
  if (cond) { console.log('PASS  ' + label); } else { console.log('FAIL  ' + label); fails += 1; }
}

function makeStub() {
  const handlers = {};
  const deliberateCalls = [];
  const ctx = { on(name, fn) { handlers[name] = fn; return () => {}; } };
  const state = { problems: {}, measure: {}, constitution: { autonomy: true, pending: [] } };
  attachEventFaces({
    ctx, state,
    isParked: () => false,
    drift: { consecutiveErrors: 0, signatureRepeat: 0, active: false, reason: '', lastSignature: null },
    perception: { sessionStarts: 0, lastSessionStartAt: 0, lastInboxAt: 0, inboxCount: 0 },
    lastActive: { agentId: null, at: 0 },
    deliberate: (sigs, at) => deliberateCalls.push({ sigs, at }),
    getOutsideCalls: () => 0, setOutsideCalls: () => {}, bumpSnapRev: () => {},
    patrol: () => {}, PATROL_MS: 1000,
  });
  return { handlers, deliberateCalls };
}

// 四次调用必须逐字节相同，才能命中"同签名"判据
const execRead = () => ({ name: 'read', arguments: { file_path: 'C:/x/y.py', offset: 1, limit: 20 } });

function run(insert) {
  const s = makeStub();
  for (let i = 0; i < 3; i++) s.handlers['tools/result'](execRead(), {});
  if (insert !== null) s.handlers['agent/inbox/inserted'](insert);
  s.handlers['tools/result'](execRead(), {});
  return s.deliberateCalls.length;
}

const C = (() => { const s = makeStub(); for (let i = 0; i < 3; i++) s.handlers['tools/result'](execRead(), {}); return s.deliberateCalls.length; })();
const B = run(null);
const A = run({});                                                            // 空 payload ≈ 真用户/未知来源
const A2 = run({ message: { source: { kind: 'repeat-tool-reminder' } } });    // ★宿主提醒来源

console.log('== C：只跑 3 次同参（未达阈值基线）==');
console.log('   deliberate = ' + C);
chk('3 次不触发', C === 0);

console.log('');
console.log('== B：4 次连续同参（判据必须活着）==');
console.log('   deliberate = ' + B);
chk('4 次必须触发 1 次', B === 1);

console.log('');
console.log('== A：3 次 → inbox(真用户/未知来源) → 第 4 次（原行为必须保持）==');
console.log('   deliberate = ' + A);
chk('真用户消息仍然重置计数（第 4 次不触发）', A === 0);

console.log('');
console.log('== A\'：3 次 → inbox(宿主 repeat-tool-reminder) → 第 4 次（★修复判据）==');
console.log('   deliberate = ' + A2);
chk('宿主提醒不再抹掉 MPM 的判据（第 4 次触发 1 次）', A2 === 1);

console.log('');
if (B === 1 && A === 0 && A2 === 1) {
  console.log('结论：根因与修复双向确认 ——');
  console.log('  根因：inbox 插入无条件清零 signatureRepeat，而宿主 repeat-tool-reminder 阈值同为 3，');
  console.log('        它以 user message 注入提醒，先把 MPM 的同签名判据抹掉 ⇒ θ_G 恒假。');
  console.log('  修复：只把已知的系统提醒来源排除在重置之外，真用户消息的原行为保持不变。');
} else if (B === 1 && A === 0 && A2 === 0) {
  console.log('结论：修复未生效 —— 宿主提醒仍会清零。检查 source.kind 的实际取值。');
} else {
  console.log('结论：基线不成立，先查 signatureRepeat 计数与 stub 形状。');
}
console.log('');
console.log(fails === 0 ? 'ALL PASS (fails=' + fails + ')' : 'HAS FAILURES (fails=' + fails + ')');
process.exit(fails === 0 ? 0 : 1);
