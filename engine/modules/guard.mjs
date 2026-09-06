// MetaFlywheel 边界硬门禁模块（P079 重构第 5 步：M2 总账门禁 → 依赖注入）
// d 契约：{ state, isParked, getOutsideCalls:()=>number, BLOCK_THRESHOLD:number, valenceRecord:(kind)=>void }
export function makeBoundaryGuard(d) {
  return function (execution) {
    const name3 = execution && execution.name;
    if (typeof name3 !== 'string' || name3.indexOf('mpm_') === 0) return undefined;
    const ids = Object.keys(d.state.problems);
    let hasActive = false;
    for (let i = 0; i < ids.length; i++) {
      const bp2 = d.state.problems[ids[i]];
      if (d.isParked(bp2)) continue; // P027/A1：搁置题不构成在轮（但不豁免总账原则——账外仍会被拦）
      const st = bp2.stage;
      if (st === 'G' || st === 'F' || st === 'S' || st === 'C') { hasActive = true; break; }
    }
    const oc = d.getOutsideCalls();
    if (hasActive || oc < d.BLOCK_THRESHOLD) return undefined;
    d.valenceRecord('reject');
    console.warn('[mpm][engine] 边界硬拦截: ' + name3 + ' (账外计数=' + oc + ')');
    return 'MPM 边界硬拦截：无在轮题而账外工具调用已达 ' + oc + ' 次。总账原则要求先入账——调用 mpm_micro（小型任务一息入账）或 mpm_generate（建正式题）后自动放行；mpm_flywheel_state 可查看飞轮。';
  };
}
