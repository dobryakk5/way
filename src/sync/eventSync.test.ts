import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import {
  __resetChoiceOutboxForTests,
  enqueueChoiceEvent,
  getChoiceEvent,
  markChoiceEventSending
} from '../persistence/eventOutbox';
import { flushChoiceEvents, syncChoiceEventsWithLock } from './eventSync';
import type { ChoiceMadeEvent } from './choiceEvent';

Object.assign(globalThis, { indexedDB, IDBKeyRange });

const CHARACTER = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const SCENE = '55555555-5555-4555-8555-555555555555';
const EVENT = '11111111-1111-4111-8111-111111111111';
const EVENT_2 = '22222222-2222-4222-8222-222222222222';
const ENDPOINT = '/api/v1/game/events/batch';

function event(overrides: Partial<ChoiceMadeEvent> = {}): ChoiceMadeEvent {
  return {
    eventId: EVENT,
    characterId: CHARACTER,
    gameSessionId: SESSION,
    seq: 1,
    gameDay: 1,
    eventType: 'CHOICE_MADE',
    sceneInstanceId: SCENE,
    choiceId: 101,
    occurredAt: '2026-10-06T13:32:11.000Z',
    ...overrides
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function flush(fetchImpl: unknown) {
  return flushChoiceEvents({
    characterId: CHARACTER,
    endpoint: ENDPOINT,
    fetchImpl: fetchImpl as typeof fetch
  });
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

describe('event sync: response handling', () => {
  it('reports idle without calling the server when nothing is pending', async () => {
    const fetchImpl = vi.fn();
    expect(await flush(fetchImpl)).toEqual({ status: 'idle', sent: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends only API fields, ordered by seq', async () => {
    await enqueueChoiceEvent(event({ eventId: EVENT_2, seq: 2, choiceId: 102 }));
    await enqueueChoiceEvent(event());
    const fetchImpl = vi.fn(async () => json({ results: [] }));

    await flush(fetchImpl);

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const sent = JSON.parse(init.body as string).events as Record<string, unknown>[];
    expect(sent.map(item => item.seq)).toEqual([1, 2]);
    expect(Object.keys(sent[0]!).sort()).toEqual([
      'characterId', 'choiceId', 'eventId', 'eventType', 'gameDay',
      'gameSessionId', 'occurredAt', 'sceneInstanceId', 'seq'
    ]);
  });

  it('marks alreadyAccepted events synced', async () => {
    await enqueueChoiceEvent(event());
    const result = await flush(vi.fn(async () =>
      json({ results: [{ eventId: EVENT, status: 'alreadyAccepted' }] })));

    expect(result).toEqual({ status: 'ok', sent: 1 });
    expect((await getChoiceEvent(EVENT))?.syncStatus).toBe('synced');
  });

  it('settles each event of a mixed batch independently', async () => {
    await enqueueChoiceEvent(event());
    await enqueueChoiceEvent(event({ eventId: EVENT_2, seq: 2, choiceId: 102 }));

    await flush(vi.fn(async () => json({
      results: [
        { eventId: EVENT, status: 'accepted' },
        { eventId: EVENT_2, status: 'rejected' }
      ]
    })));

    expect((await getChoiceEvent(EVENT))?.syncStatus).toBe('synced');
    const rejected = await getChoiceEvent(EVENT_2);
    expect(rejected?.syncStatus).toBe('rejected');
    expect(rejected?.rejectCode).toBe('REJECTED');
  });

  it('retries 5xx and increments retryCount', async () => {
    await enqueueChoiceEvent(event());
    const result = await flush(vi.fn(async () => new Response('', { status: 503 })));

    expect(result).toEqual({ status: 'retry', sent: 1, reason: 'server' });
    const stored = await getChoiceEvent(EVENT);
    expect(stored?.syncStatus).toBe('pending');
    expect(stored?.retryCount).toBe(1);
  });

  it.each([408, 425, 429])('treats HTTP %i as a transient retry, not a rejection', async status => {
    await enqueueChoiceEvent(event());
    const result = await flush(vi.fn(async () => new Response('', { status })));

    expect(result).toEqual({ status: 'retry', sent: 1, reason: 'throttled' });
    const stored = await getChoiceEvent(EVENT);
    expect(stored?.syncStatus).toBe('pending');
    expect(stored?.retryCount).toBe(1);
    expect(stored?.rejectCode).toBeUndefined();
  });

  it('rejects the batch terminally on other 4xx', async () => {
    await enqueueChoiceEvent(event());
    const result = await flush(vi.fn(async () => new Response('', { status: 400 })));

    expect(result).toEqual({ status: 'rejected', sent: 1, httpStatus: 400 });
    const stored = await getChoiceEvent(EVENT);
    expect(stored?.syncStatus).toBe('rejected');
    expect(stored?.rejectCode).toBe('HTTP_400');
    expect(stored?.retryCount).toBe(0);
  });

  it('retries when the body is not JSON', async () => {
    await enqueueChoiceEvent(event());
    const result = await flush(vi.fn(async () => new Response('<html>', { status: 200 })));

    expect(result).toEqual({ status: 'retry', sent: 1, reason: 'invalid-response' });
    const stored = await getChoiceEvent(EVENT);
    expect(stored?.syncStatus).toBe('pending');
    expect(stored?.retryCount).toBe(1);
  });

  it('retries when the body does not match the response schema', async () => {
    await enqueueChoiceEvent(event());
    const result = await flush(vi.fn(async () =>
      json({ results: [{ eventId: EVENT, status: 'maybe' }] })));

    expect(result).toEqual({ status: 'retry', sent: 1, reason: 'invalid-response' });
    expect((await getChoiceEvent(EVENT))?.syncStatus).toBe('pending');
  });

  it('retries an event the server did not mention', async () => {
    await enqueueChoiceEvent(event());
    await enqueueChoiceEvent(event({ eventId: EVENT_2, seq: 2, choiceId: 102 }));

    await flush(vi.fn(async () => json({ results: [{ eventId: EVENT, status: 'accepted' }] })));

    expect((await getChoiceEvent(EVENT))?.syncStatus).toBe('synced');
    const missing = await getChoiceEvent(EVENT_2);
    expect(missing?.syncStatus).toBe('pending');
    expect(missing?.retryCount).toBe(1);
  });
});

function fakeLocks() {
  const held = new Set<string>();
  return {
    held,
    request: vi.fn(async (
      name: string,
      _options: unknown,
      callback: (lock: unknown) => Promise<void>
    ) => {
      if (held.has(name)) return callback(null);
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    })
  };
}

const okResponse = () => json({ results: [{ eventId: EVENT, status: 'accepted' }] });

describe('syncChoiceEventsWithLock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('flushes under a per-character lock', async () => {
    const locks = fakeLocks();
    vi.stubGlobal('navigator', { locks });
    await enqueueChoiceEvent(event());

    const result = await syncChoiceEventsWithLock({
      characterId: CHARACTER,
      endpoint: ENDPOINT,
      fetchImpl: vi.fn(async () => okResponse()) as unknown as typeof fetch
    });

    expect(result).toEqual({ status: 'ok', sent: 1 });
    expect(locks.request).toHaveBeenCalledWith(
      `put-event-sync:${CHARACTER}`,
      { ifAvailable: true },
      expect.any(Function)
    );
    expect((await getChoiceEvent(EVENT))?.syncStatus).toBe('synced');
  });

  it('returns locked without sending when another worker holds the lock', async () => {
    const locks = fakeLocks();
    locks.held.add(`put-event-sync:${CHARACTER}`);
    vi.stubGlobal('navigator', { locks });
    await enqueueChoiceEvent(event());
    const fetchImpl = vi.fn(async () => okResponse());

    const result = await syncChoiceEventsWithLock({
      characterId: CHARACTER,
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result).toEqual({ status: 'locked', sent: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('recovers events stranded in sending by an interrupted run', async () => {
    vi.stubGlobal('navigator', { locks: fakeLocks() });
    await enqueueChoiceEvent(event());
    await markChoiceEventSending(EVENT);

    const result = await syncChoiceEventsWithLock({
      characterId: CHARACTER,
      endpoint: ENDPOINT,
      fetchImpl: vi.fn(async () => okResponse()) as unknown as typeof fetch
    });

    expect(result).toEqual({ status: 'ok', sent: 1 });
    expect((await getChoiceEvent(EVENT))?.syncStatus).toBe('synced');
  });

  it('still syncs when Web Locks are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    await enqueueChoiceEvent(event());
    await markChoiceEventSending(EVENT);

    const result = await syncChoiceEventsWithLock({
      characterId: CHARACTER,
      endpoint: ENDPOINT,
      fetchImpl: vi.fn(async () => okResponse()) as unknown as typeof fetch
    });

    expect(result).toEqual({ status: 'ok', sent: 1 });
    expect((await getChoiceEvent(EVENT))?.syncStatus).toBe('synced');
  });

  it('serializes runs within one tab when Web Locks are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    await enqueueChoiceEvent(event());
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fetchImpl = vi.fn(async () => {
      await gate;
      return okResponse();
    });
    const options = {
      characterId: CHARACTER,
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch
    };

    const first = syncChoiceEventsWithLock(options);
    const second = await syncChoiceEventsWithLock(options);
    release();

    expect(second).toEqual({ status: 'locked', sent: 0 });
    expect(await first).toEqual({ status: 'ok', sent: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // the in-flight guard is released afterwards
    await enqueueChoiceEvent(event({ eventId: EVENT_2, seq: 2, choiceId: 102 }));
    const third = await syncChoiceEventsWithLock({
      ...options,
      fetchImpl: vi.fn(async () =>
        json({ results: [{ eventId: EVENT_2, status: 'accepted' }] })) as unknown as typeof fetch
    });
    expect(third).toEqual({ status: 'ok', sent: 1 });
  });
});
