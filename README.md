# switch-relay

Switch coding work across AI models through OpenCode. switch-relay keeps each run, session, cost and review status in a local ledger.

## Requirements

- Node.js 22 or newer
- OpenCode with at least one provider configured

## Install

```bash
npm install --global switch-relay
switchrelay check
```

## Delegate a task

```bash
switchrelay run \
  --repo /path/to/repository \
  --title "Review the CLI" \
  --role researcher \
  --model openrouter/deepseek/deepseek-v4-flash-0731 \
  --prompt "Inspect the CLI and suggest one evidence-based improvement. Do not edit files."
```

Use the `builder` role when the worker should edit the repository. switch-relay records completed workers as `needs-review`; it never merges, pushes or deploys their work.

## Commands

```text
switchrelay check
switchrelay run --title <title> --prompt <brief> --role <role> --model <provider/model>
switchrelay record --title <title> --role <role> --model <provider/model>
switchrelay serve --repo /path/to/repository
```

switch-relay runs locally and uses your existing OpenCode provider configuration.

## Licence

MIT
