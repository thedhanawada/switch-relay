import { open, mkdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { SwitchboardState, WorkerRun } from './types.ts';

export interface LedgerOptions {
  directory?: string;
  lockWaitMs?: number;
  lockStaleMs?: number;
}

export interface StateLedger {
  readonly stateFile: string;
  read(): Promise<SwitchboardState>;
  mutateState<T>(mutator: (state: SwitchboardState) => T | Promise<T>): Promise<T>;
}

const RUN_STATUSES = ['queued', 'running', 'needs-review', 'completed', 'failed'] as const;
const RUN_ROLES = ['researcher', 'builder', 'reviewer', 'qa'] as const;

const describe = (value: unknown): string =>
  value === null
    ? 'null'
    : value === undefined
      ? 'undefined'
      : Array.isArray(value)
        ? 'an array'
        : typeof value;

export function createLedger(options: LedgerOptions = {}): StateLedger {
  const directory = path.resolve(options.directory ?? process.env.SWITCHBOARD_STATE_DIR ?? path.join(process.env.HOME ?? '.', '.switchboard'));
  const stateFile = path.join(directory, 'state.json');
  const lockFile = path.join(directory, 'state.json.lock');
  const lockWaitMs = options.lockWaitMs ?? 3_000;
  const lockStaleMs = options.lockStaleMs ?? 10_000;

  function validateRun(value: unknown, index: number): WorkerRun {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`runs[${index}] must be an object, got ${describe(value)}`);
    }
    const run = value as Record<string, unknown>;
    for (const field of ['id', 'title', 'role', 'model', 'repository', 'status', 'createdAt', 'updatedAt']) {
      if (typeof run[field] !== 'string') {
        throw new Error(`runs[${index}].${field} must be a string, got ${describe(run[field])}`);
      }
    }
    if (!(RUN_STATUSES as readonly string[]).includes(run.status as string)) {
      throw new Error(`runs[${index}].status must be one of ${RUN_STATUSES.join(', ')}, got ${JSON.stringify(run.status)}`);
    }
    if (!(RUN_ROLES as readonly string[]).includes(run.role as string)) {
      throw new Error(`runs[${index}].role must be one of ${RUN_ROLES.join(', ')}, got ${JSON.stringify(run.role)}`);
    }
    if (run.costUsd !== undefined && run.costUsd !== null && (typeof run.costUsd !== 'number' || !Number.isFinite(run.costUsd))) {
      throw new Error(`runs[${index}].costUsd must be a finite number, got ${describe(run.costUsd)}`);
    }
    for (const field of ['branch', 'sessionId', 'notes']) {
      if (run[field] !== undefined && run[field] !== null && typeof run[field] !== 'string') {
        throw new Error(`runs[${index}].${field} must be a string, got ${describe(run[field])}`);
      }
    }
    const costUsd = run.costUsd === null || run.costUsd === undefined ? undefined : run.costUsd as number;
    const branch = typeof run.branch === 'string' ? run.branch : undefined;
    const sessionId = typeof run.sessionId === 'string' ? run.sessionId : undefined;
    const notes = typeof run.notes === 'string' ? run.notes : undefined;
    return {
      id: run.id as string,
      title: run.title as string,
      role: run.role as WorkerRun['role'],
      model: run.model as string,
      repository: run.repository as string,
      status: run.status as WorkerRun['status'],
      createdAt: run.createdAt as string,
      updatedAt: run.updatedAt as string,
      ...(branch !== undefined ? { branch } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(costUsd !== undefined ? { costUsd } : {}),
      ...(notes !== undefined ? { notes } : {}),
    };
  }

  function validateState(value: unknown): SwitchboardState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('state root must be an object, got ' + describe(value));
    }
    const candidate = value as Record<string, unknown>;
    if (!('runs' in candidate)) throw new Error('state is missing the required "runs" array');
    if (!Array.isArray(candidate.runs)) throw new Error(`state field "runs" must be an array, got ${describe(candidate.runs)}`);
    if (candidate.repository !== undefined && typeof candidate.repository !== 'string') {
      throw new Error(`state field "repository" must be a string, got ${describe(candidate.repository)}`);
    }
    const runs = candidate.runs.map((run, index) => validateRun(run, index));
    return candidate.repository === undefined ? { runs } : { repository: candidate.repository, runs };
  }

  async function parseState(raw: string): Promise<SwitchboardState> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `Switchboard state at ${stateFile} is not valid JSON (${(error as Error).message}). ` +
        'The file was left untouched to avoid destroying evidence; repair or remove it manually and retry.',
      );
    }
    try {
      return validateState(parsed);
    } catch (error) {
      throw new Error(
        `Switchboard state at ${stateFile} is invalid (${(error as Error).message}). ` +
        'The file was left untouched to avoid destroying evidence; repair or remove it manually and retry.',
      );
    }
  }

  async function read(): Promise<SwitchboardState> {
    let raw: string;
    try {
      raw = await readFile(stateFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { runs: [] };
      throw error;
    }
    return parseState(raw);
  }

  async function lockAgeMs(): Promise<number | null> {
    try {
      const age = Date.now() - (await stat(lockFile)).mtimeMs;
      return Math.max(0, age);
    } catch {
      return null;
    }
  }

  async function lockOwnerIsAlive(): Promise<boolean> {
    try {
      const [pidText] = (await readFile(lockFile, 'utf8')).trim().split(/\s+/);
      const pid = Number(pidText);
      if (!Number.isSafeInteger(pid) || pid <= 0) return false;
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code !== 'ESRCH';
      }
    } catch {
      return false;
    }
  }

  async function acquireLock(): Promise<string> {
    await mkdir(directory, { recursive: true });
    const deadline = Date.now() + lockWaitMs;
    const token = randomBytes(16).toString('hex');
    for (;;) {
      let handle;
      try {
        handle = await open(lockFile, 'wx', 0o600);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') throw error;
        const age = await lockAgeMs();
        if (age === null) continue;
        if (age > lockStaleMs && !(await lockOwnerIsAlive())) {
          await unlink(lockFile).catch(() => {});
          continue;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `Timed out after ${lockWaitMs}ms waiting for the exclusive state lock at ${lockFile} ` +
            `(held for ${Math.round(age)}ms; stale after ${lockStaleMs}ms). Another Switchboard process may be writing state. ` +
            `If none is running, delete ${lockFile} and retry.`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 10 + Math.floor(Math.random() * 15)));
        continue;
      }
      try {
        await handle.writeFile(`${process.pid} ${token}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      return token;
    }
  }

  async function releaseLock(token: string): Promise<void> {
    try {
      const [, currentToken] = (await readFile(lockFile, 'utf8')).trim().split(/\s+/);
      if (currentToken === token) await unlink(lockFile);
    } catch {
      // The lock may already have been cleaned up after an interrupted process.
    }
  }

  async function fsyncDirectory(): Promise<void> {
    try {
      const dir = await open(directory, 'r');
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
    } catch {
      // Directory fsync is best effort; the file itself is always fsynced.
    }
  }

  async function write(state: SwitchboardState): Promise<void> {
    await mkdir(directory, { recursive: true });
    const validatedState = validateState(state);
    const tempFile = path.join(directory, `.state.json.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
    try {
      const handle = await open(tempFile, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(validatedState, null, 2)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(tempFile, stateFile);
      await fsyncDirectory();
    } catch (error) {
      await unlink(tempFile).catch(() => {});
      throw error;
    }
  }

  async function mutateState<T>(mutator: (state: SwitchboardState) => T | Promise<T>): Promise<T> {
    const lockToken = await acquireLock();
    try {
      const state = await read();
      const result = await mutator(state);
      await write(state);
      return result;
    } finally {
      await releaseLock(lockToken);
    }
  }

  return {
    stateFile,
    read,
    mutateState,
  };
}
