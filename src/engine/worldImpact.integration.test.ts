import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { openingCriteria, playObserved } from '../../scripts/impact-observe';
import { play } from '../../scripts/play';
import { migrateSave, validateSave, type SaveRecord } from '../persistence/save';
import { drawCard, persistDraw, type DrawResult } from './draw';
import type { GameState, ObservableImpactEvent } from './types';

// WORLD-IMPACT v1, section 30: the scenarios run on the real content, from real decisions, and look only at what was shown.
const SEED = 7;
const record = (game: GameState): SaveRecord => ({ schema: 1, started: true, game });
const sees = (events: ObservableImpactEvent[], source: string, visible: string) =>
  events.filter(e => `${e.sourceCardId}/${e.sourceChoiceId}` === source && e.visibleCardId === visible);
const cup = { c1_alexey_broken_jug: 'show', c1_alexey_after_jug: 'work' };
function capture() {
  const draws = new Map<string, DrawResult>();
  return { draws, onDraw: (_s: GameState, d: DrawResult) => { if (!draws.has(d.card.id)) draws.set(d.card.id, d); } };
}

describe('world impact scenarios', () => {
  it('A: choice -> fact -> text variant (the evening remembers what happened that day)', () => {
    const { state, events } = playObserved(SEED, { choices: { ...cup, c1_marta_firewood: 'help', c1_customer_hurry: 'help' }, routes: { 2: 'marta' }, throughDay: 3 });
    expect(state.observations.some(o => o.kind === 'variant' && o.id === 'jug_shown_evening')).toBe(true);
    expect(sees(events, 'c1_alexey_broken_jug/show', 'daytext:evening_1')[0]?.kinds).toEqual(['callback']);
    expect(state.observations.some(o => o.kind === 'variant' && o.id === 'marta_help_hero')).toBe(true);
    expect(events.some(e => e.visibleCardId === 'daytext:evening_2' && e.sourceChoiceId === 'help')).toBe(true);
  });

  it('B: choice -> fact -> choice variant (an earlier decision opens another way to answer)', () => {
    const seen = capture();
    const { events } = playObserved(SEED, { choices: cup, throughDay: 3, onDraw: seen.onDraw });
    expect(seen.draws.get('c1_alexey_bad_work')!.choices.map(c => c.id)).toEqual(['together_solo', 'own_kiln', 'independent_solo']);
    expect(sees(events, 'c1_alexey_after_jug/work', 'c1_alexey_bad_work')[0]?.kinds).toContain('choice');
    // The other decision does not open it.
    const other = capture();
    playObserved(SEED, { choices: { ...cup, c1_alexey_after_jug: 'teach' }, throughDay: 3, onDraw: other.onDraw });
    expect(other.draws.get('c1_alexey_bad_work')!.choices.map(c => c.id)).toEqual(['together', 'independent']);
  });

  it('C: choice -> fact -> visual variant, frozen into the presented scene and saved with it', () => {
    const seen = capture();
    const { state } = playObserved(SEED, { choices: cup, throughDay: 3, onDraw: seen.onDraw });
    expect(seen.draws.get('c1_alexey_after_jug')!.visual).toMatchObject({ variantId: 'cup-shown', image: 'art/scenes/workshop-cup-shown.webp' });
    expect(seen.draws.get('c1_alexey_bad_work')!.visual?.variantId).toBe('kiln-alone');
    // The frozen image survives the save, and a save is rejected when it names an image the card cannot show.
    let shown: GameState | undefined;
    play(SEED, { choices: cup, onDraw: (s, d) => { if (d.card.id === 'c1_alexey_after_jug') shown = persistDraw(s, d, content); } , stopWhen: s => s.day > 2 });
    expect(shown?.current?.visual?.variantId).toBe('cup-shown');
    expect(validateSave(record(shown!))).toBeDefined();
    const forged = structuredClone(record(shown!));
    forged.game.current!.visual = { variantId: 'cup-shown', image: 'art/scenes/elsewhere.webp' };
    expect(validateSave(forged)).toBeUndefined();
    // A save written before visuals existed (no frozen image on the shown scene) is still a valid save.
    const { visual: _visual, ...bare } = shown!.current!;
    expect(validateSave(record({ ...shown!, current: bare }))).toBeDefined();
    void state;
  });

  it('D: choice -> schedule -> delayed card', () => {
    const { events } = playObserved(SEED, { choices: cup, throughDay: 3 });
    const e = sees(events, 'c1_alexey_broken_jug/show', 'c1_alexey_after_jug')[0]!;
    expect(e).toMatchObject({ day: 2, sourceDay: 1 });
    expect(e.kinds).toEqual(expect.arrayContaining(['delayed', 'callback', 'visual']));
  });

  it('E: a decision about one character is remembered by another', () => {
    const { events } = playObserved(SEED, { choices: cup, throughDay: 4 });
    const e = sees(events, 'c1_alexey_broken_jug/show', 'c1_wounded_road')[0]!;
    expect(e).toMatchObject({ sourceCharacter: 'alexey', visibleCharacter: 'wanderer' });
    expect(e.kinds).toContain('cross-character');
    // The road itself is remembered by Timon the next day.
    const t = playObserved(SEED, { choices: { c1_wounded_road: 'stop' }, throughDay: 4 }).events;
    expect(sees(t, 'c1_wounded_road/stop', 'c1_extra_change')[0]?.kinds).toEqual(expect.arrayContaining(['callback', 'cross-character']));
    // A same-character reader is not cross-character.
    expect(sees(events, 'c1_alexey_after_jug/work', 'c1_alexey_bad_work')[0]?.kinds).not.toContain('cross-character');
  });

  it('F: an opportunity that runs out unanswered still shows its result', () => {
    const { state, events } = playObserved(SEED, { routes: { 2: 'workshop' }, throughDay: 3 });
    expect(state.opportunityState.marta_help).toBe('expired');
    expect(state.facts['liaison.martaHelp']).toBe('other');
    expect(state.observations.some(o => o.kind === 'variant' && o.id === 'marta_help_other')).toBe(true);
    expect(events.find(e => e.sourceCardId === 'opportunity:marta_help')).toMatchObject({ visibleCardId: 'daytext:evening_2', kinds: ['delayed'] });
  });

  it('G: reload between a choice and its follow-up loses nothing', () => {
    let mid: GameState | undefined;
    const straight = play(SEED, { choices: cup, onDraw: (s, d) => { if (d.card.id === 'c1_alexey_after_jug' && !mid) mid = persistDraw(s, d, content); }, stopWhen: s => s.day > 3 });
    const frozen = JSON.parse(JSON.stringify(mid)) as GameState;
    expect(frozen.history.some(h => h.cardId === 'c1_alexey_broken_jug' && h.choiceId === 'show')).toBe(true);
    const reloaded = migrateSave(JSON.parse(JSON.stringify(record(frozen))));
    expect(reloaded).toBeDefined();
    const resumed = play(SEED, { choices: cup, resume: reloaded!.game, stopWhen: s => s.day > 3 });
    // Same follow-ups and the same presentation after the reload.
    expect(resumed.state.history).toEqual(straight.state.history);
    expect(drawCard(reloaded!.game, content)?.visual).toEqual(frozen.current?.visual);
    expect(drawCard(reloaded!.game, content)?.visual?.variantId).toBe('cup-shown');
  });
});

describe('world impact acceptance', () => {
  it('the opening criterion holds for several scripted lines of play', () => {
    for (const policy of ['always-first', 'always-second', 'always-costly', 'greedy-resources', 'greedy-qualities'] as const) for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { events } = playObserved(seed, { policy, throughDay: 3 });
      const c = openingCriteria(events);
      expect(c.day1, `${policy}/${seed} day 1`).toBe(true);
      expect(c.day3, `${policy}/${seed} day 3 (${c.sources} sources)`).toBe(true);
    }
  });

  it('a reader that exists in the content but was not shown produces no impact', () => {
    // Day 1 only: the delayed follow-up of the cup (day 2) is in the content but has not been shown yet.
    const { events } = playObserved(SEED, { choices: cup, throughDay: 1 });
    expect(events.some(e => e.visibleCardId === 'c1_alexey_after_jug')).toBe(false);
    expect(events.every(e => e.day <= 1)).toBe(true);
  });

  it('the same seed and decisions give the same world, including images and choice variants', () => {
    const trace = () => {
      const log: string[] = [];
      playObserved(11, { choices: cup, throughDay: 6, onDraw: (s, d) => log.push(`${s.day}/${s.slot}:${d.card.id}:${d.variantId ?? ''}:${d.visual?.variantId ?? ''}:${d.choices.map(c => c.id).join(',')}`) });
      return log;
    };
    expect(trace()).toEqual(trace());
  });

  it('Day Reflection never feeds the world: the same play without any summary meets the same scenes', () => {
    const trace = (strip: boolean) => {
      const log: string[] = [];
      const run = play(13, { choices: cup,
        ...(strip ? { beforeStep: (s: GameState) => ({ ...s, nights: s.nights.map(({ summary: _summary, ...n }) => n) }) } : {}),
        onDraw: (s, d) => log.push(`${s.day}/${s.slot}:${d.card.id}:${d.variantId ?? ''}:${d.visual?.variantId ?? ''}:${d.choices.map(c => c.id).join(',')}`) });
      const { nights, ...world } = run.state;
      return { log, world, nightsWithoutSummary: nights.map(({ summary: _summary, ...n }) => n) };
    };
    const withSummary = trace(false), without = trace(true);
    expect(without.log).toEqual(withSummary.log);
    expect(without.world).toEqual(withSummary.world);
    expect(without.nightsWithoutSummary).toEqual(withSummary.nightsWithoutSummary);
  });
});
