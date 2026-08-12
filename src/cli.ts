import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { dashboard } from './dashboard.ts';
import { openCodeHealth } from './opencode.ts';
import { createLedger } from './store.ts';
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
const ledger = createLedger({ directory: option('--state-dir') });
const execFileAsync = promisify(execFile);

function usage() {
  console.log(`SwitchRelay\n\nCommands:\n  serve [--repo <path>] [--port 4180] [--opencode-port 4096] [--state-dir <path>]\n  check [--opencode-port 4096]\n  run --title <title> --prompt <brief> --role <researcher|builder|reviewer|qa> --model <provider/model> [--parent <provider/model>] [--parent-run <runId>] [--repo <path>] [--state-dir <path>]\n  record --title <title> --role <researcher|builder|reviewer|qa> --model <provider/model> [--status needs-review] [--cost 0.01] [--parent <provider/model>] [--parent-run <runId>] [--repo <path>] [--state-dir <path>]`);
}

const openCodeExecutable = () =>
  process.env.OPENCODE_BIN ?? path.join(process.env.HOME ?? '', '.opencode/bin/opencode');

async function startOpenCode() {
  const health = await openCodeHealth(openCodeUrl);
  if (health.connected) return health;
  const child = spawn(openCodeExecutable(), ['serve', '--hostname', '127.0.0.1', '--port', String(openCodePort)], {
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

function findSessionId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'sessionID' || key === 'sessionId') && typeof child === 'string') return child;
    const nested = findSessionId(child);
    if (nested) return nested;
  }
}

async function sessionCost(sessionId: string): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync(openCodeExecutable(), ['export', sessionId], {
      maxBuffer: 20 * 1024 * 1024,
    });
    const exported = JSON.parse(stdout) as { messages?: Array<{ info?: { cost?: number } }> };
    return exported.messages?.reduce((total, message) => total + (message.info?.cost ?? 0), 0);
  } catch {
    return undefined;
  }
}

async function runWorker() {
  const title = option('--title');
  const prompt = option('--prompt');
  const role = option('--role') as WorkerRun['role'] | undefined;
  const model = option('--model');
  if (!title || !prompt || !role || !model || !['researcher', 'builder', 'reviewer', 'qa'].includes(role)) {
    usage(); process.exitCode = 1; return;
  }

  const health = await startOpenCode();
  if (!health.connected) throw new Error(health.detail ?? 'OpenCode is unavailable');
  const now = new Date().toISOString();
  const { run, repository } = await ledger.mutateState((state) => {
    const repository = path.resolve(option('--repo') ?? state.repository ?? process.cwd());
    const parent = option('--parent');
    const parentRun = option('--parent-run');
    const run: WorkerRun = {
      id: `run_${crypto.randomUUID().slice(0, 8)}`,
      title, role, model, repository, status: 'running', createdAt: now, updatedAt: now,
      ...(parent ? { parent } : {}),
      ...(parentRun ? { parentRun } : {}),
    };
    state.runs.unshift(run);
    return { run, repository };
  });
  console.log(`[${run.id}] ${role} started with ${model}${run.parent ? ` under ${run.parent}` : ''}`);

  // OpenCode only accepts primary agents at the top level. `explore` is a
  // subagent, while `plan` provides the read-only primary role we need here.
  const agent = role === 'researcher' || role === 'reviewer' ? 'plan' : 'build';
  const child = spawn(
    openCodeExecutable(),
    ['run', '--attach', openCodeUrl, '--dir', repository, '--model', model, '--agent', agent, '--format', 'json', prompt],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let transcript = '';
  let sessionId: string | undefined;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    transcript += chunk;
    for (const line of chunk.split('\n')) {
      try { sessionId ??= findSessionId(JSON.parse(line)); } catch { /* partial or human output */ }
    }
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk: string) => process.stderr.write(chunk));
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });

  const costUsd = sessionId ? await sessionCost(sessionId) : undefined;
  const persisted = await ledger.mutateState((state) => {
    const persisted = state.runs.find((candidate) => candidate.id === run.id);
    if (!persisted) throw new Error(`SwitchRelay lost run ${run.id}`);
    persisted.sessionId = sessionId;
    persisted.costUsd = costUsd;
    persisted.status = exitCode === 0 ? 'needs-review' : 'failed';
    persisted.updatedAt = new Date().toISOString();
    persisted.notes = exitCode === 0
      ? 'Worker completed. Result requires lead-agent review.'
      : `OpenCode exited with code ${exitCode}. Last output: ${transcript.slice(-500)}`;
    return persisted;
  });
  console.log(`\n[${run.id}] ${persisted.status}; session ${persisted.sessionId ?? 'not reported'}; cost ${persisted.costUsd == null ? 'unavailable' : `$${persisted.costUsd.toFixed(6)}`}`);
  if (exitCode !== 0) process.exitCode = exitCode;
}

async function serve() {
  await ledger.read();
  const repository = option('--repo');
  if (repository) {
    await ledger.mutateState((state) => { state.repository = path.resolve(repository); });
  }
  await startOpenCode();
  const server = createServer(async (request, response) => {
    const fresh = await ledger.read();
    const health = await openCodeHealth(openCodeUrl);
    if (request.url === '/api/status') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ health, openCodeUrl, ...fresh }));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(dashboard(fresh, health, openCodeUrl));
  });
  server.listen(port, '127.0.0.1', () => console.log(`SwitchRelay ready at http://127.0.0.1:${port}`));
}

async function record() {
  const title = option('--title');
  const role = option('--role') as WorkerRun['role'] | undefined;
  const model = option('--model');
  if (!title || !role || !model || !['researcher', 'builder', 'reviewer', 'qa'].includes(role)) {
    usage(); process.exitCode = 1; return;
  }
  const now = new Date().toISOString();
  const run = await ledger.mutateState((state) => {
    const run: WorkerRun = {
      id: `run_${crypto.randomUUID().slice(0, 8)}`,
      title, role, model,
      repository: option('--repo') ? path.resolve(option('--repo')!) : state.repository ?? process.cwd(),
      status: (option('--status') as WorkerRun['status']) ?? 'needs-review',
      costUsd: option('--cost') ? Number(option('--cost')) : undefined,
      createdAt: now, updatedAt: now,
      ...(option('--parent') ? { parent: option('--parent')! } : {}),
      ...(option('--parent-run') ? { parentRun: option('--parent-run')! } : {}),
    };
    state.runs.unshift(run);
    return run;
  });
  console.log(JSON.stringify(run, null, 2));
}

if (command === 'serve') await serve();
else if (command === 'check') console.log(JSON.stringify(await openCodeHealth(openCodeUrl), null, 2));
else if (command === 'run') await runWorker();
else if (command === 'record') await record();
else usage();
