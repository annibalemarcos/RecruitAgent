import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resetDataDirectory, withDataOperation } from '../server/dataLifecycle.js';
import { saveSessionCheckpoint, getActiveOrLatestSession, clearSessionMemoryForReset, subscribeToSession } from '../server/jobRunner.js';
import { clearTrackingMemoryForReset, getAllTrackedContacts } from '../server/trackingDb.js';
import { clearVacanciesMemoryForReset, getAllTrackedVacancies, saveAllTrackedVacancies } from '../server/vacancyManager.js';
import { SAMPLE_PROFILE } from '../src/utils/sampleData.js';
import type { SessionState } from '../src/types/index.js';

// Repositories resolve their data paths on import. Run the worker in a disposable cwd.
if (!process.env.RESET_TEST_WORKER) {
  const { spawnSync } = await import('node:child_process');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'recruit-reset-'));
  try {
    const result = spawnSync(process.execPath, ['--import', path.resolve('node_modules/tsx/dist/loader.mjs'), path.resolve('tests/test-data-reset.ts')], {
      cwd: directory, env: { ...process.env, RESET_TEST_WORKER: '1' }, encoding: 'utf8',
    });
    process.stdout.write(result.stdout); process.stderr.write(result.stderr);
    assert.equal(result.status, 0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
} else {
  const data = path.resolve('data');
  await fs.mkdir(path.join(data, 'sessions'), { recursive: true });
  await fs.mkdir(path.join(data, 'nested/deeper'), { recursive: true });
  await fs.writeFile(path.join(data, 'nested/deeper/extra.txt'), 'delete');
  await fs.writeFile('outside.txt', 'keep');
  await fs.writeFile(path.join(data, 'contacts_tracking.json'), '[]');
  const session = { sessionId: 'test-old', status: 'running', currentCompanyIndex: 0, companies: [], logs: [], settings: { maxPagesPerCompany: 1, requestTimeoutMs: 100, delayBetweenRequestsMs: 0, maxConcurrency: 1, generateMaterialsForPossible: false, aiProvider: 'auto', generateDualLanguage: false }, profile: SAMPLE_PROFILE } satisfies SessionState;
  await withDataOperation(() => saveSessionCheckpoint(session));
  await saveAllTrackedVacancies([{ id: 'old-vacancy' } as any]);
  assert.equal((await getActiveOrLatestSession())?.sessionId, 'test-old');
  assert.equal((await getAllTrackedVacancies()).length, 1);
  let resetEvents = 0;
  subscribeToSession('test-old', event => { if (event.type === 'data_reset') resetEvents++; });
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const oldTask = withDataOperation(async () => {
    await wait;
    await saveSessionCheckpoint(session);
    await assert.rejects(saveAllTrackedVacancies([{ id: 'resurrected' } as any]), /reset/);
  });
  const clear = () => { clearSessionMemoryForReset(); clearTrackingMemoryForReset(); clearVacanciesMemoryForReset(); };
  await resetDataDirectory(clear);
  assert.deepEqual(await fs.readdir(data), []);
  assert.equal(resetEvents, 1);
  release(); await oldTask;
  assert.deepEqual(await fs.readdir(data), []);
  assert.equal(await fs.readFile('outside.txt', 'utf8'), 'keep');
  assert.deepEqual(await getAllTrackedContacts(), []);
  assert.deepEqual(await getAllTrackedVacancies(), []);
  assert.equal(await getActiveOrLatestSession(), null);
  await resetDataDirectory(clear);
  const next = { ...session, sessionId: 'test-new' };
  await withDataOperation(() => saveSessionCheckpoint(next));
  assert.equal((await getActiveOrLatestSession())?.sessionId, 'test-new');
  console.log('PASS: recursive reset, caches, SSE, stale background tasks, repeated reset, new session and outside files.');
}
