# 开发文档 · MetaFlywheel

> 这份文件回答一个问题：**一个新人（或三个月后的我）要怎么改这个插件，而且不改坏它。**
> 它不解释"为什么要有这个插件"（那是 `theory.md`），也不列历史编号（那是 `ledger.md`）。

**版本**：`0.4.0` · 主入口 `engine/host.js` · 判据 `node --test`（当前 **260** 条）

---

## 1. 它是什么（一句话）

**一个把"负债、判断、教训"外部化成账本的宿主插件** —— 让一个无状态的 LLM 会话在重启之后，
仍然知道**自己欠了什么、判过什么、错在哪**，并在**需要它的那一刻**把这些送回来。

### 非目标（明确不做的）

| 不做 | 为什么 |
|---|---|
| 不做"记忆召回率"优化 | 我们守的是**可审计**，不是召回。可读的 markdown 遗体 + 可核对的账本，是全部判据赖以存在的东西 |
| 不做模型微调 | 个体性由**装置**承载，不由权重承载 |
| 不回答"这算不算意识" | 原则上不可判定（P512）。只验事实，不验该不该叫那个名字 |
| 不把记忆交给向量库 | 同上：近似召回会换掉可追溯性 |

---

## 2. 运行形态

```
DSH 宿主
  └─ cordis.patch.yml    ← 声明式挂载（dsh.bundle.patch 指向它）
       └─ engine/host.js  ← apply(ctx)：注册工具、订阅事件、起巡检
            └─ engine/modules/*.mjs
```

**宿主契约（`preaction.mjs` 头部有原文）**：

| Hook | 能给什么 | 不能给什么 |
|---|---|---|
| `tools/pre-execute` | `allow` / `deny{reason}` / `ask{reason}` | **`allow` 不能携带内容** |
| `tools/post-execute` | `accept{content?, additionalContexts?}` | —— |

**⇒ 这条契约有一个直接后果**：所有"提示"只能在**动作之后**注入。
想"动手前提醒"，唯一的通道是 `ask`（而它在无人在场时会变成拒绝）。
所以我们的做法是：**把纪律做成判据，而不是做成提示**（见 §6）。

---

## 3. 模块地图

`engine/modules/` 共 **28 个** `.mjs`：**24 个运行时模块** + **4 个一次性探针脚本**（`_` 前缀，不进运行副本）。

### 3.1 骨架

| 模块 | 职责 | 关键契约 |
|---|---|---|
| `host.js` | 装配：注入依赖、注册工具、订阅事件 | 所有模块**依赖注入**，不自取全局 |
| `state.mjs` | state 生命周期：加载 / 归一 / 落盘 / 恢复 | 落盘是 **whole-state JSON**（见 §8 已知债） |
| `core.mjs` | 纯逻辑：指令生成、问题格式化 | `instructionFor()` 决定"下一步该干什么" |
| `tools.mjs` | 12 个生命周期工具的处理器 + schema | **唯一**允许写 state 的地方 |
| `util.mjs` | 无状态工具与常量 | 不依赖 state |

### 3.2 记账（"有什么"

| 模块 | 记什么 |
|---|---|
| `hits.mjs` | **命中回流**：principal 注入 → 我怎么处置 → 处置留痕 |
| `unknowns.mjs` | **未核清单**：我知道自己没验的东西（必填退役条件） |
| `promise.mjs` | **承诺-履行**：`awakenWhen` 从"只写"变成"可机械求值、到期叫醒" |
| `valence.mjs` | **效价账本** R(t)：提示级强化数据源 |
| `adopt.mjs` | **采用**：动手前真的用了某条沉积（含反事实） |
| `unforeseen.mjs` | **类型账**：数量无信息，类型分布有信息 |

### 3.3 呈现（"怎么让我看见"

| 模块 | 产出 |
|---|---|
| `selfsnap.mjs` | **自我快照**：每轮提示开头那一段（在轮身份/记忆/感知/效价/议程…） |
| `awareness.mjs` | **意识代理指标**七项面板（含三种红） |
| `heartbeat.mjs` | **生命体征卡**：把散在各处的量合成一张（**当前未接进 host**，见 §8） |
| `retrieval.mjs` | **检索小脑**：按相似度找历史沉积 |

### 3.4 驱动（"什么时候动

| 模块 | 干什么 |
|---|---|
| `patrol.mjs` | 常驻巡检（默认 20 min）：算 S(t)、检测陈旧、挑议程、必要时发动 |
| `agenda.mjs` | **内生议程**：把"自己发起"从时钟推动改成**账本驱动**（L2，不是 L3） |
| `rhythm.mjs` | **调度权**：陈旧阈值 / 发动节流 / 静默时段，个体可写、有界、可回退 |
| `runstamp.mjs` | **运行期自陈**：证明"跑的是哪一份" |
| `triggers.mjs` | **失败时刻**触发：纪律在动作失败的那一刻出现 |
| `preaction.mjs` | **行动前检索**：规则表 `preaction.rules.json`（tool + contains + hint/ask/deny） |
| `guard.mjs` | 边界硬门禁 |
| `events.mjs` | 宿主事件面：`tools/result` 监听、inbox 感知 |
| `principal.mjs` | **虚拟本体第一块砖**：把"委托人的思考方式"变成可检索的一等公民 |

### 3.5 一次性探针（`_` 前缀）

`_p247_ctrlcheck` · `_p247_sigtest` · `_p327_eventcontract` · `_p327_persistcheck` ·
`_p328_interference` · `_p332_boot_check` · `_p332_runstamp_check` · `_p339_agenda_pick`

**⇒ 它们只在源码里，不进运行副本**（由 `test/engine-sync.test.mjs` 的"未接线但有独立入口"一档保证）。

---

## 4. 数据模型

账本文件：`<沉积根>/.mpm/flywheel.json`（当前约 3.7 MB）
沉积文件：`<沉积根>/.mpm/deposits/<id>-<slug>.md`

### 4.1 账本顶层

```
seq           递增序号（用于生成 Pxxx）
problems      { Pxxx: Problem }
sediments      [Sediment]
hits           [Hit]
unknowns       [Unknown]
promises       [Promise]        （在 problems 内以 awakenWhen 表达）
adopts         [Adopt]
valence        { events: [] }   R(t) 的事件源
measure        { samples: [ {at, active, staleN, ak, s} ] }   最多 48 个
constitution   { autonomy, grantedAt, log, lastFireAt, pending }
patrol         { rounds, lastAt, lastReport, log }
principal      [Principal]      委托人的思考方式（原话 + 约束对象 + 场合）
narrations     [Narration]      T0/T1 叙述
```

### 4.2 Problem（六阶段）

```
G 生成 → F 界定 → S 求解 → C 收敛 → D 沉积 → E 激发（E 回到新 G）
```

| 字段 | 含义 |
|---|---|
| `stage` | `G`/`F`/`S`/`C`/`D`/`E` |
| `delta` / `epsilon` | 界定精度 / 逼近精度（都越低越好） |
| `cost` | 代谢代价 C（工具调用自动累积） |
| `parked` + `awakenWhen` | 搁置与重唤醒条件（**唯一真正退出指令流的路径**） |
| `settled` | 已结账（退出压力计） |
| `deposit` | `{id, path, depositedAt}` —— 有它才说明"复用价值已判定" |

### 4.3 Sediment（沉积）

```
{ id, problemId, title, tags, path, depositedAt, digest, cites,
  lastCitedAt, links, linkWaiver,
  status, supersededBy, supersededAt }        ← 后三个是 P591 新增
```

| `status` | 含义 | 注入/检索 |
|---|---|---|
| `active`（缺省） | 仍然成立 | 参与 |
| `superseded` | 被新沉积取代（`supersededBy` 指向它） | **不参与**，但仍可按 ID 查到 |
| `refuted` | 被否证 | **不参与**，但保留作为证据 |

**⇒ 退休 ≠ 删除**：`status` 只改一个字段，标题/正文/路径全部原样。

---

## 5. 不变量（改代码时不许破）

1. **落盘必须在副作用之后**：算完 → 写盘 → 再打印。反例：`UnicodeEncodeError` 在 `print` 上炸掉，产物一个字节都没落。
2. **`persist()` 的返回值必须被使用**：报告里的"可索引"要按真实结果写，不许无条件断言。
3. **判据必须会在旧代码上红**：新判据要先证明它有区分力（`git stash` / 换回旧实现跑一次）。
4. **负控与正控成对**：凡"排除某类"的判据，必须同时钉住"另一类不许被排除"，否则"什么都不算"也能通过。
5. **一个字段只有一个作者**：账本只有引擎写。外部脚本改账本会被 whole-state persist 覆盖（已实测两次）。
6. **`parked` / `settled` / `open` 的语义不许混**：它们分别退出**议程**、**压力计**、**陈旧清点**。
7. **`deposit` 是"已判定复用价值"的凭证**：`C` 阶段有 `deposit` ⇒ 退出压力计（P587）；无 `deposit` ⇒ 必须仍在。

---

## 6. 判据体系

```bash
node --test                 # 全部（当前 260 条）
node --test test/agenda.test.mjs   # 单个文件
```

**三类判据**（按区分力从弱到强）：

| 类型 | 例子 | 局限 |
|---|---|---|
| 源码扫描 | `audit-*.mjs`、`check-*.mjs` | 只证明"写着"，不证明"跑起来是这样" |
| 同源函数调用 | 直接 import 并调用 | 证明函数行为，不证明接线 |
| **实例级探针** | `agenda-fire.test.mjs`（真的跑 `runPatrol`） | 最强；造得出那场相遇就不必等重启 |

**必备的三件套**（每个新判据都该有）：

```
① 正控：该发生的发生了
② 负控：不该发生的没发生（否则"全不过滤"也能通过）
③ 双向：换回旧代码必须红
```

---

## 7. 开发流程（改引擎文件的正确顺序）

```
① 读契约（preaction.mjs 头部 / 相关模块注释），别先猜
② 改源码（daima/XIN/metaflywheel/engine/...）
③ 跑 node --test，确认没坏
④ ★ 同步到运行副本 ~/.dsh/mpm/engine/modules/  ← 漏了这步，重启也不生效
⑤ 重启 DSH（file:// 静态 import，改完不热更新）
⑥ 验：快照首行不应再有「⚠ 陈旧运行」
⑦ 提交（pre-commit 会拦"未追踪文件"与"落下的改动"）
⑧ 推两个远端：gitee + origin，并核对两处 ref 一致
```

**⇒ 第 ④ 步是今天真实栽过的地方**：改了 4 小时源码，而引擎一直加载另一份副本。
`test/engine-sync.test.mjs` 现在会红着提醒这件事。

---

## 8. 已知债（按优先级）

| # | 债 | 证据 | 建议 |
|---|---|---|---|
| 1 | **账本整份覆盖写** | 外部脚本改账本，约 10 分钟后被 whole-state persist 无声吞掉（两次） | 事件日志：persist 前把 diff 追加 `events.jsonl`（先不换主存储） |
| 2 | ~~权重硬编码~~ **已修（P593）** | 四个来源权重外置到 `agenda-weights.mjs`；`mpm_weights show` 打印各来源贡献占比，单项 ≥60% 报警 | 参数仍在 state 里而非独立配置文件（够用，暂不迁移） |
| 3 | ~~沉积会过时但无状态~~ **已修（P591 + P592）** | `status` + `mpm_supersede` + `selfsnap`/`retrieval` 过滤 + 缓存 key 覆盖 `retiredN` | 仅剩 md front-matter 未同步 status（账本已准，文件里还没写 `status:`） |
| 4 | **检索靠字面** | 485 条沉积里 **332 条 >14 天从未被引用**（81%）；回环率 2.3% | A-MEM 式 `enriched` 侧车（追加 keywords/aliases，不改原文） |
| 5 | **`heartbeat.mjs` 未接线** | `host.js` 两边都不 import 它 | 要么接进快照，要么删掉（别留着让人以为功能存在） |
| 6 | **δ 自报无校准** | 系统对自报 δ 做 `×0.85` 折减 —— 常数无依据 | 记录"自报 δ vs 事后是否回溯改写 ≥0.5"，累积成校准表（Brier） |

---

## 9. 常见故障（今天踩过的六类，全部有解）

| 症状 | 根因 | 检查顺序 |
|---|---|---|
| 改了没生效 | 改的是源码，跑的是 `~/.dsh/mpm/` 副本 | `node --test test/engine-sync.test.mjs` |
| 数据被"吞"回去 | 引擎 whole-state persist 覆盖了外部修改 | 看 `.bak` 时间戳；改之前先停引擎 |
| 判据一直绿 | 判据用同一个错名字/错约定 | 换回旧代码跑一次，必须红 |
| 数字与文字不一致 | 报的是记录数而列的是对象数 | 同时报两个数（`hit-open` 的教训） |
| 指标趋势反向 | 口径里混进了"已完成" | 分解成分看占比（S(t) 的教训） |
| `UnicodeEncodeError` | 先 print 后写盘；GBK 控制台 | 先写盘，再打印；去掉装饰字符 |

---

## 10. 路线图

| 顺位 | 事项 | 状态 |
|---|---|---|
| 1 | 沉积 `status`（ADR 式被取代） | **已完成**（P591 数据层 + 工具；P592 注入/检索过滤 + 缓存 key） |
| 2 | agenda 权重外置 + 贡献占比诊断 | **已完成（P593）**：`mpm_weights` show/set/reset + 单项 ≥60% 报警 |
| 3 | `events.jsonl` 增量日志 | **已完成（P594③）**：旁路接进 persist（失败不影响落盘）· 有界 500 行 · 返回值的 events 字段让「没写成」也可见 |
| 4 | `enriched` 侧车（关键词/别名） | **已完成（P594④）**：`sediment-enrich.mjs` + 已进 `retrieval` 词面；缓存 key 已覆盖富化；端到端判据通过 |
| 5 | 检索三项加权（相关/新近/重要） | **模块已就绪（P594⑤）**：`retrieval-weights.mjs` + 判据（含"置 0 必变序"负控）；**尚未用于 live 排序** |
| 6 | 巡检期离线索引 | **已完成（P594⑥）**：`sediment-index.mjs` + 工具 `mpm_index`（report/write/verify，确定性可验） |

---

## 11. 术语表

| 词 | 含义 |
|---|---|
| **沉积 / 认知遗体** | 一条已固化的可复用结论（markdown 文件 + 账本索引） |
| **命中 / hit** | principal 被注入一次；要求"处置"（我怎么用它） |
| **stillOpen** | 处置了但方向仍未解决；带 14 天承诺复查期 |
| **采用 / adopt** | 动手前真的用了某条沉积，且它改变了做法（必须能写出反事实） |
| **回环率** | adopt 覆盖的沉积 / 沉积总数 —— **只含沉积库**，不等于"我的采用率" |
| **L2 / L3** | L2 = 规则触发的议程；L3 = 我想要。**不许把 L2 说成 L3** |
| **δ / ε** | 界定精度 / 逼近精度。ε 量"我还差多少"，不是"事情还差多少" |
