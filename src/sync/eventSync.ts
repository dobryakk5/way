import {
  listPendingChoiceEvents,
  markChoiceEventPending,
  markChoiceEventRejected,
  markChoiceEventRetry,
  markChoiceEventSending,
  markChoiceEventSynced,
  resetSendingChoiceEvents,
  type LocalChoiceEvent
} from '../persistence/eventOutbox';
import {
  choiceMadeEventSchema,
  eventBatchResponseSchema,
  type ChoiceMadeEvent
} from './choiceEvent';

export type FlushChoiceEventsResult =
  | { status: 'idle'; sent: 0 }
  | { status: 'ok'; sent: number }
  | { status: 'paused-auth'; sent: number }
  | { status: 'retry'; sent: number; reason: 'network' | 'server' | 'throttled' | 'invalid-response' }
  | { status: 'rejected'; sent: number; httpStatus: number };

function apiEvent(local: LocalChoiceEvent): ChoiceMadeEvent {
  return choiceMadeEventSchema.parse({
    eventId: local.eventId,
    characterId: local.characterId,
    gameSessionId: local.gameSessionId,
    seq: local.seq,
    gameDay: local.gameDay,
    eventType: local.eventType,
    sceneInstanceId: local.sceneInstanceId,
    choiceId: local.choiceId,
    occurredAt: local.occurredAt
  });
}

/** Transient client-side statuses: the request itself was fine, the server asked us to come back later. */
const THROTTLED_STATUSES = new Set([408, 425, 429]);

async function returnToPending(events: LocalChoiceEvent[], incrementRetry: boolean): Promise<void> {
  await Promise.all(events.map(event => markChoiceEventPending(event.eventId, incrementRetry)));
}

export async function flushChoiceEvents(options: {
  characterId: string;
  endpoint: string;
  fetchImpl?: typeof fetch;
}): Promise<FlushChoiceEventsResult> {
  const pending = await listPendingChoiceEvents(options.characterId, 100);
  if (!pending.length) return { status: 'idle', sent: 0 };

  await Promise.all(pending.map(event => markChoiceEventSending(event.eventId)));
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ events: pending.map(apiEvent) })
    });
  } catch {
    await Promise.all(pending.map(event => markChoiceEventRetry(event.eventId)));
    return { status: 'retry', sent: pending.length, reason: 'network' };
  }

  if (response.status === 401) {
    await returnToPending(pending, false);
    return { status: 'paused-auth', sent: pending.length };
  }

  if (response.status >= 500) {
    await returnToPending(pending, true);
    return { status: 'retry', sent: pending.length, reason: 'server' };
  }

  if (THROTTLED_STATUSES.has(response.status)) {
    await returnToPending(pending, true);
    return { status: 'retry', sent: pending.length, reason: 'throttled' };
  }

  if (!response.ok) {
    await Promise.all(pending.map(event =>
      markChoiceEventRejected(event.eventId, `HTTP_${response.status}`)
    ));
    return { status: 'rejected', sent: pending.length, httpStatus: response.status };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    await returnToPending(pending, true);
    return { status: 'retry', sent: pending.length, reason: 'invalid-response' };
  }

  const parsed = eventBatchResponseSchema.safeParse(body);
  if (!parsed.success) {
    await returnToPending(pending, true);
    return { status: 'retry', sent: pending.length, reason: 'invalid-response' };
  }

  const results = new Map(parsed.data.results.map(result => [result.eventId, result]));
  await Promise.all(pending.map(async event => {
    const result = results.get(event.eventId);
    if (!result) {
      await markChoiceEventRetry(event.eventId);
      return;
    }
    if (result.status === 'accepted' || result.status === 'alreadyAccepted') {
      await markChoiceEventSynced(event.eventId);
      return;
    }
    await markChoiceEventRejected(event.eventId, result.code ?? 'REJECTED');
  }));

  return { status: 'ok', sent: pending.length };
}

type SyncOptions = Parameters<typeof flushChoiceEvents>[0];
export type SyncChoiceEventsResult = FlushChoiceEventsResult | { status: 'locked'; sent: 0 };

/**
 * Only one sync per character may run at a time, so any `sending` event seen here
 * was stranded by an earlier interrupted run and is safe to return to `pending`.
 * Without Web Locks another tab could still be mid-flight; resending is harmless
 * because the server is idempotent by eventId + payload hash.
 */
async function recoverAndFlush(options: SyncOptions): Promise<FlushChoiceEventsResult> {
  await resetSendingChoiceEvents(options.characterId);
  return flushChoiceEvents(options);
}

const inFlightWithoutLocks = new Map<string, Promise<FlushChoiceEventsResult>>();

export async function syncChoiceEventsWithLock(options: SyncOptions): Promise<SyncChoiceEventsResult> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;

  if (!locks) {
    // Web Locks unavailable (old Safari, insecure context): never stall the outbox,
    // just serialize runs within this tab.
    if (inFlightWithoutLocks.has(options.characterId)) return { status: 'locked', sent: 0 };
    const run = recoverAndFlush(options).finally(() => inFlightWithoutLocks.delete(options.characterId));
    inFlightWithoutLocks.set(options.characterId, run);
    return run;
  }

  let result: SyncChoiceEventsResult = { status: 'locked', sent: 0 };

  await locks.request(
    `put-event-sync:${options.characterId}`,
    { ifAvailable: true },
    async lock => {
      if (!lock) return;
      result = await recoverAndFlush(options);
    }
  );

  return result;
}
