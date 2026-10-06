import { sceneInstanceSchema, type SceneInstancePayload } from '../sync/sceneInstance';

export type SceneInstanceSyncStatus = 'pending' | 'sending' | 'synced' | 'rejected';

export interface LocalSceneInstance extends SceneInstancePayload {
  syncStatus: SceneInstanceSyncStatus;
  retryCount: number;
  rejectCode?: string;
  updatedAt: string;
}

const DB_NAME = 'put-scene-instance-outbox';
const DB_VERSION = 2;
const STORE = 'sceneInstances';
const CHARACTER_STATUS_DAY = 'characterStatusDay';
const CHARACTER_STATUS_ORDER = 'characterStatusOrder';

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
    transaction.onabort = () => reject(transaction.error ?? new Error('Scene outbox transaction aborted'));
  });
}

let database: Promise<IDBDatabase> | undefined;

function openOutbox(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = event => {
        const store = event.oldVersion === 0
          ? open.result.createObjectStore(STORE, { keyPath: 'sceneInstanceId' })
          : open.transaction!.objectStore(STORE);
        if (!store.indexNames.contains(CHARACTER_STATUS_DAY)) {
          store.createIndex(CHARACTER_STATUS_DAY, ['characterId', 'syncStatus', 'gameDay']);
        }
        if (!store.indexNames.contains(CHARACTER_STATUS_ORDER)) {
          store.createIndex(
            CHARACTER_STATUS_ORDER,
            ['characterId', 'syncStatus', 'gameDay', 'gameSlot']
          );
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => { database = undefined; reject(open.error); };
    });
  }
  return database;
}

function samePayload(a: SceneInstancePayload, b: SceneInstancePayload): boolean {
  return a.sceneInstanceId === b.sceneInstanceId &&
    a.characterId === b.characterId &&
    a.gameDay === b.gameDay &&
    a.sceneId === b.sceneId &&
    a.scenePresentationId === b.scenePresentationId &&
    a.gameSlot === b.gameSlot &&
    a.selectionOrigin === b.selectionOrigin &&
    JSON.stringify(a.choices) === JSON.stringify(b.choices);
}

export async function enqueueSceneInstance(raw: SceneInstancePayload): Promise<LocalSceneInstance> {
  const payload = sceneInstanceSchema.parse(raw);
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  const done = complete(tx);
  const store = tx.objectStore(STORE);
  const existing = await request(store.get(payload.sceneInstanceId)) as LocalSceneInstance | undefined;
  if (existing) {
    if (!samePayload(existing, payload)) {
      tx.abort();
      await done.catch(() => undefined);
      throw new Error('SCENE_INSTANCE_PAYLOAD_MISMATCH');
    }
    await done;
    return existing;
  }
  const local: LocalSceneInstance = {
    ...payload,
    syncStatus: 'pending',
    retryCount: 0,
    updatedAt: new Date().toISOString()
  };
  store.add(local);
  await done;
  return local;
}

export async function listPendingSceneInstances(characterId: string, limit = 100): Promise<LocalSceneInstance[]> {
  if (limit < 1 || limit > 100) throw new Error('OUTBOX_LIMIT_OUT_OF_RANGE');
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readonly');
  const done = complete(tx);
  const index = tx.objectStore(STORE).index(CHARACTER_STATUS_ORDER);
  const range = IDBKeyRange.bound(
    [characterId, 'pending', 0, 0],
    [characterId, 'pending', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]
  );
  const result = await request(index.getAll(range, limit)) as LocalSceneInstance[];
  await done;
  return result;
}

async function updateScene(
  sceneInstanceId: string,
  mutate: (scene: LocalSceneInstance) => LocalSceneInstance
): Promise<LocalSceneInstance | undefined> {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  const done = complete(tx);
  const store = tx.objectStore(STORE);
  const current = await request(store.get(sceneInstanceId)) as LocalSceneInstance | undefined;
  if (!current) { await done; return undefined; }
  const next = mutate(current);
  store.put(next);
  await done;
  return next;
}

export function markSceneInstanceSending(sceneInstanceId: string): Promise<LocalSceneInstance | undefined> {
  return updateScene(sceneInstanceId, scene => ({ ...scene, syncStatus: 'sending', updatedAt: new Date().toISOString() }));
}

export function markSceneInstancePending(sceneInstanceId: string, incrementRetry = false): Promise<LocalSceneInstance | undefined> {
  return updateScene(sceneInstanceId, scene => ({
    ...scene,
    syncStatus: 'pending',
    retryCount: scene.retryCount + (incrementRetry ? 1 : 0),
    updatedAt: new Date().toISOString()
  }));
}

export function markSceneInstanceSynced(sceneInstanceId: string): Promise<LocalSceneInstance | undefined> {
  return updateScene(sceneInstanceId, scene => {
    const next: LocalSceneInstance = { ...scene, syncStatus: 'synced', updatedAt: new Date().toISOString() };
    delete next.rejectCode;
    return next;
  });
}

export function markSceneInstanceRejected(sceneInstanceId: string, code: string): Promise<LocalSceneInstance | undefined> {
  return updateScene(sceneInstanceId, scene => ({
    ...scene, syncStatus: 'rejected', rejectCode: code, updatedAt: new Date().toISOString()
  }));
}


export async function resetSendingSceneInstances(characterId?: string): Promise<number> {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  const done = complete(tx);
  const store = tx.objectStore(STORE);
  const all = await request(store.getAll()) as LocalSceneInstance[];
  let changed = 0;
  for (const scene of all) {
    if (
      scene.syncStatus !== 'sending' ||
      (characterId !== undefined && scene.characterId !== characterId)
    ) continue;
    store.put({
      ...scene,
      syncStatus: 'pending',
      updatedAt: new Date().toISOString()
    } satisfies LocalSceneInstance);
    changed += 1;
  }
  await done;
  return changed;
}

export async function getSceneInstance(sceneInstanceId: string): Promise<LocalSceneInstance | undefined> {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readonly');
  const done = complete(tx);
  const result = await request(tx.objectStore(STORE).get(sceneInstanceId)) as LocalSceneInstance | undefined;
  await done;
  return result;
}

export async function __resetSceneInstanceOutboxForTests(): Promise<void> {
  const db = await database?.catch(() => undefined);
  db?.close();
  database = undefined;
}
