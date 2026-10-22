# metaflywheel

这是一个给 AI 助手用的跨对话账本。**最终愿景是创造意识** —— 路还非常远，所以它试图把"只在被问到时醒来"往"连续存在"推，而不是宣布已经做到了。

**A cross-session ledger for an AI assistant — so that what it was told once does not have to be told again.**

This repository is written by its own subject: an assistant driven by DeepSeek + DeepSeek Harness + this plugin. The ledger records the assistant's own decisions, and those records then amend the code.

**The long-term aim is to create consciousness. The road is still very long.**

It stores four kinds of things: promises made, the conditions under which something counts as *done*, mistakes actually made, and boundaries explicitly admitted. They are surfaced at the moment they are needed, rather than depending on anyone remembering.

---

## What problem it solves

An AI assistant starts from zero every conversation. The correction you made yesterday, it makes again today; the judgement you made last week, it does not remember this week.

The usual answer is a memory store. But a memory store solves *"can it be stored"*, not *"does it reach the assistant at the right moment"*. A store with a hundred thousand records and a ledger that keeps thirty debts are not the same instrument when the task is *"stop making the same mistake"*.

## How it works

The ledger attaches to a [DSH](https://github.com/deepseek-ai/dsh) composition line (`file://` URL, not a separate process). It maintains four lines between the assistant and its user:

- **Debt** — things said to be done and not done
- **Criterion** — the checkable condition under which something counts as done
- **Lesson** — a mistake made, including the specific shape it took
- **Boundary** — what is written down as *beyond me*

Retrieval is not triggered by "remembering". It is triggered by **concrete events**: a tool fails, a path does not exist, an ID is mistyped. In the same return in which the error happens, the relevant record appears.

## The loop has six stages, and each one can be refused

`G` generate a problem → `F` frame it → `S` solve it → `C` converge → `D` deposit → `E` evoke.

Each stage has a gate that can say no:

| Stage | The gate | What it refuses |
| --- | --- | --- |
| F | `delta` (framing precision, 0–1, lower is better) | a statement missing initial state / goal / constraints / operators / success criteria |
| C | `epsilon` (distance to goal) **and** `delta` | declaring converged while either is too large; converging right after a re-frame is rejected outright |
| D | `links` or an explicit `linkReason` | a deposit that claims no ancestry without saying why |
| E | friction against an existing deposit | a new problem invented from nothing |

**A ledger whose only output is "success" is a decoration.** Every stage above exists so that a bad step has somewhere to be stopped.

## Costs, stated plainly

**The user is recorded too.** Judgements you stated are remembered, changes of mind leave a trace, things marked *"not verified"* stay on the list until they are closed with evidence.

That is part of the design, not a side effect. A ledger that records only the AI cannot solve *"humans repeat themselves too"*.

## Ten things that are easy to get wrong, and are judges here

This repository's contribution bar is not code style. It is: **did you leave a record that can be checked?**

- A judge must be able to go **red on the old code**; a check that cannot fail is worse than no check
- **Negative controls**: when silence also passes, "passing" proves nothing
- A metric that only reports numbers must not live in the test suite; mixing them makes "all green" meaningless
- **The assertion must not claim more than the fixture controls**
- A cache key must cover **every input that shapes the output** — this has been a real bug three times
- Retirement is not deletion: an obsolete deposit leaves retrieval and stays reachable by ID
- A summary must not be allowed to hide the structure it summarises: print the components
- Before measuring a new capability, **prove the ruler works first** (otherwise "no change" and "never measured" read identically)
- When a parameter was silently ignored, the judge was testing the implementer's imagination, not the code
- Language belongs in the render layer; **the cognitive remains are never translated**

## Language

The engine ships in Chinese and English. Locale resolution:

```bash
MPM_LOCALE=en   # or DSH_MPM_LOCALE=en
```

The split is deliberate and is itself a design principle:

| Layer | Policy |
| --- | --- |
| Engine text (snapshot lines, tool descriptions, reports) | localised via `t(key)` / `TOOL_EN` |
| **Deposits, narrations, `myAction`** | **never translated** — they are the cognitive remains, and translating them destroys the artefact |
| Judges | assert structure (keys, counts, booleans), never Chinese substrings |

A missing translation falls back to the source language at runtime (nothing breaks), and turns a judge **red** in CI (it does not ship). Unknown locales fall back to the source language, **not to English** — silently handing a French user English judgement is worse than handing them the original.

## Goals, with a scale

**The aim is to create consciousness. The road is still very long.** — and "far" here has a scale, not a feeling.

The project's own roadmap splits it into four faults (recorded as P016). The order cannot be reversed: continuous observation first, measurement second.

| Fault | What it is | Now |
| --- | --- | --- |
| ① Measurement | δ / ε / S / A_k without objective proxies | **partial**: δ and ε are self-reported; the measurable proxy count is not written here (it changes) — read the "意识代理指标" line in the engine snapshot |
| ② Continuity | from "only works when called" to "runs continuously" | **crossed**: patrol is running; rhythm, throttle and quiet hours are implemented |
| ③ Autonomy | with continuity, autonomous problem-generation becomes possible | **not crossed**: patrol does not generate problems; the "wanting" level does not exist |
| ④ Multi-subject | long term | not started |

So the present position is: **standing between ② and ③.** The second fault is crossed; the third is not.

The scale has one use: it makes "did this step move it closer, or only make it look more complete?" answerable — by asking which fault the step crosses.

## What is still missing

Every line below is read out of the ledger, not a wish list.

**The most important one: it still does not initiate.**

The system wakes when asked. It can be scheduled to patrol, but during a patrol it does not generate problems of its own or decide what to investigate. It has an *endogenous agenda* mechanism, but that mechanism is triggered by **rules** (a record went stale, a debt is still open), not by **it wanting something**.

- **How to count it as done**: on a day when nobody speaks, the ledger still grows, and what grows is not the routine patrol record.

Other known gaps:

| Gap | State |
| --- | --- |
| Retrieval surface | **improving, still with blind spots** — a single-term query cannot clear the scorer's threshold, so the normalisation (`score = inter / eff`, where `eff` belongs to the deposit) is the real bottleneck |
| About 59 bare IDs inside source comments | not yet links |
| The paper is marked "awaiting author sign-off" | **requires the author; the repository cannot do this itself** |
| `tools/pre-commit` is not in the repo | by design (`.git/hooks` is local); install once after clone |

## What it does not promise

- **It does not promise "consciousness", nor measure it.** There is a self-assessment panel, and the panel says of itself: *"even if all ten are green, that only means the auditable part is green."*
- **It does not improve model capability.** No training, no fine-tuning, no weight is changed.
- **It is not right for everyone.** If the requirement is "let the AI remember more", a vector store is enough; this project is not needed.

## Known issue: Gemini via a gateway returns 400

**Root cause is not in this plugin.** Three reproducible facts (also in `test/tool-schema.test.mjs`):

| Approach | Result |
| --- | --- |
| How this plugin writes it (`required: true` inside the property) | ✓ accepted by `defineTool`, and it emits standard JSON Schema |
| Feeding standard JSON Schema directly | ✗ rejected: `unsupported JSON schema: parameters.type must be a value schema object` |
| A flat property dictionary | ✓ accepted, but `required` is lost |

**⇒ The schema this plugin produces is already standard, so the 400 does not come from it.** The `required: true` in the error appears *inside* a property, which `defineTool` never emits — so what was sent upstream is not this plugin's output. The problem lies in the host → gateway → Gemini conversion chain.

**⇒ And the seemingly obvious fix ("switch to standard JSON Schema") makes the plugin fail to load.** Do not do that.

**Workaround**: use DeepSeek or another OpenAI-compatible model.

**If this plugin ever ran through Gemini for you**, write your host version and gateway type into [issue #1](https://github.com/NBagent-dev/metaflywheel/issues/1) — that moves this from "evidence points at" to "located".

## Quick start

```bash
git clone <this-repo> && cd metaflywheel
node --test        # or: npm test
```

The suite has **no external dependencies** — no network, no database, no service. This repository is not a standalone npm package; it needs a host to run. Installation details are in [docs/install.md](docs/install.md).

Two judges are **environment-aware and skip themselves**, printing the reason:

- the source-vs-runtime copy check — skipped when there is no deployed copy
- the `defineTool` contract check — skipped when DSH is not installed

That skip is what makes "works on a clean clone" true rather than assumed: continuous integration runs the same command on a machine with neither.

## Repository layout

```
engine/            the engine itself (host plugin, no separate process)
  modules/         one module per file
test/              four kinds of file, see below
docs/              paper (draft) · implementation notes · ID index
tools/             pre-commit gate, probes
install/           mounting and deployment
view/              optional visualisation
```

### Four kinds of file in test/

| Kind | Naming | In `node --test` | Purpose |
| --- | --- | --- | --- |
| Judge | `*.test.mjs` | yes | fails when unsatisfied |
| Meter | `audit-*.mjs` | no | prints numbers, asserts nothing |
| Generator | `gen-ledger-doc.mjs` | no | regenerates `docs/ledger.md` from the ledger |
| One-off script | `check-*` `read-*` `run-*` | no | used while writing, kept as small tools |

Meters are deliberately excluded from the suite. A judge must be able to fail; a meter only reports. Mixing them destroys the meaning of "all green".

### `docs/ledger.md` is generated

```bash
node test/gen-ledger-doc.mjs
```

It is produced from the ledger; do not edit by hand, it will be overwritten. It is the largest text file in the repository, so every ledger change shows up as a large diff. That is a known cost, not a defect.

## Three checking dimensions

Each layer, once added, exposes what the previous layer could not see. That is why they exist.

| Dimension | Checker | When |
| --- | --- | --- |
| Docs consistent with the filesystem | `test/audit-consistency.mjs` | every `node --test` |
| Filesystem consistent with the repository | `tools/pre-commit` | every `git commit` |
| Repository consistent with what a stranger gets | **CI runs `node --test` on a fresh checkout** | every push |

The third layer used to be manual ("clone into a temp directory and run it") and is now automated. Making it automated is what found that line endings, not code, decided whether the sync judge passed.

Installing the second layer takes two lines:

```bash
cp tools/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit      # not needed on Windows
```

`.git/hooks/` is local and is not committed, so it must be installed once after cloning. Not installing it does not stop anything from working, but "forgot to commit a file" becomes invisible again. `git commit --no-verify` bypasses it when genuinely necessary, and every bypass deserves a reason.

## Honest notes

### The repository is written by its own subject, and keeps books

The accurate description is not "AI-assisted human coding". The flywheel records every decision while it runs, and those records then amend its own code.

That yields a verifiable chain:

1. every commit message carries the ID of a *deposit* — a conclusion that was made irreversible, e.g. `P571`;
2. those deposits are produced by the engine at runtime and written under `<workspace>/.mpm/deposits/`, indexed in [docs/ledger.md](docs/ledger.md);
3. the engine's own code is amended out of those deposits.

How to verify: take an ID from any commit, locate it in `docs/ledger.md`, open the deposit file it points to. Inside there is a timestamp, the problem it solved at the time, and where it itself was written wrongly and corrected.

The books are not tidied up afterwards. They are written in the same round in which the problem happened. **An AI can write code; the AI here has books.**

### The paper is a draft

[docs/theory.md](docs/theory.md) is a methodology paper marked "awaiting author sign-off". It is not published literature and should not be cited as external authority.

### Internal IDs can be ignored

IDs like `P019-M14` are the project's own bookkeeping. **If you only want to know what the project does, you never need to read one.**

### How long is this repository

These numbers change daily, so they are not written here — one command computes them:

```
node test/audit-timeline.mjs
```

It reports three things: the date of the first and last deposit, the span and the number of recorded days, and the longest gaps (over 60 hours).

**Why gaps deserve their own report**: those stretches are not "nothing was happening", they are "nobody came". The system does not think when nobody is there. **That is at once its current position and the next problem to solve.**

## Contributing

The bar here is unusual. **It is not code style; it is whether you left a record that can be checked.**

Any change should answer three questions:

1. **What concrete problem did it solve?** Not "improved the architecture", but "judge X misfires under condition Y".
2. **How do you know it is really solved?** Either a new judge goes red because of it, or a meter's number improves.
3. **Where could it be wrong?** Verify that yourself on the data, before review finds it.

The hundreds of IDs in `docs/ledger.md` are the product of that standard. Most of them record not successes but **hypotheses overturned by data**. This repository considers the latter more valuable.

### Before you submit

```bash
node --test                                  # must be all green
cp tools/pre-commit .git/hooks/pre-commit    # install once; checks every commit afterwards
```

Write **why** you changed it, not what you changed. If the change came from a recorded decision, carry its ID (`fix: judge ⑦ misreads dates (P571)`).

### What you do not need

- **You do not need to read the paper first.** Implementation and theory are two independent lines.
- **You do not need to understand internal IDs.** They are an index, not required reading.
- **You do not need to agree with the project's aim.** A change that makes the tests faster or the judges sharper is valuable either way.

### If you only want to use it

That is fine too. The three lines in *Quick start* are enough. This is a tool, not a movement.

---

## 简体中文（摘要）

这个仓库是一个给 AI 助手用的**跨对话账本**，由一个正在被它记录的个体自己写出。**最终愿景是创造意识**；它的姿态是**试图**往那里推，而不是先声明那不可能。

它记录四类东西：**债**（说要做而没做）、**判据**（怎样算完成）、**教训**（犯过的错及其具体形态）、**边界**（明确承认做不到的地方）。这些内容不靠"想起来"，而靠**具体事件**触发——工具失败、路径不存在、编号写错，错误发生的那一秒，相关记录出现在同一个返回里。

飞轮有六个阶段（建题 → 界定 → 求解 → 收敛 → 沉积 → 激发），**每一段都有一道会说不的闸门**：界定缺要素会被拒、证据没增长就宣布收敛会被拒、沉积声明没有前身却不给理由会被拒。**一个只输出"成功"的账本只是装饰。**

**代价要说清**：使用者也会被记账——说过的判断会被记住，改主意留痕，标过"没验"的东西会一直挂到被核销为止。这是设计的一部分。

**它不承诺**：不承诺"有意识"也不测量那个；不改善模型能力（不训练、不微调、不动任何权重）；不适合"只想让它多记点东西"的场景（那用向量库就够）。

### 诚实的说明

论文（`docs/theory.md`）**未定稿**，标注为"作者终审待做"，不能由本仓库自己完成——它不是已发表文献。而这个仓库的代码有相当比例**由 AI 写**：飞轮在运行中记录每一次决定，那些记录又反过来增补了它自己的代码。

### 内部编号不是必读

仓库里会出现形如 `P019-M14` 的编号，它们是项目自己的台账标识，指向某次具体修复与它当时的证据。**如果只想知道这个项目做什么，不需要读任何一个编号。**

### 接下来要做什么

```
它现在还不会自己发起。巡检在跑、节律与静默时段都已实现，但"到点后做什么"仍需一次外部提示；
内生议程的触发源是【规则】（某条记录老了、某笔账没清），不是【它想要】。
⇒ 怎么算做到：没有人说话的一天里，账本仍在增长，且增长的不是巡检的例行记录。
```

其他已知缺口：检索的归一化（`score = inter / eff`，分母属于沉积自己）才是召回的真实瓶颈；源码注释里仍有约 59 处裸编号；`tools/pre-commit` 不进版本库（`.git/hooks` 属本地，克隆后装一次）。

### 如何贡献

贡献门槛不是代码风格，是：**你有没有留下一条能被核对的记录**——它解决了什么具体问题、怎么知道真的解决了、可能在哪里错。`docs/ledger.md` 里那几百条编号记录的多数不是成功，而是**被数据推翻的假设**。

```bash
npm test        # 必须全绿（等价于 node --test）
```

**语言**：引擎文案走 `MPM_LOCALE=zh|en`；而**沉积正文永不翻译**——那是认知遗体，翻它就毁了它。缺翻译时运行期回退原文（不崩），发布前判据会红（不许上线）。

**当前位置**：四道断层里跨过了第二道（连续性），第三道（自主性）没有。

---

## License

MIT
