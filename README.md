# Switchboard

Local control plane for coding workers. Switchboard keeps an OpenCode server available, records the worker sessions it creates, and gives a lead agent one place to inspect status, cost, diffs and verification.

## First customer workflow

```bash
npm start -- --repo /home/apostle/.iea-r/servicecite
```

Then open `http://127.0.0.1:4180`.

Switchboard starts only on localhost. It does not hold provider credentials; OpenCode keeps using its existing provider configuration. A future worker run receives its own Git worktree before it is allowed to edit code.

## Deliberate v0.1 boundary

This first slice is the control-plane foundation, not autonomous deployment software:

- persistent OpenCode health check and session visibility
- local run ledger for cost, status, review and test evidence
- localhost dashboard and JSON API
- explicit review/merge state, with no automatic merge, push or deploy

The next slice adds queued worktree-backed runs through OpenCode's HTTP API.
