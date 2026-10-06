import {
  listPendingSceneInstances,
  markSceneInstancePending,
  markSceneInstanceRejected,
  markSceneInstanceSending,
  markSceneInstanceSynced,
  type LocalSceneInstance
} from '../persistence/sceneInstanceOutbox';
import {
  sceneInstanceBatchResponseSchema,
  sceneInstanceSchema,
  type SceneInstancePayload
} from './sceneInstance';

export type FlushSceneInstancesResult =
  | { status: 'idle'; sent: 0 }
  | { status: 'ok'; sent: number }
  | { status: 'paused-auth'; sent: number }
  | { status: 'retry'; sent: number; reason: 'network' | 'server' | 'invalid-response' }
  | { status: 'rejected'; sent: number; httpStatus: number };

function apiScene(local: LocalSceneInstance): SceneInstancePayload {
  return sceneInstanceSchema.parse({
    sceneInstanceId: local.sceneInstanceId,
    characterId: local.characterId,
    gameDay: local.gameDay,
    sceneId: local.sceneId,
    scenePresentationId: local.scenePresentationId,
    choices: local.choices
  });
}

async function returnToPending(scenes: LocalSceneInstance[], incrementRetry: boolean): Promise<void> {
  await Promise.all(scenes.map(scene => markSceneInstancePending(scene.sceneInstanceId, incrementRetry)));
}

export async function flushSceneInstances(options: {
  characterId: string;
  endpoint: string;
  fetchImpl?: typeof fetch;
}): Promise<FlushSceneInstancesResult> {
  const pending = await listPendingSceneInstances(options.characterId, 100);
  if (!pending.length) return { status: 'idle', sent: 0 };

  await Promise.all(pending.map(scene => markSceneInstanceSending(scene.sceneInstanceId)));
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sceneInstances: pending.map(apiScene) })
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

  if (!response.ok) {
    await Promise.all(pending.map(scene =>
      markSceneInstanceRejected(scene.sceneInstanceId, `HTTP_${response.status}`)
    ));
    return { status: 'rejected', sent: pending.length, httpStatus: response.status };
  }

  let body: unknown;
  try { body = await response.json(); }
  catch {
    await returnToPending(pending, true);
    return { status: 'retry', sent: pending.length, reason: 'invalid-response' };
  }

  const parsed = sceneInstanceBatchResponseSchema.safeParse(body);
  if (!parsed.success) {
    await returnToPending(pending, true);
    return { status: 'retry', sent: pending.length, reason: 'invalid-response' };
  }

  const results = new Map(parsed.data.results.map(result => [result.sceneInstanceId, result]));
  await Promise.all(pending.map(async scene => {
    const result = results.get(scene.sceneInstanceId);
    if (!result) {
      await markSceneInstancePending(scene.sceneInstanceId, true);
      return;
    }
    if (result.status === 'accepted' || result.status === 'alreadyAccepted') {
      await markSceneInstanceSynced(scene.sceneInstanceId);
      return;
    }
    await markSceneInstanceRejected(scene.sceneInstanceId, result.code ?? 'REJECTED');
  }));

  return { status: 'ok', sent: pending.length };
}
