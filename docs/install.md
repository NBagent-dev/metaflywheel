# Installation

**English** · [简体中文](install.zh-CN.md)

MetaFlywheel is not a standalone npm package. It is a host plugin that loads through a composition line in [DSH (DeepSeek Harness)](https://github.com/deepseek-ai/dsh) via a `file://` URL. Installation has three steps, and the first one does not need the host.

## Prerequisites

| Required | Notes |
| --- | --- |
| A DSH host | the `dsh` command must be available. This repository is verified on `0.2.1-rc.2`; other versions may differ in the tool contract, see Troubleshooting |
| Node.js 18+ | used only to run the test suite; the engine runs inside the host process |
| A writable `~/.dsh/mpm/` | where the composition-line patch file lives |

No network service, database or model API key is required: the model is provided by the host and this plugin never touches it.

## Step 1: clone and run the tests (no host needed)

```bash
git clone <this-repo> && cd metaflywheel
node --test
```

Expect all tests to pass. **The number of tests is not written here** — hand-written numbers go stale; use the local output and CI.

The reason to do this first: confirm the code runs on the target machine before mounting it. If this step fails, every later step rests on a false premise.

## Step 2: add one entry to the composition-line patch

Edit (or create) `~/.dsh/mpm/cordis.patch.user.yml` and add:

```yaml
- insert:
  - id: mpm-flywheel
    name: file:///C:/path/to/metaflywheel/engine/host.js
```

Rules:

- `name` must be `file://` plus an **absolute path** plus `engine/host.js`. On Windows this is `file:///C:/...` (three slashes); on POSIX it is `file:///home/...`
- spaces in the path are written as `%20`
- the file may already contain other entries (for example `agent-loop`). **Append; do not overwrite**
- the indentation must match the other entries in that file; if it is wrong the host silently ignores the entry

## Step 3: restart the host

A restart is required. The engine is loaded as a static `file://` import, so code changes do not take effect at runtime.

## Verify the mount

After the restart, the **runtime line** appears in the assembled prompt:

```
- Runtime: PID <pid> started at <time> (dsh <version>) · disk unchanged, running the latest copy
```

| What you see | Meaning | Action |
| --- | --- | --- |
| The line, saying "disk unchanged" | mounted, running the on-disk version | none |
| The line, but saying "⚠ stale runtime" | the on-disk engine is newer than the running one | restart once more |
| No such line | the engine was not loaded | check the path and indentation from step 2 |
| The line, but no self-snapshot block | loaded, but prompt assembly failed | check the host log for output prefixed `[mpm]` |

## Updating

A host restart is required after `git pull`. The exception is data-level settings: `.mpm/locale` is read on every resolution, so changing it needs no restart.

## Language

The interface switches between Chinese and English:

```bash
echo en > .mpm/locale          # or: MPM_LOCALE=en
```

The layering and precedence rules are in the README's "Language and data" section. Ledger content is written in the language of its user and is never translated.

## Uninstalling, and the data

Delete the block added in step 2 from the composition-line patch and restart the host; the engine will no longer load.

Runtime data lives in `<workspace>/.mpm/`:

| Path | Content |
| --- | --- |
| `.mpm/flywheel.json` | the ledger (whole state) |
| `.mpm/deposits/` | deposits, one markdown file each |
| `.mpm/locale` | language setting, may be empty |

Deleting that directory does not affect the rest of the host, but it destroys every record irreversibly. Back it up before deleting.

## Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Host reports a schema or parameter error on boot | host version does not match the tool contract | see the three facts in `test/tool-schema.test.mjs`; do not switch to standard JSON Schema, that makes the plugin fail to load |
| No `mpm_*` tools in the tool list | composition entry not in effect, wrong path, or wrong indentation | check each row of "Verify the mount"; the path must point to `engine/host.js` |
| Runtime line present but no self-snapshot | loaded, assembly failed | check the host log for output prefixed `[mpm]` |
| Gemini through a gateway returns 400 | not a problem in this plugin | see the README's "Known issue" section and [issue #1](https://github.com/NBagent-dev/metaflywheel/issues/1) |
