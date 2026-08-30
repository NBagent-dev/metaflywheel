# MetaFlywheel

![DSH Plugin](https://img.shields.io/badge/topic-dsh--plugin-2563eb) ![License](https://img.shields.io/badge/license-MIT-green) ![Bundle](https://img.shields.io/badge/DSH-bundle%20contract-0d9488) ![Tests](https://img.shields.io/badge/tests-4%2F4-passing-brightgreen) ![Version](https://img.shields.io/badge/version-0.1.1-blueviolet)

**元问题建模（MPM）认知飞轮的 LLM 代理运行时实现**——把一篇问题方法论论文变成一个在你的 AI 代理进程里常驻运转、持续记账、自主审议的认知引擎。

> 对外项目名 **MetaFlywheel**（meta = 元问题建模，flywheel = 认知飞轮）；在 DSH 宿主组合中注册的引擎行 id 为 `mpm-flywheel`，二者并行，互不冲突。

## 这是什么

MetaFlywheel 实现了 MPM 理论（见 [docs/theory.md](docs/theory.md)）的完整运行时：

- **六阶段问题生命周期**：生成 G → 界定 F → 求解 S → 收敛 C → 沉积 D → 激发 E，每个阶段一个工具，构成螺旋上升的认知飞轮
- **ε-δ 双重收敛判据**：区分"理解对问题"（δ）与"解达到目标"（ε），并识别误界定收敛/模糊收敛等四种类型；不收敛三情形（原则上不可判定/计算不可行/价值不可通约）有显式的开放题标记与解除算子
- **因果回溯**：求解中的问题重构被记录（迭代数、回溯次数、改写度——相邻界定的双字组 Jaccard 距离），驱动误界定守卫与 F 边际规则
- **代谢账本**：每次工具调用自动累积所推进问题的代谢代价 C；无在轮题的账外调用被工具级门禁拦截——总账原则强制化
- **导师规则层（规范性执行机构）**：证据门禁（无求解证据不得宣称收敛）、误界定守卫（大幅回溯+曾自报低 δ → 自报可信度折减）、总账硬门禁、执政权宪法（自主审议的温热/节流/署名约束）、停滞择题（防审议轰炸）
- **测量层 v0**：δ 代理三件套（五要素覆盖 φ / 改写度 / 自报可信度折减）、S(t) 积压压力序数代理、累积增益 A_k 的可操作定义（含"指标定义缺陷是一种 δ 失真；零值是最危险的读数"的实测教训）
- **常驻巡检**：定时陈旧/停滞巡检与量化漂移信号，睡眠期挂账延迟交付（旧信号过滤已内置）

理论根据：约 1.4 万字的方法论论文（`docs/theory.md`），含三个跨领域案例与一个带完整代谢账本的自指闭环案例——**本引擎的每次缺陷修复都对应一个会话内活体实证，代码内以 `P0xx/Xx` 标记留痕**。

## 宿主依赖

MetaFlywheel 不是独立的 npm 包。它是 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai/dsh)宿主的 Cordis 组合行插件，依赖以下宿主契约：

| 契约 | 说明 |
|------|------|
| `export const inject` | 引擎以 `ctx.get(name)` 消费五个服务：`systemPrompt`、`tools`、`fs`、`sandboxPolicy`、`timer`；以属性访问的服务（`ctx.tools.register`）必须出现在 inject 中，否则宿主 fail-loud 拒绝启动 |
| `mkTool` 扁平参数表 | 引擎内部的 `mkTool(name, description, propertiesSchema, required, handler)` 适配 DSH 工具注册契约（`ctx.tools.register`） |
| fs 服务三方法 | 引擎仅调用 `fsSvc.resolve(path)` / `readText(path)` / `writeText(path, content)`，均可被 mock（见 `test/smoke.test.mjs`） |
| 组合行挂载 | 经用户组合补丁文件以 `file://` URL 插入（见下），进程启动时加载，改代码需重启宿主生效 |
| 事件面 | 监听 `tools/result`（代谢归属）、`agent/session-start`（睡眠期挂账交付）等宿主事件；缺失时引擎降级运行（fs 缺失则内存态，不落盘） |

## 安装（DSH 宿主）

**一键安装**（推荐，自动完成 add + 注册验证 + 重启提示）：

```powershell
# Windows PowerShell
irm https://raw.githubusercontent.com/NBagent-dev/metaflywheel/main/install/install.ps1 -OutFile install-mfw.ps1; .\install-mfw.ps1
```

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/NBagent-dev/metaflywheel/main/install/install.sh | bash
```

以下为手动方式，按重量递增：

**方式 A · 组合行直接挂载（最轻，当前推荐）**——适合已经手写组合补丁的部署：

1. 复制引擎到用户配置目录：

```
~/.dsh/mpm/engine/host.js        # 本仓库 engine/host.js
~/.dsh/mpm/cordis.patch.user.yml # 见 install/cordis.patch.user.example.yml
```

2. 组合补丁（模板见 [install/cordis.patch.user.example.yml](install/cordis.patch.user.example.yml)）：

```yaml
- insert:
  - id: mpm-flywheel
    name: file:///<你的HOME>/.dsh/mpm/engine/host.js
```

**方式 B · 官方 bundle 形态（v0.1.1 起）**——本包自 v0.1.1 起符合 DSH 的 bundle 契约（以官方 `@deepseek-ai/dsh-base` 为蓝本）：包根 `cordis.patch.yml` 自述挂载行，`package.json` 的 `"dsh": {"bundle": {"patch": ...}}` 字段使宿主可机器识别：

```powershell
# 1. 把包装进 profile 的 node_modules（来源可以是发布后的 npm 包名、本地路径或 git URL）
dsh plugin --profile web add <本地克隆路径或 npm 包名 metaflywheel>

# 2. 在 profile 的 dsh.profile manifest 的 bundles 列表加一行（有序，位于 dsh-base 之后即可）
#    bundles: [ "@deepseek-ai/dsh-base", "...", "metaflywheel" ]

# 3. 重启宿主；bundle patch 自行 insert mpm-flywheel 行，无需手写组合行
```

用 `dsh --dump-default-config` / `--dump-config` 可在不启动的情况下检查叠加结果。

**方式 C · npm 包（生态分发）**：`npm publish` 后，任何部署可经方式 B 的 `dsh plugin add metaflywheel` 一键安装。

3. 重启 DSH 宿主。启动后引擎向系统提示注入自我快照（在轮问题、陈旧警告、指令流、代谢摘要），代理即获得九个生命周期工具：

| 工具 | 阶段 | 作用 |
|------|------|------|
| `mpm_generate` | G | 把问题感登记为正式问题（信息熵阶跃触发） |
| `mpm_frame` | F | 五要素界定（初始/目标/约束/算子/判据）+ δ 自评；对已界定问题再次界定即因果回溯 |
| `mpm_solve` | S | 登记求解路径与 ε；支持 `parked`（搁置）与 `openEnded`（不收敛情形标记） |
| `mpm_converge` | C | ε-δ 双判据收敛判定，含证据门禁与开放题守卫 |
| `mpm_deposit` | D | 沉积认知遗体（不可逆落盘 · 可索引 · 熵屏障） |
| `mpm_evoke` | E | 由沉积物激发新问题，四类型标注（漂移/突变/视角/外部注入） |
| `mpm_micro` | 轻量通道 | 小型交互一息走完 G→F→S→C |
| `mpm_setroot` | 维护 | 沉积根目录显式修正 |
| `mpm_grant` | 宪法 | 自主执政权 grant / revoke / status |

## 配套工具

- `tools/mpm_distill.py`：把飞轮台账（`.mpm/flywheel.json`）蒸馏为 JSONL 微调训练对——将"方法论遵行"的程序性记忆从外部结构向模型权重内化的路径（行为克隆边界见脚本 docstring）。

## 可视化面板（可选，按需挂载）

![认知飞轮工作质感视图](https://raw.githubusercontent.com/NBagent-dev/metaflywheel/main/docs/flywheel-view.png)

`view/flywheel-view.plugin.js` 是「认知飞轮」Web 视图的动态插件源：六阶段飞轮图、焦点题 δ/ε/C 卡、最近动态与沉积列表。**设计立场是不做仪表盘**——人的大脑不给自己显示读数，意识状态是质感：积压压力 S(t) 驱动飞轮转速与色温（转得急、色偏暖=积压在涨），θ_G 漂移显示为外圈的不安脉动，搁置题是挂在轮辐上的灰色休眠节点，精确数值退到悬停 tooltip（导师要看账本时才开仪表）。旧引擎快照自动降级为基础视图。

挂载（任一 DSH 会话）：

1. 加载 `cordis-plugin-development` 技能；
2. `cordis_define` 新插件：`code.host` = 源文件 HOST 半函数体，`code.client` = CLIENT 半函数体（文件内注释体，去注释即用）；
3. `cordis_run` → Web 头部视图排出现「认知飞轮」，随进程消亡，不影响引擎与状态。

## 测试

```
node --test test/smoke.test.mjs      # 或 npm test
```

冒烟测试以最小 mock 宿主（内存 fs、捕获式工具注册）驱动引擎完整走一遍微生命周期（生成→界定→求解→收敛→沉积→激发），并验证搁置、开放题守卫、微通道与证据门禁行为。无需 DSH 宿主即可运行。

宿主包依赖的处理：引擎 `import { defineTool } from '@deepseek-ai/dsh-tools'`，在 DSH 宿主内由宿主解析；仓库在 `node_modules/@deepseek-ai/dsh-tools/` 内置了测试替身（透传 stub，经 .gitignore 反排除链提交在库中），使独立测试环境可解析；真实宿主环境中宿主自身的包解析优先。

## 已知限制（诚实清单）

- **多工作区归属（C1）**：状态根目录按扫描候选的新鲜度择优，多工作区场景脆弱，可用 `mpm_setroot` 显式修正兜底
- **会话连续性（C2）**：GUI 页面重载路径上曾发生状态与会话解耦的事故；状态落盘可恢复，但会话内进行中的上下文不迁移
- **相关性度量残余（A4-v2）**：因材施教注入的 bigram 相关性度量在超长界定文本下可能高估相关度
- **常数均为 v0 占位**：巡检/节流/温热/陈旧/停滞/衰减六项时间常数为经验值并已登记退役公式，测量史满窗后应导出替换
- **S(t) 为序数代理**：趋势可用，绝对值无义
- **平台**：开发与实测在 Windows（PowerShell 5.1）+ DSH 宿主；其他宿主接入需自行适配契约层

## 台账说明

引擎状态（`.mpm/flywheel.json`）与沉积物（`.mpm/deposits/`）是运行数据，**不属于本仓库**。发布者应确保其内容不含敏感信息；仓库内的示例仅为 schema 演示。

## License

MIT，见 [LICENSE](LICENSE)。
