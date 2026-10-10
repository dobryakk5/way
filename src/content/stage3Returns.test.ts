import { describe, expect, it } from 'vitest';
import { play } from '../../scripts/play';
import { content } from './index';
import { applyChoice, eligible, persistDraw, resolveCardText, resolveChoices } from '../engine';
import { buildImpactGraph, impactOf } from '../engine/impact';
import { makeState } from '../engine/testUtils';
import { validateSave } from '../persistence/save';
import type { Card, GameState } from '../engine';

const card = (id: string) => content.cards.find(c => c.id === id)!;
const ENC = content.cards.filter(c => /^enc_[34]_\d+$/.test(c.id));
const NEW = ['x3_marta_second_cup', 'x3_marta_apart', 'x3_boy_at_door', 'x3_boy_by_river', 'x3_alexey_asks_for_order', 'x4_marta_keeps_word', 'x4_marta_note', 'x4_wanderer_takes_the_boy'];
const chose = (cardId: string, choiceId: string, day = 8): GameState['history'][number] => ({ day, slot: 0, cardId, choiceId, text: 't', label: 'l', facets: [], decisionKinds: [] });
const THIRD_PERSON = /\bгерой|героя|героем|герою/i;

describe('the 24 encounter scenes are rewritten without touching what was published', () => {
  it('there are 24 of them and each keeps its id, its base text and its base choices (the append-only guard checks the bytes)', () => {
    expect(ENC).toHaveLength(24);
    for (const c of ENC) { expect(c.choices.map(x => x.id)).toEqual(['a', 'b']); expect(c.text.length).toBeGreaterThan(0); }
  });
  it.each(ENC.map(c => c.id))('%s: new wording in the second person, new choice ids with exactly the old mechanics', id => {
    const c = card(id);
    const fresh = makeState({ day: c.chapter === 3 ? 12 : 22, chapter: Number(c.chapter) });
    const text = resolveCardText(fresh, c, content);
    expect(text).toBe(c.textVariants!.find(v => v.id === `${id}_v2`)!.text);
    expect(text).not.toBe(c.text);
    expect(text).not.toMatch(THIRD_PERSON);
    expect(text).not.toMatch(/В новом заказе/);
    expect(text.length).toBeLessThanOrEqual(200);
    const shown = resolveChoices(fresh, c, content);
    expect(shown.map(x => x.id)).toEqual(['a2', 'b2']);
    for (const [now, was] of [[shown[0]!, c.choices[0]!], [shown[1]!, c.choices[1]!]] as const) {
      const strip = ({ id: _i, label: _l, response: _r, impact: _m, ...rest }: typeof now) => rest;
      expect(strip(now)).toEqual(strip(was));                      // effects, facets, decision kinds, line step, goals: unchanged
      expect(now.label.length).toBeLessThanOrEqual(55);
    }
    const tr = content.traces.filter(t => t.source.cardId === id).map(t => t.source.choiceId).sort();
    expect(tr).toEqual(['a', 'a2', 'b', 'b2']);
    for (const x of ['a2', 'b2']) expect(content.traces.find(t => t.source.cardId === id && t.source.choiceId === x)!.response).not.toMatch(THIRD_PERSON);
  });
  it('no two scenes of the two chapters share a situation any more (the chapter 4 set is new, not the chapter 3 text with a prefix)', () => {
    const texts = ENC.map(c => resolveCardText(makeState({ day: c.chapter === 3 ? 12 : 22 }), c, content));
    expect(new Set(texts).size).toBe(24);
    for (let i = 0; i < 12; i++) expect(texts[i]).not.toBe(texts[12 + i]);
    const stems = texts.map(t => t.split(/[.,:]/)[0]!.slice(0, 30));
    expect(new Set(stems).size).toBeGreaterThanOrEqual(22);
  });
  it('each scene carries the consequences of decisions already made: at least two recollections, each really reading a decision or a fact', () => {
    for (const c of ENC) {
      const callbacks = c.textVariants!.filter(v => /chose|fact/.test(JSON.stringify(v.when)));       // recollections, not hero-stage flavour
      expect(callbacks.length, c.id).toBeGreaterThanOrEqual(2);
      for (const v of callbacks) { expect(JSON.stringify(v.when)).toMatch(/chose|fact/); expect(v.text).not.toMatch(THIRD_PERSON); expect(v.text.length).toBeLessThanOrEqual(260); }
    }
  });
  it('the hero-stage flavour of the three scenes that had one keeps working with the new situations, and the published ironic variants stay (after the new ones)', () => {
    for (const id of ['enc_4_1', 'enc_4_4', 'enc_4_9']) {
      const c = card(id), ids = c.textVariants!.map(v => v.id);
      expect(ids.indexOf(`ironic_${id}_v2`)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(`ironic_${id}_v2`)).toBeLessThan(ids.indexOf(`ironic_${id}`));
      const ironic = makeState({ day: 22, chapter: 4, development: { ...makeState().development, developmentCurrent: 'ironic' } });
      expect(resolveCardText(ironic, c, content)).toBe(c.textVariants!.find(v => v.id === `ironic_${id}_v2`)!.text);
      expect(resolveCardText(ironic, c, content)).not.toMatch(/В новом заказе/);
    }
  });
  it('a recollection shows when its decision was made, and the scene then keeps asking the same thing', () => {
    const marta = card('enc_3_2');
    const base = makeState({ day: 13, chapter: 3 });
    expect(resolveCardText(base, marta, content)).toMatch(/короткий час/);
    const after = resolveCardText({ ...base, history: [chose('r_marta_evening', 'wait', 5)] }, marta, content);
    expect(after).toMatch(/умеешь ждать/); expect(after).toMatch(/короткий час/);
    const alexey = resolveCardText({ ...makeState({ day: 22, chapter: 4 }), facts: { ...makeState().facts, 'alexey.reins': 'loose' } }, card('enc_4_10'), content);
    expect(alexey).toMatch(/малую партию он вёл сам/);
  });
});

describe('the six chapter 2 decisions have a life in days 11–30', () => {
  const graph = buildImpactGraph(content);
  const SIX: [string, string][] = [['c2_gaze_alexey_silence', 'ask'], ['c2_gaze_alexey_silence', 'respect'], ['c2_silence_alexey_hand', 'look'], ['c2_silence_alexey_hand', 'trust'],
    ['c2_gaze_marta_window', 'visit'], ['c2_gaze_marta_window', 'home'], ['c2_silence_marta_cup', 'ask'], ['c2_silence_marta_cup', 'leave'],
    ['c2_silence_market_pause', 'ask'], ['c2_silence_market_pause', 'deal'], ['c2_gaze_wanderer_bread', 'offer'], ['c2_gaze_wanderer_bread', 'watch']];
  it.each(SIX)('%s/%s is read by scenes of chapters 3–4', (src, choice) => {
    const late = impactOf(graph, src, choice).readers.filter(r => { const c = content.cards.find(x => x.id === r.readerId); return c && (c.chapter === 3 || c.chapter === 4 || NEW.includes(c.id)); });
    expect(late.length).toBeGreaterThanOrEqual(1);
  });
  it('the priorities have real continuations: Marta (relationship), the Wanderer and the boy, Alexey (independence)', () => {
    const readers = (src: string, choice: string) => new Set(impactOf(graph, src, choice).readers.map(r => r.readerId));
    for (const choice of ['visit']) expect(readers('c2_gaze_marta_window', choice).has('x3_marta_second_cup')).toBe(true);
    expect(readers('c2_gaze_marta_window', 'home').has('x3_marta_apart')).toBe(true);
    expect(readers('c2_gaze_wanderer_bread', 'offer').has('x3_boy_at_door')).toBe(true);
    expect(readers('c2_gaze_wanderer_bread', 'watch').has('x3_boy_by_river')).toBe(true);
    for (const choice of ['ask', 'respect']) expect(readers('c2_gaze_alexey_silence', choice).has('x3_alexey_asks_for_order')).toBe(true);
  });
  it('the continuations exist only because of the decisions: not offered without them, offered with them (and Marta’s two are exclusive)', () => {
    const at = (extra: Partial<GameState>) => makeState({ day: 15, chapter: 3, ...extra });
    const ok = (id: string, s: GameState) => eligible(s, card(id), content);
    for (const id of NEW.filter(x => x.startsWith('x3_'))) expect(ok(id, at({})), id).toBe(false);
    expect(ok('x3_marta_second_cup', at({ history: [chose('c2_gaze_marta_window', 'visit')] }))).toBe(true);
    expect(ok('x3_marta_apart', at({ history: [chose('c2_gaze_marta_window', 'visit')] }))).toBe(false);
    expect(ok('x3_marta_apart', at({ history: [chose('c2_gaze_marta_window', 'home'), chose('c2_silence_marta_cup', 'leave')] }))).toBe(true);
    expect(ok('x3_marta_apart', at({ history: [chose('c2_gaze_marta_window', 'home'), chose('c2_silence_marta_cup', 'ask')] }))).toBe(false);   // she was let in once: the cup scene applies
    expect(ok('x3_marta_second_cup', at({ history: [chose('c2_silence_marta_cup', 'ask')] }))).toBe(true);
    expect(ok('x3_boy_at_door', at({ history: [chose('c2_gaze_wanderer_bread', 'offer')] }))).toBe(true);
    expect(ok('x3_boy_at_door', at({ history: [chose('c2_gaze_wanderer_bread', 'watch')] }))).toBe(false);
    expect(ok('x3_boy_by_river', at({ history: [chose('c2_gaze_wanderer_bread', 'watch')] }))).toBe(true);
    expect(ok('x3_alexey_asks_for_order', at({ history: [chose('c2_gaze_alexey_silence', 'respect')] }))).toBe(true);
    expect(ok('x3_alexey_asks_for_order', at({ day: 25, history: [chose('c2_gaze_alexey_silence', 'respect')] }))).toBe(false);          // the window closes on day 24
  });
  it('chapter 4 scenes read the facts the chapter 3 ones write; a fact nobody reads does not exist', () => {
    const keeps = card('x4_marta_keeps_word'), note = card('x4_marta_note'), takes = card('x4_wanderer_takes_the_boy');
    const at = (facts: Record<string, string>) => makeState({ day: 25, chapter: 4, facts: { ...makeState().facts, ...facts } });
    expect(eligible(at({}), keeps, content)).toBe(false);
    expect(eligible(at({ 'marta.circle': 'open' }), keeps, content)).toBe(true); expect(eligible(at({ 'marta.circle': 'open' }), note, content)).toBe(false);
    expect(eligible(at({ 'marta.circle': 'apart' }), note, content)).toBe(true);
    expect(eligible(at({ 'wanderer.boy': 'stays' }), takes, content)).toBe(true); expect(eligible(at({ 'wanderer.boy': 'sent' }), takes, content)).toBe(false);
    const read = (key: string, value: string) => content.cards.some(c => JSON.stringify([c.requires, c.textVariants?.map(v => v.when), c.choiceVariants?.map(v => v.when)]).includes(`"fact":"${key}","equals":"${value}"`));
    for (const [key, def] of Object.entries(content.factsSchema)) if (['marta.circle', 'wanderer.boy', 'alexey.reins'].includes(key))
      for (const value of def.values.filter(v => v !== 'none')) expect(read(key, String(value)), `${key}=${String(value)} is written but nobody reads it`).toBe(true);
    // none of them is an initial fact: old saves have no such key and must stay valid
    for (const key of ['marta.circle', 'wanderer.boy', 'alexey.reins']) expect(key in content.episode.initialFacts).toBe(false);
  });
  it('a continuation, once chosen, writes its fact and the later scene follows it (day 15 → day 25)', () => {
    let s = makeState({ day: 15, slot: 1, chapter: 3, history: [chose('c2_gaze_marta_window', 'visit')], phase: 'slot' });
    const present = (st: GameState, c: Card) => persistDraw(st, { card: c, choices: resolveChoices(st, c, content), text: resolveCardText(st, c, content), source: 'pool', ...(c.choices.length === 2 ? { leftChoiceId: resolveChoices(st, c, content)[0]!.id, rightChoiceId: resolveChoices(st, c, content)[1]!.id } : {}) }, content);
    s = applyChoice(present(s, card('x3_marta_second_cup')), content, 'x3_marta_second_cup', 'take');
    expect(s.facts['marta.circle']).toBe('open');
    const later = makeState({ ...s, day: 26, slot: 1, chapter: 4, phase: 'slot' } as never);
    expect(eligible(later, card('x4_marta_keeps_word'), content)).toBe(true);
    expect(resolveCardText(later, card('enc_4_2'), content)).toMatch(/стал вашим/);
    expect(resolveCardText(later, card('enc_4_11'), content)).toMatch(/как просят своего/);
  });
});

describe('a scene that was on the screen when the encounter scenes were rewritten', () => {
  it.each(ENC.map(c => c.id))('%s: the old presented pair still loads and keeps its old effects', id => {
    const c = card(id);
    const base = play(3, { stopWhen: s => s.phase === 'slot' && !s.current && s.day >= 3 && s.day <= 4 }).state;
    const shown = persistDraw({ ...base, day: Number(c.chapter) === 3 ? 12 : 22, chapter: Number(c.chapter) }, { card: c, choices: c.choices, leftChoiceId: 'a', rightChoiceId: 'b', text: c.text, source: 'pool' }, content);
    // the frozen pair is the published one; the save is valid under the new content only if the base pair is untouched
    const next = applyChoice(shown, content, id, 'a');
    expect(next.history.at(-1)).toMatchObject({ cardId: id, choiceId: 'a' });
    expect(next.resources.peace - shown.resources.peace).toBe(2);
    expect(validateSave({ schema: 1, started: true, game: { ...shown, day: 3, chapter: 1 } as GameState })).toBeDefined();
  });
});

describe('the continuations do not demand their own slot', () => {
  it('a run with the decisions forced reaches them in most runs without a single capacity error', () => {
    let made = 0, shown = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { state } = play(seed, { policy: 'mixed', choices: { c2_gaze_wanderer_bread: 'offer' } });
      expect(state.history).toHaveLength(120);
      if (state.history.some(h => h.cardId === 'c2_gaze_wanderer_bread' && h.choiceId === 'offer')) { made++; if (state.history.some(h => h.cardId === 'x3_boy_at_door')) shown++; }
    }
    expect(made).toBeGreaterThan(8); expect(shown / made).toBeGreaterThan(.4);
  });
  it('none of the new scenes has a hard deadline (the engine counts a mustShowBy card as an obligation whatever its condition says)', () => {
    for (const id of NEW) expect(card(id).mustShowBy).toBeUndefined();
  });
});
