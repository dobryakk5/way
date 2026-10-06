import { content } from '../content';
import {
  choiceId,
  motiveOptionId,
  motivePromptId,
  sceneInstanceId
} from '../content/persistenceIds';
import { allChoices } from '../engine/variants';
import type { GameState } from '../engine/types';
import {
  deleteMotiveResolution,
  listHeldMotiveResolutions,
  markMotiveResolutionPending
} from './motiveOutbox';

export async function reconcileHeldMotiveResolutions(
  state: GameState
): Promise<{ promoted: number; removed: number }> {
  if (!state.serverPersistence?.enabled) return { promoted: 0, removed: 0 };

  const held = await listHeldMotiveResolutions(state.runId);
  let promoted = 0;
  let removed = 0;

  for (const event of held) {
    const diagnosticCase = state.heroDevelopmentProfile.cases.find(c => {
      if (
        sceneInstanceId(state.runId, c.openedDay, c.openedSlot, c.cardId) !== event.sceneInstanceId ||
        choiceId(c.cardId, c.choiceId) !== event.choiceId
      ) return false;
      const card = content.cards.find(card => card.id === c.cardId);
      const choice = card && allChoices(card).find(choice => choice.id === c.choiceId);
      const prompt = choice?.diagnosticMotive;
      return !!prompt &&
        motivePromptId(c.cardId, c.choiceId, prompt.promptId) === event.promptId;
    });

    if (!diagnosticCase) {
      await deleteMotiveResolution(event.eventId);
      removed += 1;
      continue;
    }

    const card = content.cards.find(card => card.id === diagnosticCase.cardId);
    const choice = card && allChoices(card).find(choice => choice.id === diagnosticCase.choiceId);
    const prompt = choice?.diagnosticMotive;
    let committed = false;

    if (event.resolutionType === 'skipped') {
      committed = diagnosticCase.motiveState === 'skipped';
    } else if (prompt) {
      const evidence = state.heroDevelopmentProfile.evidence.find(e =>
        e.caseId === diagnosticCase.id &&
        e.source === 'motive' &&
        e.motiveOptionId !== undefined
      );
      committed = !!evidence &&
        motiveOptionId(
          diagnosticCase.cardId,
          diagnosticCase.choiceId,
          prompt.promptId,
          evidence.motiveOptionId!
        ) === event.motiveOptionId;
    }

    if (committed) {
      await markMotiveResolutionPending(event.eventId, false);
      promoted += 1;
    } else {
      await deleteMotiveResolution(event.eventId);
      removed += 1;
    }
  }

  return { promoted, removed };
}
