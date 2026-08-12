# switch-relay

Spend your expensive tokens where they matter.

Give the **frontier models** (Claude, Codex, GPT) the work that needs them. Hand the
rest to a **cheaper worker model** (DeepSeek, or whatever fits the task). switch-relay
keeps every run, session, cost and review status in a local ledger, so you can see what
ran, what it cost, and what still needs a human look.

No cloud. No accounts. No telemetry. Just a CLI that talks to your existing OpenCode setup
and a local dashboard to watch what happened.

## The idea

```text
       ┌──────────────────┐
       │   Frontier model  │   plans it, reviews it    (Claude / Codex)
       │   (the parent)    │
       └────────┬─────────┘
                │ assigns subtasks
        ┌───────┴────────┐
        ▼                ▼
   ┌──────────┐    ┌──────────┐     each child can be a
   │  DeepSeek │    │  cheap /  │     different model —
   │  (child)  │    │ fit model │     you pick per task
   └──────────┘    └──────────┘
```

You keep using the models you already have. The parent decides and reviews. Children do
the bulk work. The ledger tells you what each one cost.

## Requirements

- Node.js 22 or newer
- OpenCode with at least one provider configured

## Install

```bash
npm install --global switch-relay
switchrelay check
```

## Delegate a task

Run a worker on a model of your choice. Tell it which parent model dispatched the task so
the ledger stays honest about who oversaw what:

```bash
switchrelay run \
  --repo /path/to/repository \
  --title "Add error handling to the API client" \
  --role builder \
  --model openrouter/deepseek/deepseek-v4-flash-0731 \
  --parent openrouter/anthropic/claude-... \
  --prompt "Add try/catch around every fetch call. Do not touch anything else."
```

Use `--role researcher` when the worker should only investigate and report back (no file
edits), or `--role builder` when it should edit the repo. switch-relay records completed
workers as `needs-review` and never merges, pushes or deploys their work — that stays with
the parent.

## Commands

```text
switchrelay check
switchrelay run   --title <title> --prompt <brief> --role <role> --model <provider/model>
                  [--parent <provider/model>] [--parent-run <runId>]
switchrelay record --title <title> --role <role> --model <provider/model>
                  [--parent <provider/model>] [--status needs-review] [--cost 0.01]
switchrelay serve --repo /path/to/repository
```

`serve` opens the dashboard at `http://127.0.0.1:4180` to review health and the run ledger.

## What it is (and isn't)

- **Is:** a local dispatch + review ledger on top of OpenCode.
- **Isn't:** an IDE, a host, an orchestration framework, or a wire into your CI.
- **Won't:** merge, push, or deploy on its own. A human (or the parent) reviews first.

## Licence

MIT
