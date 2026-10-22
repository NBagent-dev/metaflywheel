# Development · MetaFlywheel

**English** · [简体中文](DEVELOPMENT.zh-CN.md)

> This document answers one question: **how does a newcomer (or the maintainer three months from now) change this plugin without breaking it.** It does not explain why the plugin should exist (that is `theory.md`), and it does not list historical IDs (that is `ledger.md`).

**Version**: `0.4.0` · entry point `engine/host.js` · judges: `node --test` (the count is not written here; hand-written counts go stale)

---

## 1. What it is, in one sentence

**A host plugin that externalises debts, judgements and lessons into a ledger** — so that a stateless LLM session, after a restart, still knows **what it owes, what it judged and where it went wrong**, and gets those back **at the moment they are needed**.

### Non-goals (things it deliberately does not do)

| Does not do | Why |
| --- | --- |
| optimise "memory recall rate" | what is kept is **auditability**, not recall. Readable markdown remains plus a checkable ledger are what every judge rests on |
| fine-tune a model | individuality is carried by the **device**, not by weights |
| answer "does this count as consciousness" | undecidable in principle (P512). Facts are verified; the naming is not |
| hand memory to a vector store | same reason: approximate recall trades away traceability |

---

## 2. Runtime shape

```
DSH host
  └─ cordis.patch.yml    ← declarative mount (dsh.bundle.patch points at it)
       └─ engine/host.js  ← apply(ctx): registers tools, subscribes to events, starts patrol
            └─ engine/modules/*.mjs
```

**Host contract (the original text is at the top of `preaction.mjs`)**:

| Hook | Can give | Cannot give |
| --- | --- | --- |
| `tools/pre-execute` | `allow` / `deny{reason}` / `ask{reason}` | **`allow` cannot carry content** |
| `tools/post-execute` | `accept{content?, additionalContexts?}` | — |

**⇒ This contract has one direct consequence**: every "hint" can only be injected **after** an action. The only channel for "warn me before acting" is `ask` — which becomes a refusal when nobody is present. This repository therefore **turns discipline into judges rather than into prompts** (see §6).

---

## 3. Module map

`engine/modules/` holds **24 runtime modules**. One-off probes were moved to `tools/probes/` (see §3.5) — they are not part of the engine.

### 3.1 Skeleton

| Module | Responsibility | Key contract |
| --- | --- | --- |
| `host.js` | assembly: inject dependencies, register tools, subscribe to events | every module takes **injected** dependencies; none reaches for globals |
| `state.mjs` | state lifecycle: load / normalise / persist / restore | persistence is **whole-state JSON** (see §8, known debt) |
| `core.mjs` | pure logic: instruction generation, problem formatting | `instructionFor()` decides "what to do next" |
| `tools.mjs` | handlers and schemas for the lifecycle tools | the **only** place allowed to write state |
| `util.mjs` | stateless helpers and constants | does not depend on state |

### 3.2 Bookkeeping ("what exists")

| Module | Keeps |
| --- | --- |
| `hits.mjs` | **hit feedback**: a principal entry is injected → how it was acted on → the disposition is recorded |
| `unknowns.mjs` | **unverified list**: things marked unverified, each of which must state its retirement condition |
| `promise.mjs` | **promise / fulfilment**: `awakenWhen` goes from write-only to mechanically evaluable and wake-capable |
| `valence.mjs` | **valence ledger** R(t): the prompt-level reinforcement source |
| `adopt.mjs` | **adoption**: a deposit was really used before acting (including the counterfactual) |
| `unforeseen.mjs` | **type ledger**: counts carry no information, type distributions do |

### 3.3 Presentation ("how it becomes visible")

| Module | Produces |
| --- | --- |
| `selfsnap.mjs` | **self-snapshot**: the block at the head of every prompt (identity / memory / perception / valence / agenda …) |
| `awareness.mjs` | the seven-item **agency proxy** panel (including its three kinds of red) |
| `heartbeat.mjs` | **vital-signs card**: composes scattered measures into one card (**not wired into the host**, see §8) |
| `retrieval.mjs` | **retrieval cerebellum**: finds historical deposits by similarity |

### 3.4 Drive ("when it moves")

| Module | Does |
| --- | --- |
| `patrol.mjs` | resident patrol (20 min by default): computes S(t), detects staleness, picks an agenda item, fires when needed |
| `agenda.mjs` | **endogenous agenda**: changes "self-initiation" from clock-driven to **ledger-driven** (L2, not L3) |
| `rhythm.mjs` | **scheduling authority**: staleness threshold / fire throttle / quiet hours — writable by the subject, bounded, revertible |
| `runstamp.mjs` | **runtime self-report**: evidence of "which copy is running" |
| `triggers.mjs` | **failure-moment** triggers: discipline appears at the instant an action fails |
| `preaction.mjs` | **pre-action lookup**: rule table `preaction.rules.json` (tool + contains + hint/ask/deny) |
| `guard.mjs` | boundary hard gate |
| `events.mjs` | host event surface: `tools/result` listener, inbox perception |
| `principal.mjs` | **the first brick of the virtual self**: turns "how the principal thinks" into a searchable first-class citizen |

### 3.5 One-off probes (moved out of the engine)

`tools/probes/_p247_ctrlcheck` · `_p247_sigtest` · `_p327_eventcontract` · `_p327_persistcheck` ·
`_p328_interference` · `_p332_boot_check` · `_p332_runstamp_check` · `_p339_agenda_pick`

**⇒ They lived in `engine/modules/` and were therefore copied into the runtime, although nothing imports them.** They were moved out so the engine directory contains only the engine.

---

## 4. Data model

Ledger file: `<sediment root>/.mpm/flywheel.json`
Deposit files: `<sediment root>/.mpm/deposits/<id>-<slug>.md`

### 4.1 Ledger top level

```
seq            increasing counter (used to generate Pxxx)
problems      { Pxxx: Problem }
sediments      [Sediment]
hits           [Hit]
unknowns       [Unknown]
promises       [Promise]        (expressed inside problems as awakenWhen)
adopts         [Adopt]
valence        { events: [] }   event source for R(t)
measure        { samples: [ {at, active, staleN, ak, s} ] }   at most 48
constitution   { autonomy, grantedAt, log, lastFireAt, pending }
patrol         { rounds, lastAt, lastReport, log }
principal      [Principal]      how the principal thinks (verbatim + constraint object + occasion)
narrations     [Narration]      T0/T1 narration
```

### 4.2 Problem (six stages)

```
G generate → F frame → S solve → C converge → D deposit → E evoke (E returns to a new G)
```

| Field | Meaning |
| --- | --- |
| `stage` | `G` / `F` / `S` / `C` / `D` / `E` |
| `delta` / `epsilon` | framing precision / approximation precision (both lower is better) |
| `cost` | metabolic cost C (accumulated automatically by tool calls) |
| `parked` + `awakenWhen` | parked with a re-wake condition (**the only path that really leaves the instruction stream**) |
| `settled` | settled (leaves the pressure gauge) |
| `deposit` | `{id, path, depositedAt}` — only its presence shows "reuse value has been judged" |

### 4.3 Sediment (deposit)

```
{ id, problemId, title, tags, path, depositedAt, digest, cites,
  lastCitedAt, links, linkWaiver,
  status, supersededBy, supersededAt }        ← the last three were added in P591
```

| `status` | Meaning | Injection / retrieval |
| --- | --- | --- |
| `active` (default) | still holds | participates |
| `superseded` | replaced by a newer deposit (`supersededBy` points at it) | **does not participate**, still reachable by ID |
| `refuted` | refuted | **does not participate**, kept as evidence |

**⇒ Retirement is not deletion**: `status` changes one field; title, body and path stay exactly as they were.

---

## 5. Invariants (must not be broken when changing code)

1. **Persistence happens after the side effect**: compute → write → then print. Counterexample: a `UnicodeEncodeError` on `print` destroyed the artefact after it had been computed, and not one byte was written.
2. **The return value of `persist()` must be used**: the report may only claim "persisted" according to the real result, never unconditionally.
3. **A judge must go red on the old code**: prove the discriminating power first (`git stash`, or run it against the old implementation).
4. **Negative and positive controls come in pairs**: any judge that "excludes a class" must pin down that the other class is not excluded, otherwise "excludes everything" also passes.
5. **One field has one author**: only the engine writes the ledger. External scripts that edit it are silently overwritten by whole-state persistence (observed twice).
6. **`parked` / `settled` / `open` must not be conflated**: they leave the **agenda**, the **pressure gauge** and the **staleness sweep** respectively.
7. **`deposit` is the proof that reuse value was judged**: in stage `C`, having `deposit` means leaving the pressure gauge (P587); without it the problem must stay.

---

## 6. The judge system

```bash
node --test                        # everything
node --test test/agenda.test.mjs   # a single file
```

**Three kinds of judge** (ordered by discriminating power, weakest first):

| Kind | Example | Limitation |
| --- | --- | --- |
| source scan | `audit-*.mjs`, `check-*.mjs` | proves "it is written", not "it behaves this way" |
| same-source call | import and call the function | proves function behaviour, not wiring |
| **instance-level probe** | `agenda-fire.test.mjs` (really runs `runPatrol`) | strongest; if the encounter can be constructed, no restart is needed to wait for it |

**The mandatory trio** (every new judge should have all three):

```
① positive control: what should happen, happens
② negative control: what should not happen, does not (otherwise "no filtering" passes)
③ both directions: run it against the old code, and it must go red
```

---

## 7. Development flow (the correct order when changing engine files)

```
① read the contract (top of preaction.mjs, module comments) — do not guess
② change the source (daima/XIN/metaflywheel/engine/...)
③ run node --test and confirm nothing broke
④ ★ sync to the runtime copy ~/.dsh/mpm/engine/modules/  ← skip this and a restart changes nothing
⑤ restart DSH (file:// static import; no hot reload)
⑥ verify: the first line of the snapshot no longer says "⚠ stale runtime"
⑦ commit (pre-commit blocks untracked files and left-behind changes)
⑧ push to both remotes: gitee + origin, and confirm both refs agree
```

**⇒ Step ④ is where this really went wrong**: four hours of source changes while the engine kept loading a different copy. `test/engine-sync.test.mjs` now goes red to point at it.

---

## 8. Known debts (by priority)

| # | Debt | Evidence | Suggestion |
| --- | --- | --- | --- |
| 1 | **whole-ledger overwrite** | an external script edited the ledger; about ten minutes later the change was silently swallowed by whole-state persistence (twice) | event log: append the diff to `events.jsonl` before persisting (without changing the main store yet) |
| 2 | ~~hard-coded weights~~ **fixed (P593)** | weights of the four sources moved to `agenda-weights.mjs`; `mpm_weights show` prints each source's contribution and alarms at ≥60% | parameters still live in state rather than a config file (good enough; not migrating yet) |
| 3 | ~~deposits age without status~~ **fixed (P591 + P592)** | `status` + `mpm_supersede` + filtering in `selfsnap`/`retrieval` + cache key covering `retiredN` | only the markdown front matter is not synced with `status` (the ledger is right, the files do not say `status:` yet) |
| 4 | **retrieval is literal** | of 485 deposits, 332 were never cited and are older than 14 days (81%); adoption loop rate 2.3% | an A-MEM style `enriched` sidecar (append keywords/aliases without touching the original) |
| 5 | **`heartbeat.mjs` is not wired** | `host.js` imports it nowhere | either wire it into the snapshot or delete it (do not leave it looking like an existing feature) |
| 6 | **self-reported δ is uncalibrated** | the system discounts self-reported δ by `×0.85`, a constant with no basis | record "self-reported δ vs whether it was later re-framed by ≥0.5" into a calibration table (Brier) |

---

## 9. Common failures (six kinds actually hit here; all have answers)

| Symptom | Root cause | Check order |
| --- | --- | --- |
| a change has no effect | the source was changed, the `~/.dsh/mpm/` copy is what runs | `node --test test/engine-sync.test.mjs` |
| data gets "swallowed" | whole-state persistence overwrote an external edit | check the `.bak` timestamp; stop the engine before editing |
| a judge stays green | the judge uses the same wrong name or convention | run it against the old code; it must go red |
| numbers disagree with prose | it reports record counts while listing objects | report both numbers (the `hit-open` lesson) |
| a metric trends the wrong way | "already completed" leaked into the measure | decompose and show shares (the S(t) lesson) |
| `UnicodeEncodeError` | print before write, on a GBK console | write first, then print; drop decorative characters |

---

## 10. Roadmap

| # | Item | State |
| --- | --- | --- |
| 1 | deposit `status` (ADR-style supersession) | **done** (P591 data layer + tool; P592 injection/retrieval filtering + cache key) |
| 2 | agenda weights externalised + contribution diagnostics | **done (P593)**: `mpm_weights` show/set/reset + alarm at ≥60% for a single source |
| 3 | `events.jsonl` incremental log | **done (P594③)**: wired beside persistence (a failure there does not affect persistence) · bounded to 500 lines · the returned `events` field makes "not written" visible |
| 4 | `enriched` sidecar (keywords/aliases) | **done (P594④)**: `sediment-enrich.mjs`, included in retrieval's lexical surface; cache key covers enrichment; end-to-end judge passing |
| 5 | three-factor retrieval weighting (relevance / recency / importance) | **module ready (P594⑤)**: `retrieval-weights.mjs` + judges (including a "zero it and the order must change" negative control); **not yet used for live ordering** |
| 6 | offline index during patrol | **done (P594⑥)**: `sediment-index.mjs` + `mpm_index` tool (report/write/verify, deterministic and verifiable) |

---

## 11. Glossary

| Term | Meaning |
| --- | --- |
| **deposit / cognitive remain** | a reusable conclusion that has been made irreversible (a markdown file plus a ledger index entry) |
| **hit** | one injection of a principal entry; it asks for a disposition (how it was used) |
| **stillOpen** | disposed but the direction is still unresolved; carries a 14-day promise review window |
| **adopt** | a deposit was really used before acting, and it changed the action (the counterfactual must be writable) |
| **adoption loop rate** | deposits covered by adopt / total deposits — **the deposit library only**; it is not "the user's adoption rate" |
| **L2 / L3** | L2 = rule-triggered agenda; L3 = the subject wanting something. **Never call L2 an L3** |
| **δ / ε** | framing precision / approximation precision. ε measures "how far from the goal", not "how far the work is" |
