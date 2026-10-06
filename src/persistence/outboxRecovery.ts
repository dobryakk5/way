import { choiceId } from '../content/persistenceIds';
import type { GameState } from '../engine/types';
import {
  deleteChoiceEvent,
  listHeldChoiceEvents,
  markChoiceEventPending
} from './eventOutbox';

/**
 * Repairs the only crash window in the local choice transaction:
 * event written as `held`, but the save/activation step did not finish.
 */
export async function reconcileHeldChoiceEvents(state: GameState): Promise<{ promoted: number; removed: number }> {
  if (!state.serverPersistence?.enabled) return { promoted: 0, removed: 0 };
  const held = await listHeldChoiceEvents(state.runId);
  let promoted = 0;
  let removed = 0;

  for (const event of held) {
    const history = state.history[event.seq - 1];
    const committed = !!history &&
      history.day === event.gameDay &&
      choiceId(history.cardId, history.choiceId) === event.choiceId;

    if (committed) {
      await markChoiceEventPending(event.eventId, false);
      promoted += 1;
    } else {
      await deleteChoiceEvent(event.eventId);
      removed += 1;
    }
  }

  return { promoted, removed };
}
