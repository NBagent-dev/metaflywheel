// 查"参数校验 / 调用契约"这一层，库里有没有对应的沉积
// ★ 为什么要查：触发器表每条都要 sedimentId，且判据 ⑦ 会验它真实存在。
//   若库里没有这条纪律，那"参数校验失败"就是【覆盖率的洞】，不是"我忘了加一条"。
import fs from 'node:fs';

const st = JSON.parse(fs.readFileSync('C:/Users/Administrator/Desktop/daima/XIN/.mpm/flywheel.json', 'utf8'));
const seds = (st.sediments || []).filter(s => s && s.id);

// 三个角度：①参数/调用契约 ②校验/前置检查 ③工具用法
const groups = [
  ['参数 / 调用契约', /参数|调用契约|入参|args|schema|签名/],
  ['校验 / 前置检查', /校验|前置|检查|守卫|门禁|guard|validate/],
  ['工具用法 / 用法错误', /用法|误用|用错|工具.*失败|工具.*坑/]
];

for (const [label, re] of groups) {
  const hit = seds.filter(s => re.test(String(s.title || '')));
  console.log('═══ ' + label + '（' + hit.length + ' 条）═══');
  for (const s of hit.slice(-10)) {
    console.log('  ' + s.id + '  引' + (s.cites || 0) + '  ' + String(s.title).slice(0, 66));
  }
  console.log('');
}

// ★ 而最关键的一问：有没有哪条沉积专门讲"edit 失败的各种形态"
console.log('═══ ★ 直接查 edit / old_string 相关 ═══');
const editRel = seds.filter(s => /edit|old_string|锚点|逐字/i.test(String(s.title || '')));
for (const s of editRel.slice(-10)) console.log('  ' + s.id + '  引' + (s.cites || 0) + '  ' + String(s.title).slice(0, 70));
console.log('  共 ' + editRel.length + ' 条');
