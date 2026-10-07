import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { INSIGHT_NOTE } from '../engine/day';
import { createInitialGameState } from '../engine/initialState';
import { journalChanges, journeyChanges } from './dayChanges';
import { nightParts } from './screens/NightRecap';

const fragment = (id: string) => content.portraitFragments.find(f => f.id === id)!;
const resources = createInitialGameState(1).resources;

describe('nightParts', () => {
  it('splits the fair outcome into labelled parts and the insight note into its own', () => {
    const order = fragment('workshop.orderOutcome_deferred');
    const alexey = fragment('alexey.path_independent');
    const text = [order.text, alexey.text].join(' ');
    const base = createInitialGameState(1);
    const facts = { ...base.facts, 'workshop.orderOutcome': 'deferred', 'alexey.path': 'independent' };
    const game = { ...base, milestones: { fair: { day: 10, facts, text } } };
    const parts = nightParts(game, { day: 10, primary: `${text} ${INSIGHT_NOTE}`, resources });
    expect(parts.map(p => p.label)).toEqual(['Заказ', 'Алексей', 'Озарение']);
    expect(parts[0]!.text).toBe(order.text);
  });

  it('keeps an ordinary evening as one unlabelled part', () => {
    const parts = nightParts(createInitialGameState(1), { day: 3, primary: 'Мастерская затихла.', resources });
    expect(parts).toEqual([{ text: 'Мастерская затихла.' }]);
  });
});

describe('evening links', () => {
  it('are empty on a day that changed nothing', () => {
    const game = createInitialGameState(1);
    expect(journalChanges(game, undefined)).toEqual([]);
    expect(journeyChanges(game)).toEqual([]);
  });

  it('name what the journal got today', () => {
    const game = { ...createInitialGameState(1), journal: [{ day: 1, kind: 'insight' as const, id: 'x' }] };
    expect(journalChanges(game, undefined)).toEqual(['Озарение']);
  });
});
