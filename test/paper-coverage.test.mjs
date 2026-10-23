// P607：论文-引擎双源一致性判据。
//
// 为什么需要它：P030-M20 第 4 步要求"论文正文与引擎注释双源一致，禁止引擎静默偏离论文
// 而不留痕"。但过去这条契约**没有任何判据**：章节数、双语组、引用纪律都能被 judge 住，
// 唯独"引擎改了 X，论文有没有记录 X"只能靠人偶然想起——今天就是想起来了才发现缺口。
//
// 设计（三条纪律）：
//   ① 双向：`documented` 项证据必须**在**正文里（缺=红）；`pending-author` 项证据必须**不在**
//      正文里（出现了=声明过期，也红）。后者才是文档最常见的腐烂形态：写了，但账本没更新。
//   ② 只报告不修改：本判据永不写 docs/theory*.md（论文主权在作者，P030-M20 第 5 步）。
//   ③ 中英两版**都要**检查：双语组已是既成事实，只查一版等于只守一半。
//
// 声明文件就是本文件里的 ENTRIES：加一条=承认一个"论文应记录但还没记录"的层，并把状态写明。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAPERS = {
  zh: path.join(ROOT, 'docs', 'theory.zh-CN.md'),
  en: path.join(ROOT, 'docs', 'theory.md')
};

// ── 覆盖声明（引擎里已存在、论文是否已记录的层） ────────────────────────────
// status: 'documented'（论文记录了，证据必须在）| 'pending-author'（尚未记录，证据必须不在）
// terms: 每一版各自的"应出现证据词"（任一词出现即算记录；中英用词天然不同，故分列）
const ENTRIES = [
  {
    id: 'render-locale-switch',
    status: 'pending-author',
    because: 'P603：账本不译、渲染层可切语言；运行时读 <root>/.mpm/locale，未知语言回落默认。',
    terms: {
      zh: ['语言切换', '可切换语言'],
      en: ['switchable language', 'i18n', 'locale']
    }
  },
  {
    id: 'frozen-output-golden',
    status: 'pending-author',
    because: 'P623/P627：快照等渲染面的"整份输出金标"（固定夹具+冻结时钟+数字归一化），半迁移只能靠它现形。',
    terms: {
      zh: ['金标'],
      en: ['golden']
    }
  }
];

// ── 纯函数：给定声明与两版正文，报出 missing / stale ──────────────────────
export function checkCoverage(entries, texts) {
  const missing = [];
  const stale = [];
  for (const e of entries) {
    const present = {
      zh: (e.terms.zh || []).some(function (k) { return texts.zh.indexOf(k) >= 0; }),
      en: (e.terms.en || []).some(function (k) { return texts.en.indexOf(k) >= 0; })
    };
    const any = present.zh || present.en;
    const all = present.zh && present.en;
    if (e.status === 'documented' && !all) {
      missing.push({ id: e.id, missingIn: ['zh', 'en'].filter(function (k) { return !present[k]; }) });
    }
    if (e.status === 'pending-author' && any) {
      stale.push({ id: e.id, foundIn: ['zh', 'en'].filter(function (k) { return present[k]; }) });
    }
  }
  return { missing: missing, stale: stale };
}

const read = function (p) { return fs.readFileSync(p, 'utf8'); };
const TEXTS = { zh: read(PAPERS.zh), en: read(PAPERS.en) };

test('① 声明与论文现状一致：documented 项都在，pending 项都还不在', () => {
  const r = checkCoverage(ENTRIES, TEXTS);
  assert.deepEqual(r.missing, [],
    '这些层已在论文里声明为"已记录"却找不到证据：' + JSON.stringify(r.missing));
  assert.deepEqual(r.stale, [],
    '这些层的状态写着"尚未记录"，但论文里已经出现了证据 ⇒ 请把 status 改成 documented：'
    + JSON.stringify(r.stale));
});

test('② 缺口清单（只打印，不失败）：当前引擎领先论文的层', () => {
  const pending = ENTRIES.filter(function (e) { return e.status === 'pending-author'; });
  console.log('    论文尚未记录的引擎层：' + pending.length + ' 条');
  for (const e of pending) console.log('      · ' + e.id + ' —— ' + e.because);
  assert.ok(true);
});

test('③ 负控：documented 项缺证据 ⇒ 必须报 missing（说明 ① 不是恒真）', () => {
  const r = checkCoverage(
    [{ id: 'x', status: 'documented', terms: { zh: ['语言切换'], en: ['i18n'] } }],
    { zh: '这篇论文什么都没写', en: 'this paper says nothing' }
  );
  assert.equal(r.missing.length, 1);
  assert.deepEqual(r.missing[0].missingIn, ['zh', 'en']);
});

test('④ 负控：pending 项出现了证据 ⇒ 必须报 stale（抓文档腐烂而非只抓缺口）', () => {
  const r = checkCoverage(
    [{ id: 'y', status: 'pending-author', terms: { zh: ['金标'], en: ['golden'] } }],
    { zh: '我们引入了金标', en: 'we introduced a golden test' }
  );
  assert.equal(r.stale.length, 1);
  assert.deepEqual(r.stale[0].foundIn, ['zh', 'en']);
});

test('⑤ 单版命中不算记录：只中文有、英文没有 ⇒ documented 仍报警', () => {
  const r = checkCoverage(
    [{ id: 'z', status: 'documented', terms: { zh: ['语言切换'], en: ['i18n'] } }],
    { zh: '这里写了语言切换', en: 'nothing here' }
  );
  assert.deepEqual(r.missing, [{ id: 'z', missingIn: ['en'] }]);
});
