// P517 判据：**委托人的思考方式**必须成为可检索、可覆盖、且不许被编造的一等公民。
// 运行：node --test test/principal.test.mjs
//
// 这一条判据要防的不是"功能没做"，而是**滑向表演**：
//   装置若开始"替委托人说话"（把个体的判断、或没录入的东西说成"你说过"），
//   那它就不是本体，而是一个会伪造委托人的东西。⇒ 负控写死在判据里。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';   // ★第 5 次"用了没引入"就是这里：判据⑦ 用了 fs.readFileSync 却没 import（整文件红）
import { PRINCIPAL_MODES, modeOf, recordPrincipal, activeFor, principalLine } from '../engine/modules/principal.mjs';

test('①思考方式的识别：五种模式各有正例，且**认不出就返回 null**（不猜）', () => {
  assert.equal(modeOf('我们要做的事是造就意识'), 'meaning');
  assert.equal(modeOf('现在我们的插件解决了什么本质问题'), 'essence');
  assert.equal(modeOf('否则它不是主体性'), 'boundary');
  assert.equal(modeOf('最后一米为什么不想办法解决呢'), 'direction');
  assert.equal(modeOf('插件不要改模型'), 'veto', '明确的"不要"优先于其它模式');
  assert.equal(modeOf('嗯'), null, '★认不出 ⇒ null，不许硬塞一个模式');
  assert.equal(modeOf(''), null);
  assert.equal(Object.keys(PRINCIPAL_MODES).length, 5);
});

test('②否决优先：一句里既有"不要"又有别的模式 ⇒ 判为 veto（最强约束不许被盖过）', () => {
  assert.equal(modeOf('不要再问本质问题了'), 'veto');
  assert.equal(modeOf('这个方向不要做，虽然它有意义'), 'veto');
});

test('③覆盖规则：同一约束对象上，**时间戳较新者覆盖较旧者**，且旧条目留痕可回溯', () => {
  let list = [];
  list = recordPrincipal(list, { at: 1000, key: '引擎改动流程', text: '改完先语法检查再复制' }).list;
  const r2 = recordPrincipal(list, { at: 2000, key: '引擎改动流程', text: '改完先语法检查，且先跑全套判据，再复制' });
  assert.equal(r2.superseded.length, 1, '旧条目必须被标记为被覆盖（而非删除）');
  assert.equal(r2.superseded[0].supersededBy, 2000);
  const act = activeFor(r2.list, '引擎改动流程');
  assert.equal(act.at, 2000, '当前有效的应是较新那条');
  assert.equal(activeFor(r2.list, '不存在的对象'), null, '查不到 ⇒ null（不猜）');
});

test('④负控·不许编造：一条都没录入 ⇒ 快照那一行**必须为空**', () => {
  assert.equal(principalLine({}), '', '没有录入就不许显示任何"你说过"');
  assert.equal(principalLine({ principal: [] }), '');
  assert.equal(principalLine({ principal: null }), '');
});

test('④负控·不许静默：被覆盖的条目不进"有效"计数，但总数保留', () => {
  let list = [];
  list = recordPrincipal(list, { at: 1000, key: 'A', text: '不要做 A' }).list;
  list = recordPrincipal(list, { at: 2000, key: 'A', text: '可以做 A' }).list;
  const line = principalLine({ principal: list });
  // ★P520 修正锚点：原来把整串写死（`共 2 条（有效 1 · 否决 0）`），
  //   而显示里插进了"已覆盖 N"一个新字段 ⇒ **假警**。⇒ 只约束"意图"（总数/有效数/否决数），
  //   不约束字段顺序与新字段 —— 又一次"锚点随实现漂移"（P487-M405）。
  assert.match(line, /共 2 条（[^）]*有效 1[^）]*否决 0[^）]*）/, '否决被覆盖后不再计入有效否决：' + line);
});

test('⑤残缺输入不制造垃圾条目：缺 key 或缺 text ⇒ 不录入', () => {
  assert.equal(recordPrincipal([], { at: 1, key: '', text: 'x' }).entry, null);
  assert.equal(recordPrincipal([], { at: 1, key: 'A', text: '   ' }).entry, null);
});

test('⑦★接线：state.mjs 用到 mergePrincipalLists ⇒ 必须真的 import 它（第 4 次"用了没引入"）', () => {
  // 实证（2026-10-11）：我在 state.mjs 写了 `e.state.principal = mergePrincipalLists(...)` 却没写 import
  //   ⇒ restore 一跑就 ReferenceError。**抓住它的是"稳定性·冷启动"集成判据，不是任何静态判据。**
  //   这条判据把那个教训固化成静态形式：用到跨模块符号 ⇒ 必须有对应的 import 行。
  const SRC = fs.readFileSync(new URL('../engine/modules/state.mjs', import.meta.url), 'utf8');
  assert.ok(/mergePrincipalLists\s*\(/.test(SRC), 'state.mjs 应当调用 mergePrincipalLists（锚点失效？）');
  assert.match(SRC, /import\s*\{[^}]*mergePrincipalLists[^}]*\}\s*from\s*['"]\.\/principal\.mjs['"]/,
    'state.mjs 用到 mergePrincipalLists 却没有从 ./principal.mjs 引入');
});

test('⑥行文必须自带边界（不可逾越的那条界线要在快照里看得见）', () => {
  const list = recordPrincipal([], { at: 1, key: 'A', text: '不要改模型' }).list;
  const line = principalLine({ principal: list });
  assert.match(line, /不冒充"他在乎什么"的来源/, '界线必须写在显示里，不是只写在代码注释里');
  assert.match(line, /必须显式请求复核/, '可推翻通道必须写明');
});

// ── ★P520：源的演化（判据①②③）──────────────────────────────

test('⑧★P520：**"已覆盖"必须可见** —— 否则"他改过主意"等于没发生（演化等于没发生）', () => {
  let l = recordPrincipal([], { at: 1000, key: '项目定位', text: '旧说法' }).list;
  l = recordPrincipal(l, { at: 2000, key: '项目定位', text: '新说法' }).list;
  const line = principalLine({ principal: l });
  assert.match(line, /已覆盖 1/, line);
  assert.match(line, /他改过主意/, '必须写明这是"他改过主意"的留痕');
  assert.match(line, /旧说法/, '旧条目的痕迹要能看见');
  assert.equal(activeFor(l, '项目定位').text, '新说法', 'activeFor 必须返回新条目');
});

test('⑨★P520 震荡守卫：同一 key 窗口内被反复覆盖 ⇒ 提示"源在震荡"；不同 key 不报', () => {
  const now = Date.now();
  let l = [];
  for (let i = 0; i < 4; i++) l = recordPrincipal(l, { at: now - 3000 + i * 500, key: '项目定位', text: '第' + (i + 1) + '版说法' }).list;
  assert.equal(l.filter(function (e) { return e.supersededBy; }).length, 3, '应产生 3 条被覆盖条目');
  assert.match(principalLine({ principal: l }), /源在震荡/, '反复覆盖必须被提示');
  // 负控：两个 key 各覆盖一次 ⇒ 各 1 次，不到阈值，不许报
  let m = [];
  m = recordPrincipal(m, { at: now - 3000, key: 'A', text: 'a1' }).list;
  m = recordPrincipal(m, { at: now - 2500, key: 'A', text: 'a2' }).list;
  m = recordPrincipal(m, { at: now - 2000, key: 'B', text: 'b1' }).list;
  m = recordPrincipal(m, { at: now - 1500, key: 'B', text: 'b2' }).list;
  assert.ok(!/源在震荡/.test(principalLine({ principal: m })), '不同 key 各覆盖一次不该报震荡');
});

test('⑩负控：没有被覆盖的条目 ⇒ 显示"已覆盖 0"，且不出现"他改过主意"那一段', () => {
  const l = recordPrincipal([], { at: Date.now(), key: 'K', text: 'T' }).list;
  const line = principalLine({ principal: l });
  assert.match(line, /已覆盖 0/);
  assert.ok(!/他改过主意/.test(line), '没有覆盖就不许显示覆盖留痕：' + line);
});
