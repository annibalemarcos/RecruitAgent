import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import path from 'node:path';

// Async work retains the generation in which it started, including detached AI jobs.
const context = new AsyncLocalStorage<number>();
let generation = 0;
let resetting = false;
const pendingIO = new Set<Promise<unknown>>();
export const isResettingData = () => resetting;
export const isCurrentDataOperation = () => !resetting && (context.getStore() ?? generation) === generation;
export function assertCurrentDataOperation() {
  if (!isCurrentDataOperation()) throw new Error('Operação interrompida pelo reset dos dados.');
}
export function withDataOperation<T>(callback: () => T): T {
  return context.run(generation, callback);
}
async function guardedIO<T>(callback: () => Promise<T>): Promise<T> {
  assertCurrentDataOperation();
  const operation = callback();
  pendingIO.add(operation);
  try {
    const result = await operation;
    assertCurrentDataOperation();
    return result;
  } finally {
    pendingIO.delete(operation);
  }
}
// Writes to the same file run one after another. Several workers can save the same session or
// database at once; overlapping writeFile calls could interleave and corrupt the JSON.
const writeChains = new Map<string, Promise<unknown>>();
function serializedWrite(args: Parameters<typeof fs.writeFile>): Promise<void> {
  const key = String(args[0]);
  const previous = writeChains.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => fs.writeFile(...args));
  writeChains.set(key, run);
  void run.then(() => undefined, () => undefined).then(() => {
    if (writeChains.get(key) === run) writeChains.delete(key);
  });
  return run;
}
// Gate every disk operation in the data repositories; reset waits for writes already in flight.
export const dataFs = {
  mkdir: (...args: Parameters<typeof fs.mkdir>) => guardedIO(() => fs.mkdir(...args)),
  readFile: (...args: Parameters<typeof fs.readFile>) => guardedIO(() => fs.readFile(...args)),
  writeFile: (...args: Parameters<typeof fs.writeFile>) => guardedIO(() => serializedWrite(args)),
  readdir: (...args: Parameters<typeof fs.readdir>) => guardedIO(() => fs.readdir(...args)),
  stat: (...args: Parameters<typeof fs.stat>) => guardedIO(() => fs.stat(...args)),
  rm: (...args: Parameters<typeof fs.rm>) => guardedIO(() => fs.rm(...args)),
} as typeof fs;

export async function resetDataDirectory(clearMemory: () => void): Promise<void> {
  if (resetting) throw new Error('Já existe uma limpeza em andamento.');
  resetting = true;
  generation++;
  try {
    clearMemory();
    await Promise.allSettled([...pendingIO]);
    const directory = path.resolve(process.cwd(), 'data');
    // Do not follow a replaced data directory symlink to another location.
    const info = await fs.lstat(directory).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (info?.isSymbolicLink() || (info && !info.isDirectory())) {
      throw new Error('A pasta data precisa ser um diretório real, sem link simbólico.');
    }
    await fs.mkdir(directory, { recursive: true });
    for (const entry of await fs.readdir(directory)) {
      await fs.rm(path.join(directory, entry), { recursive: true, force: true });
    }
  } finally {
    resetting = false;
  }
}
