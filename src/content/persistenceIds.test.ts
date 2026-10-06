import { describe, expect, it } from 'vitest';
import { content } from './index';
import { allChoices } from '../engine/variants';
import {
  choiceId,
  choiceKey,
  choicePresentationId,
  sceneId,
  scenePresentationId,
  stableContentId
} from './persistenceIds';

describe('persistence content ids', () => {
  it('is deterministic and safe for JSON numbers', () => {
    const first = stableContentId('choice', 'card/answer');
    expect(first).toBe(stableContentId('choice', 'card/answer'));
    expect(Number.isSafeInteger(first)).toBe(true);
    expect(first).toBeGreaterThan(0);
  });

  it('does not collide for the current content catalog', () => {
    const seen = new Map<number, string>();
    const add = (id: number, key: string) => {
      const previous = seen.get(id);
      expect(previous, `id collision ${id}: ${previous} vs ${key}`).toBeUndefined();
      seen.set(id, key);
    };

    for (const card of content.cards) {
      add(sceneId(card.id), `scene:${card.id}`);
      add(scenePresentationId(card.id), `scene-presentation:${card.id}:base`);
      for (const variant of card.textVariants ?? []) {
        add(
          scenePresentationId(card.id, variant.id),
          `scene-presentation:${card.id}:${variant.id}`
        );
      }

      const localChoiceIds = new Set<string>();
      for (const choice of allChoices(card)) {
        if (localChoiceIds.has(choice.id)) continue;
        localChoiceIds.add(choice.id);
        add(choiceId(card.id, choice.id), `choice:${choiceKey(card.id, choice.id)}`);
        add(
          choicePresentationId(card.id, choice.id),
          `choice-presentation:${choiceKey(card.id, choice.id)}`
        );
      }
    }
  });
});
