import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { dashboard } from './dashboard.ts';
import { openCodeHealth } from './opencode.ts';
import { readState, saveState } from './store.ts';
import type { WorkerRun } from './types.ts';

const args = process.argv.slice(2);
const command = args[0] ?? 'serve';
const option = (name: string) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const port = Number(option('--port') ?? 4180);
const openCodePort = Number(option('--opencode-port') ?? 4096);
const openCodeUrl = `http://127.0.0.1:${openCodePort}`;

function usage() {
  console.log(`Switchboard\n\nCommands:\n  serve [--repo <path>] [--port 4180] [--opencode-port 4096]\n  check [--opencode-port 4096]\n  record --title <title> --role <researcher|builder|reviewer|qa> --model <provider/model> [--status needs-review] [--cost 0.01] [--repo <path>]`);
}

async function startOpenCode() {
  const health = await openCodeHealth(openCodeUrl);
  if (health.connected) return health;
  const executable = process.env.OPENCODE_BIN ?? path.join(process.env.HOME ?? '', '.opencode/bin/opencode');
  const child = spawn(executable, ['serve', '--hostname', '127.0.0.1', '--port', String(openCodePort)], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const next = await openCodeHealth(openCodeUrl);
    if (next.connected) return next;
  }
  return openCodeHealth(openCodeUrl);
}

async function serve() {
  const state = await readState();
  const repository = option('--repo');
  if (repository) {
    state.repository = path.resolve(repository);
    await saveState(state);
  }
  await startOpenCode();
  const server = createServer(async (request, response) => {
    const fresh = await readState();
    const health = await openCodeHealth(openCodeUrl);
    if (request.url === '/api/status') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ health, openCodeUrl, ...fresh }));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(dashboard(fresh, health, openCodeUrl));
  });
  server.listen(port, '127.0.0.1', () => console.log(`Switchboard ready at http://127.0.0.1:${port}`));
}

async function record() {
  const title = option('--title');
  const role = option('--role') as WorkerRun['role'] | undefined;
  const model = option('--model');
  if (!title || !role || !model || !['researcher', 'builder', 'reviewer', 'qa'].includes(role)) {
    usage(); process.exitCode = 1; return;
  }
  const state = await readState();
  const now = new Date().toISOString();
  const run: WorkerRun = {
    id: `run_${crypto.randomUUID().slice(0, 8)}`,
    title, role, model,
    repository: option('--repo') ? path.resolve(option('--repo')!) : state.repository ?? process.cwd(),
    status: (option('--status') as WorkerRun['status']) ?? 'needs-review',
    costUsd: option('--cost') ? Number(option('--cost')) : undefined,
    createdAt: now, updatedAt: now,
  };
  state.runs.unshift(run); await saveState(state); console.log(JSON.stringify(run, null, 2));
}

if (command === 'serve') await serve();
else if (command === 'check') console.log(JSON.stringify(await openCodeHealth(openCodeUrl), null, 2));
else if (command === 'record') await record();
else usage();
