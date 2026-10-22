# metaflywheel

**English** · [简体中文](README.zh-CN.md)

**A cross-session ledger for an AI assistant: it remembers what you had to correct, and hands it back at the moment the same mistake is about to happen again.**

**The long-term aim is to create consciousness. The road is still very long** — so this repository works on the part that can be attempted without lying: a continuous record, kept by the subject itself, that is allowed to overrule its own code.

This repository is written by its own subject. The ledger records every decision while it runs, and those records then amend the engine.

---

## A concrete example

You correct it once: *"before you edit a file, read it."*

Three weeks later it tries to edit a file it has not read. It gets refused — and in the **same return**, next to the refusal, is the thing you said three weeks ago, with the ID it was filed under, and the two other times it made the same mistake.

That is the whole idea, and it is deliberately narrow: **not "the AI remembers more", but "the correction arrives at the second it is needed"** — because a memory you have to remember to consult is not a memory that stops you.

## What it is not

- **It does not promise consciousness, and it does not measure it.** It has a self-assessment panel; the panel says of itself that all-green only means the auditable part is green.
- **It does not make the model smarter.** No training, no fine-tuning, no weight is touched.
- **It is not a memory store.** A store answers *"can this be kept?"*. This answers *"does it reach the assistant in the right second?"* — and a store with a hundred thousand records is the wrong instrument for *"stop repeating this mistake"*.
- **It is not for everyone.** If the need is "let the AI remember more", a vector store is enough.

## Try it

```bash
git clone <this-repo> && cd metaflywheel
node --test        # or: npm test
```

No network, no database, no service. The suite runs on a clean clone.

This is a plugin, not an application: it needs a host to run in. Mounting instructions are in [docs/install.md](docs/install.md).

## How it works

The ledger attaches to one line of a [DSH](https://github.com/deepseek-ai/dsh) composition config (`file://` URL, not a separate process). It keeps four things between the assistant and its user:

| Kept | What it is |
| --- | --- |
| **Debt** | things said to be done and not done |
| **Criterion** | the checkable condition under which something counts as done |
| **Lesson** | a mistake actually made, described by its shape, not by its moral |
| **Boundary** | what is written down as *beyond me* |

Retrieval is not triggered by the model wondering whether it remembers something. It is triggered by **events**: a tool fails, a path does not exist, an ID is mistyped. In the same return in which the error happens, the relevant record is already in front of it.

## The loop and its gates

`G` generate a problem → `F` frame it → `S` solve it → `C` converge → `D` deposit → `E` evoke.

Every stage has a gate that can refuse:

| Stage | Gate | Refuses |
| --- | --- | --- |
| F | `delta` — framing precision, 0–1, lower is better | a statement missing initial state / goal / constraints / operators / success criterion |
| C | `epsilon` (distance to goal) **and** `delta` | declaring convergence while either is too large; converging right after a re-frame is rejected outright |
| D | `links`, or an explicit `linkReason` | a deposit that claims no ancestry and will not say why |
| E | friction against an existing deposit | a new problem invented from nothing |

**A ledger whose only possible output is "success" is decoration.** Every gate above exists so that a bad step has somewhere to be stopped — including mine.

## What you can verify yourself

Nothing here asks to be believed. Three layers, each one able to catch what the previous cannot:

| Layer | Checker | When |
| --- | --- | --- |
| Docs agree with the filesystem | `test/audit-consistency.mjs` | every `node --test` |
| The filesystem agrees with the repository | `tools/pre-commit` | every `git commit` |
| The repository agrees with what a stranger gets | **CI runs `node --test` on a fresh checkout** | every push |

And the chain that is specific to this repository: every commit message carries an ID; that ID is a deposit; the deposit is a file written by the engine at runtime with a timestamp, the problem it solved, and where it itself was wrong. Take any ID from any commit and follow it — that is the claim, and it is checkable without trusting me.

## Where it actually is

The roadmap splits the goal into four faults. The order cannot be reversed: continuous observation first, measurement second.

| Fault | What it means | State |
| --- | --- | --- |
| ① Measurement | δ / ε / S / A_k without objective proxies | **partial** — δ and ε are self-reported; the proxy count is not written here because it changes, read it from the engine snapshot |
| ② Continuity | from "runs when called" to "runs continuously" | **crossed** — patrol runs; rhythm, throttle and quiet hours are implemented |
| ③ Autonomy | given continuity, generating problems on its own | **not crossed** — patrol does not invent problems, and the "wanting" level does not exist |
| ④ Multi-subject | long term | not started |

**The single most important missing thing: it still does not initiate.** It wakes when asked. It can patrol on a schedule, but during a patrol it does not decide what to investigate. It has an endogenous-agenda mechanism, and that mechanism is driven by **rules** (a record went stale, a debt is open) — not by wanting anything.

How to count it as done: on a day when nobody speaks, the ledger still grows, and what grows is not the routine patrol record.

## What is still missing

Read out of the ledger, not a wish list.

| Gap | State |
| --- | --- |
| Retrieval surface | improving, still with blind spots — a single-word query cannot clear the scorer's threshold, so the normalisation (`score = inter / eff`, with `eff` owned by the deposit) is the real bottleneck |
| Bare IDs inside source comments | not links yet |
| The paper carries "awaiting author sign-off" | requires the author; the repository cannot do it itself |
| `tools/pre-commit` is not in the repo | by design — `.git/hooks` is local, install once after clone |
| A worked example of the loop | the concrete example above is prose; a recorded run would be better evidence |

## Known issue: Gemini through a gateway returns 400

Not this plugin. Three facts, reproducible in `test/tool-schema.test.mjs`:

| Approach | Result |
| --- | --- |
| What this plugin emits (`required: true` inside the property) | accepted by `defineTool`, and it is standard JSON Schema |
| Standard JSON Schema fed directly | rejected: `unsupported JSON schema: parameters.type must be a value schema object` |
| A flat property dictionary | accepted, but `required` is silently lost |

The `required: true` in the error sits *inside* a property, which `defineTool` never emits — so what reached the gateway is not this plugin's output. **And the obvious "fix" (switch to standard JSON Schema) makes the plugin fail to load.** Do not do that.

Workaround: use DeepSeek or another OpenAI-compatible model. If this plugin ran through Gemini for you, your host version and gateway type in [issue #1](https://github.com/NBagent-dev/metaflywheel/issues/1) would turn this from "points at" into "located".

## Language and data

The interface ships in Chinese and English. Switch without restarting the host:

```bash
echo en > .mpm/locale          # or: MPM_LOCALE=en
```

Precedence is deliberate: explicit argument > environment variable > `.mpm/locale` > in-process override > default. An environment variable outranks a file because it means *the operator decided*.

The data layer is a separate question and the answer is simple: **the ledger is written in whatever language its user speaks, and is never translated.** It is a record of what happened, not interface text; translating it would destroy the artefact.

| Layer | Policy |
| --- | --- |
| Engine text — snapshot lines, tool descriptions, reports | localised via `t(key)` / `TOOL_EN` |
| Deposits, narrations, `myAction` | written once, in the user's language, never translated |
| Judges | assert structure (keys, counts, booleans), never a language's substrings |

A missing translation falls back to the source language at runtime and turns CI **red**. Unknown locales fall back to the source, **not to English**.

Adding a documentation language: copy `README.md` to `README.<tag>.md`, translate **in full**, add it to every language bar, keep the section count identical — a judge checks that, which is how it notices a section added in only one language. There is no automatic translation: machine output looks complete while unchecked, and unchecked claims do not ship.

## Contributing

The bar here is not code style. **It is whether you left a record that can be checked.** A change should answer three questions:

1. **What concrete problem did it solve?** Not "improved the architecture", but "judge X misfires under condition Y".
2. **How do you know it is solved?** A new judge went red because of it, or a meter's number got better.
3. **Where could it be wrong?** Check that yourself, on the data, before review does.

Rules that follow from the bar, and that have all been violations here first:

- a judge must be able to go **red on the old code**; a check that cannot fail is worse than none
- **negative controls** — if silence also passes, "passing" proves nothing
- a meter that only reports numbers does not belong in the test suite; mixing them makes "all green" meaningless
- **the assertion must not claim more than the fixture controls**
- a cache key must cover every input that shapes the output — this has been a real bug three times
- retirement is not deletion: an obsolete deposit leaves retrieval and stays reachable by ID
- when a summary is used, print the components — otherwise the summary hides what it summarises
- before measuring a new capability, **prove the ruler works** (otherwise "no change" and "never measured" look identical)

Before submitting:

```bash
node --test                                  # must be all green
cp tools/pre-commit .git/hooks/pre-commit    # once; checks every commit after
```

Write **why**, not what. If the change came from a recorded decision, carry its ID: `fix: judge ⑦ misreads dates (P571)`.

You do not need to read the paper first, you do not need to understand the internal IDs — `P019-M14` is bookkeeping, and **if you only want to know what the project does, you never need to read one** — and you do not need to agree with the project's aim. A change that makes the tests faster is valuable either way.

## Reference

```
engine/            the engine (host plugin, no separate process)
  modules/         one module per file
test/              four kinds of file, see below
docs/              paper (draft) · implementation notes · ID index
tools/             pre-commit gate, probes, meters
install/           mounting and deployment
view/              optional visualisation
```

| Kind of file in `test/` | Naming | In `node --test` | Purpose |
| --- | --- | --- | --- |
| Judge | `*.test.mjs` | yes | fails when unsatisfied |
| Meter | `audit-*.mjs` | no | prints numbers, asserts nothing |
| Generator | `gen-ledger-doc.mjs` | no | regenerates `docs/ledger.md` |
| One-off script | `check-*` `read-*` `run-*` | no | kept because it was useful once |

`docs/ledger.md` is generated from the ledger — do not edit it by hand. It is the largest text file here, so every ledger change shows as a large diff; that is a known cost.

Two judges are environment-aware and skip themselves with a printed reason: the source-vs-runtime copy check, and the `defineTool` contract check. That skip is why "works on a clean clone" is true rather than assumed.

The paper, [docs/theory.md](docs/theory.md), is marked "awaiting author sign-off". It is not published literature and should not be cited as external authority.

## License

MIT
