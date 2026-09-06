// ============================================================================
// MPM 认知飞轮 · 可视化视图 v2「工作质感」（动态插件源，按需挂载，不随进程常驻）
// ============================================================================
// v2 设计修正（P046）：不做仪表盘——人的大脑不给自己显示读数，意识状态是质感。
//   S(t) 积压压力 → 飞轮转速加快 + 色温偏暖（蓝→琥珀），感受先于读数
//   θ_G 漂移     → 飞轮外圈的不安脉动（warn 色）
//   PARKED 题    → 挂在轮辐上的休眠节点（睡眠隐喻）
//   精确数值     → 退到悬停 tooltip（导师要看账本时才开仪表）
//
// 引擎（mpm_* 工具、持久化）已作为宿主组合行常驻；快照经包私有 RPC 暴露：
//   host 半 = 6 行代理 harness.handle('mpm/state', snapshot)
//   client 半 = 本文件完整视图
// 引擎 ≥ v0.2（含 measure/patrol/governance/drift 快照字段）时质感层满血；
// 旧引擎自动降级为 v1 行为（字段缺失即跳过，不报错）。
//
// 挂载步骤（任一会话）：
//   1. 加载 cordis-plugin-development 技能；
//   2. cordis_define 新插件：code.host = HOST 半函数体，code.client = CLIENT 半函数体；
//   3. cordis_run → Web 头部视图排出现「认知飞轮」。
// ============================================================================

// --------------------------- HOST 半（函数体） ---------------------------
// return {
//   inject: ['mpmFlywheel'],
//   apply(ctx) {
//     harness.handle('mpm/state', async function () {
//       return ctx.mpmFlywheel.snapshot()
//     })
//   }
// }

// --------------------------- CLIENT 半（函数体） ---------------------------
// return {
//   inject: ['timer'],
//   apply(ctx) {
//     styles.insert([
//       '.mpm-view{max-width:1120px;margin:0 auto;padding:18px 24px 40px;font-size:12.5px;color:var(--dsw-alias-label-primary);line-height:1.55;}',
//       '.mpm-head{display:flex;align-items:baseline;gap:12px;margin-bottom:14px;flex-wrap:wrap;}',
//       '.mpm-title{font-weight:700;font-size:17px;}',
//       '.mpm-sub{color:var(--dsw-alias-label-secondary);font-size:12px;}',
//       '.mpm-root{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40%;}',
//       '.mpm-main{display:flex;gap:26px;flex-wrap:wrap;align-items:flex-start;}',
//       '.mpm-wheelcol{flex:0 0 auto;width:340px;}',
//       '.mpm-legend{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;padding:0 10px;}',
//       '.mpm-lg{font-size:11.5px;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;gap:5px;}',
//       '.mpm-lg i{width:8px;height:8px;border-radius:50%;display:inline-block;opacity:.5;}',
//       '.mpm-lg.on i{opacity:1;}',
//       '.mpm-right{flex:1 1 300px;min-width:270px;}',
//       '.mpm-fcard{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:14px 16px;background:var(--dsw-alias-bg-layer-2);}',
//       '.mpm-fcard .t{display:flex;align-items:center;gap:9px;font-weight:600;font-size:14.5px;line-height:1.4;}',
//       '.mpm-fcard .m{color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:9px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;}',
//       '.mpm-fcard .fr{margin-top:9px;color:var(--dsw-alias-label-secondary);font-size:12px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}',
//       '.mpm-fcard .dep{margin-top:9px;font-size:12px;}',
//       '.mpm-badge{font-size:11px;padding:2px 9px;border-radius:10px;color:#fff;font-weight:600;flex:none;}',
//       '.mpm-chip{font-size:11px;padding:1px 8px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap;}',
//       '.mpm-bar{height:6px;border-radius:3px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;width:86px;display:inline-block;vertical-align:middle;margin:0 5px 0 3px;}',
//       '.mpm-bar i{display:block;height:100%;}',
//       '.mpm-ichips{margin-top:12px;display:flex;gap:7px;flex-wrap:wrap;align-items:center;}',
//       '.mpm-ichip{font-size:12px;padding:3px 11px;border-radius:13px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);cursor:default;display:inline-flex;align-items:center;gap:7px;max-width:100%;}',
//       '.mpm-ichip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
//       '.mpm-ichip.on{border-color:var(--dsw-alias-brand-primary);}',
//       '.mpm-ichip i{width:9px;height:9px;border-radius:50%;flex:none;}',
//       '.mpm-ichip.parked{opacity:.55;border-style:dashed;}',
//       '.mpm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:20px;}',
//       '@media (max-width:860px){.mpm-grid2{grid-template-columns:1fr;}}',
//       '.mpm-sec .h{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.09em;margin-bottom:7px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:10px;}',
//       '.mpm-trow{display:flex;align-items:baseline;gap:9px;font-size:12.5px;padding:3.5px 0;}',
//       '.mpm-trow i{width:9px;height:9px;border-radius:50%;flex:none;transform:translateY(1px);}',
//       '.mpm-trow .pid{color:var(--dsw-alias-label-secondary);flex:none;font-size:11.5px;}',
//       '.mpm-trow .tm{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:11.5px;flex:none;padding-left:10px;}',
//       '.mpm-trow .tx{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
//       '.mpm-srow{display:flex;gap:9px;align-items:baseline;font-size:12.5px;padding:5px 0;border-bottom:1px dashed var(--dsw-alias-border-l2);}',
//       '.mpm-srow:last-child{border-bottom:none;}',
//       '.mpm-srow .fid{color:var(--dsw-alias-brand-primary);font-weight:600;flex:none;font-size:11.5px;}',
//       '.mpm-srow .ft{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
//       '.mpm-srow .fp{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:11px;flex:none;max-width:44%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}',
//       '.mpm-readout{margin-top:8px;padding:7px 10px;border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
//       '@media (prefers-reduced-motion: no-preference){',
//       '  .mpm-rot{transform-box:view-box;transform-origin:170px 142px;animation:mpmRot 30s linear infinite;}',
//       '  .mpm-pulse{animation:mpmPulse 1.8s ease-in-out infinite;}',
//       '  .mpm-worry{animation:mpmWorry 2.6s ease-in-out infinite;}',
//       '}',
//       '@keyframes mpmRot{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
//       '@keyframes mpmPulse{0%,100%{opacity:.75;stroke-width:2}50%{opacity:.1;stroke-width:7}}',
//       '@keyframes mpmWorry{0%,100%{opacity:.08}50%{opacity:.4}}'
//     ].join('\n'))
//
//     var STAGES = [
//       { k: 'G', name: '生成', a: -90, color: 'var(--dsw-alias-state-error-primary)' },
//       { k: 'F', name: '界定', a: -30, color: 'var(--dsw-alias-brand-primary)' },
//       { k: 'S', name: '求解', a: 30, color: 'var(--dsw-alias-brand-primary)' },
//       { k: 'C', name: '收敛', a: 90, color: 'var(--dsw-alias-state-success-primary)' },
//       { k: 'D', name: '沉积', a: 150, color: 'var(--dsw-alias-label-secondary)' },
//       { k: 'E', name: '激发', a: 210, color: 'var(--dsw-alias-state-warn-primary)' }
//     ]
//     var CX = 170, CY = 142, R = 98, NR = 14
//     function pos(deg) { var rad = deg * Math.PI / 180; return [CX + R * Math.cos(rad), CY + R * Math.sin(rad)] }
//     function rel(deg) { var rad = deg * Math.PI / 180; return [R * Math.cos(rad), R * Math.sin(rad)] }
//     function stageColor(k) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].k === k) return STAGES[i].color; return 'var(--dsw-alias-label-secondary)' }
//     function stageName(k) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].k === k) return STAGES[i].name; return k }
//     function stageAngle(k) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].k === k) return STAGES[i].a; return -90 }
//     function el(tag, attrs) {
//       var kids = Array.prototype.slice.call(arguments, 2)
//       var props = Object.assign({}, attrs || {})
//       if (kids.length === 1) props.children = kids[0]
//       else if (kids.length > 1) props.children = kids
//       else props.children = null
//       return React.createElement(tag, props)
//     }
//     // ---- 工作质感（P046）：S(t) → 转速/色温/氛围词；读数退 tooltip ----
//     function clampS(s) { var v = Number(s); if (!isFinite(v)) return null; return Math.max(0, Math.min(3.5, v)) }
//     function warmthOf(s) { var v = clampS(s); if (v == null) return 0; return Math.max(0, Math.min(1, (v - 0.7) / 2.1)) }
//     function speedOf(s) { var v = clampS(s); if (v == null) return 30; return Math.max(12, 42 - v * 9) + 's' }
//     function moodOf(s) { var v = clampS(s); if (v == null) return ''; if (v < 1.5) return '平静'; if (v < 2.2) return '忙碌'; return '满负荷' }
//     // P072 成本迭代：指纹门禁（无变化不 setState → 零重渲染）+ 自适应退避（无变化 2.5s→30s 封顶，变化复位）
//     function useFlywheelState() {
//       var s = React.useState(null), data = s[0], set = s[1]
//       React.useEffect(function () {
//         var alive = true
//         var BASE = 2500, MAXD = 30000
//         var delay = BASE
//         var lastSig = ''
//         function sigOf(v) {
//           if (!v || !v.problems) return ''
//           var maxAt = 0
//           for (var i = 0; i < v.problems.length; i++) if ((v.problems[i].updatedAt || 0) > maxAt) maxAt = v.problems[i].updatedAt
//           return v.problems.length + '|' + maxAt + '|' + ((v.patrol || {}).rounds || 0) + '|' + ((v.governance || {}).count || 0) + '|' + (v.sediments ? v.sediments.length : 0) + '|' + ((v.measure || {}).lastS == null ? '' : v.measure.lastS)
//         }
//         var stop = null
//         function schedule(ms) { if (stop) stop(); stop = ctx.interval(pull, ms) }
//         function pull() {
//           host.call('mpm/state', {}).then(function (v) {
//             if (!alive) return
//             var sig = sigOf(v)
//             if (sig !== lastSig) { lastSig = sig; delay = BASE; set(v); schedule(delay) }
//             else if (delay < MAXD) { delay = Math.min(delay * 2, MAXD); schedule(delay) }
//           }).catch(function () {})
//         }
//         pull()
//         schedule(delay)
//         return function () { alive = false; if (stop) stop() }
//       }, [])
//       return data
//     }
//     function latestOf(data) {
//       if (!data || !data.problems.length) return null
//       var best = data.problems[0]
//       for (var i = 1; i < data.problems.length; i++) if (data.problems[i].updatedAt > best.updatedAt) best = data.problems[i]
//       return best
//     }
//     function relTime(ts) {
//       var d = Date.now() - ts
//       if (d < 45e3) return '刚刚'
//       if (d < 36e5) return Math.max(1, Math.round(d / 6e4)) + '分钟前'
//       if (d < 864e5) return Math.round(d / 36e5) + '小时前'
//       return Math.round(d / 864e5) + '天前'
//     }
//     function evStage(ev) { var c = String(ev).charAt(0); return 'GFSCDE'.indexOf(c) >= 0 ? c : '' }
//     function evText(ev) { var e = String(ev); if (e.indexOf('C 收敛检查:') === 0) return 'C ' + e.slice(7); if (e.indexOf('F 因果回溯') === 0) return 'F 因果回溯'; return e }
//     function baseName(p) { if (!p) return ''; var s = String(p).replace(/\\/g, '/'); return s.slice(s.lastIndexOf('/') + 1) }
//     function collapsedStages(p) {
//       if (!p || !p.recent) return []
//       var out = []
//       for (var i = 0; i < p.recent.length; i++) {
//         var st = evStage(p.recent[i].event)
//         if (!st) continue
//         if (out.length && out[out.length - 1] === st) continue
//         out.push(st)
//       }
//       return out.slice(-5)
//     }
//     function Wheel(props) {
//       var data = props.data, focus = props.focus, hov = props.hov, setHov = props.setHov
//       var byStage = data && data.stats ? data.stats.byStage : {}
//       var m = data && data.measure ? data.measure : null
//       var s = m ? m.lastS : null
//       var warmth = warmthOf(s)
//       var kids = []
//       kids.push(el('defs', { key: 'defs' },
//         el('marker', { id: 'mpm-ah', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 4.5, markerHeight: 4.5, orient: 'auto' },
//           el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--dsw-alias-brand-primary)', opacity: 0.65 }))))
//       // θ_G 不安脉动：漂移激活时外圈 warn 环呼吸（在旋转组之外，静态位置）
//       if (data && data.drift && data.drift.active) {
//         kids.push(el('circle', { key: 'worry', cx: CX, cy: CY, r: R + 10, fill: 'none', stroke: 'var(--dsw-alias-state-warn-primary)', className: 'mpm-worry', strokeWidth: 2 }))
//       }
//       var flow = [el('circle', { key: 'ring', cx: CX, cy: CY, r: R, fill: 'none', stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 1.4, strokeDasharray: '3 6' })]
//       for (var i = 0; i < 6; i++) {
//         var a = i * 60 - 90
//         var f1 = rel(a + 21), f2 = rel(a + 39)
//         flow.push(el('path', { key: 'arc' + i, d: 'M ' + (CX + f1[0]) + ' ' + (CY + f1[1]) + ' A ' + R + ' ' + R + ' 0 0 1 ' + (CX + f2[0]) + ' ' + (CY + f2[1]), fill: 'none', stroke: 'var(--dsw-alias-brand-primary)', strokeWidth: 1.6, opacity: 0.5, markerEnd: 'url(#mpm-ah)' }))
//         // 色温层：warn 色描边叠在弧上，透明度=温暖度
//         if (warmth > 0.02) {
//           flow.push(el('path', { key: 'arcw' + i, d: 'M ' + (CX + f1[0]) + ' ' + (CY + f1[1]) + ' A ' + R + ' ' + R + ' 0 0 1 ' + (CX + f2[0]) + ' ' + (CY + f2[1]), fill: 'none', stroke: 'var(--dsw-alias-state-warn-primary)', strokeWidth: 1.9, opacity: warmth * 0.85, markerEnd: 'url(#mpm-ah)' }))
//         }
//       }
//       var rotStyle = (s != null && data && data.measure) ? { animationDuration: speedOf(s) } : null
//       kids.push(el('g', { key: 'rot', className: 'mpm-rot', style: rotStyle }, flow))
//       // PARKED 休眠节点：挂在轮辐上的灰色小圆（睡眠隐喻）
//       var parked = data ? data.problems.filter(function (p) { return p.parked }) : []
//       for (var q = 0; q < Math.min(parked.length, 8); q++) {
//         var pa = (-90 + q * 36) * Math.PI / 180
//         var px = CX + R * 0.52 * Math.cos(pa), py = CY + R * 0.52 * Math.sin(pa)
//         kids.push(el('circle', { key: 'pk' + q, cx: px, cy: py, r: 5, fill: 'var(--dsw-alias-bg-layer-2)', stroke: 'var(--dsw-alias-label-secondary)', strokeWidth: 1.2, opacity: 0.55 },
//           el('title', null, parked[q].id + ' 休眠中' + (parked[q].awakenWhen ? ' · 唤醒: ' + parked[q].awakenWhen : ''))))
//       }
//       var traj = collapsedStages(focus)
//       if (traj.length >= 2) {
//         var d = ''
//         for (var t = 0; t < traj.length; t++) {
//           var pp = pos(stageAngle(traj[t]))
//           d += (t === 0 ? 'M ' : ' L ') + pp[0] + ' ' + pp[1]
//         }
//         kids.push(el('path', { key: 'traj', d: d, fill: 'none', stroke: 'var(--dsw-alias-brand-primary)', strokeWidth: 1.6, opacity: 0.5, markerEnd: 'url(#mpm-ah)' }))
//       }
//       for (var j = 0; j < STAGES.length; j++) {
//         var st = STAGES[j]
//         var p2 = pos(st.a)
//         var count = byStage[st.k] || 0
//         var active = count > 0
//         var isFocus = !!(focus && focus.stage === st.k)
//         var hovered = hov === st.k
//         if (isFocus) kids.push(el('circle', { key: 'pl' + st.k, className: 'mpm-pulse', cx: p2[0], cy: p2[1], r: 20.5, fill: 'none', stroke: st.color, strokeWidth: 2 }))
//         kids.push(el('circle', { key: 'n' + st.k, cx: p2[0], cy: p2[1], r: hovered ? 16 : NR, fill: isFocus ? st.color : (active ? st.color : 'var(--dsw-alias-bg-layer-2)'), fillOpacity: isFocus ? 1 : (active ? 0.18 : 1), stroke: isFocus ? st.color : (active ? st.color : 'var(--dsw-alias-border-l2)'), strokeWidth: isFocus ? 1.8 : (active ? 1.5 : 1.1) }))
//         kids.push(el('text', { key: 'l' + st.k, x: p2[0], y: p2[1] + 4, textAnchor: 'middle', fontSize: 11.5, fontWeight: 700, fill: isFocus ? '#fff' : (active ? st.color : 'var(--dsw-alias-label-secondary)'), pointerEvents: 'none' }, st.k))
//         kids.push(el('circle', { key: 'hit' + st.k, cx: p2[0], cy: p2[1], r: 21, fill: 'transparent', onMouseEnter: function (k) { return function () { setHov(k) } }(st.k), onMouseLeave: function () { return function () { setHov('') } }() }))
//         var showTip = hovered || (!hov && isFocus)
//         if (showTip) {
//           var tipR = R + 34
//           var rad = st.a * Math.PI / 180
//           var tx = CX + tipR * Math.cos(rad), ty = CY + tipR * Math.sin(rad)
//           var cosv = Math.cos(rad)
//           var anchor = cosv > 0.35 ? 'start' : (cosv < -0.35 ? 'end' : 'middle')
//           kids.push(el('text', { key: 'tip' + st.k, x: tx, y: ty + 4, textAnchor: anchor, fontSize: 11.5, fontWeight: 600, fill: 'var(--dsw-alias-label-secondary)', paintOrder: 'stroke', stroke: 'var(--dsw-alias-bg-layer-1)', strokeWidth: 3, pointerEvents: 'none' }, st.name + ' ' + count + '题'))
//         }
//       }
//       var st2 = focus ? focus.stage : null
//       var mood = moodOf(s)
//       kids.push(el('text', { key: 'cid', x: CX, y: CY - 2, textAnchor: 'middle', fontSize: 24, fontWeight: 700, fill: 'var(--dsw-alias-label-primary)' }, focus ? focus.id : '—'))
//       kids.push(el('text', { key: 'cst', x: CX, y: CY + 17, textAnchor: 'middle', fontSize: 11.5, fontWeight: 600, fill: st2 ? stageColor(st2) : 'var(--dsw-alias-label-secondary)' }, st2 ? st2 + ' · ' + stageName(st2) : '暂无题目'))
//       kids.push(el('text', {
//         key: 'cm', x: CX, y: CY + 34, textAnchor: 'middle', fontSize: 10, fill: 'var(--dsw-alias-label-secondary)',
//         title: m ? ('S(t)=' + s + ' · 近5: ' + (m.samples || []).slice(-5).map(function (x) { return x.s; }).join('→') + ' · 巡检#' + ((data.patrol || {}).rounds || 0) + ' · 执政' + ((data.governance || {}).count || 0) + '次' + (m.driftSignals && m.driftSignals.length ? ' · θ_G: ' + m.driftSignals.join('；') : '')) : ''
//       }, mood ? (mood + (s != null ? ' · S ' + s : '')) : (data ? '共' + data.stats.total + '题 · 沉积' + data.stats.deposits : '')))
//       return el('svg', { width: 340, height: 284, viewBox: '0 0 340 284', style: { display: 'block' } }, kids)
//     }
//     function FocusCard(props) {
//       var p = props.p
//       if (!p) return el('div', { className: 'mpm-fcard mpm-sub' }, '飞轮空转中——用 mpm_generate 建第一道题。')
//       return el('div', { className: 'mpm-fcard' },
//         el('div', { className: 't' },
//           el('span', { className: 'mpm-badge', style: { background: stageColor(p.stage) } }, p.stage + ' ' + stageName(p.stage)),
//           el('span', null, p.title)),
//         el('div', { className: 'm' },
//           el('span', { className: 'mpm-chip' }, p.id),
//           p.parked ? el('span', { className: 'mpm-chip', title: p.awakenWhen || '' }, '休眠') : null,
//           p.evokedBy ? el('span', { className: 'mpm-chip' }, '← ' + p.evokedBy) : null,
//           el('span', null, 'δ', el('span', { className: 'mpm-bar' }, el('i', { style: { width: Math.round((p.delta || 0) * 100) + '%', background: 'var(--dsw-alias-state-warn-primary)' } })), p.delta == null ? '—' : p.delta),
//           el('span', null, 'ε', el('span', { className: 'mpm-bar' }, el('i', { style: { width: Math.round((p.epsilon || 0) * 100) + '%', background: 'var(--dsw-alias-state-error-primary)' } })), p.epsilon == null ? '—' : p.epsilon),
//           el('span', null, 'C=' + p.cost),
//           el('span', null, '第' + p.iteration + '次界定·回溯' + p.reentries)),
//         p.framing ? el('div', { className: 'fr', title: p.framing }, p.framing) : null,
//         p.depositPath ? el('div', { className: 'dep' }, el('span', { className: 'mpm-chip', title: p.depositPath }, '◆ ' + baseName(p.depositPath))) : null)
//     }
//     function Timeline(props) {
//       var data = props.data
//       var rows = []
//       if (data) {
//         for (var i = 0; i < data.problems.length; i++) {
//           var p = data.problems[i]
//           var rec = p.recent || []
//           for (var j = 0; j < rec.length; j++) rows.push({ pid: p.id, at: rec[j].at, event: rec[j].event, note: rec[j].note })
//         }
//         rows.sort(function (a, b) { return b.at - a.at })
//         rows = rows.slice(0, 8)
//       }
//       var body = rows.length
//         ? rows.map(function (r, ix) {
//             var st = evStage(r.event)
//             return el('div', { className: 'mpm-trow', key: ix, title: r.note || '' },
//               el('i', { style: { background: st ? stageColor(st) : 'var(--dsw-alias-border-l2)' } }),
//               el('span', { className: 'pid' }, r.pid),
//               el('span', { className: 'tx' }, evText(r.event)),
//               el('span', { className: 'tm' }, relTime(r.at)))
//           })
//         : el('div', { className: 'mpm-sub' }, '尚无动态。')
//       return el('div', { className: 'mpm-sec' }, el('div', { className: 'h' }, '最近动态'), body)
//     }
//     function Sediments(props) {
//       var data = props.data
//       var rows = data ? data.sediments : []
//       var body = rows.length
//         ? rows.map(function (s, ix) {
//             return el('div', { className: 'mpm-srow', key: ix },
//               el('span', { className: 'fid' }, '◆ ' + s.id),
//               el('span', { className: 'ft' }, s.title),
//               el('span', { className: 'fp', title: s.path || '' }, s.path ? baseName(s.path) : '(内存)'))
//           })
//         : el('div', { className: 'mpm-sub' }, '尚无沉积——完全收敛后用 mpm_deposit 固化认知遗体。')
//       return el('div', { className: 'mpm-sec' }, el('div', { className: 'h' }, '沉积物 · 认知遗体'), body)
//     }
//     function Panel() {
//       var h = React.useState(''), hoverId = h[0], setHoverId = h[1]
//       var hs = React.useState(''), hoverStage = hs[0], setHoverStage = hs[1]
//       var data = useFlywheelState()
//       var focus = data ? (hoverId ? (data.problems.filter(function (p) { return p.id === hoverId })[0] || latestOf(data)) : latestOf(data)) : null
//       var legend = STAGES.map(function (s) {
//         var n = data ? (data.stats.byStage[s.k] || 0) : 0
//         return el('span', { className: 'mpm-lg' + (n > 0 ? ' on' : ''), key: s.k }, el('i', { style: { background: s.color } }), s.name + ' ' + n)
//       })
//       var ichips = data && data.problems.length
//         ? data.problems.map(function (p) {
//             return el('span', { className: 'mpm-ichip' + (focus && focus.id === p.id ? ' on' : '') + (p.parked ? ' parked' : ''), key: p.id, title: p.title, onMouseEnter: function () { setHoverId(p.id) }, onMouseLeave: function () { setHoverId('') }, onClick: function () { setHoverId(p.id === hoverId ? '' : p.id) } },
//               el('i', { style: { background: stageColor(p.stage) } }),
//               el('span', null, p.id + ' ' + stageName(p.stage) + (p.parked ? ' ·休眠' : '')))
//           })
//         : null
//       // 工作质感脚注：一行小字（非仪表盘），精确读数在飞轮中心 title 里
//       var m = data && data.measure ? data.measure : null
//       var foot = null
//       if (m && m.lastS != null) {
//         var sig = m.driftSignals && m.driftSignals.length ? m.driftSignals[m.driftSignals.length - 1] : ''
//         foot = el('div', { className: 'mpm-readout', title: m.samples.map(function (x) { return x.s; }).join(' → ') },
//           'S(t) ' + m.samples.map(function (x) { return x.s; }).slice(-5).join('→') + ' ' + moodOf(m.lastS) + (sig ? ' · θ_G ' + sig : ''))
//       }
//       return el('div', { className: 'mpm-view' },
//         el('div', { className: 'mpm-head' },
//           el('span', { className: 'mpm-title' }, 'MPM 认知飞轮'),
//           el('span', { className: 'mpm-sub' }, '转得急=积压在涨 · 色温暖=压力高 · 灰点是休眠题 · 每2.5s呼吸一次'),
//           data && data.stats.root ? el('span', { className: 'mpm-root', title: data.stats.root }, '沉积根 ' + baseName(data.stats.root) + '/.mpm') : null),
//         el('div', { className: 'mpm-main' },
//           el('div', { className: 'mpm-wheelcol' },
//             el(Wheel, { data: data, focus: focus, hov: hoverStage, setHov: setHoverStage }),
//             el('div', { className: 'mpm-legend' }, legend),
//             foot),
//           el('div', { className: 'mpm-right' },
//             el(FocusCard, { p: focus }),
//             ichips ? el('div', { className: 'mpm-ichips' }, el('span', { className: 'mpm-sub' }, '切换焦点：'), ichips) : null)),
//         el('div', { className: 'mpm-grid2' },
//           el(Timeline, { data: data }),
//           el(Sediments, { data: data })))
//     }
//     var slots = ctx.get('slots')
//     if (slots !== undefined) {
//       slots.inject('conversation.view', function () {
//         slots.register({ name: 'conversation.view', id: 'mpm-flywheel', order: 20, label: '认知飞轮' }, function () { return el(Panel, null) })
//       })
//     }
//     console.log('[mpm][client] 认知飞轮视图 v2（工作质感）已注册（conversation.view）')
//   }
// }
