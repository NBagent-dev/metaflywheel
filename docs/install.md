# 安装

MetaFlywheel **不是独立的 npm 包**。它是一个宿主插件——当前实现在
[DSH（DeepSeek Harness）](https://github.com/deepseek-ai/dsh) 的组合行上运行。

## 你要先有的东西

- 一个能跑的 DSH 宿主（`dsh` 命令可用）
- Node.js 18+（用于跑测试；引擎本身跑在宿主里）

## 三步

```bash
# 1. 克隆并跑测试（不需要宿主，不需要任何外部服务）
git clone <this-repo> && cd metaflywheel
npm test
# 期望：全部通过（数字见 CI badge，不由本文件手写 —— 手写的数字会过期）

# 2. 把引擎挂到宿主的组合行
#    编辑（或新建）~/.dsh/mpm/cordis.patch.user.yml，加入一行以 file:// 指向 engine/host.js
#    具体字段见 docs/architecture.md 的「组合行挂载」一节

# 3. 重启宿主
#    ★ 必须重启：引擎以 file:// 静态 import 加载，改代码不会热生效
```

## 怎么知道它真的挂上了

重启后，**快照的第一行**会出现运行期信息：

```
- 运行期：PID <pid> 起于 <时刻>（dsh <版本>）· 磁盘未变，跑的就是最新一份
```

- 如果它显示「⚠ 陈旧运行」，说明磁盘上的引擎比正在跑的新 ⇒ 需要再重启一次
- 如果**没有**这一行，说明引擎没被加载

## 它能做什么（挂上之后）

引擎会向宿主注册一组工具（`mpm_generate` / `mpm_frame` / `mpm_solve` / `mpm_converge` /
`mpm_deposit` / `mpm_evoke` / `mpm_micro` 等），并在每轮提示装配时注入一份自我快照。

**你不需要记住这些工具名**——正常对话即可；引擎会在它认为需要时提示使用哪个。

## 卸载

从组合行补丁文件里删掉那一行，重启宿主。引擎的数据在
`<工作区>/.mpm/`（账本 `flywheel.json` 与沉积 `deposits/`），删不删都行。
