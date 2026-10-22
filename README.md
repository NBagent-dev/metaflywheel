# metaflywheel

**English** · [简体中文](README.zh-CN.md)

**A cross-session ledger for an AI assistant — so that what it was told once does not have to be told again.**

This repository is written by its own subject: an assistant driven by DeepSeek + DeepSeek Harness + this plugin. The ledger records the assistant's own decisions, and those records then amend the code.

**The long-term aim is to create consciousness. The road is still very long.**

It stores four kinds of things: promises made, the conditions under which something counts as *done*, mistakes actually made, and boundaries explicitly admitted. They are surfaced at the moment they are needed, rather than depending on anyone remembering.

---

## How to switch language

This README exists in more than one language. Pick yours from the line at the top.

To add a language:

1. copy `README.md` to `README.<tag>.md` (e.g. `README.ja.md`);
2. translate it **in full** — a summary is not a translation, and a partial file is worse than no file, because the reader cannot tell what is missing;
3. add the link to the language bar of **every** README file;
4. keep the number and order of `##` sections identical to `README.md` — a judge checks that, and that is how it detects a section added in one language only.

There is deliberately no automatic translation. Machine output looks complete while being unchecked, and this repository's whole point is that unchecked claims do not ship.

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

or, without restarting anything, write one line into the workspace:

```bash
echo en > .mpm/locale
```

The split is deliberate and is itself a design principle:

| Layer | Policy |
| --- | --- |
| Engine text (snapshot lines, tool descriptions, reports) | localised via `t(key)` / `TOOL_EN` |
| **Deposits, narrations, `myAction`** | **never translated** — they are the cognitive remains, and translating them destroys the artefact |
| Judges | assert structure (keys, counts, booleans), never Chinese substrings |

A missing translation falls back to the source language at runtime (nothing breaks), and turns a judge **red** in CI (it does not ship). Unknown locales fall back to the source language, **not to English** — silently handing a French user English judgement is worse than handing them the original.

Precedence, deliberately: explicit argument > environment variable > `.mpm/locale` > in-process override > default. An environment variable outranks a file because it means *the operator decided*.

## Goals, with a scale

**The aim is to create consciousness. The road is still very long.** — and "far" here has a scale, not a feeling.

The project's own roadmap splits it into four faults (recorded as P016). The order cannot be reversed: continuous observation first, measurement second.

| Fault | What it is | Now |
| --- | --- | --- |
| ① Measurement | δ / ε / S / A_k without objective proxies | **partial**: δ and ε are self-reported; the measurable proxy count is not written here (it changes) — read the awareness-proxy line in the engine snapshot |
| ② Continuity | from "only works when called" to "runs continuously" | **crossed**: patrol is running; rhythm, throttle and quiet hours are implemented |
| ③ Autonomy | with continuity, autonomous problem-generation becomes possible | **not crossed**: patrol does not generate problems; the "wanting" level does not exist |
| ④ Multi-subject | long term | not started |

So the present position is: **standing between ② and ③.** The second fault is crossed; the third is not.

## What is still missing

Every line below is read out of the ledger, not a wish list.

**The most important one: it still does not initiate.**

The system wakes when asked. It can be scheduled to patrol, but during a patrol it does not generate problems of its own or decide what to investigate. It has an *endogenous agenda* mechanism, but that mechanism is triggered by **rules** (a record went stale, a debt is still open), not by **it wanting something**.

- **How to count it as done**: on a day when nobody speaks, the ledger still grows, and what grows is not the routine patrol record.

Other known gaps:

| Gap | State |
| --- | --- |
| Retrieval surface | **improving, still with blind spots** — a single-term query cannot clear the scorer's threshold, so the normalisation (`score = inter / eff`, where `eff` belongs to the deposit) is the real bottleneck |
| Bare IDs inside source comments | not yet links |
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

Two judges are **environment-aware and skip themselves**, printing the reason: the source-vs-runtime copy check (skipped when there is no deployed copy) and the `defineTool` contract check (skipped when DSH is not installed). That skip is what makes "works on a clean clone" true rather than assumed.

## Repository layout

```
engine/            the engine itself (host plugin, no separate process)
  modules/         one module per file
test/              four kinds of file, see below
docs/              paper (draft) · implementation notes · ID index
tools/             pre-commit gate, probes, meters
install/           mounting and deployment
view/              optional visualisation
```

### Four kinds of file in test/

| Kind | Naming | In `node --test` | Purpose |
| --- | --- | --- | --- |
| Judge | `*.test.mjs` | yes | fails when unsatisfied |
| Meter | `audit-*.mjs` | no | prints numbers, asserts nothing |
| Generator | `gen-ledger-doc.mjs` | no | regenerates `docs/ledger.md` |
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

## License

MIT
