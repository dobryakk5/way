import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { play } from '../../scripts/play';
import { content } from '../content';
import { validateSave, type SaveRecord } from '../persistence/save';
import { applyChoice } from './apply';
import { drawCard, persistDraw } from './draw';
import { makeCard, makeContent, makeState } from './testUtils';
import type { Card, Choice, GameState } from './types';

const choice = (id: string, resources: Choice['effects']['resources'] = {}): Choice => ({ id, label: `Вариант ${id}`, effects: { resources }, servesFacets: ['work'] });
const four = (id = 'four'): Card => makeCard({ id, type: 'situation', facets: ['work'], choices: [choice('A', { wealth: 1 }), choice('B', { peace: 1 }), choice('C', { bonds: 1 }), choice('D', { strength: 1 })] });
const three = (id = 'three'): Card => makeCard({ id, type: 'situation', facets: ['work'], choices: [choice('x'), choice('y'), choice('z')] });

describe('cards with three or four choices (Choice[2..4])', () => {
  it('shows 3 and 4 choices in the authored order, without sides, for every seed', () => {
    for (const card of [three(), four()]) {
      const data = makeContent({ cards: [card] });
      for (const seed of [1, 7, 99, 12345, 777777]) {
        const state = makeState({ seed, day: 2, slot: 1 });
        const draw = drawCard(state, data)!;
        expect(draw.choices.map(c => c.id)).toEqual(card.choices.map(c => c.id));
        expect(draw.leftChoiceId).toBeUndefined();
        expect(draw.rightChoiceId).toBeUndefined();
        const shown = persistDraw(state, draw, data);
        expect(shown.current?.choiceIds).toEqual(card.choices.map(c => c.id));
        expect(shown.current && 'leftChoiceId' in shown.current).toBe(false);
      }
    }
  });

  it('keeps a two-choice card exactly as before: sides exist and survive a reload', () => {
    const card = makeCard({ id: 'two', type: 'situation' });
    const data = makeContent({ cards: [card] });
    const state = makeState({ seed: 999, day: 3, slot: 2 });
    const first = drawCard(state, data)!;
    expect(first.leftChoiceId).toBeDefined();
    const restored = drawCard(JSON.parse(JSON.stringify(persistDraw(state, first, data))), data)!;
    expect(restored.leftChoiceId).toBe(first.leftChoiceId);
    expect(restored.rightChoiceId).toBe(first.rightChoiceId);
  });

  it('a reload after the first presentation reproduces the same order and text; semantics follow choiceId', () => {
    const data = makeContent({ cards: [four()] });
    const state = makeState({ seed: 5, day: 1, slot: 0 });
    const shown = persistDraw(state, drawCard(state, data)!, data);
    const restored = JSON.parse(JSON.stringify(shown)) as typeof shown;
    const again = drawCard(restored, data)!;
    expect(again.choices.map(c => c.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(again.source).toBe('current');
    // Applying by id gives that choice's effect whatever its position was.
    const after = applyChoice(restored, data, 'four', 'C');
    expect(after.resources.bonds).toBe(restored.resources.bonds + 1);
    expect(after.resources.wealth).toBe(restored.resources.wealth);
    expect(after.history.at(-1)?.choiceId).toBe('C');
  });

  it('rejects an answer outside the shown choices and leaves the state untouched on a stale card', () => {
    const data = makeContent({ cards: [four()] });
    const state = makeState({ seed: 5, day: 1, slot: 0 });
    const shown = persistDraw(state, drawCard(state, data)!, data);
    expect(() => applyChoice(shown, data, 'four', 'E')).toThrow(/outside the presented choices/);
    expect(applyChoice(shown, data, 'other-card', 'A')).toBe(shown);
  });

  it('a saved 4-choice current validates only when the shown order matches the content, and 2-choice sides stay mandatory', () => {
    let shown: GameState | undefined;
    play(3, { onDraw: (s, d) => { if (!shown) shown = persistDraw(s, d, content); } });
    const real = content.cards.find(c => c.id === shown!.current!.cardId)!;
    const original = real.choices;
    try {
      // The real card grows two more choices; the saved `current` is then a valid four-choice presentation.
      real.choices = [...original, { ...structuredClone(original[0]!), id: 'zz_c' }, { ...structuredClone(original[1]!), id: 'zz_d' }];
      const { leftChoiceId: _side, ...cur } = shown!.current!;
      const four = { ...shown!, current: { ...cur, choiceIds: real.choices.map(c => c.id), choices: structuredClone(real.choices) } };
      const rec = (game: GameState): SaveRecord => ({ schema: 1, started: true, game });
      expect(validateSave(rec(four))).toBeDefined();
      expect(validateSave(rec({ ...four, current: { ...four.current!, choiceIds: [...four.current!.choiceIds].reverse() } }))).toBeUndefined();
      expect(validateSave(rec({ ...four, current: { ...four.current!, leftChoiceId: 'zz_c' } }))).toBeUndefined();
      expect(validateSave(rec({ ...four, current: { ...four.current!, choices: four.current!.choices!.slice(0, 3) } }))).toBeUndefined();
      const tampered = structuredClone(four); tampered.current!.choices![2]!.effects = { resources: { wealth: 50 } };
      expect(validateSave(rec(tampered))).toBeUndefined();
    } finally {
      real.choices = original;
    }
    // A two-choice presentation must still carry its side.
    const noSide = structuredClone(shown!); delete noSide.current!.leftChoiceId;
    expect(validateSave({ schema: 1, started: true, game: noSide })).toBeUndefined();
    expect(validateSave({ schema: 1, started: true, game: shown! })).toBeDefined();
  });
});
