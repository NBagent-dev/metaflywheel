# MetaFlywheel

**English** · [简体中文](architecture.zh-CN.md)

**A problem ledger that lives inside the AI agent's process.**

It stops an AI assistant from starting from zero in every conversation: what it did, what it got wrong and what the user judged are written down as entries that survive restarts, and those entries are placed in front of it **at the moment they apply**.

---

## The problem it solves

An AI agent has one recurring defect: **it has no subject that persists across sessions.**

- a bug fixed in one session is reintroduced the same way in the next
- the user says "this direction is wrong", and the next session walks back into it
- it reports "done", and nobody has checked whether it was done
- worse: it does not know that **the thing it marked "not verified"** is still hanging there

MetaFlywheel gives such an agent a ledger that outlives the process. This is not memory retrieval; it is closer to **outstanding debt**:

| What it keeps | Rather than |
| --- | --- |
| which item was marked "not verified" and has not been closed | a chunk of text retrievable into context |
| which judgement the user changed, so the ledger must change too | a fixed user preference |
| which lesson **blocked** an error | a list of best practices |

The last row is the least intuitive property of this class of system: **a lesson that actually works may have zero citations** — because its success shows up as *the mistake did not happen*, and **what does not happen leaves no record**.

---

## Something that can be checked

```
npm test   →   all passing
```

The number is not the point. The point is that a substantial part of the suite is **designed to be able to fail**:

- feed it a malformed data structure → it must raise, never quietly display `0`
- let an error word appear in normal output → it must **stay silent** (a false alarm is worse than a miss: noise gets ignored)
- cite any deposit → that ID must really exist in the ledger (one wrong character fails silently)

A test that can never fail carries no information, so every judge ships with its counterexample.

---

## Running it

```bash
git clone <this-repo> && cd metaflywheel
npm test                      # the whole suite; no external service required
```

It needs a host to work (**it is not a standalone npm package**). The current implementation attaches to a composition line of [DSH](https://github.com/deepseek-ai/dsh) and is loaded through a `file://` URL. Installation is in [docs/install.md](install.md).

---

## Honest notes (this section matters more than the ones above)

1. **The theory is a draft.** [docs/theory.md](theory.md) is a methodology paper of roughly forty thousand characters, written by the repository's user together with an AI, and **marked "awaiting author sign-off"**. It is not published literature and should not be cited as external authority.

2. **A substantial part of the code was written by an AI.** That is not being hidden. Every judge was reviewed by a human and **keeps its failure record** — during development the judges caught more mistakes than they ever proved.

3. **The repository contains internal IDs (for example `P019-M14`).** They are this project's own bookkeeping, pointing at a specific past repair. **If you only want to know what this thing does, you never need to read one.** For the story behind each ID, see [docs/ledger.md](ledger.md).

4. **It does not promise "consciousness", and it does not measure it.** There is a panel that asks "is it getting stronger", and the panel states in the same breath: **"even if these ten are all green, that only means the auditable part is green."**

---

## Whether it is worth reading

If the scenario is **"keep an AI assistant from repeating the same class of mistake across long collaboration"**, this repository is worth a look.

If the scenario is **"make the AI remember more"**, a vector store is enough and this project is not needed.

Its whole claim compresses to one line:

> **A ledger that lives across conversations prevents the same class of error from happening twice better than a smarter model does.**

And that claim has a price: **it records the user too** — judgements you stated are remembered, changes of mind leave a trace, and anything you marked "not verified" stays on the list until it is closed.

---

## Layout

```
engine/            the engine (host plugin, no separate process)
  modules/         one module per file
test/              the judges (node --test, zero dependencies)
docs/              theory.md (draft paper) · architecture.md (this file) · DEVELOPMENT.md (implementation) · ledger.md (ID index)
install/           mounting and deployment
view/              optional visualisation
```

For implementation detail, read [docs/DEVELOPMENT.md](DEVELOPMENT.md). For the paper, read [docs/theory.md](theory.md). To find out what an ID means, read [docs/ledger.md](ledger.md).

---

## License

MIT
