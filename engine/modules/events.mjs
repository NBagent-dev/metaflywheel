// MetaFlywheel 事件面/感知层模块（P079 重构：tools/result 监听、inbox 感知、session-start、巡检定时器调度）
// 依赖注入契约：attachEventFaces(e)。e 为宿主管状所有者注入：
//   { ctx, state, isParked, drift, perception, lastActive, deliberate,
//     getOutsideCalls:()=>number, setOutsideCalls:(n)=>void, bumpSnapRev,
//     patrol:()=>Promise|void, PATROL_MS:number }
// 铁律：只做「闭包→参数化」机械变换——函数体一字未动（自由变量改由 e 绑定），阈值/文案/流程不变。
// drift/perception/lastActive/outsideCalls 均为宿主可变状态，模块闭包不得重建；outsideCalls 是 let（宿主所有权）。

export function attachEventFaces(e) {
  const { ctx, state, isParked, drift, perception, lastActive, deliberate,
    getOutsideCalls, setOutsideCalls, bumpSnapRev, patrol, PATROL_MS } = e;

  ctx.on('tools/result', function (exec, result) {
    const name2 = exec && exec.name;
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
      let sig = name2;
      try { sig = name2 + '|' + JSON.stringify((exec && (exec.args || exec.input)) || {}).slice(0, 120); } catch (e2) {}
      if (err) { drift.consecutiveErrors += 1; drift.reason = '工具连续失败 ' + drift.consecutiveErrors + ' 次(' + name2 + ')'; }
      else drift.consecutiveErrors = 0;
      if (sig === drift.lastSignature) drift.signatureRepeat += 1;
      else { drift.lastSignature = sig; drift.signatureRepeat = 0; }
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

  ctx.on('agent/session-start', function (payload) {
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
