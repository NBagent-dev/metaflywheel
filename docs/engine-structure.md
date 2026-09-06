# 引擎模块结构图（P079 重构 · 十轮达成态）

> 状态：**主体完成**——10 个模块迁出，apply 薄层 ≈274 行组装+助手。剩余=薄层微调与 CodeCheck 复核。

## 现状（2026-09-06，commit 待 r10 落账）

```
engine/
  host.js               # file:// 插件行入口（export name/inject/apply）≈274 LOC——state 声明+助手+装配+注册
  modules/
    util.mjs            # 纯函数/常量（STAGE_NAMES/PHI_MARKS/phiOf/bigrams/revisionOf/relAgo）
    retrieval.mjs       # 检索小脑（沉积缓存面+双通道，P073 bug 修复）
    selfsnap.mjs        # 自我快照渲染 renderSelfSnapshot(deps)
    core.mjs            # buildSnapshot/directiveText/fmtProblem
    valence.mjs         # R1 效价账本
    guard.mjs           # M2 边界硬门禁 makeBoundaryGuard(deps)
    tools.mjs           # makeTools(deps×28)：mkTool+11 处理器+narrate
    state.mjs           # makeStateMachine(e×9)：persist/restore/adoptRoot/迁移
    events.mjs          # attachEventFaces(e×13)：tools/result+inbox+session+调度
    patrol.mjs          # makePatrol(p×11)：runPatrol 测量/宪法复审/停滞/议程
```

## 重构方法论（本工程实证，可复用）

1. **模块=纯逻辑+参数注入**；宿主只持有：可变状态声明、事件装配、周期轮（apply 薄层）
2. **每迁一块**：node --check + 冒烟 5/5 → commit+双远端推送 → **同步运行副本**（sync-engine.ps1 整目录版）
3. **迁移期逐行重读**是硬纪律——已借此抓住：P073 签名错位（检索历史经验通道静默失效）、citeSediments 重复函数头、模块未同步入库（重启即挂）
4. 可委托子代理做机械抽取，父代理三层复核（语法/符号泄漏/残留定义）后提交

## 本地复杂度代理（终态数据待 r10 采集）

| 指标 | 重构前 | 重构后 |
|---|---|---|
| host.js LOC | 1530 | ≈274 |
| host.js 分支行 | ≈314 | 待测 |
| modules 文件数 | 0 | 10 |
| 单函数平均圈复杂度 | 134.6（CodeCheck） | 待 CodeCheck 重跑 |

## 收尾清单
- [ ] CodeCheck 重跑（avg 圈复杂度 <15 目标判据）
- [ ] 用户重启验证（快照/面板/叙述行为零回归）
- [ ] 运行副本最终同步（已完成多轮，末次以本图 commit 后为准）
