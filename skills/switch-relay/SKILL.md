---
name: switch-relay
description: Dispatch, monitor, and review focused coding tasks through the local SwitchRelay CLI and OpenCode. Use when the user asks Codex to delegate work to another model, run a cheaper researcher or builder, track an AI worker's cost/session/status, or review a SwitchRelay worker result.
---

# SwitchRelay

Use SwitchRelay to make Codex the lead agent: define the work, select a worker model, then review its result. Never present a worker completion as approval. The user or lead agent must review and decide next actions.

## Preconditions

Run `switchrelay check` first. If the command is missing, ask the user to install `switch-relay` with npm. If OpenCode is unavailable, explain that it must be authenticated and reachable before dispatching work.

Use the repository in scope. Use a dedicated `--state-dir` only when the user wants an isolated demo or project ledger. Otherwise use SwitchRelay's default local ledger.

## Dispatch

Choose the role deliberately:

- Use `researcher` for investigation and reports; it is read-only.
- Use `reviewer` for read-only review.
- Use `builder` only when the user has authorized file edits.
- Use `qa` for task-specific validation work.

Use a focused, bounded title and prompt. Record Codex as the parent with `--parent openai/codex` unless the user provides a different parent identifier. Include `--parent-run` only when a lead run ID is known.

```bash
switchrelay run \
  --repo <repository> \
  --title "<focused task>" \
  --role researcher \
  --model <provider/model> \
  --parent openai/codex \
  --prompt "<bounded brief and file-edit constraint>"
```

For builders, require the prompt to state the requested scope and verification. Do not ask a worker to merge, push, publish, deploy, change credentials, or approve its own result.

## Review

Wait for the command to finish. Treat these results as follows:

- `needs-review`: inspect the worker's output, repository changes, and relevant checks before giving the user a recommendation.
- `failed`: report the recorded error and diagnose before retrying.
- `running`: do not start a duplicate task; monitor the ledger/dashboard instead.

Use `switchrelay serve --repo <repository>` only when the user wants the local dashboard. The dashboard is at `http://127.0.0.1:4180`; leave it running only while needed.

## Report

State the worker model, parent, status, session ID if present, cost if present, substantive result, and your review recommendation. Clearly distinguish evidence from the worker and your own judgment.
