# metaflywheel

**English** · [简体中文](README.zh-CN.md)

A cross-session ledger for an AI assistant. It stores the corrections a user made, the mistakes the assistant actually made, and the conditions under which a task counts as finished, and it returns the relevant record at the moment it is needed.

**The long-term aim is to create consciousness. The road is very long**, so this repository works only on the part that can be attempted without self-deception: a continuous record maintained by the subject itself, allowed to overrule its own code.

The repository is written by its own subject. The ledger records each decision during execution, and those records are then used to amend the engine.

---

## A concrete example

A user corrects the assistant once: *read a file before editing it*.

Three weeks later the assistant attempts to edit a file it has not read. The attempt is refused, and in the same tool return, next to the refusal, the ledger supplies the original correction with the ID it was filed under, together with the two earlier occasions of the same mistake.

The scope is deliberately narrow. The objective is not to make the assistant remember more; it is to make a stored correction arrive at the moment it applies. A record that only surfaces when someone remembers to look it up cannot prevent the mistake it describes.

## Scope and non-goals

| The repository does | The repository does not |
| --- | --- |
| store corrections, mistakes, open debts and explicit boundaries | claim or measure consciousness |
| return them on concrete events (a failing tool, a missing path, a malformed ID) | change model weights, train, or fine-tune |
| expose every decision in a ledger that can be read and audited | replace general-purpose memory or retrieval systems |

A memory store answers whether something can be kept. This project addresses whether it arrives at the right moment, which is a different problem and needs a different instrument. If the requirement is simply that the assistant remembers more, a vector store is sufficient and this project is not needed.

The engine includes a self-assessment panel for a set of measurable indicators; the panel itself states that an all-green result means only that the auditable part is auditable.

## Getting started

```bash
git clone <this-repo> && cd metaflywheel
node --test        # or: npm test
```

The test suite has no network, database or service dependency and runs on a clean clone.

This is a plugin, not a standalone application: it requires a host to run in. Mounting and deployment are described in [docs/install.md](docs/install.md).

## How it works

The ledger attaches to a single line of a [DSH](https://github.com/deepseek-ai/dsh) composition config as a `file://` URL. No separate process is started. Four record types are maintained between the assistant and its user:

| Record | Content |
| --- | --- |
| Debt | work that was declared and has not been completed |
| Criterion | the checkable condition under which the work counts as finished |
| Lesson | a mistake that occurred, described by its shape rather than its moral |
| Boundary | what has been explicitly written down as out of scope |

Retrieval is event-triggered rather than self-triggered. The assistant does not decide to consult its memory; a failing tool, a missing path or a malformed ID causes the relevant record to be included in the same tool return.

## The loop and its gates

The problem lifecycle is `G` generate → `F` frame → `S` solve → `C` converge → `D` deposit → `E` evoke.

Each stage has a gate that can refuse the transition:

| Stage | Gate | Refuses |
| --- | --- | --- |
| F | `delta`: framing precision, 0–1, lower is better | a statement missing initial state, goal, constraints, available operators or success criterion |
| C | `epsilon` (distance to goal) **and** `delta` | convergence while either value is too large; convergence immediately after a re-frame is rejected outright |
| D | `links`, or an explicit `linkReason` | a deposit that claims no ancestry and gives no reason |
| E | friction against an existing deposit | a new problem with no origin |

A ledger whose only reachable output is "success" cannot be audited. Every gate above exists so that a failed step has a defined place to be stopped, including the engine's own.

## What can be verified

Three checking layers are in place, each able to detect what the previous layer cannot.

| Layer | Checker | Trigger |
| --- | --- | --- |
| Documentation agrees with the filesystem | `test/audit-consistency.mjs` | every `node --test` |
| The filesystem agrees with the repository | `tools/pre-commit` | every `git commit` |
| The repository agrees with a fresh checkout | CI runs `node --test` on a clean clone | every push |

The claim specific to this repository is also checkable without trusting the author. Every commit message carries an ID; each ID is a deposit; each deposit is a file written by the engine at runtime, containing a timestamp, the problem it solved and any correction it received later. Any ID from any commit can be followed to its deposit through [docs/ledger.md](docs/ledger.md).

## Current position

The roadmap separates the objective into four faults. The order is fixed: continuous observation first, measurement second.

| Fault | Description | State |
| --- | --- | --- |
| ① Measurement | `delta`, `epsilon`, `S`, `A_k` without objective proxies | partial: `delta` and `epsilon` are self-reported; the proxy count changes and is read from the engine snapshot rather than restated here |
| ② Continuity | from running-on-call to running-continuously | crossed: patrol runs, with rhythm, throttle and quiet hours implemented |
| ③ Autonomy | given continuity, originating problems without a request | not crossed: patrol does not originate problems, and the level of wanting does not exist |
| ④ Multi-subject | long term | not started |

The largest open gap is item ③. The system wakes when asked. It can patrol on a schedule, but a patrol does not decide what to investigate. An endogenous-agenda mechanism exists and is driven by rules such as a stale record or an open debt, not by a preference.

The completion condition for ③ is stated operationally: on a day with no user messages, the ledger still grows, and the growth is not the routine patrol record.

## Open gaps

Each item is read out of the ledger rather than listed as a wish.

| Gap | State |
| --- | --- |
| Retrieval ranking | in progress; a single-term query does not clear the scorer threshold, so the normalisation `score = inter / eff`, where `eff` belongs to the deposit, is the actual bottleneck |
| Bare IDs inside source comments | not linked yet |
| The paper is marked awaiting author sign-off | requires the author; the repository cannot do this itself |
| `tools/pre-commit` is not tracked | by design: `.git/hooks` is local, installed once after cloning |
| A recorded end-to-end run | the example above is prose; a recorded run would be stronger evidence |

## Known issue: Gemini through a gateway returns 400

The error does not originate in this plugin. Three facts, reproducible in `test/tool-schema.test.mjs`:

| Approach | Result |
| --- | --- |
| What this plugin emits (`required: true` inside the property) | accepted by `defineTool`; the output is standard JSON Schema |
| Standard JSON Schema submitted directly | rejected: `unsupported JSON schema: parameters.type must be a value schema object` |
| A flat property dictionary | accepted, but `required` is silently dropped |

The `required: true` in the error appears inside a property, which `defineTool` never emits, so the payload that reached the gateway was not produced by this plugin. The apparent fix of switching to standard JSON Schema makes the plugin fail to load and should not be applied.

Workaround: use DeepSeek or another OpenAI-compatible model. If the plugin has run through Gemini in a given deployment, the host version and gateway type recorded in [issue #1](https://github.com/NBagent-dev/metaflywheel/issues/1) would move the diagnosis from an inference to a located fault.

## Language and data

The interface is available in Chinese and English, and the locale can be changed without restarting the host:

```bash
echo en > .mpm/locale          # or: MPM_LOCALE=en
```

Precedence, in order: explicit argument, environment variable, `.mpm/locale`, in-process override, default. An environment variable outranks the file because it represents an operator decision.

The data layer is a separate decision: the ledger is written in the language of its user and is never translated. It records what happened rather than presenting an interface, and translating it would destroy the artefact.

| Layer | Policy |
| --- | --- |
| Engine text: snapshot lines, tool descriptions, reports | localised through `t(key)` and `TOOL_EN` |
| Deposits, narrations, `myAction` | written once in the user's language, never translated |
| Judges | assert structure (keys, counts, booleans), never substrings of one language |

A missing translation falls back to the source language at runtime and turns CI red. An unknown locale falls back to the source language, not to English.

To add a documentation language, copy `README.md` to `README.<tag>.md`, translate it in full, add it to every language bar and keep the section count identical. A judge checks the section count, which is how a section added in only one language is detected. Automatic translation is deliberately not used: machine output looks complete while remaining unchecked, and unverified claims are not released.

## Contributing

The requirement for a change is not code style. It is whether the change leaves a record that can be checked. A change should answer three questions:

1. Which concrete problem does it solve? Not "improves the architecture", but "judge X misfires under condition Y".
2. How is the fix demonstrated? Either a new judge failed before the change and passes after it, or a meter's value improved.
3. Where could it be wrong? Verify that against the data before review does.

The following rules follow from that requirement, and each of them was violated in this repository first:

- a judge must be able to fail on the old code; a check that cannot fail is worse than no check
- negative controls are required: if silence also passes, a passing result demonstrates nothing
- a meter that only reports numbers does not belong in the test suite, because mixing them makes "all green" meaningless
- an assertion must not claim more than its fixture controls
- a cache key must cover every input that shapes the output; this has been a defect three times
- retirement is not deletion: an obsolete deposit leaves retrieval and remains reachable by ID
- when a summary is used, the components are printed alongside it, otherwise the summary hides what it summarises
- before measuring a new capability, the measuring instrument is validated first, otherwise "no change" and "never measured" are indistinguishable

Before submitting:

```bash
node --test                                  # must be all green
cp tools/pre-commit .git/hooks/pre-commit    # once; checks every commit after
```

Commit messages state why rather than what. When a change follows from a recorded decision, the ID is carried in the message: `fix: judge ⑦ misreads dates (P571)`.

Reading the paper is not a prerequisite. Understanding internal IDs is not required either: `P019-M14` is bookkeeping, and an ID never has to be read in order to understand what the project does. Agreement with the project's objective is not required; a change that makes the tests faster or the judges sharper is valuable regardless.

## Reference

```
engine/            the engine (host plugin, no separate process)
  modules/         one module per file
test/              four kinds of file, see below
docs/              paper (draft), implementation notes, ID index
tools/             pre-commit gate, probes, meters
install/           mounting and deployment
view/              optional visualisation
```

| Kind of file in `test/` | Naming | Runs under `node --test` | Purpose |
| --- | --- | --- | --- |
| Judge | `*.test.mjs` | yes | fails when a requirement is not met |
| Meter | `audit-*.mjs` | no | prints numbers, asserts nothing |
| Generator | `gen-ledger-doc.mjs` | no | regenerates `docs/ledger.md` |
| One-off script | `check-*`, `read-*`, `run-*` | no | retained because it was useful once |

`docs/ledger.md` is generated from the ledger and must not be edited by hand. It is the largest text file in the repository, so every ledger change appears as a large diff; this is a known cost.

Two judges are environment-aware and skip themselves with a printed reason: the source-to-runtime copy check, and the `defineTool` contract check. Those skips are why "runs on a clean clone" holds rather than being assumed.

The paper, [docs/theory.md](docs/theory.md), is marked awaiting author sign-off. It is not published literature and should not be cited as external authority.

## License

MIT
