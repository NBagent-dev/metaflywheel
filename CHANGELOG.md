# Changelog

## v0.3.0（2026-09-06）

巨型闭包模块化（P079 十轮工程）与体验连续实验线落地——engine/host.js 从 1530 行单函数重构为 274 行薄入口 + 10 个模块：

- **结构重构**：util / retrieval / selfsnap / core / valence / guard / tools / state / events / patrol 十模块化拆分（makeTools/makeStateMachine 等依赖注入工厂）；迁移期修复 2 个潜伏 bug（P073 retrieveTop 签名错位致「历史经验」检索通道静默失效；citeSediments 重复函数头）；每轮 node --check + 冒烟 5/5 全绿
- **中间件缓存面**（P073）：提示注入塌缩（在轮身份只列 G/F/S+新课 C）、沉积语料索引缓存（append-only 键）、快照 per-rev 记忆化
- **叙述/体感层**（P076/T0/T1）：`mpm_narrate` 工具（64 条环形+体感信号自动织入）、自我快照「近日叙述」段、面板视图 v2.1（指纹门禁+自适应退避轮询）
- **运维**：sync-engine.ps1 升级为整目录同步（host.js+modules 逐字节校验）；CodeCheck 平均圈复杂度 134.6 → 17.0（本地代理 ~14.8）
- **实验**：现象层连续性实验设计书（T0-T3）、A/B 有效性测试包（P025，A 臂已完成，B 臂待切换对照）；R4 盲测首数据点（P023-M42：记忆连续成立、体验连续缺口实体化）

## v0.2.1（2026-08-30）

- 修复：检索小脑命中行的渲染缺陷——`retrievalHits()` 返回字符串而调用方按 `{text}` 解引用，命中时快照/状态视图显示 `undefined`；现按调用方契约返回 `{text}` 对象。该缺陷由首个天然相似查询（打包类在轮题命中打包类沉积）在活体中暴露，属"机制正确、显示层断裂"型

## v0.2.0（2026-08-30）

个体功能层扩展：效价账本（R1）与检索小脑（D）——自我快照从"状态陈列"升级为带在线信号与相似度检索的工作记忆：

- 效价账本 v1：事件→效价映射（完全收敛 +2 / 沉积兑现引用 +1 / δ自报失真 −1 / 误界定收敛 −1 / 边界硬拦截 −1；搁置与生命周期门禁拒绝不罚——合法生命周期动作），R(t)=48h 半衰指数衰减和，持久化新增 `valence` 字段（含旧态迁移回填）；自我快照与状态视图新增效价行——提示级强化的数据源（收敛模式被指令流强化、事故模式被警告行抑制）
- 检索小脑 v1：沉积（title+tags）与已结算题（title+framing 前 120 字）双语料 bigram 相似度检索（沿 P027/A4 语料 DF 过滤纪律），Top-2 附命中分注入自我快照与状态视图；记忆区按热度序、检索区按相似度序，两序之差为可测对照；诚实零命中输出（宁缺勿滥）
- 新常数按宪法登记：VALENCE_TAU_MS / VALENCE_MAP / RETRIEVE_TOP_N / RETRIEVE_MIN_SCORE（均 v0 占位 + 预注册退役公式）
- 活体验证：效价行随真实收敛事件实时涨落并跨重启持久；检索与 M9③ 因材施教同查询行为一致（一致性背书）

## v0.1.1（2026-08-29）

升级为 DSH 官方 bundle 契约形态（以 `@deepseek-ai/dsh-base` 实物为蓝本），可被 `dsh plugin` 流程索引安装：

- 包根新增 `cordis.patch.yml`（bundle 自述挂载 patch：insert `mpm-flywheel` 行，name 解析到包 main）
- `package.json` 新增 `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}` 机器可读声明；`main`/`exports` 指向 `engine/host.js`；`peerDependencies` 声明宿主契约（`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`）；`files` 收录发布物
- 安装方式 B 从"约定提法"升级为真实契约：`dsh plugin --profile <name> add <来源>` + 在 `dsh.profile.bundles` 加一行 `metaflywheel`
- 单包双形态兼容：file:// 直挂 `engine/host.js`（v0.1.0 方式）与 bundle 包名解析（v0.1.1 方式）加载同一模块，行为一致
- `repository` 字段补全

## v0.1.0（2026-08-29）

首个可发布版本。引擎源起于单用户生产环境（31 个问题 / 20 份沉积物 / 34 轮巡检的实战台账），按开源就绪度审计完成打包：参数化部署路径、补齐文档与许可证、新增宿主无关冒烟测试。

### 生命周期与判据
- 六阶段工具链：generate / frame / solve / converge / deposit / evoke + micro / setroot / grant
- ε-δ 双重收敛判据、四类型收敛分类、证据门禁（无求解证据不得宣称收敛）
- 因果回溯记录（迭代/回溯/改写度）与误界定守卫（δ 自报可信度折减）、F 边际规则
- 不收敛三情形的开放题标记（openEnded：permanently-open / dimensional-reduction / negotiated-compromise），开放题保留在轮地位、豁免收敛指令、可显式解除，收敛守卫拒绝开放题
- 激发四类型标注（drift / mutation / perspective / injection）

### 规范性执行机构（导师规则层）
- 证据门禁、误界定守卫、F 边际规则、总账硬门禁、执政权宪法（温热/节流/署名/粘性修正权）、停滞择题（单轮最多 2 题named signal）
- 搁置（parked）贯穿过滤：指令流 / 陈旧名单 / 巡检清点 / 代谢采样 / 睡眠期挂账交付

### 测量层 v0
- δ 代理三件套（φ 五要素覆盖 / 改写度 Jaccard / 自报可信度折减）、S(t) 积压压力序数代理（近 5 趋势）
- 累积增益 A_k 可操作定义：g = (Δδ + 0.5Δε + 0.2·闭环) / max(1, C)；ε0 首值捕获与历史回填
- 巡检结构化日志（patrol.log）；θ_G 漂移信号携带可读理由（空意图发动缺陷修复）
- 六项时间常数 v0 标注 + 预注册退役公式（CONSTS 表）

### 打包
- 部署路径参数化（去除单用户绝对路径）
- README（概念/安装/工具参考/已知限制）、LICENSE（MIT）、本变更日志
- 宿主无关冒烟测试（node:test，内存 fs mock，微生命周期全流程 + 搁置/开放题/微通道断言）
- 理论文档 docs/theory.md（MPM 论文 v2）
- 蒸馏工具 tools/mpm_distill.py（台账 → 微调训练对）
