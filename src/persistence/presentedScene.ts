import {
  choiceId,
  choicePresentationId,
  sceneId,
  sceneInstanceId,
  scenePresentationId
} from '../content/persistenceIds';
import type { GameState } from '../engine/types';

/**
 * Freezes the persistence identity of the exact card presentation.
 * This is local metadata only; no network call is made here.
 */
export function attachPresentedScenePersistence(state: GameState): GameState {
  const current = state.current;
  if (state.phase !== 'slot' || !current || current.persistence) return state;

  const authoredOrder = current.choiceIds;
  const shownOrder = current.leftChoiceId && authoredOrder.length === 2
    ? [current.leftChoiceId, authoredOrder.find(id => id !== current.leftChoiceId)!]
    : [...authoredOrder];

  if (shownOrder.some(id => !id)) throw new Error('Invalid presented choice order');

  return {
    ...state,
    current: {
      ...current,
      persistence: {
        sceneInstanceId: sceneInstanceId(state.runId, state.day, state.slot, current.cardId),
        sceneId: sceneId(current.cardId),
        scenePresentationId: scenePresentationId(current.cardId, current.variantId),
        choices: shownOrder.map((authorChoiceId, index) => ({
          authorChoiceId,
          choiceId: choiceId(current.cardId, authorChoiceId),
          presentationId: choicePresentationId(current.cardId, authorChoiceId),
          position: index + 1
        }))
      }
    }
  };
}
