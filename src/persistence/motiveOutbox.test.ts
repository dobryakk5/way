import { beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import {
  __resetMotiveOutboxForTests,
  enqueueMotiveResolution,
  getMotiveResolution,
  listHeldMotiveResolutions,
  listPendingMotiveResolutions,
  markMotiveResolutionPending,
  markMotiveResolutionSending,
  resetSendingMotiveResolutions
} from './motiveOutbox';
import type { MotiveResolutionEvent } from '../sync/motiveResolution';

Object.assign(globalThis, { indexedDB, IDBKeyRange });

const EVENT = '11111111-1111-4111-8111-111111111111';
const EVENT_2 = '22222222-2222-4222-8222-222222222222';
const CHARACTER = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const SCENE = '55555555-5555-4555-8555-555555555555';

function event(overrides: Partial<MotiveResolutionEvent> = {}): MotiveResolutionEvent {
  return {
    eventId: EVENT,
    characterId: CHARACTER,
    gameSessionId: SESSION,
    gameDay: 1,
    sceneInstanceId: SCENE,
    choiceId: 101,
    promptId: 201,
    resolutionType: 'answered',
    motiveOptionId: 301,
    occurredAt: '2026-10-06T13:32:11.000Z',
    ...overrides
  } as MotiveResolutionEvent;
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('put-motive-outbox');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('database delete blocked'));
  });
}

beforeEach(async () => {
  await __resetMotiveOutboxForTests();
  await deleteDatabase();
});

describe('motive outbox', () => {
  it('holds a resolution until the local game save commits', async () => {
    await enqueueMotiveResolution(
      event(),
      { caseId: 'case-1', promptId: 'why', optionId: 'purpose' },
      'held'
    );

    expect(await listHeldMotiveResolutions(CHARACTER)).toHaveLength(1);
    expect(await listPendingMotiveResolutions(CHARACTER)).toHaveLength(0);

    await markMotiveResolutionPending(EVENT);
    expect(await listHeldMotiveResolutions(CHARACTER)).toHaveLength(0);
    expect(await listPendingMotiveResolutions(CHARACTER)).toHaveLength(1);
  });

  it('allows only one motive resolution per presented scene', async () => {
    await enqueueMotiveResolution(
      event(),
      { caseId: 'case-1', promptId: 'why', optionId: 'purpose' }
    );

    await expect(enqueueMotiveResolution(
      event({
        eventId: EVENT_2,
        resolutionType: 'skipped'
      }),
      { caseId: 'case-1', promptId: 'why' }
    )).rejects.toThrow('MOTIVE_ALREADY_RECORDED');
  });

  it('returns a stranded sending resolution to pending after restart', async () => {
    await enqueueMotiveResolution(
      event(),
      { caseId: 'case-1', promptId: 'why', optionId: 'purpose' }
    );
    await markMotiveResolutionSending(EVENT);
    expect((await getMotiveResolution(EVENT))?.syncStatus).toBe('sending');

    expect(await resetSendingMotiveResolutions(CHARACTER)).toBe(1);
    expect((await getMotiveResolution(EVENT))?.syncStatus).toBe('pending');
  });
});
