import { ensureRemoteCharacter, type EnsureCharacterResult } from './character';
import { flushChoiceEvents, type FlushChoiceEventsResult } from './eventSync';
import { flushMotiveResolutions, type FlushMotiveResolutionsResult } from './motiveSync';
import {
  recoverAndFlushSceneInstances,
  type FlushSceneInstancesResult
} from './sceneInstanceSync';

export type GamePersistenceSyncResult =
  | { status: 'done' }
  | { status: 'locked' }
  | { status: 'character'; result: EnsureCharacterResult }
  | { status: 'scenes'; result: FlushSceneInstancesResult }
  | { status: 'events'; result: FlushChoiceEventsResult }
  | { status: 'motives'; result: FlushMotiveResolutionsResult };

function complete(status: string): boolean {
  return status === 'ok' || status === 'idle';
}

async function runSync(options: {
  characterId: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<GamePersistenceSyncResult> {
  const base = options.apiBaseUrl.replace(/\/$/, '');
  const character = await ensureRemoteCharacter({
    characterId: options.characterId,
    endpoint: `${base}/api/v1/characters`,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
  });
  if (character.status !== 'ok') {
    return { status: 'character', result: character };
  }

  const scenes = await recoverAndFlushSceneInstances({
    characterId: options.characterId,
    endpoint: `${base}/api/v1/game/scene-instances/batch`,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
  });
  if (!complete(scenes.status)) {
    return { status: 'scenes', result: scenes };
  }

  const events = await flushChoiceEvents({
    characterId: options.characterId,
    endpoint: `${base}/api/v1/game/events/batch`,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
  });
  if (!complete(events.status)) {
    return { status: 'events', result: events };
  }

  const motives = await flushMotiveResolutions({
    characterId: options.characterId,
    endpoint: `${base}/api/v1/game/motives/batch`,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
  });
  if (!complete(motives.status)) {
    return { status: 'motives', result: motives };
  }
  return { status: 'done' };
}

const inFlightWithoutLocks = new Map<string, Promise<GamePersistenceSyncResult>>();

export async function syncGamePersistence(options: {
  characterId: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  /** Day completion must wait for any automatic sync, then drain newly queued events. */
  waitForActive?: boolean;
}): Promise<GamePersistenceSyncResult> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) {
    while (inFlightWithoutLocks.has(options.characterId)) {
      if (!options.waitForActive) return { status: 'locked' };
      await inFlightWithoutLocks.get(options.characterId);
    }
    const run = runSync(options).finally(() => inFlightWithoutLocks.delete(options.characterId));
    inFlightWithoutLocks.set(options.characterId, run);
    return run;
  }

  let result: GamePersistenceSyncResult = { status: 'locked' };
  await locks.request(
    `put-persistence-sync:${options.characterId}`,
    { ifAvailable: !options.waitForActive },
    async lock => {
      if (!lock) return;
      result = await runSync(options);
    }
  );
  return result;
}
