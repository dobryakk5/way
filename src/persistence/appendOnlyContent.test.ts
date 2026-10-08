import { describe, expect, it } from 'vitest';
import { play } from '../../scripts/play';
import { presentedSnapshot, snapshotViolations } from '../../scripts/compat-snapshot';
import published from '../../reports/compat-presented-baseline.json';
import { content } from '../content';
import { applyChoice, eligible, persistDraw, rollEncounter } from '../engine';
import { validateSave } from './save';
import type { Card, GameContent, GameState } from '../engine';

const baseline = published as Record<string, string>;
const record = (game: GameState) => ({ schema: 1 as const, started: true, game });
const mutate = (id: string, f: (c: Card) => Card): GameContent => ({ ...content, cards: content.cards.map(c => c.id === id ? f(c) : c) });

describe('published presentations are append-only (server catalog and frozen saves)', () => {
  it('nothing that was published has changed or disappeared; only additions are allowed', () => {
    const { changed, removed } = snapshotViolations(presentedSnapshot(), baseline);
    expect({ changed, removed }, 'A published text, label or presented choice changed. Add a NEW text variant / a NEW choice id instead (see scripts/compat-snapshot.ts).').toEqual({ changed: [], removed: [] });
    expect(Object.keys(baseline).length).toBeGreaterThan(1500);
  });
  it('the guard really fires: an edited scene text, an edited label, a changed effect and a removed variant are caught; new variants and choices are not', () => {
    const v = (c: GameContent) => snapshotViolations(presentedSnapshot(c), baseline);
    expect(v(mutate('r_kiln', c => ({ ...c, text: c.text + '!' }))).changed).toContain('scene:r_kiln');
    expect(v(mutate('r_kiln', c => ({ ...c, choices: c.choices.map((x, i) => i ? x : { ...x, label: x.label + '!' }) }))).changed).toContain('choice:r_kiln/a');
    expect(v(mutate('r_kiln', c => ({ ...c, choices: c.choices.map((x, i) => i ? x : { ...x, effects: { ...x.effects, resources: { wealth: 9 } } }) }))).changed).toContain('presented:r_kiln/a');
    expect(v(mutate('c2_gaze_alexey_silence', c => ({ ...c, textVariants: c.textVariants!.filter(x => x.id !== 'c2_gaze_alexey_silence_detail') }))).removed).toContain('scene:c2_gaze_alexey_silence#c2_gaze_alexey_silence_detail');
    const additive = v(mutate('r_kiln', c => ({ ...c, textVariants: [...(c.textVariants ?? []), { id: 'brand_new', when: { dayGte: 1 }, text: 'new', kind: 'consequence' as const }],
      choiceVariants: [...(c.choiceVariants ?? []), { when: { dayGte: 99 }, choices: c.choices.map(x => ({ ...x, id: x.id + '9' })) }] })));
    expect(additive).toEqual({ changed: [], removed: [] });
  });
  it('impact metadata is not a presentation: adding it changes nothing', () => {
    const marked = mutate('r_kiln', c => ({ ...c, choices: c.choices.map(x => ({ ...x, impact: { level: 'meaningful' as const } })) }));
    expect(snapshotViolations(presentedSnapshot(marked), baseline)).toEqual({ changed: [], removed: [] });
  });
});

describe('a scene that was already on the screen when the content changed (r_marta_hello, saved before the evening existed)', () => {
  // The pair exactly as the original release presented it; it is frozen in the save as `current`.
  const OLD_PAIR = [
    { id: 'a', label: 'Поговорить сейчас', servesFacets: ['relationships'], obligation: 'Поговорить сейчас', effects: { resources: { strength: 2, wealth: -1 }, qualities: { compassion: 1 } } },
    { id: 'b', label: 'Договориться на вечер', servesFacets: ['work'], obligation: 'Договориться на вечер', effects: { resources: { peace: 2, strength: -1 }, qualities: { honesty: 1 } } }
  ] as never[];
  const freshState = () => play(3, { stopWhen: s => s.phase === 'slot' && !s.current && s.day >= 3 && s.day <= 4 }).state;
  const mid = () => persistDraw(freshState(), { card: content.cards.find(c => c.id === 'r_marta_hello')!, choices: OLD_PAIR, leftChoiceId: 'a', rightChoiceId: 'b', text: 'Марта, твоя соседка, остановилась у двери и ждёт, что ты спросишь о её дне. Поговорить сейчас или договориться о разговоре на вечер?', source: 'pool' }, content);
  it('the old presented pair is exactly what the original content had, and it is still among the choices of the card (no save.ts change is needed)', () => {
    const card = content.cards.find(c => c.id === 'r_marta_hello')!;
    expect(card.choices.map(c => [c.id, c.label, c.effects])).toEqual((OLD_PAIR as { id: string; label: string; effects: unknown }[]).map(c => [c.id, c.label, c.effects]));
    expect(card.choiceVariants![0]!.choices.map(c => c.id)).toEqual(['a2', 'b2']);
  });
  it('the save loads and the old choice keeps its OLD effects: no evening is scheduled for it', () => {
    const state = mid();
    expect(validateSave(record(state))).toBeDefined();
    const next = applyChoice(state, content, 'r_marta_hello', 'b');
    expect(next.scheduled.some(s => s.cardId === 'r_marta_evening')).toBe(false);
    expect(next.history.at(-1)).toMatchObject({ cardId: 'r_marta_hello', choiceId: 'b' });
    expect(next.resources.peace - state.resources.peace).toBe(2);
  });
  it('a forged pair is still rejected (the global validation is untouched)', () => {
    const state = mid();
    const forged = structuredClone(state);
    forged.current!.choices = forged.current!.choices!.map(c => c.id === 'b' ? { ...c, effects: { resources: { wealth: 50 } } } : c);
    expect(validateSave(record(forged))).toBeUndefined();
  });
  it('new presentations offer the new pair, whose second choice keeps the evening', () => {
    const next = applyChoice(persistDraw(freshState(), { card: content.cards.find(c => c.id === 'r_marta_hello')!, choices: content.cards.find(c => c.id === 'r_marta_hello')!.choiceVariants![0]!.choices, text: 't', source: 'pool' }, content), content, 'r_marta_hello', 'b2');
    expect(next.scheduled.some(s => s.cardId === 'r_marta_evening')).toBe(true);
  });
});

describe('a dice set prepared before an update that made one of its scenes unavailable (r_letter_stack now waits for the first letter)', () => {
  // A save made by the original build: the six candidates are fixed, the die has not been rolled yet, and Liya's first letter has never been shown.
  const staleDice = (seed: number, place: number): GameState => {
    const s = play(seed, { stopWhen: x => x.phase === 'dice' && !x.current && x.day >= 5 && !x.shown.c1_liya_letter }).state;
    const dice = s.diceHistory.at(-1)!;
    const candidates = [...dice.candidates]; const other = candidates.indexOf('r_letter_stack');
    if (other >= 0 && other !== place) candidates[other] = candidates[place]!;
    candidates[place] = 'r_letter_stack';
    return { ...s, diceHistory: [...s.diceHistory.slice(0, -1), { ...dice, candidates, candidateOrigins: candidates.map(() => 'neutral' as const) }] };
  };
  it('loads; the stale face prepares a fresh set and rolls the same face on it, every other face rolls the saved set as before', () => {
    let tried = 0;
    for (let seed = 1; seed <= 40 && tried < 3; seed++) {
      let s: GameState; try { s = staleDice(seed, 2); } catch { continue; }
      if (s.phase !== 'dice' || s.shown.c1_liya_letter) continue;
      tried++;
      expect(validateSave(record(s))).toBeDefined();
      expect(eligible({ ...s, phase: 'slot' }, content.cards.find(c => c.id === 'r_letter_stack')!, content)).toBe(false);
      for (let face = 1; face <= 6; face++) {
        const rolled = rollEncounter(s, content, face);
        const dice = rolled.diceHistory.filter(d => d.day === s.day);
        expect(dice).toHaveLength(1);                                     // one set for the day, never two
        expect(dice[0]!.face).toBe(face);                                 // the face that came up is the face that counts
        expect(dice[0]!.candidates).toHaveLength(6); expect(new Set(dice[0]!.candidates).size).toBe(6);
        if (face === 3) expect(dice[0]!.candidates).not.toContain('r_letter_stack');       // the stale face: a fresh set that holds only scenes that can be shown now
        else expect(dice[0]!.candidates).toEqual(s.diceHistory.at(-1)!.candidates);        // any other face: the saved set is rolled exactly as before
        expect(rolled.current?.cardId).toBe(dice[0]!.candidates[face - 1]);
        expect(eligible({ ...s, phase: 'slot' }, content.cards.find(c => c.id === rolled.current!.cardId)!, content)).toBe(true);
        expect(validateSave(record(rolled))).toBeDefined();
      }
    }
    expect(tried).toBeGreaterThan(0);
  });
  it('a set whose face is still available is rolled exactly as before', () => {
    const s = play(5, { stopWhen: x => x.phase === 'dice' && !x.current && x.day >= 3 }).state;
    const rolled = rollEncounter(s, content, 3);
    expect(rolled.diceHistory.at(-1)!.candidates).toEqual(s.diceHistory.at(-1)!.candidates);
    expect(rolled.current?.cardId).toBe(s.diceHistory.at(-1)!.candidates[2]);
  });
});
