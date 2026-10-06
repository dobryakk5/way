import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import {
  __resetChoiceOutboxForTests,
  enqueueChoiceEvent,
  getChoiceEvent
} from '../persistence/eventOutbox';
import { flushChoiceEvents } from './eventSync';
import type { ChoiceMadeEvent } from './choiceEvent';

Object.assign(globalThis, { indexedDB, IDBKeyRange });

const CHARACTER = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const SCENE = '55555555-5555-4555-8555-555555555555';
const EVENT = '11111111-1111-4111-8111-111111111111';

function event(): ChoiceMadeEvent {
  return {
    eventId: EVENT,
    characterId: CHARACTER,
    gameSessionId: SESSION,
    seq: 1,
    gameDay: 1,
    eventType: 'CHOICE_MADE',
    sceneInstanceId: SCENE,
    choiceId: 101,
    occurredAt: '2026-10-06T13:32:11.000Z'
  };
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('put-event-outbox');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('database delete blocked'));
  });
}

beforeEach(async () => {
  await __resetChoiceOutboxForTests();
  await deleteDatabase();
});

describe('event sync', () => {
  it('marks accepted events synced', async () => {
    await enqueueChoiceEvent(event());
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      results: [{ eventId: EVENT, status: 'accepted' }]
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await flushChoiceEvents({
      characterId: CHARACTER,
      endpoint: '/api/v1/game/events/batch',
      fetchImpl: fetchImpl as typeof fetch
    });

    expect(result).toEqual({ status: 'ok', sent: 1 });
    expect((await getChoiceEvent(EVENT))?.syncStatus).toBe('synced');
  });

  it('pauses 401 without increasing retryCount', async () => {
    await enqueueChoiceEvent(event());
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }));

    const result = await flushChoiceEvents({
      characterId: CHARACTER,
      endpoint: '/api/v1/game/events/batch',
      fetchImpl: fetchImpl as typeof fetch
    });

    expect(result.status).toBe('paused-auth');
    const stored = await getChoiceEvent(EVENT);
    expect(stored?.syncStatus).toBe('pending');
    expect(stored?.retryCount).toBe(0);
  });

  it('retries network failures and increments retryCount', async () => {
    await enqueueChoiceEvent(event());
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });

    const result = await flushChoiceEvents({
      characterId: CHARACTER,
      endpoint: '/api/v1/game/events/batch',
      fetchImpl: fetchImpl as typeof fetch
    });

    expect(result.status).toBe('retry');
    const stored = await getChoiceEvent(EVENT);
    expect(stored?.syncStatus).toBe('pending');
    expect(stored?.retryCount).toBe(1);
  });

  it('retries when a successful batch response omits an event result', async () => {
    await enqueueChoiceEvent(event());
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      results: []
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await flushChoiceEvents({
      characterId: CHARACTER,
      endpoint: '/api/v1/game/events/batch',
      fetchImpl: fetchImpl as typeof fetch
    });

    expect(result.status).toBe('retry');
    expect((await getChoiceEvent(EVENT))?.syncStatus).toBe('pending');
  });

  it('marks terminal per-event rejection without retry', async () => {
    await enqueueChoiceEvent(event());
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      results: [{ eventId: EVENT, status: 'rejected', code: 'DAY_ALREADY_CLOSED' }]
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await flushChoiceEvents({
      characterId: CHARACTER,
      endpoint: '/api/v1/game/events/batch',
      fetchImpl: fetchImpl as typeof fetch
    });

    expect(result.status).toBe('rejected');
    const stored = await getChoiceEvent(EVENT);
    expect(stored?.syncStatus).toBe('rejected');
    expect(stored?.rejectCode).toBe('DAY_ALREADY_CLOSED');
    expect(stored?.retryCount).toBe(0);
  });
});
