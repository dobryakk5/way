import {
  choiceId,
  motiveOptionId,
  motivePromptId,
  sceneInstanceId
} from '../content/persistenceIds';
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
    const diagnosticCase = state.heroDevelopmentProfile.cases.find(c =>
      sceneInstanceId(state.runId, c.openedDay, c.openedSlot, c.cardId) === event.sceneInstanceId &&
      choiceId(c.cardId, c.choiceId) === event.choiceId &&
      motivePromptId(c.cardId, c.choiceId, state.pendingMotive?.promptId ?? '') !== 0
    );

    if (!diagnosticCase) {
      await deleteMotiveResolution(event.eventId);
      removed += 1;
      continue;
    }

    let committed = false;
    if (event.resolutionType === 'skipped') {
      committed = diagnosticCase.motiveState === 'skipped';
    } else {
      const evidence = state.heroDevelopmentProfile.evidence.find(e =>
        e.caseId === diagnosticCase.id &&
        e.source === 'motive' &&
        e.motiveOptionId !== undefined
      );
      committed = !!evidence &&
        motiveOptionId(
          diagnosticCase.cardId,
          diagnosticCase.choiceId,
          event.promptId.toString(),
          evidence.motiveOptionId!
        ) > 0;
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
