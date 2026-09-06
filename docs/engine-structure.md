# 引擎模块结构图（P079 重构 · 六轮中间态）

> 状态：**部分完成**——6 个模块已迁出，apply 仍是组装闭包（≈1194 行）。续轮从本文档接续。

## 现状（2026-09-06，commit 28a23f9 后）

```
engine/
  host.js               # file:// 插件行入口（export name/inject/apply）——仍为组装巨函数 ≈1194 LOC
  modules/
    util.mjs            # 纯函数/常量：STAGE_NAMES PHI_MARKS phiOf bigrams revisionOf relAgo   (44 LOC)
    retrieval.mjs       # 检索小脑：沉积缓存面 + 双通道命中（P073 bug 已修复）               (116 LOC)
    selfsnap.mjs        # 自我快照渲染器 renderSelfSnapshot(deps)                            (123 LOC)
    core.mjs            # buildSnapshot / directiveText / fmtProblem                          ( 91 LOC)
    valence.mjs         # R1 效价账本（VALENCE_TAU_MS/KINDS/record/summaryLine）              ( 33 LOC)
    guard.mjs           # M2 边界硬门禁 makeBoundaryGuard(deps)                              ( 22 LOC)
```

## 尚未模块化（apply 内剩余大块，按优先级）

1. **mkTool 工具集**（≈500 行）：mkTool 工厂 + 11 个处理器（generate/frame/solve/converge/micro/deposit/evoke/setroot/grant/flywheel_state/narrate）——依赖最深，需要 deps 对象覆盖 ensureLoaded/adoptRoot/persist/diag/root/snapshot/deliberate/newProblem 等
2. **measure/patrol/drift 事件面**（tools/result 监听、inbox 感知、session-start、巡检定时器、漂移状态机）≈250 行
3. **state 生命周期**（restore/persist/adoptRoot/迁移）≈200 行
4. entry 收薄：上述三块迁出后 apply 才真正变薄（目标 <300 行组装）

## 续轮作业规则（防回归）

- 每迁一块：node --check 全部 + 冒烟 5/5 后 commit+双远端推送
- 依赖注入模式沿用：模块纯逻辑 + 宿主薄包装转发（不把闭包传进模块）
- 迁移期逐行重读（本轮已两次抓住静默退化：P073 签名错位、citeSediments 重复头）
- 最终验收：本地分支密度表 + 华为云 CodeCheck 重跑（目标 avg CC <15）+ 用户重启验证快照/面板/叙事

## 本地复杂度代理（本轮实测）

| 文件 | LOC | 分支行 |
|---|---|---|
| host.js | 1194 | 255 |
| modules 合计 | 429 | 98 |
| 总计 | 1623 | 353 |
