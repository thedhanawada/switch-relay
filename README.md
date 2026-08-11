# AgentRelay

Local control plane for delegating coding work across models. AgentRelay keeps an OpenCode server available, records the worker sessions it creates, and gives a lead agent one place to inspect status, cost, diffs and verification.

## First customer workflow

```bash
npm start -- --repo /home/apostle/.iea-r/servicecite
```

Then open `http://127.0.0.1:4180`.

Terminal-first delegation:

```bash
npm run agentrelay -- run \
  --repo /path/to/repository \
  --title "Review the CLI" \
  --role researcher \
  --model openrouter/deepseek/deepseek-v4-flash-0731 \
  --prompt "Inspect the CLI and return one evidence-based improvement. Do not edit files."
```

AgentRelay starts only on localhost. It does not hold provider credentials; OpenCode keeps using its existing provider configuration. Existing local installations continue reading `.switchboard/state.json`; new installations use `.agentrelay/state.json`.

## Deliberate v0.1 boundary

This first slice is the control-plane foundation, not autonomous deployment software:

- persistent OpenCode health check and session visibility
- crash-safe local run ledger for cost, status, review and test evidence
- localhost dashboard and JSON API
- explicit review/merge state, with no automatic merge, push or deploy

The ledger uses atomic file replacement and an exclusive writer lock, so parallel
terminal workers cannot silently overwrite one another. For isolated testing, pass
`--state-dir <path>` to `serve`, `run`, or `record`.

The next slice adds queued worktree-backed runs through OpenCode's HTTP API.
