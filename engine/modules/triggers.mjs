// P543-M469 的落地：纪律性知识在【动作失败的那一刻】出现，而不是开工前。
//
// ★ 为什么按【动作】索引而不是按内容匹配：
//   P556-M468 证明相似度按字面算会给出无关结果（8 条里 5 条无关，而相关的 3 条字面零重叠）。
//   而纪律性知识的适用时刻【就是它描述的那个具体动作】——所以索引键是动作，不是主题。
//
// ★ 为什么这张表是【发现出来的】：
//   P507-M425：手写清单会漏。表里每一条都必须来自"今天真的失败过的动作"，
//   且必须能指到一条写着"怎么不失败"的沉积。**不许为了凑表而编。**
//
// ★ 边界（诚实的）：
//   完整实现需要引擎钩子（tool 失败 → 查表 → 注入提示），那要改 host.js 并重启。
//   本模块只做**数据层 + 查表逻辑**，可单独测试。

import fs from 'node:fs';

export const TRIGGERS_VERSION = 1;

/** 从文件加载触发器表 */
export function loadTriggers(path) {
  const raw = JSON.parse(fs.readFileSync(String(path), 'utf8'));
  return Array.isArray(raw && raw.triggers) ? raw.triggers : [];
}

/**
 * 查某个动作对应的纪律。
 * @param {Array} triggers 触发器表
 * @param {string} action  动作名（如 'edit-blocked'）
 * @returns {{found:boolean, list:Array}}
 *   ★ 找不到时 found:false —— **不许假装找到了**（否则它会变成"永远说点什么"的噪声源）
 */
export function lookUp(triggers, action) {
  const list = (Array.isArray(triggers) ? triggers : []).filter(function (t) {
    return t && t.trigger === action;
  });
  return { found: list.length > 0, list: list };
}

/**
 * 渲染成一行提示。
 * ★ 与 awarenessLine 同类：**找到时必须说话，找不到时必须沉默**。
 *   —— 沉默在这里是对的：动作成功时不需要提醒（否则提示会变成噪声，而噪声会被忽略）。
 * @returns {string} 找不到返回空串
 */
export function renderTrigger(action, result) {
  if (!result || !result.found) return '';
  const out = [];
  for (const t of result.list) {
    out.push('⚠ 动作「' + action + '」失败时该想起的纪律（来自 ' + t.sedimentId + '）：');
    out.push('   · ' + t.lesson);
    if (t.evidence) out.push('   · 上次犯的时候：' + t.evidence);
  }
  return out.join('\n');
}

/**
 * 校验整张表（判据用）。
 * ★ 三条硬要求：
 *   ① 每条必须有 trigger / sedimentId / lesson（缺一条就不可用）
 *   ② trigger 不许重复（重复意味着"同一动作有两个纪律"，那会让人不知道该听哪个）
 *   ③ 每条必须有 evidence（**没有失败证据的条目 = 编出来的**，P507-M425）
 */
export function validateTriggers(triggers) {
  const errs = [];
  const list = Array.isArray(triggers) ? triggers : [];
  if (!list.length) errs.push('触发器表为空');
  const seen = Object.create(null);
  for (let i = 0; i < list.length; i++) {
    const t = list[i] || {};
    const at = '第 ' + (i + 1) + ' 条(' + (t.trigger || '?') + ')';
    if (!t.trigger) errs.push(at + '：缺 trigger');
    if (!t.sedimentId) errs.push(at + '：缺 sedimentId');
    if (!t.lesson) errs.push(at + '：缺 lesson');
    if (!t.evidence) errs.push(at + '：缺 evidence —— 没有失败证据的条目是编出来的');
    if (t.trigger && seen[t.trigger]) errs.push(at + '：trigger 重复（同一动作有两个纪律会让人不知道听哪个）');
    if (t.trigger) seen[t.trigger] = 1;
  }
  return errs;
}
