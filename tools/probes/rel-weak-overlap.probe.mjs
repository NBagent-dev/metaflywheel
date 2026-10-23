// P606 回归探针（tools/probes/rel-weak-overlap.probe.mjs）
// 复跑：node tools/probes/rel-weak-overlap.probe.mjs
// 判据：①有相关沉积时，长/短 framing 都应变同一条相关沉积；②只有弱重叠+无关时，长短 framing 都**不该**注入。
// 若①或②破了，说明相似度的分母口径被改了（详见沉积 P606-M502）。
// P606 探针：长 framing 下，**弱重叠但语义无关**的沉积标题会不会赢过**语义相关**的那条。
// 判据不是"能不能注入"，而是"注入的是哪一条"——这才是 M9③ 真正的失败面。
import { renderSelfSnapshot } from '../../engine/modules/selfsnap.mjs';

const now = Date.now();

const LONG = ('这个题要研究交易系统在极端行情下的资金分配策略，涉及凯利公式、相关性矩阵、回撤控制、'
  + '仓位管理、滑点估计、多资产类别、共同窗口对齐、样本外检验、参数敏感性、蒙特卡洛重采样、'
  + '风险预算、波动率目标、杠杆约束、流动性冲击、执行成本、隔夜跳空、极端尾部事件、压力测试、'
  + '情景分析、归因分解、夏普比率、卡玛比率、最大回撤、恢复期、再平衡频率、税费、融资成本、'
  + '保证金、强平线、对冲工具、期权隐含波动率、期限结构、基差、跨境资金、汇率风险、合规检查').repeat(8);

const SHORT = '资金分配与风险预算：凯利公式在多资产上的适用边界';

const mk = (id, title, digest) => ({ id, title, tags: [], digest: digest || (title + ' 的摘要'), cites: 0, depositedAt: now - 86400000 });

// 五条沉积：①语义相关（用词不同）②弱重叠但语义无关（共享 控制/管理/成本 等高频 bigram）③④⑤ 填充
const SEDS = [
  mk('M2', '项目里的成本控制与进度管理', '讲的是软件项目排期、人力成本与需求变更控制，与交易无关'),
  mk('M3', '煮咖啡的水温控制', '手冲咖啡 92 度'),
  mk('M4', '阳台种番茄的浇水频率', '见干见湿'),
  mk('M5', '修自行车的刹车线', '线管走向与张力')
];

function render(framing, label) {
  const out = renderSelfSnapshot({
    state: {
      seq: 1,
      problems: { P900: { id: 'P900', title: '多资产资金分配与风险预算', framing, stage: 'S', updatedAt: now, cost: 1 } },
      sediments: SEDS,
      patrol: { rounds: 1, lastAt: now }, measure: {},
      constitution: { autonomy: true, log: [] }, valence: { events: [] }, narrations: []
    },
    perception: { lastInboxAt: now - 60000, inboxCount: 1, sessionStarts: 1 },
    outsideCalls: 0, drift: { active: false, reason: '' }, retrievalHits: () => [],
    valenceSummaryLine: () => '', directiveText: () => 'x',
    isParked: () => false, isOpen: () => false, BOUNDARY_THRESHOLD: 5, runStampLine: () => ''
  });
  const line = out.split('\n').find(function (l) { return l.indexOf('因材施教') >= 0; });
  const m = line ? (line.match(/(P\d+|[A-Z]?\d+)\s*摘要/) || line.match(/沉积\s+(\S+)\s+摘要/) || line.match(/沉积\s+(\S+)/)) : null;
  let who = '（未注入）';
  if (line) {
    if (line.indexOf('M2') >= 0) who = 'M2（弱重叠·语义无关）';
    else if (line.indexOf('M1') >= 0) who = 'M1（语义相关）';
    else if (line.indexOf('M3') >= 0) who = 'M3';
    else if (line.indexOf('M4') >= 0) who = 'M4';
    else if (line.indexOf('M5') >= 0) who = 'M5';
    else who = '（有注入但未识别）';
  }
  console.log('    [' + label + '] framing=' + framing.length + ' 字符 ⇒ 注入: ' + who);
  return who;
}

console.log('  沉积：M1 语义相关 / M2 弱重叠但语义无关（共享「成本·控制·管理」）/ M3-M5 完全无关');
const a = render(LONG, '长 framing');
const b = render(SHORT, '短 framing');
console.log('');
console.log('  ⇒ 长 framing 时注入的是: ' + a);
console.log('  ⇒ 短 framing 时注入的是: ' + b);
const badLong = a.indexOf('M2') >= 0;
const goodShort = b.indexOf('（未注入）') >= 0;
console.log('  ⇒ 缺陷复现（长 framing 把无关但词汇重叠的顶上来）: ' + (badLong ? '是' : '否'));
console.log('  ⇒ 对照（短 framing 不犯这个错）: ' + (goodShort ? '是' : '否'));
process.exit(0);
