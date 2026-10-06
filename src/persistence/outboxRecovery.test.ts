import { beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { choiceId } from '../content/persistenceIds';
import { createInitialGameState } from '../engine/initialState';
import {
  __resetChoiceOutboxForTests,
  enqueueChoiceEvent,
  getChoiceEvent
} from './eventOutbox';
import { reconcileHeldChoiceEvents } from './outboxRecovery';

Object.assign(globalThis, { indexedDB, IDBKeyRange });

const CHARACTER = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const INSTANCE = '55555555-5555-4555-8555-555555555555';
const EVENT = '11111111-1111-4111-8111-111111111111';

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

describe('held choice recovery', () => {
  it('promotes an event when the corresponding history choice was saved', async () => {
    const state = createInitialGameState(1, { runId: CHARACTER });
    state.history.push({ day: 1, slot: 0, cardId: 'card-a', choiceId: 'answer-a' });
    await enqueueChoiceEvent({
      eventId: EVENT, characterId: CHARACTER, gameSessionId: SESSION, seq: 1, gameDay: 1,
      eventType: 'CHOICE_MADE', sceneInstanceId: INSTANCE,
      choiceId: choiceId('card-a', 'answer-a'), occurredAt: '2026-10-06T13:32:11.000Z'
    }, 'held');

    expect(await reconcileHeldChoiceEvents(state)).toEqual({ promoted: 1, removed: 0 });
    expect((await getChoiceEvent(EVENT))?.syncStatus).toBe('pending');
  });

  it('removes an event when the save never committed the choice', async () => {
    const state = createInitialGameState(1, { runId: CHARACTER });
    await enqueueChoiceEvent({
      eventId: EVENT, characterId: CHARACTER, gameSessionId: SESSION, seq: 1, gameDay: 1,
      eventType: 'CHOICE_MADE', sceneInstanceId: INSTANCE,
      choiceId: choiceId('card-a', 'answer-a'), occurredAt: '2026-10-06T13:32:11.000Z'
    }, 'held');

    expect(await reconcileHeldChoiceEvents(state)).toEqual({ promoted: 0, removed: 1 });
    expect(await getChoiceEvent(EVENT)).toBeUndefined();
  });
});
