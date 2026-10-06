import { beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import {
  __resetChoiceOutboxForTests,
  enqueueChoiceEvent,
  getChoiceEvent,
  listPendingChoiceEvents,
  markChoiceEventSending,
  resetSendingChoiceEvents
} from './eventOutbox';
import type { ChoiceMadeEvent } from '../sync/choiceEvent';

Object.assign(globalThis, { indexedDB, IDBKeyRange });

const EVENT_A = '11111111-1111-4111-8111-111111111111';
const EVENT_B = '22222222-2222-4222-8222-222222222222';
const CHARACTER = '33333333-3333-4333-8333-333333333333';
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
