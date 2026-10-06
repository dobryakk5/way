import { ensureRemoteCharacter, type EnsureCharacterResult } from './character';
import { flushChoiceEvents, type FlushChoiceEventsResult } from './eventSync';
import { flushSceneInstances, type FlushSceneInstancesResult } from './sceneInstanceSync';

export type GamePersistenceSyncResult =
  | { status: 'locked' }
  | { status: 'character'; result: EnsureCharacterResult }
  | { status: 'scenes'; result: FlushSceneInstancesResult }
  | { status: 'events'; result: FlushChoiceEventsResult };

function complete(status: string): boolean {
  return status === 'ok' || status === 'idle';
}

export async function syncGamePersistence(options: {
  characterId: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<GamePersistenceSyncResult> {
  if (!navigator.locks) return { status: 'locked' };
  let result: GamePersistenceSyncResult = { status: 'locked' };
  const base = options.apiBaseUrl.replace(/\/$/, '');

  await navigator.locks.request(
    `put-persistence-sync:${options.characterId}`,
    { ifAvailable: true },
    async lock => {
      if (!lock) return;
      const character = await ensureRemoteCharacter({
        characterId: options.characterId,
        endpoint: `${base}/api/v1/characters`,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
      });
      if (character.status !== 'ok') {
        result = { status: 'character', result: character };
        return;
      }

      const scenes = await flushSceneInstances({
        characterId: options.characterId,
        endpoint: `${base}/api/v1/game/scene-instances/batch`,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
      });
      if (!complete(scenes.status)) {
        result = { status: 'scenes', result: scenes };
        return;
      }

      const events = await flushChoiceEvents({
        characterId: options.characterId,
        endpoint: `${base}/api/v1/game/events/batch`,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
      });
      result = { status: 'events', result: events };
    }
  );
  return result;
}
