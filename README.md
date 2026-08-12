# switch-relay

**Use the right AI model for each coding task — and keep a clear record of what happened.**

switch-relay is a local CLI for dispatching work through [OpenCode](https://opencode.ai). Your lead model plans and reviews; a worker model completes one focused task. switch-relay records the model, parent, session, cost, and review status in a local ledger.

No cloud service. No telemetry. No automatic merging or deployment.

## Install

You need Node.js 22+ and an authenticated OpenCode setup.

    npm install --global switch-relay
    switchrelay check

## Run a worker

    switchrelay run --repo /path/to/repository --title "Add API error handling" --role builder --model openrouter/deepseek/deepseek-v4-flash-0731 --parent openai/codex --prompt "Add focused try/catch handling around fetch calls. Do not change anything else."

When it finishes, switch-relay records the worker's OpenCode session, cost, and result. Successful work is marked `needs-review` — it is never merged automatically.

Use `--role researcher` for read-only investigation, or `--role builder` when the worker may edit the repository.

## How it works

    lead model → plans and reviews
         │
         └→ worker model → completes one focused task
                              │
                              └→ local ledger → session · cost · status · review

You pick the worker model for every task. Use a frontier model for high-judgment work and a cheaper, capable worker for execution.

## Commands

| Command | What it does |
| --- | --- |
| `switchrelay check` | Checks whether OpenCode is reachable. |
| `switchrelay run` | Runs one worker and records the outcome. |
| `switchrelay record` | Adds work performed outside switch-relay to the ledger. |
| `switchrelay serve` | Opens a local review dashboard at `http://127.0.0.1:4180`. |

Run `switchrelay` with no command to see all options.

## Local state

The ledger is stored in `~/.switchrelay/state.json`. Override it with `--state-dir` or `SWITCHRELAY_STATE_DIR`. Writes are atomic and protected by an exclusive lock, so concurrent runs stay intact.

## What it does not do

switch-relay is a small dispatch and review ledger, not an IDE, CI system, hosting platform, or autonomous deployer. You keep control of the repository and the final review decision.

## Links

- [Website](https://thedhanawada.github.io/switch-relay/)
- [npm package](https://www.npmjs.com/package/switch-relay)
- [OpenCode](https://opencode.ai)

MIT
