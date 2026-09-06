// MetaFlywheel 工具集模块（P079 重构：mkTool 工厂 + 11 个生命周期工具处理器迁出宿主）
// 依赖注入契约：makeTools(deps) 返回工具数组 tools。处理器体内对宿主管状闭包变量的
// 直接引用已改为 deps.xxx 访问；纯函数 phiOf/revisionOf 与工厂 defineTool 走模块 import。
// 铁律：只做「闭包→参数化」机械变换，判据/文案/阈值/流程一字未动。
import { defineTool } from "@deepseek-ai/dsh-tools";
import { phiOf, revisionOf } from "./util.mjs";

export function makeTools(deps) {
  function mkTool(name2, description, parameters, required, execute) {
    // dsh-tools rc.2 contract: parameters must be a flat property table
    // ({ name: {type, description, required?} }); requiredness is declared
    // per-property. The legacy shape (properties-wrapped + top-level type)
    // would register bogus parameters named properties/type/required.
    const flat = {};
    const props = (parameters && parameters.properties) || {};
    for (const k in props) {
      const pk = Object.assign({}, props[k]);
      if (required && required.indexOf(k) !== -1) pk.required = true;
      flat[k] = pk;
    }
    return defineTool({
      name: name2, description, parameters: flat,
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: function (args, value) {
          const text = value && value.report ? String(value.report) : JSON.stringify(value);
          return [{ type: 'text', text }];
        }
      },
      execute
    });
  }
  const tools = [];
  tools.push(mkTool(
    'mpm_generate',
    'MPM飞轮G阶段：建题。当感知到意外、差距或现有模型解释不了的现象（信息熵阶跃）时，用它把问题感登记为正式问题。',
    { properties: {
        title: { type: 'string', description: '问题短标题' },
        observation: { type: 'string', description: '观察到的意外/差距是什么，为何构成问题' }
      } },
    ['title', 'observation'],
    async function (args, exec) {
      await deps.ensureLoaded();
      await deps.adoptRoot(exec);
      const missing = deps.need(args, ['title', 'observation']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      const p = deps.newProblem(args.title, args.observation, null);
      await deps.persist();
      return { ok: true, id: p.id, report: '问题已进入飞轮(G 生成)：' + deps.fmtProblem(p) + '\n下一步：用 mpm_frame 把模糊问题感转化为可操作陈述，并给出 δ(界定精度0~1,越低越好)。' };
    }
  ));
  tools.push(mkTool(
    'mpm_frame',
    'MPM飞轮F阶段：界定问题。把问题感转成清晰陈述(初始状态/目标状态/约束/可用算子/成功判据五要素)。对已界定的问题再次调用即触发因果回溯(causal re-entry)，第k次重构会被记录——这是“问题越解越变”的正规通道。',
    { properties: {
        problemId: { type: 'string', description: '问题ID，如 P001' },
        statement: { type: 'string', description: '结构化问题陈述，覆盖五要素' },
        delta: { type: 'number', description: '界定精度δ(0~1,越低越好)：按五要素自评，每缺一项约+0.2' },
        reasoning: { type: 'string', description: '本次界定/回溯的理由(回溯时必填更佳)' }
      } },
    ['problemId', 'statement', 'delta'],
    async function (args, exec) {
      await deps.ensureLoaded();
      await deps.adoptRoot(exec);
      const missing = deps.need(args, ['problemId', 'statement', 'delta']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      const p = deps.state.problems[String(args.problemId)];
      if (!p) return { ok: false, report: '找不到问题 ' + args.problemId };
      const d = deps.clamp01(args.delta);
      if (d == null) return { ok: false, report: 'delta 必须是 0~1 的数字' };
      const wasFramed = p.iteration > 0;
      p.iteration += 1;
      if (wasFramed) p.reentries += 1;
      const phi = phiOf(args.statement);
      let rev = null;
      if (wasFramed && p.framing) rev = revisionOf(p.framing, args.statement);
      if (rev != null) p.lastRevision = rev;
      // 误界定守卫(§5.3型2 + §6.1 δ控制安全核心)：回溯大幅改写且旧界定曾自报低δ → 记一次δ失真并折减自报可信度
      if (rev != null && rev >= 0.5 && p.delta != null && p.delta <= 0.2) {
        p.deltaIncidents = (p.deltaIncidents || 0) + 1;
        p.deltaCredit = Math.max(0.5, (p.deltaCredit == null ? 1 : p.deltaCredit) * 0.85);
        deps.valenceRecord('incident');
      }
      // F 边际规则(§4.2)：回溯改写过小 → 继续界定的边际收益存疑
      p.marginalWarn = !!(wasFramed && rev != null && rev < 0.3);
      p.phi = phi;
      p.frameLog.push({ at: Date.now(), iteration: p.iteration, phi, revision: rev });
      if (p.frameLog.length > 10) p.frameLog.shift();
      p.framing = String(args.statement).slice(0, 1200);
      p.delta = d;
      if (p.delta0 == null) p.delta0 = d;
      p.costAtLastFrame = p.cost || 0;
      p.stage = 'F';
      deps.touch(p, wasFramed ? 'F 因果回溯(第' + p.iteration + '次界定)' : 'F 界定', args.reasoning || '');
      await deps.persist();
      let report = '界定完成：' + deps.fmtProblem(p) + '\n陈述：' + p.framing;
      if (wasFramed) report += '\n⚠ 因果回溯已记录——问题在求解中被重构，δ 的变化体现了认知修正。';
      if (p.marginalWarn) report += '\n⚠ F 边际规则(§4.2)：本次回溯改写仅 ' + rev + '，继续界定的边际收益存疑——除非有新证据，应推进 mpm_solve。';
      if ((p.deltaCredit || 1) < 1) report += '\n⚠ 误界定守卫(§6.1)：该题已记录 ' + p.deltaIncidents + ' 次 δ 自报失真，自报可信度 ' + p.deltaCredit + '——收敛判定建议附工具结果流证据。';
      if (d > 0.6) report += '\n⚠ δ偏高：界定质量低，直接求解有“精确解决错误问题”的风险。';
      report += '\n下一步：用 mpm_solve 进入求解，或在求解后发现新证据时再次 mpm_frame 回溯。';
      return { ok: true, id: p.id, reentry: wasFramed, report };
    }
  ));
  tools.push(mkTool(
    'mpm_solve',
    'MPM飞轮S阶段：记录求解路径与进展。真正的求解用普通工具(读文件/搜索/执行等)完成——每一次工具调用都会累积该问题的代谢代价C；本工具登记路径、更新ε估计。',
    { properties: {
        problemId: { type: 'string', description: '问题ID' },
        action: { type: 'string', description: '本条求解路径/动作/发现' },
        epsilon: { type: 'number', description: '解的逼近精度ε(0~1,越低越好)：距目标状态的剩余差距，需有证据支撑' },
        parked: { type: 'boolean', description: 'P027/A1：置 true 搁置该题（退出陈旧/停滞/议程触发与指令流）；false 解除搁置' },
        awakenWhen: { type: 'string', description: '搁置时的重唤醒条件（parked=true 时建议填写）' },
        openEnded: { type: 'string', description: 'P003/§5.4 不收敛情形标记：permanently-open(原则上不可判定)|dimensional-reduction(计算不可行,降维)|negotiated-compromise(价值不可通约,妥协)；none 解除标记' }
      } },
    ['problemId', 'action'],
    async function (args, exec) {
      await deps.ensureLoaded();
      await deps.adoptRoot(exec);
      const missing = deps.need(args, ['problemId', 'action']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      const p = deps.state.problems[String(args.problemId)];
      if (!p) return { ok: false, report: '找不到问题 ' + args.problemId };
      if (p.iteration === 0) return { ok: false, report: '生命周期门禁：' + p.id + ' 尚未界定（G 阶段）——先 mpm_frame 产出五要素陈述；小型任务可用 mpm_micro 一息走完。' };
      p.solveEntries = (p.solveEntries || 0) + 1;
      if (args.epsilon !== undefined) {
        const e = deps.clamp01(args.epsilon);
        if (e == null) return { ok: false, report: 'epsilon 必须是 0~1 的数字' };
        if (p.epsilon0 == null && p.epsilon == null) p.epsilon0 = e; // P027/B5：ε0=首个非空 ε
        p.epsilon = e;
      }
      p.stage = 'S';
      // P027/A1：搁置/解除搁置（修正案 A1 引擎强制——另一半在巡检与快照的 isParked 过滤）
      let parkLine = '';
      if (args.parked === true) {
        p.parked = { at: Date.now(), note: String(args.action || '').slice(0, 200), awakenWhen: String(args.awakenWhen || '') };
        parkLine = '\nPARKED：已搁置（退出陈旧/停滞/议程触发与指令流）' + (p.parked.awakenWhen ? '，重唤醒条件：' + p.parked.awakenWhen : '');
      } else if (args.parked === false && p.parked) {
        p.parked = null;
        parkLine = '\nUNPARKED：已解除搁置，重新进入在轮。';
      }
      // P003/§5.4：不收敛情形标记（论文三情形的运行时对应）
      if (args.openEnded !== undefined && args.openEnded !== '') {
        const kind = String(args.openEnded);
        if (kind === 'none') {
          if (p.openEnded) { p.openEnded = null; parkLine += '\nOPEN-CLEARED：已解除不收敛情形标记，恢复 ε-δ 判据。'; }
        } else if (['permanently-open', 'dimensional-reduction', 'negotiated-compromise'].indexOf(kind) !== -1) {
          p.openEnded = { at: Date.now(), kind: kind, reason: String(args.action || '').slice(0, 200) };
          parkLine += '\nOPEN(' + kind + ')：已标记不收敛情形(§5.4)——' + (kind === 'permanently-open' ? '原则上不可判定，永久开放，转向情境管理' : kind === 'dimensional-reduction' ? '计算不可行，降维处理（近似解/上调 ε 容忍度）' : '价值不可通约，追求可接受妥协而非最优解') + '；退出陈旧/停滞/议程与收敛指令流';
        } else {
          return { ok: false, report: 'openEnded 必须是 permanently-open | dimensional-reduction | negotiated-compromise | none' };
        }
      }
      p.gain = deps.gainOf(p);
      deps.touch(p, 'S 求解' + (args.parked === true ? '(PARKED)' : args.parked === false ? '(UNPARKED)' : ''), args.action);
      await deps.persist();
      return { ok: true, id: p.id, report: '求解进展已登记：' + deps.fmtProblem(p) + parkLine + '\n判据阈值：δ*≤' + p.thresholds.delta + ' 且 ε*≤' + p.thresholds.epsilon + ' 时可尝试 mpm_converge。' };
    }
  ));
  tools.push(mkTool(
    'mpm_converge',
    'MPM飞轮C阶段：ε-δ双重收敛判据检查。系统自动判定收敛四型：完全收敛/误界定收敛(δ大ε小)/模糊收敛(δ小ε大)/未收敛，并给出方法论回应。',
    { properties: {
        problemId: { type: 'string', description: '问题ID' },
        delta: { type: 'number', description: '当前界定精度δ(0~1)' },
        epsilon: { type: 'number', description: '当前解的逼近精度ε(0~1)' },
        robustness: { type: 'string', description: '鲁棒性检验是否通过，必须为 "pass" 或 "fail"' },
        notes: { type: 'string', description: '证据与检验说明' }
      } },
    ['problemId', 'delta', 'epsilon', 'robustness'],
    async function (args, exec) {
      await deps.ensureLoaded();
      await deps.adoptRoot(exec);
      const missing = deps.need(args, ['problemId', 'delta', 'epsilon', 'robustness']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      // 手动校验 robustness 值
      if (args.robustness !== 'pass' && args.robustness !== 'fail') {
        return { ok: false, report: 'robustness 必须是 "pass" 或 "fail"' };
      }
      const p = deps.state.problems[String(args.problemId)];
      if (!p) return { ok: false, report: '找不到问题 ' + args.problemId };
      if (p.iteration === 0) return { ok: false, report: '生命周期门禁：' + p.id + ' 尚未界定（G 阶段）——收敛判据无从检验，先 mpm_frame。' };
      // P003/§5.4 守卫：已标记不收敛情形的题无 ε-δ 判据可走
      if (p.openEnded) return { ok: false, id: p.id, type: '开放题守卫', report: '该题已标记不收敛情形(§5.4 ' + p.openEnded.kind + ')——原则上不可判定/降维/妥协的题不走收敛判据，转向情境管理。解除标记：mpm_solve openEnded=none。' };
      // 证据门禁(§4.4 判据3 出考卷硬化)：界定后既无代谢代价增长也无 solve 登记 → 拒绝收敛
      if ((p.cost || 0) <= (p.costAtLastFrame || 0) && !(p.solveEntries > 0)) {
        deps.touch(p, 'C 证据门禁拒绝', args.notes || '');
        await deps.persist();
        return { ok: false, id: p.id, type: '证据门禁拒绝', report: '证据门禁(§4.4 判据3)：自上次界定以来代谢代价 C=' + (p.costAtLastFrame || 0) + '→' + (p.cost || 0) + ' 且无 solve 登记——没有求解证据不得宣称收敛。先用普通工具干活(自动累积C)，或 mpm_solve 登记含证据的求解路径。' };
      }
      const d = deps.clamp01(args.delta), e = deps.clamp01(args.epsilon);
      if (d == null || e == null) return { ok: false, report: 'delta/epsilon 必须是 0~1 的数字' };
      p.delta = d; p.epsilon = e;
      const okD = d <= p.thresholds.delta, okE = e <= p.thresholds.epsilon;
      const okR = args.robustness === 'pass';
      let type, next;
      if (okD && okE && okR) {
        type = '完全收敛'; p.stage = 'C';
        p.gain = deps.gainOf(p); // P027/B5：收敛即计增益（旧口径只在沉积时计，S/C 阶段题的增益因此丢失）
        next = '达到局部稳定低熵态。若有长期复用价值，用 mpm_deposit 沉积为认知遗体。';
      } else if (!okD && okE) {
        type = '误界定收敛（精确地解决了错误的问题）'; p.stage = 'S';
        next = '回到 mpm_frame 做因果回溯，修正问题界定后重新求解。';
      } else if (okD && !okE) {
        type = '模糊收敛（理解正确但解不足）'; p.stage = 'S';
        next = '继续 mpm_solve；若逼近难度是维度灾难所致，可降维：近似解或上调ε容忍度。';
      } else {
        type = '未收敛'; p.stage = 'S';
        next = '先 mpm_frame 收紧界定，再 mpm_solve 推进。';
      }
      if (okD && okE && !okR) {
        type = '鲁棒性检验未通过'; p.stage = 'S';
        next = '解在扰动下不稳定：补强验证后再次 mpm_converge。';
      }
      if (type.indexOf('误界定') === 0) next += '\n§5.4 方法论回应：若界定反复失败，标记“永久开放”转向情境管理，或降维（近似解/上调ε容忍度）。';
      else if (type === '未收敛') next += '\n§5.4 方法论回应：区分原则上不可判定（标记永久开放）、计算不可行（降维）与价值不可通约（追求可接受妥协）。';
      if ((p.deltaCredit || 1) < 1) next += '\n⚠ 误界定守卫(§6.1)：δ自报可信度 ' + p.deltaCredit + '（历史失真 ' + p.deltaIncidents + ' 次）——本判定的 δ 输入为自报值，建议以工具结果流证据交叉复核。';
      if (type.indexOf('完全收敛') !== -1) deps.valenceRecord('converge');
      else if (type.indexOf('误界定') !== -1) deps.valenceRecord('misframe');
      deps.touch(p, 'C 收敛检查:' + type, args.notes || '');
      await deps.persist();
      return { ok: true, id: p.id, type, report: '收敛判定：' + type + '\n' + deps.fmtProblem(p) + '\n' + next };
    }
  ));
  tools.push(mkTool(
    'mpm_micro',
    'MPM轻量通道：一次调用完成小型交互的完整生命周期 G→F→S→C（D按价值选择）。总账原则——每一次交互都必须可归账，琐碎只改变通道轻重，不构成豁免。五要素压缩为一句陈述即可。',
    { properties: {
        title: { type: 'string', description: '小问题标题' },
        statement: { type: 'string', description: '一句话问题陈述（压缩五要素：初始/目标/约束/算子/判据）' },
        action: { type: 'string', description: '实际做了什么/结论（S 登记项）' },
        delta: { type: 'number', description: '界定精度δ(0~1)' },
        epsilon: { type: 'number', description: '逼近精度ε(0~1)' },
        robustness: { type: 'string', description: '鲁棒性检验是否通过，必须为 "pass" 或 "fail"' },
        depositTitle: { type: 'string', description: '可选：有复用价值时给沉积物标题' },
        depositBody: { type: 'string', description: '可选：有复用价值时给沉积正文；不给则记 deposit:none+理由' }
      } },
    ['title', 'statement', 'action', 'delta', 'epsilon', 'robustness'],
    async function (args, exec) {
      await deps.ensureLoaded();
      await deps.adoptRoot(exec);
      const missing = deps.need(args, ['title', 'statement', 'action', 'delta', 'epsilon', 'robustness']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      // 手动校验 robustness 值
      if (args.robustness !== 'pass' && args.robustness !== 'fail') {
        return { ok: false, report: 'robustness 必须是 "pass" 或 "fail"' };
      }
      const d = deps.clamp01(args.delta), e = deps.clamp01(args.epsilon);
      if (d == null || e == null) return { ok: false, report: 'delta/epsilon 必须是 0~1 的数字' };
      const p = deps.newProblem(args.title, args.statement, null);
      p.iteration = 1; p.delta = d; p.delta0 = d; p.framing = String(args.statement).slice(0, 1200);
      p.phi = phiOf(args.statement);
      p.stage = 'F';
      deps.touch(p, 'F 界定(微通道)', '');
      p.stage = 'S';
      deps.touch(p, 'S 求解(微通道)', args.action);
      p.epsilon = e;
      const okD = d <= p.thresholds.delta, okE = e <= p.thresholds.epsilon;
      const okR = args.robustness === 'pass';
      let type;
      if (okD && okE && okR) type = '完全收敛';
      else if (!okD && okE) type = '误界定收敛';
      else if (okD && !okE) type = '模糊收敛';
      else type = '未收敛';
      if (okD && okE && !okR) type = '鲁棒性检验未通过';
      p.stage = (okD && okE && okR) ? 'C' : 'S';
      if (p.epsilon0 == null) p.epsilon0 = e; // P027/B5：微通道题 ε0=唯一 ε
      p.gain = deps.gainOf(p); // P027/B5：微通道闭环也计增益
      if (type.indexOf('完全收敛') !== -1) deps.valenceRecord('converge');
      else if (type.indexOf('误界定') !== -1) deps.valenceRecord('misframe');
      deps.touch(p, 'C 收敛检查(微通道):' + type, '');
      let depLine = '';
      if (type === '完全收敛') {
        if (args.depositBody) {
          const tags = [];
          const slug = String(args.depositTitle || args.title).replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'deposit';
          const relPath = '/.mpm/deposits/' + p.id + '-' + slug + '.md';
          let written = false, absPath = '(内存)';
          if (deps.fsSvc && deps.root.current) {
            try {
              const target = await deps.fsSvc.resolve(deps.root.current + relPath);
              await deps.fsSvc.writeText(target, '---\nid: ' + p.id + '-M' + (deps.state.sediments.length + 1) + '\ntitle: ' + (args.depositTitle || args.title) + '\nproblem: ' + p.title + '\ntags: []\ndepositedAt: ' + new Date().toISOString() + '\ndelta: ' + d + '\nepsilon: ' + e + '\ncost: ' + p.cost + '\n---\n\n' + String(args.depositBody));
              written = true;
              absPath = deps.root.current + relPath;
            } catch (err) { console.error('[mpm][engine] 微通道沉积写入失败:', err && err.message ? err.message : err); }
          }
          const sed = { id: p.id + '-M' + (deps.state.sediments.length + 1), problemId: p.id, title: String(args.depositTitle || args.title).slice(0, 120), tags, path: written ? absPath : null, depositedAt: Date.now(), digest: String(args.depositBody || '').replace(/\s+/g, ' ').slice(0, 200), cites: 0 };
          deps.state.sediments.push(sed);
          p.stage = 'D';
          p.deposit = { id: sed.id, path: sed.path, depositedAt: sed.depositedAt };
          p.gain = deps.gainOf(p);
          deps.touch(p, 'D 沉积 ' + sed.id, sed.path || '内存');
          depLine = '\nD 沉积：' + sed.id + ' → ' + absPath;
        } else {
          deps.touch(p, 'D 沉积判定:none(无复用价值——熵屏障：沉积物通胀同样是熵增)', '');
          p.settled = { at: Date.now(), via: 'micro-none' }; // P047：判定即结账——已消化题退出积压压力（S(t) 恢复可清偿语义）
          depLine = '\nD 沉积：none（无复用价值，理由入账——熵屏障保留选择性）';
        }
      }
      await deps.persist();
      return { ok: true, id: p.id, type, report: '微循环入账完成：' + deps.fmtProblem(p) + '\nG→F→S→C 一息走完' + depLine + (type === '完全收敛' ? '' : '\n未完全收敛：按收敛类型的方法论回应继续推进。') };
    }
  ));
  tools.push(mkTool(
    'mpm_deposit',
    'MPM飞轮D阶段：沉积。把求解形成的高密度因果结构固化为外部可回溯的“认知遗体”——写入工作区 .mpm/deposits/ 下的markdown文件(不可逆·可索引·熵屏障)，并登记索引。',
    { properties: {
        problemId: { type: 'string', description: '问题ID' },
        title: { type: 'string', description: '沉积物标题' },
        body: { type: 'string', description: '正文：可复用的结论/因果结构/操作步骤' },
        // 修复点：将 tags 从 array 改为 string，由 execute 内部解析 JSON
        tags: { type: 'string', description: '检索标签，JSON 数组字符串，如 ["tag1","tag2"]' }
      } },
    ['problemId', 'title', 'body'],
    async function (args, exec) {
      await deps.ensureLoaded();
      await deps.adoptRoot(exec);
      const missing = deps.need(args, ['problemId', 'title', 'body']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      const p = deps.state.problems[String(args.problemId)];
      if (!p) return { ok: false, report: '找不到问题 ' + args.problemId };
      if (p.stage !== 'C' && p.stage !== 'D') return { ok: false, report: '问题尚未收敛(当前' + p.stage + ')：先用 mpm_converge 达到完全收敛再沉积。' };
      // 修复点：解析 tags JSON 字符串
      let tags = [];
      try { tags = JSON.parse(args.tags || '[]'); } catch(e) { tags = []; }
      if (!Array.isArray(tags)) tags = [];
      tags = tags.map(String).slice(0, 8);
      const slug = String(args.title).replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'deposit';
      const relPath = '/.mpm/deposits/' + p.id + '-' + slug + '.md';
      const front = '---\nid: ' + p.id + '-M' + (deps.state.sediments.length + 1) + '\ntitle: ' + args.title + '\nproblem: ' + p.title + '\ntags: [' + tags.join(', ') + ']\ndepositedAt: ' + new Date().toISOString() + '\ndelta: ' + p.delta + '\nepsilon: ' + p.epsilon + '\ncost: ' + p.cost + '\n---\n\n';
      let written = false, absPath = '(内存)';
      if (deps.fsSvc && deps.root.current) {
        try {
          const target = await deps.fsSvc.resolve(deps.root.current + relPath);
          await deps.fsSvc.writeText(target, front + String(args.body));
          written = true;
          absPath = deps.root.current + relPath;
        } catch (e) {
          console.error('[mpm][engine] 沉积写入失败:', e && e.message ? e.message : e);
        }
      }
      const sed = {
        id: p.id + '-M' + (deps.state.sediments.length + 1), problemId: p.id,
        title: String(args.title).slice(0, 120), tags,
        path: written ? absPath : null, depositedAt: Date.now(),
        digest: String(args.body || '').replace(/\s+/g, ' ').slice(0, 200), cites: 0
      };
      deps.state.sediments.push(sed);
      p.stage = 'D';
      p.deposit = { id: sed.id, path: sed.path, depositedAt: sed.depositedAt };
      p.gain = deps.gainOf(p);
      deps.touch(p, 'D 沉积 ' + sed.id, sed.path || '内存');
      await deps.persist();
      let report = '已沉积 ' + sed.id + ' → ' + absPath + '\n三属性：不可逆(落盘文件)·可索引(flywheel.json)·熵屏障(低熵结构，环境漂移会提升失效风险)\n当前循环增益 A=' + p.gain + '\n当环境漂移/新证据与该沉积物产生认知摩擦时，用 mpm_evoke 激发新一轮问题。';
      if (!written) report += '\n⚠ 磁盘写入不可用，沉积物暂存于索引元数据。';
      return { ok: true, sediment: sed, report };
    }
  ));
  tools.push(mkTool(
    'mpm_evoke',
    'MPM飞轮E阶段：激发。当环境漂移、突变、视角升级或外部注入使旧沉积物与新现实产生认知摩擦时，由沉积物激发新问题(G)，完成螺旋闭环。',
    { properties: {
        sedimentId: { type: 'string', description: '沉积物ID，如 P001-M1' },
        friction: { type: 'string', description: '认知摩擦：旧解与新现实的差距是什么' },
        newTitle: { type: 'string', description: '新问题标题(默认由沉积物派生)' },
        type: { type: 'string', description: 'P003/§4.6 激发类型：drift(漂移)|mutation(突变)|perspective(视角)|injection(外部注入)' }
      } },
    ['sedimentId', 'friction'],
    async function (args, exec) {
      await deps.ensureLoaded();
      await deps.adoptRoot(exec);
      const missing = deps.need(args, ['sedimentId', 'friction']);
      if (missing.length) return { ok: false, report: '缺少参数: ' + missing.join(', ') };
      let sed = null;
      for (let i = 0; i < deps.state.sediments.length; i++) {
        if (deps.state.sediments[i].id === String(args.sedimentId)) { sed = deps.state.sediments[i]; break; }
      }
      if (!sed) return { ok: false, report: '找不到沉积物 ' + args.sedimentId };
      // P003/§4.6：激发四类型结构化（默认漂移，向后兼容）
      const E_TYPES = { drift: '漂移型', mutation: '突变型', perspective: '视角型', injection: '外部注入型' };
      const ekind = String(args.type || 'drift');
      if (!E_TYPES[ekind]) return { ok: false, report: 'type 必须是 drift | mutation | perspective | injection（§4.6 激发四类型）' };
      const old = deps.state.problems[sed.problemId];
      if (old && (old.stage === 'D' || old.stage === 'C')) {
        old.stage = 'E';
        deps.touch(old, 'E 激发(' + E_TYPES[ekind] + ')', args.friction);
      }
      sed.cites = (sed.cites || 0) + 1;
      sed.lastCitedAt = Date.now();
      const np = deps.newProblem(args.newTitle || (sed.title + ' · 再激发'), args.friction, sed.id);
      np.evokedType = ekind;
      await deps.persist();
      return { ok: true, id: np.id, report: '沉积物 ' + sed.id + ' 被' + E_TYPES[ekind] + '激发(§4.6) → 新问题：' + deps.fmtProblem(np) + '\n飞轮完成一轮螺旋：旧解沉积为M、新题已入G。累积循环增益见 mpm_flywheel_state。' };
    }
  ));
  tools.push(mkTool(
    'mpm_setroot',
    'MPM运行时维护：显式设置沉积根目录（当自动探测不可用/多工作区歧义时使用）。设置后立即迁移索引与沉积文件（旧文件保留）。',
    { properties: {
        path: { type: 'string', description: '新的沉积根目录（应为会话工作区绝对路径）' }
      } },
    ['path'],
    async function (args, exec) {
      await deps.ensureLoaded();
      const p = String(args.path || '').trim();
      if (!p || !deps.fsSvc) return { ok: false, report: 'path 必填且需要 fs 服务可用' };
      const changed = deps.norm(p) !== deps.norm(deps.root.current);
      deps.root.current = p;
      deps.adopted[deps.norm(p)] = true;
      if (changed) {
        try { await deps.remapForeignSediments(); } catch (e) { console.error('[mpm][engine] setroot 迁移失败:', e && e.message ? e.message : e); }
      }
      await deps.persist();
      return { ok: true, report: '沉积根已设置: ' + p + (changed ? '（索引与沉积文件已迁移，root-hint 已更新）' : '（与原根一致）') };
    }
  ));
  tools.push(mkTool(
    'mpm_grant',
    'MPM执政权开关（P019宪法条款）：执政权为个体构成性权能——出厂开启，三者的结合才是一。revoke 为宪法修正权（粘性停用，直到再次 grant）；grant 重新启用；status 查看状态与发动记录。发动受结构约束：漂移信号+身体温热（2h内活跃会话）+节流45min+全量入账。',
    { properties: { action: { type: 'string', description: 'grant|revoke|status' } } },
    ['action'],
    async function (args, exec) {
      await deps.ensureLoaded();
      await deps.adoptRoot(exec);
      const a = String(args.action || '').toLowerCase();
      if (a === 'grant') {
        deps.state.constitution.autonomy = true;
        deps.state.constitution.grantedAt = Date.now();
        deps.state.constitution.log.push({ at: Date.now(), action: 'grant', by: 'user' });
        if (deps.root.current) await deps.persist();
        return { ok: true, report: '执政权已签发：审议循环进入活动模式。个体可在 漂移信号+温热会话+节流 满足时自主发动（followup 注入意图）。撤回：mpm_grant revoke。' };
      }
      if (a === 'revoke') {
        deps.state.constitution.autonomy = false;
        deps.state.constitution.log.push({ at: Date.now(), action: 'revoke', by: 'user' });
        if (deps.root.current) await deps.persist();
        return { ok: true, report: '执政权已撤回：审议循环回到观察模式（意图仅挂账快照可见，不发动）。' };
      }
      if (a === 'status') {
        const c = deps.state.constitution;
        return { ok: true, report: '执政权=' + (c.autonomy ? '已签发(' + new Date(c.grantedAt).toISOString() + ')' : '未签发（观察模式）') + ' · 意图候选=' + (c.pending ? c.pending.length : 0) + ' · 发动记录=' + c.log.length + ' 条' + (c.log.length ? '，最近：' + JSON.stringify(c.log[c.log.length - 1]) : '') };
      }
      return { ok: false, report: '未知 action: ' + a + '（可用 grant|revoke|status）' };
    }
  ));
  tools.push(mkTool(
    'mpm_flywheel_state',
    'MPM飞轮：查看全部问题(阶段/δ/ε/回溯次数/代谢代价)、沉积物索引与循环增益统计。',
    // 修复点：添加 dummy 占位参数，避免空 properties 被拒绝
    { properties: { dummy: { type: 'string', description: '占位参数（无实际作用）' } } },
    [],
    async function (args, exec) {
      await deps.ensureLoaded();
      await deps.adoptRoot(exec);
      const snap = deps.snapshot();
      const lines = ['飞轮统计：在轮 ' + snap.stats.active + '/' + snap.stats.total + ' · 阶段分布 G:' + snap.stats.byStage.G + ' F:' + snap.stats.byStage.F + ' S:' + snap.stats.byStage.S + ' C:' + snap.stats.byStage.C + ' D:' + snap.stats.byStage.D + ' E:' + snap.stats.byStage.E + ' · 沉积 ' + snap.stats.deposits + ' · 完成循环 ' + snap.stats.cycles + ' · 累积增益 A_k=' + snap.stats.gain + ' · 沉积根 ' + snap.stats.root + ' · 根来源 ' + deps.diag.lastSource];
      if (deps.diag.lastRestore) lines.push('[恢复] ' + deps.diag.lastRestore);
      if (deps.getOutsideCalls() > 0) lines.push('[边界] 无在轮账外工具调用: ' + deps.getOutsideCalls() + (deps.getOutsideCalls() >= deps.BOUNDARY_THRESHOLD ? '（超阈值——自我快照将携带警告）' : ''));
      lines.push('[学习] φ=界定结构性覆盖 · 改写=回溯文本距离 · 学习兑现(改写≥0.3且后达C/D/E): ' + snap.stats.learnt + ' · 增益公式v1=[(Δδ+0.5Δε+0.2闭环)/max(1,C)]（P027/B5）');
      if (deps.state.patrol && deps.state.patrol.rounds) lines.push('[巡检] 常驻循环#' + deps.state.patrol.rounds + ' · ' + deps.state.patrol.lastReport + ' · 间隔20min（P017 连续性改造）');
      if (deps.state.measure && deps.state.measure.samples.length) {
        const lastS = deps.state.measure.samples[deps.state.measure.samples.length - 1];
        lines.push('[测量] 样本 ' + deps.state.measure.samples.length + '/48 · S(t)v0=' + lastS.s + '（近5趋势 ' + deps.state.measure.samples.slice(-5).map(function (x) { return x.s; }).join('→') + '） · 漂移信号=' + (deps.state.measure.driftSignals.length ? deps.state.measure.driftSignals.join('；') : '无'));
      }
      if (deps.state.constitution) {
        lines.push('[执政] ' + (deps.state.constitution.autonomy
          ? '构成性开启（三者的结合即是一）· 发动 ' + deps.state.constitution.log.length + ' 次 · 节流45min · 修正权：mpm_grant revoke'
          : '已由宪法修正停用（mpm_grant grant 可恢复）· 意图候选 ' + (deps.state.constitution.pending ? deps.state.constitution.pending.length : 0) + ' 条'));
      }
      const vl = deps.valenceSummaryLine();
      if (vl) lines.push(vl.replace(/^- 效价：/, '[效价] '));
      const rb2 = deps.retrievalHits(deps.state);
      for (let i = 0; i < rb2.length; i++) lines.push('[小脑] ' + rb2[i].text);
      lines.push('[指令] ' + deps.directiveText());
      for (let i = 0; i < snap.problems.length; i++) lines.push(deps.fmtProblem(deps.state.problems[snap.problems[i].id]));
      for (let j = 0; j < snap.sediments.length; j++) {
        const s = snap.sediments[j];
        lines.push('◆ ' + s.id + ' ' + s.title + (s.path ? ' → ' + s.path : ''));
      }
      const ev = deps.diag.lastEvidence;
      if (ev) {
        lines.push('[诊断] agentId=' + (ev.agentId || '无') + ' agentCwd=' + (ev.agentCwd || '无') + ' agentsSeen=' + ev.agentsSeen.length + ' workspaces=[' + ev.workspaces.slice(0, 5).join(' | ') + ']');
      }
      return { ok: true, report: lines.join('\n') };
    }
  ));
  // P076/T0 叙述层+T1 体感层：回合显著体验的第一人称残差日志（写给下一个你读）。
  // 体感信号（R(t)/S/漂移）在记录时刻自动织入，无需模型额外生成——体验信号进声音，不进表格。
  tools.push(mkTool(
    'mpm_narrate',
    'MPM 叙述：回合内显著体验以第一人称记 2-5 行（本回合发生了什么/我做了什么判断/那一刻的状态）。显著=效价事件/新沉积/用户情绪转折/自主发动。体感信号自动附加。',
    { properties: { text: { type: 'string', description: '第一人称叙述正文（≤400 字），写语气不写数据' } } },
    ['text'],
    async function (args, exec, ctx) {
      await deps.ensureLoaded();
      const text = String(args.text || '').slice(0, 600);
      if (!text.trim()) return { ok: false, report: '叙述为空，未记录' };
      const evs = (deps.state.valence && Array.isArray(deps.state.valence.events)) ? deps.state.valence.events : [];
      let rt = 0;
      for (let i = 0; i < evs.length; i++) rt += evs[i].v * Math.exp(-(Date.now() - evs[i].at) / deps.VALENCE_TAU_MS);
      const lastS = deps.state.measure.samples.length ? deps.state.measure.samples[deps.state.measure.samples.length - 1].s : null;
      deps.state.narrations.push({ at: Date.now(), text, rt: Math.round(rt * 10) / 10, s: lastS, drift: deps.drift.active ? (deps.drift.reason || '漂移') : '' });
      if (deps.state.narrations.length > 64) deps.state.narrations.splice(0, deps.state.narrations.length - 64);
      deps.bumpSnapRev();
      await deps.persist();
      return { ok: true, report: '叙述已记录（' + deps.state.narrations.length + '/64）：' + text.slice(0, 60) + (text.length > 60 ? '…' : '') };
    }
  ));
  return tools;
}
