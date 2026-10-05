import { describe, expect, it } from 'vitest';
import { drawCard, persistDraw } from './draw';
import { makeCard, makeContent, makeState } from './testUtils';

describe('drawCard', () => {
  it('uses priority crisis -> mustShowBy -> scheduled -> pool', () => {
    const crisis = makeCard({
      id: 'crisis_need',
      type: 'crisis',
      chapter: 'any',
      once: false,
      crisis: { resource: 'wealth', edge: 0 }
    });
    const due = makeCard({ id: 'due', type: 'situation', mustShowBy: 2 });
    const chain = makeCard({ id: 'chain', type: 'chain' });
    const pool = makeCard({ id: 'pool', type: 'situation' });
    const content = makeContent({ cards: [crisis, due, chain, pool] });

    const crisisState = makeState({
      day: 2,
      resources: { wealth: 0, strength: 50, peace: 50, bonds: 50 },
      pendingCrises: ['crisis_need'],
      scheduled: [{ cardId: 'chain', day: 1 }]
    });
    expect(drawCard(crisisState, content)?.card.id).toBe('crisis_need');

    const dueState = makeState({
      day: 2,
      scheduled: [{ cardId: 'chain', day: 1 }]
    });
    expect(drawCard(dueState, content)?.card.id).toBe('due');

    const chainState = makeState({
      day: 1,
      shown: { due: [1] },
      scheduled: [{ cardId: 'chain', day: 1 }]
    });
    expect(drawCard(chainState, content)?.card.id).toBe('chain');

    const poolState = makeState({ day: 1, shown: { due: [1] } });
    expect(drawCard(poolState, content)?.card.id).toBe('pool');
  });

  it('respects once, cooldown and requires in the random pool', () => {
    const once = makeCard({ id: 'once', type: 'situation' });
    const routine = makeCard({ id: 'routine', type: 'routine', chapter: 'any', cooldownDays: 3 });
    const locked = makeCard({
      id: 'locked',
      type: 'situation',
      requires: { flag: 'missing' }
    });
    const allowed = makeCard({ id: 'allowed', type: 'situation' });
    const content = makeContent({ cards: [once, routine, locked, allowed] });
    const state = makeState({ shown: { once: [1], routine: [1] }, day: 2 });

    expect(drawCard(state, content)?.card.id).toBe('allowed');
  });

  it('reconstructs exactly the same card and sides after persistence', () => {
    const card = makeCard({ id: 'choice', type: 'situation' });
    const content = makeContent({ cards: [card] });
    const state = makeState({ seed: 999, day: 3, slot: 2 });
    const first = drawCard(state, content);
    expect(first).toBeDefined();
    if (!first) return;

    const saved = persistDraw(state, first);
    const restored = drawCard(saved, content);

    expect(restored?.card.id).toBe(first.card.id);
    expect(restored?.leftChoiceId).toBe(first.leftChoiceId);
    expect(restored?.rightChoiceId).toBe(first.rightChoiceId);
  });

  it('uses the first matching textVariant', () => {
    const card = makeCard({
      id: 'marta',
      type: 'situation',
      text: 'Марта сказала, что всё хорошо.',
      textVariants: [
        {
          id: 'cup', kind: 'perception',
          when: { quality: 'attention', gte: 8 },
          text: 'Марта сказала, что всё хорошо. Чашку она так и не поставила на стол.'
        }
      ]
    });
    const content = makeContent({ cards: [card] });
    const state = makeState({
      qualities: { attention: 8, honesty: 0, compassion: 0, letgo: 0, courage: 0 }
    });

    expect(drawCard(state, content)?.text).toContain('Чашку');
  });
});
