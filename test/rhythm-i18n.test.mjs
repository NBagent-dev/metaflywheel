// P608 判据：节律那一行（每轮快照里都出现）+ 效价门禁理由 + 参数拒绝理由
//
// 为什么这三处要一起做：它们都是"引擎自己开口说话"的地方，而且都**带数字**。
// 数字的口径不能被翻译改掉，所以每一条都先冻结 zh 黄金，再验 en 只换语言不换语义。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rhythmLine, valenceGate, normalizeRhythm } from '../engine/modules/rhythm.mjs';
import { setLocaleOverride } from '../engine/modules/i18n.mjs';

const CJK = /[\u3040-\u30ff\u4e00-\u9fff\uff00-\uffef]/;

const SELF_GATE = { rhythm: { staleMinutes: 90, fireThrottleMinutes: 45, quietFrom: 23, quietTo: 8, valenceFloor: 40 } };
const FACTORY = {};
const PARTIAL = { rhythm: { staleMinutes: 30 } };

// ★迁移前冻结的黄金（分别 214 / 137 / 168 字节）
const G_SELF = '- 节律(自我设定)：陈旧 90min · 发动节流 45min · 静默 23-8 时 · 效价门槛 40（低于它不自主发动）——**由我自己写下，非出厂常数**（mpm_rhythm 可改，reset 回出厂）';
const G_FACT = '- 节律(出厂默认)：陈旧 30min · 发动节流 45min · 效价门槛未设（未被改写；mpm_rhythm 可改写自己的节律）';
const G_PART = '- 节律(自我设定)：陈旧 30min · 发动节流 45min · 效价门槛未设——**由我自己写下，非出厂常数**（mpm_rhythm 可改，reset 回出厂）';

test('① ★迁移不改行为：三种形态的 zh 输出与迁移前冻结的黄金逐字节相同', () => {
  const cases = [[SELF_GATE, G_SELF, 214], [FACTORY, G_FACT, 137], [PARTIAL, G_PART, 168]];
  for (const [state, golden, bytes] of cases) {
    const got = rhythmLine(state, 'zh');
    assert.equal(Buffer.byteLength(got, 'utf8'), bytes, '字节数变了：' + got);
    assert.equal(got, golden);
  }
});

test('② en 下不含中日韩字符，且两个语义点都在（来源可辨 / 门槛在建）', () => {
  const a = rhythmLine(SELF_GATE, 'en');
  assert.equal(CJK.test(a), false, 'en 里仍有中日韩字符：' + a);
  assert.ok(/Rhythm \(self-set\)/.test(a), '必须看得出这是"自我设定"而非默认：' + a);
  assert.ok(/valence floor 40/.test(a), '门槛数字必须保留：' + a);
  assert.ok(/written by me/.test(a), '必须保留"这是我自己写的"这一句：' + a);
  const b = rhythmLine(FACTORY, 'en');
  assert.equal(CJK.test(b), false, b);
  assert.ok(/factory default/.test(b), '默认态必须可辨：' + b);
  assert.ok(/not set/.test(b), '未设门槛必须写出来：' + b);
});

test('③ 效价门禁：三种情形的理由都必须换语言，而 R(t) 与门槛值不许变', () => {
  const ev = { valence: { events: [] } };
  const blocked = valenceGate(SELF_GATE.rhythm, ev, Date.now(), 'zh');
  assert.equal(blocked.why, 'R(t)=0.0 低于门槛 40');
  const enBlocked = valenceGate(SELF_GATE.rhythm, ev, Date.now(), 'en');
  assert.equal(CJK.test(enBlocked.why), false, enBlocked.why);
  assert.ok(/R\(t\)=0\.0/.test(enBlocked.why) && /40/.test(enBlocked.why), '数字必须原样保留：' + enBlocked.why);
  const none = valenceGate(SELF_GATE.rhythm, ev, Date.now(), 'zh');
  assert.ok(none, '门禁必须返回对象');
});

test('④ 参数拒绝理由：zh 保持原格式，en 不含中文（否则用户看不懂为什么被拒）', () => {
  const zh = normalizeRhythm({ foo: 1 }, null, 'zh');
  assert.deepEqual(zh.rejected, ['foo：不认识的项']);
  const en = normalizeRhythm({ foo: 1 }, null, 'en');
  assert.deepEqual(en.rejected, ['foo: unknown key']);
  assert.equal(CJK.test(en.rejected[0]), false, en.rejected[0]);
  // 越界也换语言
  const en2 = normalizeRhythm({ staleMinutes: 99999 }, null, 'en');
  assert.equal(CJK.test(String(en2.rejected[0])), false, String(en2.rejected[0]));
});

test('⑤ 负控：显式 locale 压过全局覆盖（与其它模块同一条纪律）', () => {
  setLocaleOverride('en');
  try {
    assert.equal(rhythmLine(SELF_GATE, 'zh'), G_SELF, '显式 zh 必须压过全局 en');
  } finally {
    setLocaleOverride('');
  }
});
