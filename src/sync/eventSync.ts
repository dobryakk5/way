import {
  listPendingChoiceEvents,
  markChoiceEventPending,
  markChoiceEventRejected,
  markChoiceEventRetry,
  markChoiceEventSending,
  markChoiceEventSynced,
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
  | { status: 'retry'; sent: number; reason: 'network' | 'server' | 'invalid-response' }
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

export async function syncChoiceEventsWithLock(options: {
  characterId: string;
  endpoint: string;
  fetchImpl?: typeof fetch;
}): Promise<FlushChoiceEventsResult | { status: 'locked'; sent: 0 }> {
  if (!navigator.locks) return { status: 'locked', sent: 0 };

  let result: FlushChoiceEventsResult | { status: 'locked'; sent: 0 } = {
    status: 'locked',
    sent: 0
  };

  await navigator.locks.request(
    `put-event-sync:${options.characterId}`,
    { ifAvailable: true },
    async lock => {
      if (!lock) return;
      result = await flushChoiceEvents(options);
    }
  );

  return result;
}
