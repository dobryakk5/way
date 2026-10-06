import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../engine/initialState';
import { attachPresentedScenePersistence } from './presentedScene';
import { choiceId, sceneId, scenePresentationId } from '../content/persistenceIds';

describe('presented scene persistence', () => {
  it('freezes numeric ids and the actual two-choice order', () => {
    const base = createInitialGameState(7, {
      runId: '33333333-3333-4333-8333-333333333333'
    });
    const state = {
      ...base,
      phase: 'slot' as const,
      day: 4,
      slot: 2,
      current: {
        cardId: 'card-a',
        leftChoiceId: 'right',
        choiceIds: ['left', 'right'],
        text: 'Scene'
      }
    };

    const next = attachPresentedScenePersistence(state);
    const persistence = next.current?.persistence;
    expect(persistence?.sceneId).toBe(sceneId('card-a'));
    expect(persistence?.scenePresentationId).toBe(scenePresentationId('card-a'));
    expect(persistence?.choices.map(choice => choice.authorChoiceId)).toEqual(['right', 'left']);
    expect(persistence?.choices.map(choice => choice.position)).toEqual([1, 2]);
    expect(persistence?.choices[0]?.choiceId).toBe(choiceId('card-a', 'right'));
  });

  it('does not replace an already frozen persistence reference', () => {
    const base = createInitialGameState(7, {
      runId: '33333333-3333-4333-8333-333333333333'
    });
    const first = attachPresentedScenePersistence({
      ...base,
      phase: 'slot',
      current: { cardId: 'card-a', choiceIds: ['a', 'b'], text: 'Scene' }
    });
    expect(attachPresentedScenePersistence(first)).toBe(first);
  });
});
