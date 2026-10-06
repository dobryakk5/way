import {
  motiveResolutionSchema,
  type MotiveResolutionEvent
} from '../sync/motiveResolution';

export type MotiveOutboxStatus = 'held' | 'pending' | 'sending' | 'synced' | 'rejected';

export interface LocalMotiveResolution extends MotiveResolutionEvent {
  syncStatus: MotiveOutboxStatus;
  retryCount: number;
  rejectCode?: string;
  updatedAt: string;
}

const DB_NAME = 'put-motive-outbox';
const DB_VERSION = 1;
const STORE = 'resolutions';
const CHARACTER_STATUS = 'characterStatus';
const CHARACTER_SCENE = 'characterScene';

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Motive outbox transaction aborted'));
  });
}

let database: Promise<IDBDatabase> | undefined;

function openOutbox(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const store = open.result.createObjectStore(STORE, { keyPath: 'eventId' });
        store.createIndex(CHARACTER_STATUS, ['characterId', 'syncStatus', 'gameDay']);
        store.createIndex(CHARACTER_SCENE, ['characterId', 'sceneInstanceId'], { unique: true });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => {
        database = undefined;
        reject(open.error);
      };
    });
  }
  return database;
}

function samePayload(a: MotiveResolutionEvent, b: MotiveResolutionEvent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function enqueueMotiveResolution(
  raw: MotiveResolutionEvent,
  initialStatus: 'held' | 'pending' = 'pending'
): Promise<LocalMotiveResolution> {
  const event = motiveResolutionSchema.parse(raw);
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  const done = complete(tx);
  const store = tx.objectStore(STORE);
  const existing = await request(store.get(event.eventId)) as LocalMotiveResolution | undefined;
  if (existing) {
    if (!samePayload(existing, event)) {
      tx.abort();
      await done.catch(() => undefined);
      throw new Error('EVENT_ID_PAYLOAD_MISMATCH');
    }
    await done;
    return existing;
  }

  const local: LocalMotiveResolution = {
    ...event,
    syncStatus: initialStatus,
    retryCount: 0,
    updatedAt: new Date().toISOString()
  };

  try {
    store.add(local);
    await done;
    return local;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError') {
      throw new Error('MOTIVE_ALREADY_RECORDED');
    }
    throw error;
  }
}

async function listByStatus(
  characterId: string,
  status: 'held' | 'pending',
  limit = 100
): Promise<LocalMotiveResolution[]> {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readonly');
  const done = complete(tx);
  const index = tx.objectStore(STORE).index(CHARACTER_STATUS);
  const range = IDBKeyRange.bound(
    [characterId, status, 0],
    [characterId, status, Number.MAX_SAFE_INTEGER]
  );
  const result = await request(index.getAll(range, limit)) as LocalMotiveResolution[];
  await done;
  return result;
}

export function listPendingMotiveResolutions(
  characterId: string,
  limit = 100
): Promise<LocalMotiveResolution[]> {
  return listByStatus(characterId, 'pending', limit);
}

export function listHeldMotiveResolutions(characterId: string): Promise<LocalMotiveResolution[]> {
  return listByStatus(characterId, 'held', 100);
}

async function updateResolution(
  eventId: string,
  mutate: (event: LocalMotiveResolution) => LocalMotiveResolution
): Promise<LocalMotiveResolution | undefined> {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  const done = complete(tx);
  const store = tx.objectStore(STORE);
  const current = await request(store.get(eventId)) as LocalMotiveResolution | undefined;
  if (!current) {
    await done;
    return undefined;
  }
  const next = mutate(current);
  store.put(next);
  await done;
  return next;
}

export function markMotiveResolutionPending(
  eventId: string,
  incrementRetry = false
): Promise<LocalMotiveResolution | undefined> {
  return updateResolution(eventId, event => ({
    ...event,
    syncStatus: 'pending',
    retryCount: event.retryCount + (incrementRetry ? 1 : 0),
    updatedAt: new Date().toISOString()
  }));
}

export function markMotiveResolutionSending(eventId: string): Promise<LocalMotiveResolution | undefined> {
  return updateResolution(eventId, event => ({
    ...event,
    syncStatus: 'sending',
    updatedAt: new Date().toISOString()
  }));
}

export function markMotiveResolutionSynced(eventId: string): Promise<LocalMotiveResolution | undefined> {
  return updateResolution(eventId, event => {
    const next: LocalMotiveResolution = {
      ...event,
      syncStatus: 'synced',
      updatedAt: new Date().toISOString()
    };
    delete next.rejectCode;
    return next;
  });
}

export function markMotiveResolutionRejected(
  eventId: string,
  code: string
): Promise<LocalMotiveResolution | undefined> {
  return updateResolution(eventId, event => ({
    ...event,
    syncStatus: 'rejected',
    rejectCode: code,
    updatedAt: new Date().toISOString()
  }));
}

export async function resetSendingMotiveResolutions(characterId?: string): Promise<number> {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  const done = complete(tx);
  const store = tx.objectStore(STORE);
  const all = await request(store.getAll()) as LocalMotiveResolution[];
  let changed = 0;
  for (const event of all) {
    if (
      event.syncStatus !== 'sending' ||
      (characterId !== undefined && event.characterId !== characterId)
    ) continue;
    store.put({
      ...event,
      syncStatus: 'pending',
      updatedAt: new Date().toISOString()
    } satisfies LocalMotiveResolution);
    changed += 1;
  }
  await done;
  return changed;
}

export async function deleteMotiveResolution(eventId: string): Promise<void> {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  const done = complete(tx);
  tx.objectStore(STORE).delete(eventId);
  await done;
}

export async function getMotiveResolution(
  eventId: string
): Promise<LocalMotiveResolution | undefined> {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readonly');
  const done = complete(tx);
  const result = await request(tx.objectStore(STORE).get(eventId)) as LocalMotiveResolution | undefined;
  await done;
  return result;
}

export async function __resetMotiveOutboxForTests(): Promise<void> {
  const db = await database?.catch(() => undefined);
  db?.close();
  database = undefined;
}
