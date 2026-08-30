# dsh-plugin-collection 收录 PR 材料

> 用途：向 https://github.com/daha1216/dsh-plugin-collection 提交收录 PR 时，
> 把下面两段分别合入 `plugins.json` 与 PR 描述。fork 动作需在网页点一次
> （仓库页右上角 Fork），其余 git 操作本机可经 ssh.github.com:443 完成。

## 1. plugins.json 新增条目（追加到 plugins 数组末尾）

```json
{
  "id": "metaflywheel",
  "name": "metaflywheel",
  "version": "0.1.1",
  "description": "MPM 认知飞轮引擎：六阶段问题生命周期（生成→界定→求解→收敛→沉积→激发）+ ε-δ 双判据收敛判定 + 代谢账本与导师规则层，作为 DSH 组合行常驻运转；符合官方 bundle 契约（cordis.patch.yml + dsh.bundle.patch 声明）。",
  "source": "https://github.com/NBagent-dev/metaflywheel",
  "install": "github:NBagent-dev/metaflywheel",
  "update": "dsh plugin --profile web update metaflywheel"
}
```

## 2. PR 描述文案

**标题**：`Add metaflywheel — MPM cognitive flywheel engine (bundle contract conformant)`

**正文**：

> 收录申请：metaflywheel v0.1.1
>
> **是什么**：Meta-Problem Modeling（MPM）认知飞轮的 DSH 常驻引擎——六阶段问题
> 生命周期（generate/frame/solve/converge/deposit/evoke）、ε-δ 双重收敛判据、
> 代谢账本（每次工具调用自动归属在轮问题）、导师规则层（证据门禁/误界定守卫/
> 执政权宪法），配套微调训练对蒸馏工具与完整理论文档。
>
> **契约符合性**（对照 dsh-plugin-collection 收录标准）：
> - 包根 `cordis.patch.yml`：insert `mpm-flywheel` 行 ✓
> - `package.json` 含 `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}` ✓
> - `main`/`exports` 指向插件模块（engine/host.js，导出 name/inject/apply）✓
> - 安装即用，零核心改动，卸载即净 ✓
>
> **质量信号**：宿主无关冒烟测试 4/4（`npm test`，node:test）；MIT；README
> 含已知限制诚实清单；变更日志完整（v0.1.0/v0.1.1）。
>
> **验证方式**：`dsh plugin --profile web add github:NBagent-dev/metaflywheel`
> → 在 `dsh.profile` 的 `bundles` 列表加 `metaflywheel` → 重启 → `dsh
> --dump-config` 可见 mpm-flywheel 行。

## 3. 提交流程（本机执行部分）

```powershell
# 1. 网页 fork daha1216/dsh-plugin-collection 到 NBagent-dev 账号
# 2. 本机：
git clone git@github.com:NBagent-dev/dsh-plugin-collection.git
cd dsh-plugin-collection
# 编辑 plugins.json 追加上述条目（保持 JSON 合法）
git checkout -b add-metaflywheel
git add plugins.json; git commit -m "Add metaflywheel (MPM cognitive flywheel engine)"
git push -u origin add-metaflywheel
# 3. 网页开 PR（base: daha1216/main）粘贴上述标题与正文
```
