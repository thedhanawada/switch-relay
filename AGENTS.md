# AGENTS.md

## Project

switch-relay — delegates coding work across AI models through OpenCode, keeping
each run, session, cost and review status in a local ledger.

## Setup

- Node.js 22 or newer.
- No test framework; tests use the built-in Node test runner:

```bash
npm run build   # esbuild -> dist/cli.js
npm run check   # run switchrelay check
npm test        # node --test test/*.test.ts
```

## Conventions

- TypeScript, ESM (`"type": "module"`). Source lives in `src/`, tests in `test/`.
- CLI entry: `src/cli.ts` (bundle target node22, esm).
- Run `npm test` and `npm run build` before finishing a change. Note: running
  other agents/models is done through the tool's own `run` command, not ad-hoc.
- Do not add code comments unless asked.
