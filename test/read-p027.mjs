// ★ 用账本里的 path（权威），不猜文件名
import fs from 'node:fs';

const st = JSON.parse(fs.readFileSync('C:/Users/Administrator/Desktop/daima/XIN/.mpm/flywheel.json', 'utf8'));
const seds = (st.sediments || []).filter(s => s && s.id);

const targets = ['P027-M17', 'P028-M18', 'P030-M20'];
for (const id of targets) {
  const s = seds.find(x => x.id === id);
  if (!s) { console.log(id + ' 不在账本'); continue; }
  console.log('═══ ' + s.id + ' ═══');
  console.log('  title: ' + s.title);
  console.log('  path : ' + s.path);
  console.log('  存在 : ' + fs.existsSync(String(s.path)) + '  · 字节 ' + (fs.existsSync(String(s.path)) ? fs.statSync(String(s.path)).size : -1));
  console.log('');
}

// 读最相关的那条全文（P027-M17：引擎修补契约，而账本 path 是权威的）
const t = seds.find(x => x.id === 'P027-M17');
console.log('════════════ P027-M17 全文 ════════════');
console.log(fs.readFileSync(String(t.path), 'utf8'));
