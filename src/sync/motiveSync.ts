import {
  listPendingMotiveResolutions,
  markMotiveResolutionPending,
  markMotiveResolutionRejected,
  markMotiveResolutionSending,
  markMotiveResolutionSynced,
  resetSendingMotiveResolutions,
  type LocalMotiveResolution
} from '../persistence/motiveOutbox';
import {
  motiveResolutionBatchResponseSchema,
  motiveResolutionSchema,
  type MotiveResolutionEvent
} from './motiveResolution';

export type FlushMotiveResolutionsResult =
  | { status: 'idle'; sent: 0 }
  | { status: 'ok'; sent: number }
  | { status: 'paused-auth'; sent: number }
  | { status: 'retry'; sent: number; reason: 'network' | 'server' | 'throttled' | 'invalid-response' }
  | { status: 'rejected'; sent: number; httpStatus: number };

const THROTTLED_STATUSES = new Set([408, 425, 429]);

function apiEvent(local: LocalMotiveResolution): MotiveResolutionEvent {
  return motiveResolutionSchema.parse({
    eventId: local.eventId,
    characterId: local.characterId,
    gameSessionId: local.gameSessionId,
    gameDay: local.gameDay,
    sceneInstanceId: local.sceneInstanceId,
    choiceId: local.choiceId,
    promptId: local.promptId,
    resolutionType: local.resolutionType,
    ...(local.resolutionType === 'answered'
      ? { motiveOptionId: local.motiveOptionId }
      : {}),
    occurredAt: local.occurredAt
  });
}

async function returnToPending(
  events: LocalMotiveResolution[],
  incrementRetry: boolean
): Promise<void> {
  await Promise.all(events.map(event =>
    markMotiveResolutionPending(event.eventId, incrementRetry)
  ));
}

export async function flushMotiveResolutions(options: {
  characterId: string;
  endpoint: string;
  fetchImpl?: typeof fetch;
}): Promise<FlushMotiveResolutionsResult> {
  await resetSendingMotiveResolutions(options.characterId);
  const pending = await listPendingMotiveResolutions(options.characterId, 100);
  if (!pending.length) return { status: 'idle', sent: 0 };

  await Promise.all(pending.map(event => markMotiveResolutionSending(event.eventId)));
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ resolutions: pending.map(apiEvent) })
    });
  } catch {
    await returnToPending(pending, true);
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
      markMotiveResolutionRejected(event.eventId, `HTTP_${response.status}`)
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

  const parsed = motiveResolutionBatchResponseSchema.safeParse(body);
  if (!parsed.success) {
    await returnToPending(pending, true);
    return { status: 'retry', sent: pending.length, reason: 'invalid-response' };
  }

  const results = new Map(parsed.data.results.map(result => [result.eventId, result]));
  await Promise.all(pending.map(async event => {
    const result = results.get(event.eventId);
    if (!result) {
      await markMotiveResolutionPending(event.eventId, true);
      return;
    }
    if (result.status === 'accepted' || result.status === 'alreadyAccepted') {
      await markMotiveResolutionSynced(event.eventId);
      return;
    }
    await markMotiveResolutionRejected(event.eventId, result.code ?? 'REJECTED');
  }));

  return { status: 'ok', sent: pending.length };
}
