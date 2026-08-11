import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SwitchboardState } from './types.ts';

const stateDirectory = path.join(process.env.HOME ?? '.', '.switchboard');
const stateFile = path.join(stateDirectory, 'state.json');

export async function readState(): Promise<SwitchboardState> {
  try {
    return JSON.parse(await readFile(stateFile, 'utf8')) as SwitchboardState;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { runs: [] };
    throw error;
  }
}

export async function saveState(state: SwitchboardState) {
  await mkdir(stateDirectory, { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
