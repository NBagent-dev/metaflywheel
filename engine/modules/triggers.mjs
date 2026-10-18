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

/**
 * 把工具返回（或宿主 result）里的文本拼出来。
 * ★ 只取 {type:'text'} 项——别把结构化字段塞进正则。
 * ★★ 而非文本项要【滤掉】不是填空串：函数名叫 collectText，就该"只收集文本"。
 *    （填 '' 再 join 会留下空行——那是"按位置对齐"，不是"收集"。两者对匹配都无害，
 *      但名字与行为不一致会让下一个人误判。判据 ⑨ 就是用它抓出这一点的。）
 */
export function collectText(result) {
  const c = result && result.content;
  if (!Array.isArray(c)) return '';
  return c
    .map(function (x) { return (x && typeof x.text === 'string') ? x.text : null; })
    .filter(function (x) { return x !== null; })
    .join('\n');
}

/**
 * ★工具失败 → 动作名。
 *
 * ★ 这里用正则匹配文本，**与 P556-M468 的"字面匹配不可靠"不冲突**：
 *   那条说的是"用字面相似去检索【相关沉积】"不可靠（语义相似度做不到）；
 *   而这里判断的是【这次调用是否失败】——**失败标记是结构化的**
 *   （`[exit code: N]` 是硬标记；`has not been read` / `不存在` 是固定短语），
 *   不是语义相似度。
 *
 * ★ 顺序很重要：先特判（edit-blocked / id-guess），再一般（path-guess），最后 exit code。
 *   因为一笔 edit 失败可能同时命中"not found"，而 edit-blocked 更精确。
 *
 * ★ 返回 null 表示"认不出" —— **绝不许硬套一个动作名**（否则会注入无关纪律）。
 */
export function failureToAction(toolName, text) {
  const t = String(text == null ? '' : text);
  const tn = String(toolName == null ? '' : toolName);

  // ① edit 被读守卫拒（P027-M17 那条纪律治的正是它）
  if (/has not been read|file has not been read/i.test(t)) return 'edit-blocked';

  // ② 猜了不存在的沉积 ID（引擎的拒绝语）
  if (/不存在的沉积 ID|已拒绝/.test(t) && /沉积/.test(t)) return 'id-guess';

  // ③ 猜了路径：读/找失败
  if (/not found|cannot read|does not exist|路径不存在|找不到.*文件/i.test(t)) return 'path-guess';

  // ④ shell 非零退出（★ 只认非零；0 是成功）
  //   ★ 而且【只有 shell 类工具】才认 —— 否则别的工具输出里偶然出现 "[exit code:" 字样就会误报
  //   （判断放在这里而不是调用方：本函数是"从工具输出推断动作"的拥有者，拆成两处会各自漏判）
  if (isShellTool(tn) && /\[exit code:\s*[1-9]\d*\]/i.test(t)) return 'pwsh-inline-fail';

  return null;
}

/** 只在"这个工具可能是 shell"时才认 exit code —— 防止 edit 返回里偶然出现 exit code 字样 */
export function isShellTool(toolName) {
  return /^(pwsh|bash|sh|shell|powershell|cmd)$/i.test(String(toolName == null ? '' : toolName));
}

