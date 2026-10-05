import { describe, expect, it } from 'vitest';
import { applyChoice as transitionChoice } from './apply';
import { drawCard, persistDraw } from './draw';
import type { GameState, GameContent } from './types';
function applyChoice(state: GameState, content: GameContent, cardId: string, choiceId: string) {
 const draw = drawCard(state, content);
 if (!draw) throw new Error('Missing fixture card');
 return transitionChoice(persistDraw(state, draw, content), content, cardId, choiceId);
}
import { makeCard, makeContent, makeState } from './testUtils';

describe('applyChoice', () => {
  it('applies effects, clamps values, writes trace and advances slot', () => {
    const card = makeCard({
      id: 'choice',
      type: 'situation',
      choices: [
        {
          id: 'act',
          label: 'Действовать',
          effects: {
            resources: { wealth: 20, peace: -20 },
            qualities: { courage: 2 },
            setFlags: ['acted'],
            clearFlags: ['old'],
            schedule: [{ cardId: 'follow', inDays: 2 }],
            wisdomId: 'w1'
          }
        },
        { id: 'wait', label: 'Ждать', effects: {} }
      ]
    });
    const follow = makeCard({ id: 'follow', type: 'chain' });
    const content = makeContent({ cards: [card, follow] });
    const state = makeState({
      slot: 1,
      resources: { wealth: 95, strength: 50, peace: 10, bonds: 50 },
      flags: ['old']
    });

    const next = applyChoice(state, content, 'choice', 'act');
    expect(next.resources.wealth).toBe(100);
    expect(next.resources.peace).toBe(0);
    expect(next.qualities.courage).toBe(2);
    expect(next.flags).toContain('acted');
    expect(next.flags).not.toContain('old');
    expect(next.scheduled).toContainEqual({ cardId: 'follow', day: 3 });
    expect(next.pendingWisdoms).toEqual(['w1']);
    expect(next.journal).toContainEqual({day:1,kind:'wisdom',id:'w1'});
    expect(next.shown.choice).toEqual([1]);
    expect(next.history.at(-1)).toMatchObject({ cardId: 'choice', choiceId: 'act' });
    expect(next.slot).toBe(2);
    expect(next.phase).toBe('slot');
  });

  it('queues every resource crisis reached by the choice', () => {
    const choice = makeCard({
      id: 'drain',
      type: 'situation',
      choices: [
        {
          id: 'all',
          label: 'all',
          effects: { resources: { strength: -20, peace: -20 } }
        },
        { id: 'none', label: 'none', effects: {} }
      ]
    });
    const strength = makeCard({
      id: 'crisis_strength',
      type: 'crisis',
      chapter: 'any',
      once: false,
      crisis: { resource: 'strength', edge: 0 }
    });
    const peace = makeCard({
      id: 'crisis_peace',
      type: 'crisis',
      chapter: 'any',
      once: false,
      crisis: { resource: 'peace', edge: 0 }
    });
    const content = makeContent({ cards: [choice, strength, peace] });
    const state = makeState({
      resources: { wealth: 50, strength: 10, peace: 5, bonds: 50 }
    });

    const next = applyChoice(state, content, 'drain', 'all');
    expect(next.pendingCrises).toEqual(['crisis_strength', 'crisis_peace']);
  });

  it('resolves a crisis to 40 and removes it from queue', () => {
    const crisis = makeCard({
      id: 'crisis_strength',
      type: 'crisis',
      chapter: 'any',
      once: false,
      crisis: { resource: 'strength', edge: 0 }
    });
    const content = makeContent({ cards: [crisis] });
    const state = makeState({
      resources: { wealth: 50, strength: 0, peace: 50, bonds: 50 },
      pendingCrises: ['crisis_strength']
    });

    const next = applyChoice(state, content, crisis.id, 'a');
    expect(next.resources.strength).toBe(40);
    expect(next.pendingCrises).toEqual([]);
  });

  it('removes the due schedule when a chain is chosen', () => {
    const chain = makeCard({ id: 'follow', type: 'chain' });
    const content = makeContent({ cards: [chain] });
    const state = makeState({
      day: 3,
      scheduled: [
        { cardId: 'follow', day: 2 },
        { cardId: 'follow', day: 5 }
      ]
    });

    const next = applyChoice(state, content, 'follow', 'a');
    expect(next.scheduled).toEqual([{ cardId: 'follow', day: 5 }]);
  });

  it('moves to evening after slot 3', () => {
    const card = makeCard({ id: 'last', type: 'situation' });
    const content = makeContent({ cards: [card] });
    const next = applyChoice(makeState({ slot: 3 }), content, 'last', 'a');
    expect(next.phase).toBe('evening');
    expect(next.slot).toBe(3);
  });
});
