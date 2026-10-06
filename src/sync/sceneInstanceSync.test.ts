import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import {
  __resetSceneInstanceOutboxForTests,
  enqueueSceneInstance,
  getSceneInstance
} from '../persistence/sceneInstanceOutbox';
import { flushSceneInstances } from './sceneInstanceSync';
import type { SceneInstancePayload } from './sceneInstance';

Object.assign(globalThis, { indexedDB, IDBKeyRange });

const CHARACTER = '33333333-3333-4333-8333-333333333333';
const INSTANCE = '55555555-5555-4555-8555-555555555555';

function payload(): SceneInstancePayload {
  return {
    sceneInstanceId: INSTANCE,
    characterId: CHARACTER,
    gameDay: 1,
    sceneId: 101,
    scenePresentationId: 201,
    choices: [
      { choiceId: 301, presentationId: 401, position: 1 },
      { choiceId: 302, presentationId: 402, position: 2 }
    ]
  };
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('put-scene-instance-outbox');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('database delete blocked'));
  });
}

beforeEach(async () => {
  await __resetSceneInstanceOutboxForTests();
  await deleteDatabase();
});

describe('scene instance sync', () => {
  it('marks accepted scene instances synced', async () => {
    await enqueueSceneInstance(payload());
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      results: [{ sceneInstanceId: INSTANCE, status: 'accepted' }]
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await flushSceneInstances({
      characterId: CHARACTER,
      endpoint: '/api/v1/game/scene-instances/batch',
      fetchImpl: fetchImpl as typeof fetch
    });

    expect(result).toEqual({ status: 'ok', sent: 1 });
    expect((await getSceneInstance(INSTANCE))?.syncStatus).toBe('synced');
  });

  it('keeps 401 pending without retry penalty', async () => {
    await enqueueSceneInstance(payload());
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }));
    await flushSceneInstances({
      characterId: CHARACTER,
      endpoint: '/api/v1/game/scene-instances/batch',
      fetchImpl: fetchImpl as typeof fetch
    });
    const stored = await getSceneInstance(INSTANCE);
    expect(stored?.syncStatus).toBe('pending');
    expect(stored?.retryCount).toBe(0);
  });
});
