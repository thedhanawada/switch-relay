# AgentRelay

Delegate coding work to different AI models through OpenCode. AgentRelay keeps each run, session, cost and review status in a local ledger.

## Requirements

- Node.js 22 or newer
- OpenCode with at least one provider configured

## Install

```bash
npm install --global @ndhanawada/agentrelay
agentrelay check
```

## Delegate a task

```bash
agentrelay run \
  --repo /path/to/repository \
  --title "Review the CLI" \
  --role researcher \
  --model openrouter/deepseek/deepseek-v4-flash-0731 \
  --prompt "Inspect the CLI and suggest one evidence-based improvement. Do not edit files."
```

Use the `builder` role when the worker should edit the repository. AgentRelay records completed workers as `needs-review`; it never merges, pushes or deploys their work.

## Commands

```text
agentrelay check
agentrelay run --title <title> --prompt <brief> --role <role> --model <provider/model>
agentrelay record --title <title> --role <role> --model <provider/model>
agentrelay serve --repo /path/to/repository
```

AgentRelay runs locally and uses your existing OpenCode provider configuration.

## Licence

MIT
