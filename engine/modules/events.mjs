// MetaFlywheel 事件面/感知层模块（P079 重构：tools/result 监听、inbox 感知、会话启动感知、巡检定时器调度）
// ★P327（2026-09-26）宿主契约迁移：会话启动事件由 `agent/session-start` 改为 `agent/created`（dsh 0.1.7-rc.2）。
// 依赖注入契约：attachEventFaces(e)。e 为宿主管状所有者注入：
//   { ctx, state, isParked, drift, perception, lastActive, deliberate,
//     getOutsideCalls:()=>number, setOutsideCalls:(n)=>void, bumpSnapRev,
//     patrol:()=>Promise|void, PATROL_MS:number }
// 铁律：只做「闭包→参数化」机械变换——函数体一字未动（自由变量改由 e 绑定），阈值/文案/流程不变。
// drift/perception/lastActive/outsideCalls 均为宿主可变状态，模块闭包不得重建；outsideCalls 是 let（宿主所有权）。

// ★P247 补丁 v2（2026-09-18）导出的签名函数：**测试必须 import 这一份**，不得在测试里复制逻辑。
// 起因：v1 的判决测试 _p247_sigtest.mjs 自带一份 newSig 副本，验证的是副本而不是出货文件——
// 正是 P095「验证对象必须等于用户会打开的那个文件」的复发。签名规则一变，测试照样全绿。
//
// 规则：
//   · 字段名按宿主真实契约取，保留向后兼容顺序 arguments → args → input。
//     宿主取证：dsh-tools/lib/index.js:3055-3059 顶层 exec 构造
//       `const detached = snapshotJsonValue(exec.arguments); ... arguments: deepFreeze(detached)`
//     该 exec 即 tools/result 事件的第一参（同文件 L3290-3295 notifyResult 发射）。
//     L3086 的 `arguments: void 0` 是"参数不可 JSON 序列化"的错误分支——正是我们要显式跳过的情形。
//   · 覆盖**整个**参数体：长度 + djb2 全串哈希。只取前缀会漏判（两条 ssh 长命令前 240 字符
//     相同即被误判同签名；edit 的 file_path 吃完配额后 old_string 几乎不参与比较）。
//   · **取不到就返回 null**，表示"判据不可观测"。缺失必须表现为"这条判据不成立"，
//     绝不能静默伪装成"取到了一个空值"——那样判别力会从"恒真"翻成"恒假"，更坏。
export function signatureOf(name, exec) {
  try {
    const raw = exec && (exec.arguments != null ? exec.arguments
      : (exec.args != null ? exec.args : exec.input));
    if (raw == null) return null;
    const js = JSON.stringify(raw);
    if (js == null) return null;
    let h = 5381;
    for (let i = 0; i < js.length; i++) h = ((h << 5) + h + js.charCodeAt(i)) | 0;
    return name + '|' + js.length + '|' + (h >>> 0).toString(36);
  } catch (e) { return null; }
}

export function attachEventFaces(e) {
  const { ctx, state, isParked, drift, perception, lastActive, deliberate,
    getOutsideCalls, setOutsideCalls, bumpSnapRev, patrol, PATROL_MS } = e;

  ctx.on('tools/result', function (exec, result) {
    const name2 = exec && exec.name;
    // ★P328 一次性诊断（2026-09-26）：θ_G 的同签名判据在本机实测**恒假**。
    //   现场证据：4 次完全同参 read 之后既不报警也不发动；而 deliberate 的三项落盘证据
    //   全部为证 —— constitution.log 末条仍是 16:04 的 P326、lastFireAt 距今 6.5h
    //   （远超 45min 节流，真触发会立即发动而非挂账）、pending 为 0。
    //   触发链是 sig!==null → repeat≥3 → deliberate，所以只剩两种可能，必须分开：
    //     ① signatureOf 恒返回 null（exec.arguments 取不到）
    //     ② 4 次 arguments 实际不同（宿主在参数里注入了逐次变化的字段）
    //   宿主源码里存在**两套几乎相同的 notifyResult 实现**（dsh-tools/lib/index.js:1067-1070
    //   与 3409-3420），运行时用哪套、exec 的真实形状如何，读源码定不了 —— 只能落一次盘。
    //   落点选 state.measure（persist 的 plain 对象收它）。**读完即撤，不改变任何现有行为。**
    if (!state.measure.trProbe && typeof name2 === 'string' && name2.indexOf('mpm_') !== 0) {
      try {
        let aj = null;
        try { aj = JSON.stringify(exec && exec.arguments); } catch (e3) { aj = 'THREW:' + String(e3 && e3.message); }
        state.measure.trProbe = {
          at: Date.now(),
          name: name2,
          execType: exec === null ? 'null' : typeof exec,
          keys: (exec && typeof exec === 'object') ? Object.keys(exec) : null,
          argumentsPresent: !!(exec && exec.arguments != null),
          argumentsType: exec ? typeof exec.arguments : 'no-exec',
          argumentsJson: (aj === undefined ? 'undefined' : aj),
          sig: signatureOf(name2, exec),
          frozen: !!(exec && Object.isFrozen(exec)),
        };
      } catch (e2) {
        state.measure.trProbe = { at: Date.now(), error: String(e2 && e2.message) };
      }
    }
    if (typeof name2 !== 'string' || name2.indexOf('mpm_') === 0) { setOutsideCalls(0); return; }
    const ids = Object.keys(state.problems);
    let hasActive = false;
    for (let i = 0; i < ids.length; i++) {
      const p = state.problems[ids[i]];
      if (isParked(p)) continue; // P027/A1：搁置题不吸收代谢、不构成在轮（openEnded 开放题仍算在轮——情境管理也是账上工作）
      if (p.stage === 'G' || p.stage === 'F' || p.stage === 'S' || p.stage === 'C') hasActive = true;
      if (p.stage === 'S') p.cost += 1;
    }
    try {
      // v6.1 修复（测试二实测发现）：发射点为双参 (exec, result)，error 标志在 result 上
      // （toolErrorResult: {isError:true, error:{message,...}}）——旧检测只看 exec，error 恒为假，θ_G 连续失败路径从未生效。
      const err = !!(result && (result.isError || result.error)) || !!(exec && exec.error);
      // ★P247 修复（2026-09-17 判决实验 + 源码取证）：宿主在 tools/result 上把工具参数放在
      //   `exec.arguments`（dsh-tools/lib/index.js:1216 `arguments: normalized.dispatched`；
      //   另见 L2955/L3055/L3192 `tool.execute(exec.arguments, exec)`）。
      //   旧写法只试 exec.args / exec.input，两者都不存在 ⇒ `|| {}` 兜底成空对象
      //   ⇒ 签名恒为 `name|{}`，同签名判据退化成**常量比较**：
      //   实测连续 4 次 read 四个完全不同的文件（guard/util/valence/core.mjs）仍报
      //   「同签名重复调用 4 次(read)」。四个不同文件不可能同签名 ⇒ 判据不含参数。
      //   性质澄清：这不是"灵敏度过高"，而是**判别力恰好为零**——任何 4 次连续同名工具调用
      //   （一批读、一批改、一串命令）都必然触发，而真正的同参死循环与正常工作完全不可分。
      //   两条纪律：
      //     ① 字段名按宿主实际契约取，保留向后兼容顺序（arguments → args → input）；
      //     ② **取不到就不判**：sig=null 表示"不可观测"，显式跳过该判据。
      //        缺失必须表现为"这条判据不成立"，绝不能静默伪装成"取到了一个空值"。
      // ★P247 补丁 v2（2026-09-18）：原 v1 的「slice 上限 120→240」已被彻底替换。
      //   签名规则提取为模块级 signatureOf() 并导出——**本处只调用，不得内联复制**。
      //   判决测试 _p247_sigtest.mjs 必须 import 同一份，否则重犯 P095
      //   （验证对象 ≠ 出货对象：v1 的测试自带副本，规则改了测试照样全绿）。
      const sig = signatureOf(name2, exec);
      if (err) { drift.consecutiveErrors += 1; drift.reason = '工具连续失败 ' + drift.consecutiveErrors + ' 次(' + name2 + ')'; }
      else drift.consecutiveErrors = 0;
      if (sig !== null) {
        if (sig === drift.lastSignature) drift.signatureRepeat += 1;
        else { drift.lastSignature = sig; drift.signatureRepeat = 0; }
      }
      // P027/B7 修复：同签名重复路径此前不写 reason → 快照出现空理由漂移警告（本会话实证）；
      // 阈值由 2 对齐 M10③ 规格（≥3）。
      if (drift.signatureRepeat >= 3) drift.reason = '同签名重复调用 ' + drift.signatureRepeat + ' 次(' + name2 + ')';
      drift.active = drift.consecutiveErrors >= 3 || drift.signatureRepeat >= 3;
      if (!drift.active) drift.reason = '';
      // P019 v6 瞬时审议：θ_G 漂移信号产生的当下即形成意图并尝试发动（不等下一次巡检）
      if (drift.active) deliberate([drift.reason], Date.now());
    } catch (e2) {}
    setOutsideCalls(hasActive ? 0 : getOutsideCalls() + 1);
    bumpSnapRev(); // P073：drift/代谢变更即快照修订
  });

  ctx.on('agent/inbox/claimed', function (payload) {
    try {
      const aid = payload && payload.agent && payload.agent.id;
      if (aid) { lastActive.agentId = String(aid); lastActive.at = Date.now(); }
    } catch (e2) {}
  });

  ctx.on('agent/inbox/inserted', function () {
    perception.lastInboxAt = Date.now();
    perception.inboxCount += 1;
    drift.consecutiveErrors = 0; drift.signatureRepeat = 0; drift.active = false; drift.reason = '';
  });

  // ★P327（2026-09-26）0.1.7-rc.2 契约迁移：宿主把 `agent/session-start` 改成了 `agent/created`。
  //   取证三处（全部是对装机产物/运行时契约的实测，不是读发布说明）：
  //     ① 装机全树搜 `agent/session-start` = 0 处，`agent/created` = 26 处；
  //     ② Host Event Inspect 目录里只有 `agent/created`
  //        （mode serial，签名 `(this: Scoped<Agent>, payload: { agent, source, signal? })`），
  //        没有 `agent/session-start`；
  //     ③ cordis@4.0.4 `on()` 的实现体是 `const hooks = this._hooks[name] ||= []`——**不校验事件名**。
  //   即：写错名字既不会抛、也不会崩，只是**永不触发**。静默失效比崩溃更难发现，
  //   而这一条恰好是 P021「冷时段的意志」的挂账交付入口——名字错了这条链就整条死掉，
  //   且没有任何报错会指向它。
  //   载荷无需适配：旧路径读 `payload.agent.id`，新载荷同样带 `agent` 字段。
  ctx.on('agent/created', function (payload) {
    perception.sessionStarts += 1;
    perception.lastSessionStartAt = Date.now();
    try {
      const aid = payload && payload.agent && payload.agent.id;
      if (aid) { lastActive.agentId = String(aid); lastActive.at = Date.now(); }
    } catch (e2) {}
    // P021 冷时段意志 v1：睡眠期挂账的意图在醒来时即时交付（梦的延迟执行）。
    // 会话启动=身体回暖信号；交付署名"睡眠期挂账"；节流与入账结构约束不变。
    // P030/A1-v2 残余修复：挂账交付前过滤已搁置题的信号——实测旧信号重放
    // （P024 已 PARKED 而其常数审计挂账仍于会话启动时交付）。规则：信号中引用的
    // 题ID若全部处于搁置态则不交付；无题ID引用的信号（如宪法复审提案）照常交付。
    const c = state.constitution;
    if (c.autonomy && c.pending && c.pending.length) {
      const sigAwake = function (s) {
        if (!s || s.indexOf('（') === 0) return false;
        const ids = s.match(/P\d{3}/g) || [];
        if (!ids.length) return true;
        return ids.some(function (id) { const q = state.problems[id]; return q && !isParked(q); });
      };
      const sigs = c.pending.map(function (p) { return p.signal; }).filter(sigAwake);
      if (sigs.length) deliberate(sigs.map(function (s) { return '睡眠期挂账·' + s; }), Date.now());
    }
  });

  // P017 巡检定时器调度：首轮 8s 预热，其后每 PATROL_MS 一次；timer 服务缺失则静默降级。
  if (typeof ctx.timeout === 'function' && typeof ctx.interval === 'function') {
    ctx.timeout(function () { patrol(); }, 8000);
    ctx.interval(function () { patrol(); }, PATROL_MS);
  }
}
