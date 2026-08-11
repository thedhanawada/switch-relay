import { createLedger } from '../../src/store.ts';

const [directory, id, title] = process.argv.slice(2);
if (!directory || !id) {
  console.error('usage: add-run <state-dir> <run-id> [title]');
  process.exit(2);
}

const ledger = createLedger({ directory });
await ledger.mutateState((state) => {
  const now = '2026-01-01T00:00:00.000Z';
  state.runs.unshift({
    id,
    title: title ?? `title-${id}`,
    role: 'researcher',
    model: 'test/model',
    repository: '/tmp/repo',
    status: 'running',
    createdAt: now,
    updatedAt: now,
  });
});