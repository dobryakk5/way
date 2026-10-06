import { choiceMadeEventSchema, type ChoiceMadeEvent } from '../sync/choiceEvent';

export type OutboxSyncStatus = 'pending' | 'sending' | 'synced' | 'rejected';

export interface LocalChoiceEvent extends ChoiceMadeEvent {
  syncStatus: OutboxSyncStatus;
  retryCount: number;
  rejectCode?: string;
  updatedAt: string;
}

const DB_NAME = 'put-event-outbox';
const DB_VERSION = 1;
const STORE = 'events';
const CHARACTER_SEQ = 'characterSeq';
const CHARACTER_STATUS_SEQ = 'characterStatusSeq';

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
    transaction.onabort = () => reject(transaction.error ?? new Error('Outbox transaction aborted'));
  });
}

let database: Promise<IDBDatabase> | undefined;

function openOutbox(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const store = open.result.createObjectStore(STORE, { keyPath: 'eventId' });
        store.createIndex(CHARACTER_SEQ, ['characterId', 'seq'], { unique: true });
        store.createIndex(CHARACTER_STATUS_SEQ, ['characterId', 'syncStatus', 'seq']);
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

function sameEvent(a: ChoiceMadeEvent, b: ChoiceMadeEvent): boolean {
  return a.eventId === b.eventId &&
    a.characterId === b.characterId &&
    a.gameSessionId === b.gameSessionId &&
    a.seq === b.seq &&
    a.gameDay === b.gameDay &&
    a.eventType === b.eventType &&
    a.sceneInstanceId === b.sceneInstanceId &&
    a.choiceId === b.choiceId &&
    a.occurredAt === b.occurredAt;
}

export async function enqueueChoiceEvent(raw: ChoiceMadeEvent): Promise<LocalChoiceEvent> {
  const event = choiceMadeEventSchema.parse(raw);
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  const done = complete(tx);
  const store = tx.objectStore(STORE);
  const existing = await request(store.get(event.eventId)) as LocalChoiceEvent | undefined;

  if (existing) {
    if (!sameEvent(existing, event)) {
      tx.abort();
      await done.catch(() => undefined);
      throw new Error('EVENT_ID_PAYLOAD_MISMATCH');
    }
    await done;
    return existing;
  }

  const local: LocalChoiceEvent = {
    ...event,
    syncStatus: 'pending',
    retryCount: 0,
    updatedAt: new Date().toISOString()
  };

  try {
    store.add(local);
    await done;
    return local;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError') {
      throw new Error('OUTBOX_SEQ_CONFLICT');
    }
    throw error;
  }
}

export async function listPendingChoiceEvents(characterId: string, limit = 100): Promise<LocalChoiceEvent[]> {
  if (limit < 1 || limit > 100) throw new Error('OUTBOX_LIMIT_OUT_OF_RANGE');
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readonly');
  const done = complete(tx);
  const index = tx.objectStore(STORE).index(CHARACTER_STATUS_SEQ);
  const range = IDBKeyRange.bound(
    [characterId, 'pending', 0],
    [characterId, 'pending', Number.MAX_SAFE_INTEGER]
  );
  const result = await request(index.getAll(range, limit)) as LocalChoiceEvent[];
  await done;
  return result;
}

async function updateEvent(
  eventId: string,
  mutate: (event: LocalChoiceEvent) => LocalChoiceEvent
): Promise<LocalChoiceEvent | undefined> {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  const done = complete(tx);
  const store = tx.objectStore(STORE);
  const current = await request(store.get(eventId)) as LocalChoiceEvent | undefined;
  if (!current) {
    await done;
    return undefined;
  }
  const next = mutate(current);
  store.put(next);
  await done;
  return next;
}

export function markChoiceEventSending(eventId: string): Promise<LocalChoiceEvent | undefined> {
  return updateEvent(eventId, event => ({
    ...event,
    syncStatus: 'sending',
    updatedAt: new Date().toISOString()
  }));
}

export function markChoiceEventSynced(eventId: string): Promise<LocalChoiceEvent | undefined> {
  return updateEvent(eventId, event => ({
    ...event,
    syncStatus: 'synced',
    rejectCode: undefined,
    updatedAt: new Date().toISOString()
  }));
}

export function markChoiceEventRejected(eventId: string, code: string): Promise<LocalChoiceEvent | undefined> {
  return updateEvent(eventId, event => ({
    ...event,
    syncStatus: 'rejected',
    rejectCode: code,
    updatedAt: new Date().toISOString()
  }));
}

export function markChoiceEventPending(eventId: string, incrementRetry = false): Promise<LocalChoiceEvent | undefined> {
  return updateEvent(eventId, event => ({
    ...event,
    syncStatus: 'pending',
    retryCount: event.retryCount + (incrementRetry ? 1 : 0),
    updatedAt: new Date().toISOString()
  }));
}

export function markChoiceEventRetry(eventId: string): Promise<LocalChoiceEvent | undefined> {
  return markChoiceEventPending(eventId, true);
}

export async function resetSendingChoiceEvents(characterId?: string): Promise<number> {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  const done = complete(tx);
  const store = tx.objectStore(STORE);
  const all = await request(store.getAll()) as LocalChoiceEvent[];
  let changed = 0;
  for (const event of all) {
    if (event.syncStatus !== 'sending' || characterId && event.characterId !== characterId) continue;
    store.put({
      ...event,
      syncStatus: 'pending',
      updatedAt: new Date().toISOString()
    } satisfies LocalChoiceEvent);
    changed += 1;
  }
  await done;
  return changed;
}

export async function getChoiceEvent(eventId: string): Promise<LocalChoiceEvent | undefined> {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readonly');
  const done = complete(tx);
  const result = await request(tx.objectStore(STORE).get(eventId)) as LocalChoiceEvent | undefined;
  await done;
  return result;
}

export async function clearChoiceOutbox(characterId: string): Promise<void> {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  const done = complete(tx);
  const store = tx.objectStore(STORE);
  const all = await request(store.getAll()) as LocalChoiceEvent[];
  for (const event of all) if (event.characterId === characterId) store.delete(event.eventId);
  await done;
}

/** Test-only: closes the cached connection so fake-indexeddb can delete the database cleanly. */
export async function __resetChoiceOutboxForTests(): Promise<void> {
  const db = await database?.catch(() => undefined);
  db?.close();
  database = undefined;
}
