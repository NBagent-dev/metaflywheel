# Changelog

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
