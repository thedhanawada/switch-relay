import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, open, readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createLedger } from '../src/store.ts';
import type { WorkerRun } from '../src/types.ts';

const execFileAsync = promisify(execFile);
const helperFile = fileURLToPath(new URL('./helpers/add-run.ts', import.meta.url));

const tempDirectory = () => mkdtemp(path.join(os.tmpdir(), 'switchrelay-test-'));

const sampleRun = (id: string): WorkerRun => ({
  id,
  title: `title-${id}`,
  role: 'researcher',
  model: 'test/model',
  repository: '/tmp/repo',
  status: 'running',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

test('missing state file reads as an empty ledger', async () => {
  const ledger = createLedger({ directory: await tempDirectory() });
  assert.deepEqual(await ledger.read(), { runs: [] });
});

test('mutateState writes valid, formatted JSON atomically and leaves no litter', async () => {
  const directory = await tempDirectory();
  const ledger = createLedger({ directory });
  await ledger.mutateState((state) => { state.runs.unshift(sampleRun('first')); });

  const files = await readdir(directory);
  assert.ok(files.includes('state.json'), `expected state.json, got ${files}`);
  assert.ok(!files.includes('state.json.lock'), 'lock must be released after a mutation');
  assert.equal(files.some((file) => file.includes('.tmp')), false, `leftover temp files: ${files}`);

  const raw = await readFile(path.join(directory, 'state.json'), 'utf8');
  assert.equal(JSON.parse(raw).runs[0].id, 'first');
  assert.match(raw, /\n  "runs"/, 'state file is pretty-printed JSON');

  await ledger.mutateState((state) => { state.runs.unshift(sampleRun('second')); });
  const parsed = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
  assert.deepEqual(parsed.runs.map((run: WorkerRun) => run.id).sort(), ['first', 'second']);
  assert.equal((await readdir(directory)).some((file) => file.includes('.tmp')), false);
});

test('concurrent in-process mutations preserve every distinct run', async () => {
  const directory = await tempDirectory();
  const ledger = createLedger({ directory });
  const ids = Array.from({ length: 40 }, (_, index) => `run-${index}`);
  await Promise.all(ids.map((id) => ledger.mutateState((state) => { state.runs.unshift(sampleRun(id)); })));
  const state = await ledger.read();
  assert.deepEqual(state.runs.map((run) => run.id).sort(), [...ids].sort());
});

test('concurrent cross-process mutations preserve every distinct run', async () => {
  const directory = await tempDirectory();
  const ids = Array.from({ length: 25 }, (_, index) => `proc-${index}`);
  await Promise.all(ids.map((id) =>
    execFileAsync(process.execPath, ['--experimental-strip-types', helperFile, directory, id], { maxBuffer: 1024 * 1024 })
      .catch((error) => Promise.reject(new Error(`${id} failed: ${error.stderr ?? error.message}`))),
  ));
  const state = await createLedger({ directory }).read();
  assert.deepEqual(state.runs.map((run) => run.id).sort(), [...ids].sort());
});

test('invalid JSON produces an actionable error and preserves evidence', async () => {
  const directory = await tempDirectory();
  const stateFile = path.join(directory, 'state.json');
  const corrupted = '{ this is not json';
  await writeFile(stateFile, corrupted, 'utf8');
  const ledger = createLedger({ directory });
  await assert.rejects(ledger.read(), (error: unknown) => {
    const message = (error as Error).message;
    assert.match(message, /state\.json/);
    assert.match(message, /not valid JSON/);
    assert.match(message, /left untouched/i);
    return true;
  });
  assert.equal(await readFile(stateFile, 'utf8'), corrupted, 'corrupted file must not be overwritten');
});

test('state with a wrong shape produces an actionable error and preserves evidence', async () => {
  for (const broken of [{ runs: 'definitely-not-an-array' }, { noRuns: [] }, null, 'plain string']) {
    const directory = await tempDirectory();
    const stateFile = path.join(directory, 'state.json');
    await writeFile(stateFile, JSON.stringify(broken), 'utf8');
    const ledger = createLedger({ directory });
    await assert.rejects(ledger.read(), /state|runs/i);
    assert.equal(await readFile(stateFile, 'utf8'), JSON.stringify(broken), 'invalid state must not be replaced');
  }
});

test('a malformed run names the offending entry and preserves evidence', async () => {
  const directory = await tempDirectory();
  const stateFile = path.join(directory, 'state.json');
  const malformed = { runs: [{ title: 'missing id and status' }] };
  await writeFile(stateFile, JSON.stringify(malformed), 'utf8');
  const ledger = createLedger({ directory });
  await assert.rejects(ledger.read(), (error: unknown) => {
    assert.match((error as Error).message, /runs\[0\]/);
    assert.match((error as Error).message, /left untouched/i);
    return true;
  });
  assert.equal(await readFile(stateFile, 'utf8'), JSON.stringify(malformed));
});

test('a run with an unsupported role is rejected instead of trusted by type assertion', async () => {
  const directory = await tempDirectory();
  const stateFile = path.join(directory, 'state.json');
  const malformed = { runs: [{ ...sampleRun('wrong-role'), role: 'administrator' }] };
  await writeFile(stateFile, JSON.stringify(malformed), 'utf8');
  await assert.rejects(createLedger({ directory }).read(), /runs\[0\]\.role.*researcher.*builder.*reviewer.*qa/);
  assert.equal(await readFile(stateFile, 'utf8'), JSON.stringify(malformed));
});

test('parent model fields persist through a write and round-trip on read', async () => {
  const directory = await tempDirectory();
  const ledger = createLedger({ directory });
  await ledger.mutateState((state) => {
    state.runs.unshift({ ...sampleRun('parented'), parent: 'anthropic/claude', parentRun: 'run_parent123' });
  });
  const parsed = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
  assert.equal(parsed.runs[0].parent, 'anthropic/claude');
  assert.equal(parsed.runs[0].parentRun, 'run_parent123');
  assert.equal((await ledger.read()).runs[0].parent, 'anthropic/claude');
});

test('a run with a non-string parent is rejected instead of trusted', async () => {
  const directory = await tempDirectory();
  const stateFile = path.join(directory, 'state.json');
  const malformed = { runs: [{ ...sampleRun('bad-parent'), parent: 42 }] };
  await writeFile(stateFile, JSON.stringify(malformed), 'utf8');
  await assert.rejects(createLedger({ directory }).read(), /runs\[0\]\.parent.*string/);
  assert.equal(await readFile(stateFile, 'utf8'), JSON.stringify(malformed));
});

test('mutation refuses to proceed when a mutator throws, leaving state intact', async () => {
  const directory = await tempDirectory();
  const ledger = createLedger({ directory });
  await ledger.mutateState((state) => { state.repository = '/tmp/set'; });
  const before = await readFile(path.join(directory, 'state.json'), 'utf8');
  await assert.rejects(
    ledger.mutateState((state) => { state.runs.unshift(sampleRun('x')); throw new Error('boom'); }),
    /boom/,
  );
  assert.equal(await readFile(path.join(directory, 'state.json'), 'utf8'), before);
  await assert.rejects(
    ledger.mutateState((state) => { state.repository = '/tmp/nope'; return Promise.reject(new Error('async boom')); }),
    /async boom/,
  );
  assert.equal(await readFile(path.join(directory, 'state.json'), 'utf8'), before);
});

test('recovers from a stale lock left behind by a crashed writer', async () => {
  const directory = await tempDirectory();
  const ledger = createLedger({ directory, lockStaleMs: 500, lockWaitMs: 10_000 });
  const lockFile = path.join(directory, 'state.json.lock');
  await writeFile(lockFile, 'dead pid\n', 'utf8');
  const ancient = Date.now() / 1000 - 60;
  await utimes(lockFile, ancient, ancient);

  await ledger.mutateState((state) => { state.runs.unshift(sampleRun('recovered')); });
  const state = await ledger.read();
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0].id, 'recovered');
  assert.ok(!(await readdir(directory)).includes('state.json.lock'));
});

test('does not steal an old lock from a live writer', async () => {
  const directory = await tempDirectory();
  const ledger = createLedger({ directory, lockStaleMs: 20, lockWaitMs: 120 });
  const lockFile = path.join(directory, 'state.json.lock');
  await writeFile(lockFile, `${process.pid} live-owner\n`, 'utf8');
  const ancient = Date.now() / 1000 - 60;
  await utimes(lockFile, ancient, ancient);

  await assert.rejects(
    ledger.mutateState((state) => { state.runs.unshift(sampleRun('stolen')); }),
    /Timed out.*exclusive state lock/,
  );
  assert.equal(await readFile(lockFile, 'utf8'), `${process.pid} live-owner\n`);
  assert.equal((await readdir(directory)).includes('state.json'), false);
});

test('refuses to persist an invalid state produced by a mutator', async () => {
  const directory = await tempDirectory();
  const ledger = createLedger({ directory });
  await assert.rejects(
    ledger.mutateState((state) => { (state as unknown as { runs: string }).runs = 'broken'; }),
    /runs.*array/,
  );
  assert.equal((await readdir(directory)).includes('state.json'), false);
  assert.equal((await readdir(directory)).includes('state.json.lock'), false);
});

test('an actively held lock blocks mutations only up to the bounded timeout', async () => {
  const directory = await tempDirectory();
  const ledger = createLedger({ directory, lockWaitMs: 300, lockStaleMs: 60_000 });
  const holder = await open(path.join(directory, 'state.json.lock'), 'wx', 0o600);
  try {
    const started = Date.now();
    await assert.rejects(
      ledger.mutateState((state) => { state.runs.unshift(sampleRun('blocked')); }),
      (error: unknown) => {
        const message = (error as Error).message;
        assert.match(message, /lock/);
        assert.match(message, /state\.json\.lock/);
        assert.match(message, /delete/);
        return true;
      },
    );
    assert.ok(Date.now() - started < 2_000, 'lock wait must be bounded');
  } finally {
    await holder.close();
  }
  assert.equal((await readdir(directory)).includes('state.json'), false, 'no state written while lock was held');
});
