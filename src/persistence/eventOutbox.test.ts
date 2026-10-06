import { beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import {
  __resetChoiceOutboxForTests,
  clearChoiceOutbox,
  enqueueChoiceEvent,
  getChoiceEvent,
  listPendingChoiceEvents,
  markChoiceEventRejected,
  markChoiceEventRetry,
  markChoiceEventSending,
  markChoiceEventSynced,
  resetSendingChoiceEvents
} from './eventOutbox';
import type { ChoiceMadeEvent } from '../sync/choiceEvent';

Object.assign(globalThis, { indexedDB, IDBKeyRange });

const EVENT_A = '11111111-1111-4111-8111-111111111111';
const EVENT_B = '22222222-2222-4222-8222-222222222222';
const CHARACTER = '33333333-3333-4333-8333-333333333333';
const OTHER_CHARACTER = '66666666-6666-4666-8666-666666666666';
const SESSION = '44444444-4444-4444-8444-444444444444';
const SCENE = '55555555-5555-4555-8555-555555555555';

function event(overrides: Partial<ChoiceMadeEvent> = {}): ChoiceMadeEvent {
  return {
    eventId: EVENT_A,
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

describe('choice event outbox', () => {
  it('stores a validated choice event as pending', async () => {
    await enqueueChoiceEvent(event());
    const stored = await getChoiceEvent(EVENT_A);
    expect(stored?.syncStatus).toBe('pending');
    expect(stored?.choiceId).toBe(101);
    expect(stored?.retryCount).toBe(0);
  });

  it('treats identical eventId + payload as idempotent', async () => {
    await enqueueChoiceEvent(event());
    await enqueueChoiceEvent(event());
    expect(await listPendingChoiceEvents(CHARACTER)).toHaveLength(1);
  });

  it('rejects same eventId with another payload', async () => {
    await enqueueChoiceEvent(event());
    await expect(enqueueChoiceEvent(event({ choiceId: 102 })))
      .rejects.toThrow('EVENT_ID_PAYLOAD_MISMATCH');
  });

  it('rejects a second event with the same character seq', async () => {
    await enqueueChoiceEvent(event());
    await expect(enqueueChoiceEvent(event({ eventId: EVENT_B, choiceId: 102 })))
      .rejects.toThrow('OUTBOX_SEQ_CONFLICT');
  });

  it('returns pending events ordered by seq', async () => {
    await enqueueChoiceEvent(event({ eventId: EVENT_B, seq: 2, choiceId: 102 }));
    await enqueueChoiceEvent(event());
    const result = await listPendingChoiceEvents(CHARACTER);
    expect(result.map(item => item.seq)).toEqual([1, 2]);
  });

  it('returns stranded sending events to pending after restart', async () => {
    await enqueueChoiceEvent(event());
    await markChoiceEventSending(EVENT_A);
    expect((await getChoiceEvent(EVENT_A))?.syncStatus).toBe('sending');
    expect(await resetSendingChoiceEvents(CHARACTER)).toBe(1);
    expect((await getChoiceEvent(EVENT_A))?.syncStatus).toBe('pending');
  });
});

describe('choice event outbox: lifecycle', () => {
  it.each([0, 101])('rejects list limit %i', async limit => {
    await expect(listPendingChoiceEvents(CHARACTER, limit))
      .rejects.toThrow('OUTBOX_LIMIT_OUT_OF_RANGE');
  });

  it('honours the list limit', async () => {
    await enqueueChoiceEvent(event());
    await enqueueChoiceEvent(event({ eventId: EVENT_B, seq: 2, choiceId: 102 }));
    expect((await listPendingChoiceEvents(CHARACTER, 1)).map(item => item.seq)).toEqual([1]);
  });

  it('lists only pending events of the requested character', async () => {
    await enqueueChoiceEvent(event());
    await enqueueChoiceEvent(event({ eventId: EVENT_B, seq: 2, choiceId: 102 }));
    await enqueueChoiceEvent(event({
      eventId: '77777777-7777-4777-8777-777777777777',
      characterId: OTHER_CHARACTER
    }));
    await markChoiceEventSynced(EVENT_A);

    const result = await listPendingChoiceEvents(CHARACTER);
    expect(result.map(item => item.eventId)).toEqual([EVENT_B]);
  });

  it('allows the same seq for different characters', async () => {
    await enqueueChoiceEvent(event());
    await expect(enqueueChoiceEvent(event({
      eventId: EVENT_B,
      characterId: OTHER_CHARACTER
    }))).resolves.toMatchObject({ seq: 1, characterId: OTHER_CHARACTER });
  });

  it('rejects a malformed event before touching storage', async () => {
    await expect(enqueueChoiceEvent(event({ choiceId: 'card-1' as unknown as number })))
      .rejects.toThrow();
    expect(await getChoiceEvent(EVENT_A)).toBeUndefined();
  });

  it('increments retryCount on retry and keeps the event pending', async () => {
    await enqueueChoiceEvent(event());
    await markChoiceEventRetry(EVENT_A);
    await markChoiceEventRetry(EVENT_A);
    const stored = await getChoiceEvent(EVENT_A);
    expect(stored?.syncStatus).toBe('pending');
    expect(stored?.retryCount).toBe(2);
  });

  it('stores the reject code and clears it once synced', async () => {
    await enqueueChoiceEvent(event());
    await markChoiceEventRejected(EVENT_A, 'DAY_ALREADY_CLOSED');
    expect((await getChoiceEvent(EVENT_A))?.rejectCode).toBe('DAY_ALREADY_CLOSED');
    await markChoiceEventSynced(EVENT_A);
    const stored = await getChoiceEvent(EVENT_A);
    expect(stored?.syncStatus).toBe('synced');
    expect(stored?.rejectCode).toBeUndefined();
  });

  it('returns undefined when marking an unknown event', async () => {
    expect(await markChoiceEventSynced(EVENT_A)).toBeUndefined();
  });

  it('resets stranded sending events only for the given character', async () => {
    const OTHER_EVENT = '77777777-7777-4777-8777-777777777777';
    await enqueueChoiceEvent(event());
    await enqueueChoiceEvent(event({ eventId: OTHER_EVENT, characterId: OTHER_CHARACTER }));
    await markChoiceEventSending(EVENT_A);
    await markChoiceEventSending(OTHER_EVENT);

    expect(await resetSendingChoiceEvents(CHARACTER)).toBe(1);
    expect((await getChoiceEvent(EVENT_A))?.syncStatus).toBe('pending');
    expect((await getChoiceEvent(OTHER_EVENT))?.syncStatus).toBe('sending');
  });

  it('clears the outbox of one character only', async () => {
    const OTHER_EVENT = '77777777-7777-4777-8777-777777777777';
    await enqueueChoiceEvent(event());
    await enqueueChoiceEvent(event({ eventId: OTHER_EVENT, characterId: OTHER_CHARACTER }));

    await clearChoiceOutbox(CHARACTER);

    expect(await getChoiceEvent(EVENT_A)).toBeUndefined();
    expect(await getChoiceEvent(OTHER_EVENT)).toBeDefined();
  });
});
