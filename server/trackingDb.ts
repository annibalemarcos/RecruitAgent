import { verifyStoredContact } from './emailVerification.js';
import { dataFs as fs, assertCurrentDataOperation, isCurrentDataOperation } from './dataLifecycle.js';
import path from 'path';
import { TrackedContactRecord, OutreachStatus } from '../src/types/index.js';

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'contacts_tracking.json');

// In-memory cache
let memoryCache: TrackedContactRecord[] | null = null;

async function ensureDir() {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
  } catch {
    // Already exists
  }
}

export async function getAllTrackedContacts(): Promise<TrackedContactRecord[]> {
  assertCurrentDataOperation();
  if (memoryCache !== null) {
    return memoryCache;
  }
  await ensureDir();
  assertCurrentDataOperation();
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const records = JSON.parse(data) as TrackedContactRecord[];
    memoryCache = [];
    for (const record of records) {
      const verified = await verifyStoredContact(record);
      assertCurrentDataOperation();
      if (verified) memoryCache.push(verified);
    }
  } catch {
    assertCurrentDataOperation();
    memoryCache = [];
  }
  return memoryCache;
}

export async function saveAllTrackedContacts(records: TrackedContactRecord[]): Promise<void> {
  await ensureDir();
  assertCurrentDataOperation();
  const verifiedRecords: TrackedContactRecord[] = [];
  for (const record of records) {
    const verified = await verifyStoredContact(record);
    if (verified) verifiedRecords.push(verified);
  }
  records = verifiedRecords;
  assertCurrentDataOperation();
  memoryCache = records;
  await fs.writeFile(DB_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

export async function upsertTrackedContact(record: TrackedContactRecord): Promise<TrackedContactRecord> {
  const verified = await verifyStoredContact(record);
  if (!verified) throw new Error('Contato sem email comprovado em fonte oficial acessada.');
  record = verified;
  const all = await getAllTrackedContacts();
  // Find by contact id or email
  const existingIdx = all.findIndex((r) => r.id === record.id || (r.email === record.email && r.companyName === record.companyName));

  const updatedRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    all[existingIdx] = {
      ...all[existingIdx],
      ...updatedRecord,
    };
  } else {
    all.unshift(updatedRecord);
  }

  await saveAllTrackedContacts(all);
  return updatedRecord;
}

export async function updateTrackedContactStatus(
  id: string,
  updates: {
    status?: OutreachStatus;
    contactedAt?: string;
    discardedAt?: string;
    interviewAt?: string;
    notes?: string;
    discardReason?: string;
  }
): Promise<TrackedContactRecord | null> {
  const all = await getAllTrackedContacts();
  const idx = all.findIndex((r) => r.id === id);
  if (idx < 0) return null;

  all[idx] = {
    ...all[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await saveAllTrackedContacts(all);
  return all[idx];
}

export async function removeTrackedContact(id: string): Promise<boolean> {
  const all = await getAllTrackedContacts();
  const filtered = all.filter((r) => r.id !== id);
  if (filtered.length === all.length) return false;
  await saveAllTrackedContacts(filtered);
  return true;
}

export function clearTrackingMemoryForReset() { memoryCache = []; }
