import { describe, expect, it } from 'vitest';
import { evaluateCondition, rankQualities, topQuality } from './conditions';
import { makeCard, makeContent, makeState } from './testUtils';

describe('conditions', () => {
  it('evaluates numeric, flag and history conditions', () => {
    const content = makeContent();
    const state = makeState({
      day: 4,
      chapter: 1,
      flags: ['trusted'],
      resources: { wealth: 70, strength: 50, peace: 50, bonds: 50 },
      qualities: { attention: 4, honesty: 0, compassion: 0, letgo: 0, courage: 0 },
      shown: { c1: [2] },
      history: [{ day: 2, slot: 0, cardId: 'c1', choiceId: 'tell' }]
    });

    expect(evaluateCondition({ resource: 'wealth', gte: 60 }, state, content)).toBe(true);
    expect(evaluateCondition({ quality: 'attention', gte: 4 }, state, content)).toBe(true);
    expect(evaluateCondition({ flag: 'trusted' }, state, content)).toBe(true);
    expect(evaluateCondition({ chapter: 1 }, state, content)).toBe(true);
    expect(evaluateCondition({ dayGte: 3, dayLte: 5 }, state, content)).toBe(true);
    expect(evaluateCondition({ shown: 'c1' }, state, content)).toBe(true);
    expect(
      evaluateCondition({ chose: { card: 'c1', choice: 'tell' } }, state, content)
    ).toBe(true);
    expect(
      evaluateCondition(
        { all: [{ flag: 'trusted' }, { not: { resource: 'wealth', lte: 50 } }] },
        state,
        content
      )
    ).toBe(true);
  });

  it('breaks a quality tie by the quality that grew later', () => {
    const first = makeCard({
      id: 'first',
      type: 'situation',
      choices: [
        { id: 'notice', label: 'notice', effects: { qualities: { attention: 1 } } },
        { id: 'other', label: 'other', effects: {} }
      ]
    });
    const second = makeCard({
      id: 'second',
      type: 'situation',
      choices: [
        { id: 'tell', label: 'tell', effects: { qualities: { honesty: 1 } } },
        { id: 'other', label: 'other', effects: {} }
      ]
    });
    const content = makeContent({ cards: [first, second] });
    const state = makeState({
      qualities: { attention: 5, honesty: 5, compassion: 0, letgo: 0, courage: 0 },
      history: [
        { day: 1, slot: 0, cardId: 'first', choiceId: 'notice' },
        { day: 2, slot: 0, cardId: 'second', choiceId: 'tell' }
      ]
    });

    expect(topQuality(state, content)).toBe('honesty');
    expect(rankQualities(state, content).slice(0, 2)).toEqual(['honesty', 'attention']);
    expect(evaluateCondition({ topQuality: 'honesty', gte: 5 }, state, content)).toBe(true);
  });

  it('reads facts and declared intention without resource scores', () => {
    const c=makeContent(), s=makeState({facts:{'market.arrangement':'solo'},declaredIntention:'body'});
    expect(evaluateCondition({fact:'market.arrangement',equals:'solo'},s,c)).toBe(true);
    expect(evaluateCondition({intention:'body'},s,c)).toBe(true);
  });

  it('uses Quality order as final tie-break', () => {
    const content = makeContent();
    const state = makeState();
    expect(topQuality(state, content)).toBe('attention');
  });
});
