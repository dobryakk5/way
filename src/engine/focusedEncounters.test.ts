import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { play } from '../../scripts/play';
import { focusedEncountersErrors } from '../../scripts/check-content';
import { protectedCardsHash, runFingerprint } from '../../scripts/focused-baseline';
import baseline from '../../reports/focused-encounters-baseline.json';
import { auditProfile } from './heroDevelopmentProfile';
import { drawCard, encounterSlice, facetAdjustedSlice, freePool } from './draw';
import { fairDieFace, openEncounter, prepareEncounter, rollEncounter } from './journey';
import { isFacetWeightedDrawCandidate } from './facets';
import { DIRECT_TIER_WEIGHTS, FocusPoolEmptyError, focusBasis, focusTier, focusedEncountersOn, pickDirectFocusedStory, pickFocusedStory, rankFocusedStory, selectFocusedStoryCandidates, setFocusedTrace } from './focusedEncounters';
import type { FocusedTraceEvent } from './focusedEncounters';
import { deriveStoryContext } from './storyContext';
import { deterministicRandom } from './rng';
import { validateSave } from '../persistence/save';
import { makeCard, makeContent, makeState } from './testUtils';
import type { Card, FocusedStoryMeta, GameContent, GameState, LifeFacet, StoryLine } from './types';

type Flags = { on?: boolean; facetAttention?: boolean; range?: [number, number] };
const configured = (c: GameContent, { on = true, facetAttention = false, range = [1, 10] }: Flags = {}): GameContent => ({ ...c, profile: { ...c.profile,
  rollout: { ...c.profile.rollout, focusedEncounters: on, facetAttention }, focusedEncounters: { fromDay: range[0], throughDay: range[1] } } });
const story = (id: string, facets: LifeFacet[], meta?: FocusedStoryMeta, extra: Partial<Card> = {}): Card =>
  makeCard({ id, type: 'situation', chapter: 'any', facets, once: false, ...(meta ? { story: meta } : {}), ...extra });
const neutral = (id: string): Card => story(id, ['work'], undefined, { diagnostic: { situationId: id, contextId: 'c', facets: ['work'], developmentWeight: 1 } });
const evidence = (...lines: StoryLine[]): GameState['evidence'] => lines.map((line, i) => ({ day: 1, slot: i % 4, cardId: `e${i}`, choiceId: 'a', line, step: 's' }));
const at = (i: number, over: Partial<GameState> = {}): GameState => makeState({ seed: 500 + i, day: 1 + (i % 9), slot: i % 3, goal: { id: 'alexey', wording: 'x' }, ...over });

// One synthetic world: a card per tier, a card that is not relevant, an unmarked one, and neutral scenes.
const P1 = story('p1', ['work'], { goalIds: ['alexey'], lines: ['apprentice'], role: 'complication' });
const P1b = story('p1b', ['work'], { goalIds: ['alexey'], lines: ['apprentice'], role: 'consequence' });
const P2L = story('p2l', ['body'], { lines: ['commitments'], role: 'consequence' });
const P2T = story('p2t', ['relationships'], { threadIds: ['timon_coins'], role: 'relationship' });
const P3 = story('p3', ['body'], { goalIds: ['alexey'], role: 'opportunity' });
const P4 = story('p4', ['inner'], { goalIds: ['order'], role: 'ambient' });
const P5 = story('p5', ['body'], { worldFallback: true, role: 'ambient' });
const NOPE = story('off_topic', ['body'], { goalIds: ['order'], role: 'ambient' });
const UNMARKED = story('unmarked', ['inner']);
const ALL = [P1, P1b, P2L, P2T, P3, P4, P5, NOPE, UNMARKED];
const neutrals = Array.from({ length: 10 }, (_, i) => neutral(`n${i}`));
const storyState = (i = 0, over: Partial<GameState> = {}) => at(i, { declaredIntention: 'inner', evidence: evidence('apprentice', 'commitments'),
  facts: { ...makeState().facts, 'timon.trust': 'open' }, ...over });

describe('relevance tiers P1…P5 (section 5)', () => {
  const rank = (cards: Card[], state = storyState()) => rankFocusedStory(state, makeContent({ cards }), cards);
  it('assigns the first matching tier and gives the reasons', () => {
    const tiers = Object.fromEntries(rank(ALL).map(r => [r.card.id, r.tier]));
    expect(tiers).toEqual({ p1: 1, p1b: 1, p2l: 2, p2t: 2, p3: 3, p4: 4, p5: 5 });
    const basis = (c: Card) => rank(ALL).find(r => r.card === c)!.basis;
    expect(basis(P1)).toEqual({ G: true, L: true, T: false, I: false, W: false });
    expect(basis(P2T)).toEqual({ G: false, L: false, T: true, I: false, W: false });
    expect(basis(P4)).toEqual({ G: false, L: false, T: false, I: true, W: false });
  });
  it('excludes a scene without any confirmed anchor, and an unmarked one even if its sphere matches the intention', () => {
    const ids = rank(ALL).map(r => r.card.id);
    expect(ids).not.toContain('off_topic'); expect(ids).not.toContain('unmarked');
  });
  it('a line is fresh only after a step in it; an open thread only while open; the goal decides P3', () => {
    expect(rank([P1, P2L], storyState(0, { evidence: [] })).map(r => [r.card.id, r.tier])).toEqual([['p1', 3]]);
    expect(rank([P2T], storyState(0, { facts: { ...makeState().facts, 'timon.trust': 'unknown' } }))).toEqual([]);
    expect(rank([P3], storyState(0, { goal: { id: 'order', wording: 'x' } }))).toEqual([]);
    { const { goal: _goal, ...noGoal } = storyState(0); void _goal; expect(rank([P3], noGoal as GameState)).toEqual([]); }
  });
  it('P4 needs the intention AND a story block; P5 needs worldFallback AND role ambient', () => {
    expect(focusBasis(story('i', ['inner']), deriveStoryContext(storyState(), content))).toBeUndefined();
    expect(focusTier(focusBasis(story('i', ['inner'], { goalIds: ['order'], role: 'ambient' }), deriveStoryContext(storyState(), content))!.basis)).toBe(4);
    const loose = story('w', ['body'], { worldFallback: true, role: 'complication' });
    expect(focusBasis(loose, deriveStoryContext(storyState(), content))!.basis.W).toBe(false);
  });
  it('only ordinary free story scenes are ranked: neutral, probe, development, route-only, fixed, required, chain never are', () => {
    const marked = (c: Card) => ({ ...c, story: { goalIds: ['alexey'], role: 'ambient' } as FocusedStoryMeta });
    const kinds = [neutral('n'), story('probe', ['work'], undefined, { tags: ['probe-only'] }), story('dev', ['work'], undefined, { development: { stages: ['expert'] } }),
      story('ro', ['work'], undefined, { tags: ['route-only'] }), story('fx', ['work'], undefined, { at: { day: 1, slot: 0 } }), story('rq', ['work'], undefined, { required: true }),
      story('ch', ['work'], undefined, { type: 'chain' }), story('mb', ['work'], undefined, { mustShowBy: 3 })].map(marked);
    expect(rank(kinds)).toEqual([]);
    expect(selectFocusedStoryCandidates(storyState(), makeContent({ cards: kinds }), kinds)).toEqual({ cards: [], tiers: {} });
  });
  it('selectFocusedStoryCandidates returns the cards in tier order with their tiers', () => {
    const r = selectFocusedStoryCandidates(storyState(), makeContent({ cards: ALL }), ALL);
    expect(r.cards.map(c => c.id)).toEqual(['p1', 'p1b', 'p2l', 'p2t', 'p3', 'p4', 'p5']);
    expect(r.tiers.p2t).toBe(2);
  });
});

describe('filling the story places (section 6.2)', () => {
  const ranked = (cards = ALL, state = storyState()) => rankFocusedStory(state, makeContent({ cards }), cards);
  const pick = (count: number, cards = ALL, i = 0, c = makeContent({ cards })) => pickFocusedStory(storyState(i), c, ranked(cards, storyState(i)), count);
  it('one place takes the best tier; several take tiers in order without repeating a card', () => {
    for (let i = 0; i < 30; i++) expect(['p1', 'p1b']).toContain(pick(1, ALL, i).picked[0]!.card.id);
    const nonDiverse = [P1, P1b, P3, P5];
    for (let i = 0; i < 30; i++) {
      const ids = pick(4, nonDiverse, i).picked.map(r => r.card.id);
      expect(ids.slice(0, 2).sort()).toEqual(['p1', 'p1b']); expect(ids.slice(2)).toEqual(['p3', 'p5']); expect(new Set(ids).size).toBe(4);
    }
  });
  it('never adds an irrelevant scene to reach the count', () => {
    expect(pick(6, [P1, NOPE, UNMARKED]).picked.map(r => r.card.id)).toEqual(['p1']);
  });
  it('keeps one place for another fresh line or open thread when there are two places and an alternative exists', () => {
    for (let i = 0; i < 40; i++) {
      const { picked, variety } = pick(2, [P1, P1b, P2L], i);
      expect(picked.map(r => r.card.id)).toContain('p2l'); expect(variety).toBe('p2l');
    }
  });
  it('else keeps a place for a scene of the intention in another sphere; without any alternative it just follows priority', () => {
    const cards = [P1, P1b, P4];
    for (let i = 0; i < 40; i++) expect(pick(2, cards, i).picked.map(r => r.card.id)).toContain('p4');
    for (let i = 0; i < 20; i++) expect(pick(2, [P1, P1b], i).variety).toBeUndefined();
    expect(pick(1, [P1, P1b, P2L]).variety).toBeUndefined();
  });
  it('a card of weight 0 is never preferred over a card that has weight, and sorting stays well-defined', () => {
    const zero = story('zero', ['work'], { goalIds: ['alexey'], role: 'complication' }, { weight: 0 });
    const zero2 = story('zero2', ['work'], { goalIds: ['alexey'], role: 'complication' }, { weight: 0 });
    const light = story('light', ['work'], { goalIds: ['alexey'], role: 'complication' }, { weight: 1 });
    for (let i = 0; i < 60; i++) {
      expect(pick(1, [zero, light], i).picked[0]!.card.id).toBe('light');
      expect(pick(3, [zero, zero2, light], i).picked.map(r => r.card.id)).toEqual(['light', 'zero', 'zero2']);
    }
    expect(pick(1, [zero], 3).picked[0]!.card.id).toBe('zero');
  });
  it('is deterministic for a fixed state and spreads over a tier by weight', () => {
    const heavy = story('h', ['work'], { goalIds: ['alexey'], role: 'complication' }, { weight: 9 });
    const light = story('l', ['work'], { goalIds: ['alexey'], role: 'complication' }, { weight: 1 });
    const cards = [heavy, light];
    expect(pick(1, cards, 5).picked[0]!.card.id).toBe(pick(1, cards, 5).picked[0]!.card.id);
    const heavyShare = Array.from({ length: 1200 }, (_, i) => pick(1, cards, i).picked[0]!.card.id).filter(id => id === 'h').length / 1200;
    expect(heavyShare).toBeGreaterThan(.82); expect(heavyShare).toBeLessThan(.97);
  });
  it('uses facet attention once: a work-heavy history makes work scenes more likely inside a tier, never impossible', () => {
    const w = story('w', ['work'], { goalIds: ['alexey'], role: 'complication' }, { weight: 3 });
    const b = story('b', ['body'], { goalIds: ['alexey'], role: 'complication' }, { weight: 3 });
    const history = Array.from({ length: 16 }, (_, i) => ({ day: 1, slot: i % 4, cardId: 'w', choiceId: 'a', facets: ['work' as LifeFacet] }));
    const share = (c: GameContent) => Array.from({ length: 1200 }, (_, i) => pickFocusedStory(storyState(i, { history }), c, rankFocusedStory(storyState(i), c, [w, b]), 1).picked[0]!.card.id)
      .filter(id => id === 'w').length / 1200;
    const base = makeContent({ cards: [w, b, story('hist', ['work'])] });
    const off = share(configured(base)), on = share(configured(base, { facetAttention: true }));
    expect(off).toBeGreaterThan(.45); expect(off).toBeLessThan(.55);
    expect(on).toBeGreaterThan(off + .08); expect(on).toBeLessThan(.9);
  });
});

describe('rollout gate (section 9)', () => {
  it('is on only with the flag and inside the day range', () => {
    const c = configured(makeContent({ cards: [] }), { range: [1, 10] });
    expect([0, 1, 5, 10, 11].map(day => focusedEncountersOn(makeState({ day }), c))).toEqual([false, true, true, true, false]);
    expect(focusedEncountersOn(makeState({ day: 3 }), configured(makeContent({ cards: [] }), { on: false }))).toBe(false);
  });
  it('the shipped content has the flag off and the range 1–10', () => {
    expect(content.profile.rollout.focusedEncounters).toBe(false);
    expect(content.profile.focusedEncounters).toEqual({ fromDay: 1, throughDay: 10 });
    // Only ordinary free scenes carry a story block; the protected categories never do.
    expect(content.cards.filter(c => c.story).every(isFacetWeightedDrawCandidate)).toBe(true);
  });
  it('off or outside the range the slice is the legacy slice, call for call', () => {
    const cards = [...ALL, ...neutrals];
    for (const [c, day] of [[configured(makeContent({ cards }), { on: false }), 3], [configured(makeContent({ cards }), { range: [1, 10] }), 12]] as const) {
      for (let i = 0; i < 40; i++) {
        const s = storyState(i, { day });
        const ordered = freePool(s, c).sort((a, b) => deterministicRandom(s.seed, s.day, s.slot, `candidate:${a.id}`, s.episodeId) - deterministicRandom(s.seed, s.day, s.slot, `candidate:${b.id}`, s.episodeId));
        expect(encounterSlice(s, c, ordered, 6)).toEqual(facetAdjustedSlice(s, c, ordered, 6));
        const withFacets = configured(c, { on: c.profile.rollout.focusedEncounters, facetAttention: true, range: [c.profile.focusedEncounters.fromDay, c.profile.focusedEncounters.throughDay] });
        expect(encounterSlice(s, withFacets, ordered, 6)).toEqual(facetAdjustedSlice(s, withFacets, ordered, 6));
      }
    }
  });
  it('AC-1 (self-referential, survives content edits): the flag on but outside every played day gives the same runs as the flag off', () => {
    const outside = configured(content, { range: [31, 31] });
    for (const [policy, seed] of [['mixed', 1], ['mixed', 2], ['always-costly', 3], ['random', 4], ['greedy-qualities', 5]] as const)
      expect([policy, seed, runFingerprint(policy, seed, outside)]).toEqual([policy, seed, runFingerprint(policy, seed)]);
  });
  const REGENERATE = 'The content changed since reports/focused-encounters-baseline.json was recorded. If that is intended, re-record the reference with `npm run focused:baseline:rerecord` (it uses the ORIGINAL selectors of the stage 0 commit on the current content) and say so in the review.';
  it('AC-1 (recorded): with the flag off whole runs equal the baseline recorded at the stage 0 SHA', () => {
    for (const [policy, seed] of [['mixed', 1], ['mixed', 2], ['always-costly', 3], ['random', 4]] as const)
      expect(runFingerprint(policy, seed), `${policy}/${seed}: ${REGENERATE}`).toBe(baseline.runs[policy]![seed - 1]);
  });
  it('the protected cards (neutral, probe, development) are byte-identical to the baseline', () => { expect(protectedCardsHash(), `Protected diagnostic/development cards differ from the baseline. ${REGENERATE}`).toBe(baseline.protectedCardsHash); });
});

describe('the dice set (point 1: prepareEncounter)', () => {
  const world = (flags?: Flags, cards = [...ALL, ...neutrals, ...Array.from({ length: 4 }, (_, i) => story(`filler${i}`, ['work'], { goalIds: ['alexey'], role: 'ambient' }))]) =>
    configured(makeContent({ cards }), flags);
  const sets = (c: GameContent, n = 120) => Array.from({ length: n }, (_, i) => ({ i, state: prepareEncounter(storyState(i), c) }));
  const protectedOf = (ids: string[]) => ids.filter(id => id.startsWith('n')).sort().join(',');

  it('six distinct eligible scenes; every story scene in the set is relevant; the neutral ones are exactly those of the legacy set (FACET-2)', () => {
    const on = world(), off = world({ on: false });
    let full = 0;
    for (const { i, state } of sets(on)) {
      const legacy = prepareEncounter(storyState(i), off).diceHistory.at(-1)!.candidates;
      if (state.phase !== 'dice') continue;
      full++;
      const ids = state.diceHistory.at(-1)!.candidates;
      expect(new Set(ids).size).toBe(6);
      const relevant = new Set(selectFocusedStoryCandidates(storyState(i), on, on.cards).cards.map(c => c.id));
      for (const id of ids) expect(id.startsWith('n') || relevant.has(id)).toBe(true);
      expect(protectedOf(ids)).toBe(protectedOf(legacy));
    }
    expect(full).toBeGreaterThan(60);
  });
  it('neutral candidates do not depend on the facet attention or on the story context', () => {
    const on = world({ facetAttention: true }), off = world({ on: false });
    const history = Array.from({ length: 16 }, (_, i) => ({ day: 1, slot: i % 4, cardId: 'p1', choiceId: 'a', facets: ['inner' as LifeFacet] }));
    for (let i = 0; i < 60; i++) {
      const a = prepareEncounter(storyState(i, { history }), on), b = prepareEncounter(storyState(i), off);
      if (a.phase === 'dice') expect(protectedOf(a.diceHistory.at(-1)!.candidates)).toBe(protectedOf(b.diceHistory.at(-1)!.candidates));
    }
  });
  it('is deterministic and the faces keep their original place order; the six are shuffled so a tier does not own a face', () => {
    const on = world();
    const first = new Array<number>(6).fill(0);
    for (const { i, state } of sets(on, 200)) {
      if (state.phase !== 'dice') continue;
      expect(prepareEncounter(storyState(i), on)).toEqual(state);
      const ids = state.diceHistory.at(-1)!.candidates;
      const best = Math.min(...ids.map(id => (selectFocusedStoryCandidates(storyState(i), on, on.cards).tiers[id] ?? 9)));
      ids.forEach((id, k) => { if ((selectFocusedStoryCandidates(storyState(i), on, on.cards).tiers[id] ?? 9) === best) first[k]!++; });
    }
    for (const n of first) expect(n).toBeGreaterThan(0);
  });
  it('at most one throw per game day, and no new field is written into the dice record', () => {
    const on = world();
    const dice = prepareEncounter(storyState(3), on);
    expect(dice.phase).toBe('dice');
    expect(Object.keys(dice.diceHistory[0]!).sort()).toEqual(['candidateOrigins', 'candidates', 'day', 'slot']);
    { const { current: _shown, ...rest } = rollEncounter(dice, on, 2); void _shown; expect(prepareEncounter({ ...rest, phase: 'slot' } as GameState, on).diceHistory).toHaveLength(1); }
  });
  it('faces stay equally likely: the die does not know the tiers', () => {
    let state = 1; const rng = () => { state = (state * 1664525 + 1013904223) >>> 0; return state; };
    const counts = new Array<number>(7).fill(0);
    for (let i = 0; i < 6000; i++) counts[fairDieFace(rng)]!++;
    for (let face = 1; face <= 6; face++) expect(Math.abs(counts[face]! / 6000 - 1 / 6)).toBeLessThan(.02);
  });
  it('the saved set survives a reload and a change of the rollout: candidates, face, current scene, choice ids', () => {
    const on = world(), off = world({ on: false });
    const dice = prepareEncounter(storyState(4), on);
    expect(dice.phase).toBe('dice');
    const reloaded = JSON.parse(JSON.stringify(dice)) as GameState;
    expect(prepareEncounter(reloaded, off)).toEqual(reloaded);
    const rolledOn = rollEncounter(dice, on, 4), rolledOff = rollEncounter(reloaded, off, 4);
    expect(rolledOff).toEqual(rolledOn);
    expect(rolledOn.current!.cardId).toBe(dice.diceHistory[0]!.candidates[3]);
    const again = JSON.parse(JSON.stringify(rolledOn)) as GameState;
    expect(openEncounter(again).current).toEqual(rolledOn.current);
    expect(rollEncounter(again, on, 1)).toBe(again);
  });
  it('writes nothing but the trace: the state and the dice record carry no tier, basis or weight', () => {
    const events: FocusedTraceEvent[] = [];
    setFocusedTrace(e => events.push(e));
    try {
      const dice = prepareEncounter(storyState(6), world());
      expect(JSON.stringify(dice)).not.toMatch(/tier|basis|"G"|"L"|worldFallback/);
      expect(events.some(e => e.kind === 'dice' && e.picks?.every(p => p.tier >= 1 && p.tier <= 5))).toBe(true);
    } finally { setFocusedTrace(undefined); }
  });
});

describe('deficit and direct draw (point 2: drawCard, section 7)', () => {
  const few = [P1, UNMARKED, NOPE, ...neutrals.slice(0, 5)];   // one relevant story scene among three
  const fewOn = () => configured(makeContent({ cards: few }));
  it('too few relevant scenes: no dice set, and the direct draw never shows a scene outside the filter', () => {
    const c = fewOn();
    let deficits = 0, dice = 0;
    for (let i = 0; i < 200; i++) {
      const s = storyState(i), next = prepareEncounter(s, c);
      if (next.phase === 'dice') { dice++; expect(next.diceHistory.at(-1)!.candidates.filter(id => !id.startsWith('n')).every(id => id === 'p1')).toBe(true); }
      else { deficits++; expect(next).toBe(s); expect(next.diceHistory).toHaveLength(0); }
      const drawn = drawCard(s, c)!;
      expect(drawn.card.diagnostic !== undefined || drawn.card.id === 'p1').toBe(true);
    }
    expect(deficits).toBeGreaterThan(0); expect(dice).toBeGreaterThan(0);
  });
  it('AC-7: the direct draw uses the same relevant list as the dice and never leaves it', () => {
    const cards = [...ALL, ...neutrals];
    const c = configured(makeContent({ cards }));
    for (let i = 0; i < 300; i++) {
      const s = storyState(i), card = drawCard(s, c)!.card;
      if (card.diagnostic) continue;
      const { cards: relevant, tiers } = selectFocusedStoryCandidates(s, c, freePool(s, c));
      expect(relevant.map(x => x.id)).toContain(card.id);
      expect(tiers[card.id]).toBeGreaterThanOrEqual(1);
      expect(['unmarked', 'off_topic']).not.toContain(card.id);
    }
  });
  it('keeps the legacy share of protected scenes: a protected first pick is returned untouched', () => {
    const cards = [...ALL, ...neutrals];
    const c = configured(makeContent({ cards })), off = configured(makeContent({ cards }), { on: false });
    let protectedPicks = 0;
    for (let i = 0; i < 300; i++) {
      const s = storyState(i), legacy = drawCard(s, off)!.card;
      if (isFacetWeightedDrawCandidate(legacy)) continue;
      protectedPicks++; expect(drawCard(s, c)!.card.id).toBe(legacy.id);
    }
    expect(protectedPicks).toBeGreaterThan(20);
  });
  it('with no relevant story it draws a protected scene by the same roll, deterministically', () => {
    const cards = [UNMARKED, NOPE, ...neutrals];
    const c = configured(makeContent({ cards }));
    for (let i = 0; i < 80; i++) {
      const s = storyState(i), drawn = drawCard(s, c)!.card;
      expect(drawn.id.startsWith('n')).toBe(true); expect(drawCard(s, c)!.card.id).toBe(drawn.id);
    }
  });
  it('FOCUS_POOL_EMPTY: only unrelated story scenes and nothing protected is a registered data error, not a silent general draw', () => {
    const c = configured(makeContent({ cards: [UNMARKED, NOPE] }));
    const events: FocusedTraceEvent[] = [];
    setFocusedTrace(e => events.push(e));
    try {
      let thrown = 0;
      for (let i = 0; i < 20; i++) { try { drawCard(storyState(i), c); } catch (e) { expect(e).toBeInstanceOf(FocusPoolEmptyError); expect((e as FocusPoolEmptyError).code).toBe('FOCUS_POOL_EMPTY'); thrown++; } }
      expect(thrown).toBe(20); expect(events.filter(e => e.kind === 'empty')).toHaveLength(20);
    } finally { setFocusedTrace(undefined); }
    expect(drawCard(storyState(0), configured(makeContent({ cards: [UNMARKED, NOPE] }), { on: false }))).toBeDefined();
    expect(drawCard(storyState(0, { day: 12 }), c)).toBeDefined();
  });
  it('is repeatable and uses no Math.random', () => {
    const c = configured(makeContent({ cards: [...ALL, ...neutrals] }));
    const original = Math.random; Math.random = () => { throw new Error('Math.random used'); };
    try { for (let i = 0; i < 60; i++) expect(drawCard(storyState(i), c)!.card.id).toBe(drawCard(storyState(i), c)!.card.id); } finally { Math.random = original; }
  });
});

describe('what the selector must not touch (section 8)', () => {
  const marked = (c: GameContent): GameContent => ({ ...c, cards: c.cards.map(card => isFacetWeightedDrawCandidate(card)
    ? { ...card, story: { goalIds: ['order', 'workshop', 'alexey'], role: 'ambient' } as FocusedStoryMeta } : card) });
  const onReal = configured(marked(content));
  it('the relevant list and the context ignore the diagnostic profile and the development state', () => {
    const { state } = play(2, { policy: 'mixed' });
    const { current: _shown, ...free } = state; void _shown;
    const { observedPrimary: _primary, ...profile } = state.heroDevelopmentProfile; void _primary;
    const altered = { ...free, development: { ...state.development, developmentCurrent: 'strategist' as const },
      heroDevelopmentProfile: { ...profile, status: 'insufficient' as const, confidence: 0 } } as GameState;
    const day = { ...free, day: 5, slot: 1 } as GameState;
    const a = { ...altered, day: 5, slot: 1 } as GameState;
    const ids = (s: GameState) => selectFocusedStoryCandidates(s, onReal, freePool(s, onReal)).cards.map(c => c.id);
    expect(ids(a)).toEqual(ids(day));
    expect(deriveStoryContext(a, onReal)).toEqual(deriveStoryContext(day, onReal));
  });
  it('FACET-1: the profile reading of the same decisions is identical with the selector on and off', () => {
    const { state } = play(2, { policy: 'mixed' });
    expect(auditProfile(state, onReal)).toEqual(auditProfile(state, configured(marked(content), { on: false })));
  });
  it('FACET-2 on real states: the protected candidates are the legacy ones and a probe appears at most once, with its origin kept', () => {
    const off = configured(marked(content), { on: false });
    const seen: GameState[] = [];
    play(7, { policy: 'mixed', beforeStep: s => { if (s.phase === 'slot' && !s.current && !s.diceHistory.some(d => d.day === s.day)) seen.push(s); return s; } });
    play(8, { policy: 'always-costly', beforeStep: s => { if (s.phase === 'slot' && !s.current && !s.diceHistory.some(d => d.day === s.day)) seen.push(s); return s; } });
    let compared = 0, probes = 0;
    for (const s of seen) {
      const st = { ...s, day: Math.min(s.day, 10) };
      let a: GameState, b: GameState;
      try { a = prepareEncounter(st, onReal); b = prepareEncounter(st, off); } catch { continue; }
      if (a.phase !== 'dice' || b.phase !== 'dice') continue;
      compared++;
      const da = a.diceHistory.at(-1)!, db = b.diceHistory.at(-1)!;
      const isProtected = (id: string) => !isFacetWeightedDrawCandidate(onReal.cards.find(c => c.id === id)!);
      const prot = (d: typeof da) => d.candidates.map((id, k) => [id, d.candidateOrigins?.[k]] as const).filter(([id]) => isProtected(id)).map(([id, o]) => `${id}:${o}`).sort();
      expect(prot(da)).toEqual(prot(db));
      expect(da.candidateOrigins!.filter(o => o === 'probe').length).toBeLessThanOrEqual(1);
      probes += da.candidateOrigins!.filter(o => o === 'probe').length;
    }
    expect(compared).toBeGreaterThan(10);
    void probes;
  });
  it('a development scene of the active stage is drawn whatever the context says', () => {
    const dev = story('dev.pressure', ['work'], undefined, { development: { stages: ['expert'] } });
    const c = configured(makeContent({ cards: [dev, P1, ...neutrals] }));
    const s = storyState(1); const d = drawCard({ ...s, development: { ...s.development, developmentCurrent: 'expert' } }, c)!;
    expect([d.card.id, d.source]).toEqual(['dev.pressure', 'development']);
  });
  it('a full 30-day run with the selector on keeps 120 decisions, one throw a day, fixed scenes and no unfinished obligation', () => {
    for (const [policy, seed] of [['mixed', 11], ['always-first', 12], ['always-costly', 13]] as const) {
      const { state, draws } = play(seed, { policy, content: onReal });
      expect(state.history).toHaveLength(120);
      expect(new Set(state.diceHistory.map(d => d.day)).size).toBe(state.diceHistory.length);
      for (const card of onReal.cards.filter(x => x.at)) expect(draws.some(d => d.cardId === card.id && d.day === card.at!.day && d.slot === card.at!.slot)).toBe(true);
      expect(state.scheduled.some(sc => onReal.cards.find(x => x.id === sc.cardId)?.required)).toBe(false);
      for (const d of state.diceHistory) { expect(new Set(d.candidates).size).toBe(6); expect(d.candidateOrigins!.filter(o => o === 'probe').length).toBeLessThanOrEqual(1); }
    }
  });
  const stripStory = (c: GameContent): GameContent => ({ ...c, cards: c.cards.map(({ story: _s, ...card }) => { void _s; return card; }) });
  const freeStates = (seed: number, from: number, through: number): GameState[] => {
    const seen: GameState[] = [];
    play(seed, { policy: 'mixed', beforeStep: s => { if (s.phase === 'slot' && !s.current && s.day >= from && s.day <= through) seen.push(s); return s; } });
    return seen;
  };
  it('H: before coverage is extended, days after the range are exactly the legacy algorithm even for unmarked content', () => {
    const unmarked = configured(stripStory(content));           // flag on, range 1–10, nothing marked
    const states = freeStates(3, 11, 30);
    expect(states.length).toBeGreaterThan(20);
    for (const s of states) {
      expect(drawCard(s, unmarked)).toEqual(drawCard(s, stripStory(content)));
      expect(prepareEncounter(s, unmarked)).toEqual(prepareEncounter(s, stripStory(content)));
    }
  });
  it('I / AC-2: unmarked content inside the range never shows an ordinary story scene from the free pool; it fails loudly (FOCUS_POOL_EMPTY) or shows a protected scene', () => {
    const unmarked = configured(stripStory(content));
    const ordinary = new Set(content.cards.filter(isFacetWeightedDrawCandidate).map(c => c.id));
    let empty = 0, protectedShown = 0;
    for (const s of [...freeStates(3, 1, 10), ...freeStates(4, 1, 10)]) {
      try {
        const draw = drawCard(s, unmarked);
        if (draw?.source === 'pool') { expect(ordinary.has(draw.card.id)).toBe(false); protectedShown++; }
        const dice = prepareEncounter(s, unmarked);
        if (dice.phase === 'dice') for (const id of dice.diceHistory.at(-1)!.candidates) expect(ordinary.has(id)).toBe(false);
      } catch (e) { expect(e).toBeInstanceOf(FocusPoolEmptyError); empty++; }
    }
    expect(empty + protectedShown).toBeGreaterThan(0);
  });
  it('a state written with the selector on is a valid save, and the dice record is the unchanged strict shape', () => {
    const { state } = play(5, { policy: 'mixed', content: onReal, stopWhen: s => s.phase === 'dice' && !s.current && s.day >= 2 });
    expect(state.phase).toBe('dice');
    expect(validateSave({ schema: 1, started: true, game: state })).toBeDefined();
  });
});

describe('direct draw: tier weights 8:5:3:2:1 and variety', () => {
  const oneEach = [P1, P2L, P3, P4, P5];
  const c = (cards: Card[]) => makeContent({ cards });
  const tierShares = (cards: Card[], n = 6000, over: Partial<GameState> = {}) => {
    const counts: Record<number, number> = {};
    for (let i = 0; i < n; i++) {
      const state = storyState(i, over), ranked = rankFocusedStory(state, c(cards), cards);
      const t = pickDirectFocusedStory(state, c(cards), ranked)!.tier;
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / n]));
  };
  it('the weights are the ones the review decided', () => { expect(DIRECT_TIER_WEIGHTS).toEqual({ 1: 8, 2: 5, 3: 3, 4: 2, 5: 1 }); });
  it('with all five tiers present the tiers are drawn 8:5:3:2:1', () => {
    const shares = tierShares(oneEach);
    [8, 5, 3, 2, 1].forEach((w, i) => expect(Math.abs((shares[i + 1] ?? 0) - w / 19)).toBeLessThan(.02));
  });
  it('an empty tier is excluded and the others are renormalised; the number of cards in a tier does not change the tier odds', () => {
    const shares = tierShares([P1, P1b, P3]);
    expect(Math.abs(shares[1]! - 8 / 11)).toBeLessThan(.02); expect(Math.abs(shares[3]! - 3 / 11)).toBeLessThan(.02); expect(shares[2]).toBeUndefined();
    expect(tierShares([P5], 50)).toEqual({ 5: 1 });
  });
  it('is not always the best tier and keeps variety: several tiers and several cards of one tier appear', () => {
    const picks = new Set<string>(), tiers = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const state = storyState(i), ranked = rankFocusedStory(state, c(ALL), ALL), r = pickDirectFocusedStory(state, c(ALL), ranked)!;
      picks.add(r.card.id); tiers.add(r.tier);
    }
    expect([...tiers].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(picks.has('p1') && picks.has('p1b')).toBe(true);
    expect(picks.size).toBe(7);
  });
  it('is deterministic and gives nothing when nothing is relevant', () => {
    const state = storyState(9), ranked = rankFocusedStory(state, c(ALL), ALL);
    expect(pickDirectFocusedStory(state, c(ALL), ranked)!.card.id).toBe(pickDirectFocusedStory(state, c(ALL), ranked)!.card.id);
    expect(pickDirectFocusedStory(state, c(ALL), [])).toBeUndefined();
  });
  it('through drawCard: the story share of the legacy split is kept, and tiers below the best are really shown', () => {
    const cards = [...oneEach, ...neutrals];
    const on = configured(makeContent({ cards })), off = configured(makeContent({ cards }), { on: false });
    const shown: Record<string, number> = {};
    let storyOn = 0, storyOff = 0;
    for (let i = 0; i < 1500; i++) {
      const s = storyState(i), a = drawCard(s, on)!.card, b = drawCard(s, off)!.card;
      if (isFacetWeightedDrawCandidate(a)) { storyOn++; shown[a.id] = (shown[a.id] ?? 0) + 1; }
      if (isFacetWeightedDrawCandidate(b)) storyOff++;
    }
    expect(storyOn).toBe(storyOff);
    for (const id of ['p1', 'p2l', 'p3', 'p4', 'p5']) expect(shown[id]).toBeGreaterThan(0);
    expect(shown.p1!).toBeGreaterThan(shown.p5!);
  });
});

describe('the declared-intention bonus (x1.15) inside a tier, never applied twice', () => {
  const inner = story('i_in', ['inner'], { goalIds: ['alexey'], role: 'complication' });
  const body = story('i_out', ['body'], { goalIds: ['alexey'], role: 'complication' });
  const uniform = Array.from({ length: 16 }, (_, k) => ({ day: 1, slot: k % 4, cardId: 'h', choiceId: 'a', facets: [(['work', 'relationships', 'body', 'inner'] as LifeFacet[])[k % 4]!] }));
  const share = (c: GameContent, over: Partial<GameState>) => Array.from({ length: 8000 }, (_, i) => {
    const state = storyState(i, over), ranked = rankFocusedStory(state, c, [inner, body]);
    return pickFocusedStory(state, c, ranked, 1).picked[0]!.card.id;
  }).filter(id => id === 'i_in').length / 8000;
  const world = (facetAttention: boolean) => configured(makeContent({ cards: [inner, body, story('h', ['work'])] }), { facetAttention });
  it('facet attention off: the scene of the intention weighs 1.15 against 1', () => {
    expect(Math.abs(share(world(false), {}) - 1.15 / 2.15)).toBeLessThan(.02);
  });
  it('facet attention off: no intention, no bonus', () => {
    expect(Math.abs(share(world(false), { declaredIntention: 'work' }) - .5)).toBeLessThan(.02);
  });
  it('facet attention on, few own decisions: the bonus comes from facet attention alone, once (not 1.15 squared)', () => {
    expect(Math.abs(share(world(true), {}) - 1.15 / 2.15)).toBeLessThan(.02);
  });
  it('facet attention on, enough own decisions: the bonus has faded, as facet attention itself defines', () => {
    expect(Math.abs(share(world(true), { history: uniform }) - .5)).toBeLessThan(.02);
  });
});

describe('real content with the selector on (days 1–10)', () => {
  const onReal = configured(content);
  it('never runs out of scenes: no FOCUS_POOL_EMPTY for any goal, intention or policy; every ordinary scene shown from the pool is relevant', () => {
    const ordinary = new Set(content.cards.filter(isFacetWeightedDrawCandidate).map(c => c.id));
    let checked = 0;
    for (const policy of ['mixed', 'always-first', 'always-costly'] as const) for (const goal of ['order', 'workshop', 'alexey'] as const) for (let seed = 1; seed <= 4; seed++) {
      const { state } = play(seed, { policy, goal, content: onReal, goalAt: seed % 2 ? { 11: 'workshop', 21: 'alexey' } : { 11: 'alexey', 21: 'order' },
        onDraw: (s, draw) => {
          if (draw.source !== 'pool' || s.day > 10 || !ordinary.has(draw.card.id)) return;
          expect(rankFocusedStory(s, onReal, freePool(s, onReal)).some(r => r.card.id === draw.card.id)).toBe(true); checked++;
        } });
      expect(state.history).toHaveLength(120);
    }
    expect(checked).toBeGreaterThan(30);
  });
});

describe('scenarios B and D: a change of goal keeps the promises; obligations and crises are not displaced', () => {
  const chainThread = content.threads.find(t => t.kind === 'chain')!;
  const follow = chainThread.kind === 'chain' ? chainThread.followUp.cardId : '';
  const toApprentice = story('to_apprentice', ['work'], { goalIds: ['alexey'], lines: ['apprentice'], role: 'consequence' });
  const toThread = story('to_thread', ['relationships'], { threadIds: [chainThread.id], role: 'consequence' });
  const toWorkshop = story('to_workshop', ['work'], { goalIds: ['workshop'], role: 'opportunity' });
  const cards = [toApprentice, toThread, toWorkshop];
  const base = (goal: 'alexey' | 'workshop') => storyState(0, { day: 11, goal: { id: goal, wording: 'x' }, scheduled: [{ cardId: follow, day: 12, latestDay: 14 }] });
  const followCard = content.cards.find(c => c.id === follow)!;
  const tiers = (s: GameState) => Object.fromEntries(rankFocusedStory(s, makeContent({ cards: [...cards, followCard] }), cards).map(r => [r.card.id, r.tier]));
  it('B: switching the goal on day 11 moves the focus, but the open thread keeps its scene relevant', () => {
    expect(tiers(base('alexey'))).toEqual({ to_apprentice: 1, to_thread: 2 });
    expect(tiers(base('workshop'))).toEqual({ to_apprentice: 2, to_thread: 2, to_workshop: 3 });
    expect(deriveStoryContext(base('workshop'), content).openThreadIds).toContain(chainThread.id);
  });
  it('C: the same holds when the goal is changed again on day 21 — a scheduled promise stays open until its latest day', () => {
    const late = (day: number) => ({ ...base('workshop'), day, scheduled: [{ cardId: follow, day: 20, latestDay: 24 }] });
    expect(deriveStoryContext(late(21), content).openThreadIds).toContain(chainThread.id);
    expect(deriveStoryContext(late(25), content).openThreadIds).not.toContain(chainThread.id);
  });
  it('D: a pending crisis and a due required scene are drawn before any contextual scene', () => {
    const crisis = makeCard({ id: 'crisis', type: 'crisis', chapter: 'any', crisis: { resource: 'strength', edge: 0 }, once: false, cooldownDays: 3,
      textVariants: [{ id: 'again', when: { dayGte: 1 }, text: 'again', kind: 'consequence' }] });
    const c = configured(makeContent({ cards: [crisis, ...ALL, ...neutrals] }));
    for (let i = 0; i < 20; i++) {
      const s = storyState(i, { resources: { wealth: 50, strength: 0, peace: 50, bonds: 50 } });
      expect(drawCard(s, c)).toMatchObject({ source: 'crisis' });
      expect(prepareEncounter(s, c)).toBe(s);
    }
  });
});

describe('static lint of the story metadata (section 12.1)', () => {
  const lint = (patch: (c: GameContent) => GameContent) => focusedEncountersErrors(patch(content)).join('\n');
  const withStory = (id: string, meta: FocusedStoryMeta) => (c: GameContent): GameContent => ({ ...c, cards: c.cards.map(card => card.id === id ? { ...card, story: meta } : card) });
  const ordinary = content.cards.find(isFacetWeightedDrawCandidate)!;
  const protectedCard = content.cards.find(c => c.diagnostic && !c.tags?.includes('probe-only'))!;
  it('the shipped content passes', () => { expect(focusedEncountersErrors(content)).toEqual([]); });
  it('accepts a real anchor and rejects an unknown thread, a line nothing writes, a protected scene, and an impossible requires', () => {
    expect(lint(withStory(ordinary.id, { goalIds: ['alexey'], role: 'ambient' }))).toBe('');
    expect(lint(withStory(ordinary.id, { threadIds: ['no_such_thread'], role: 'ambient' }))).toMatch(/unknown thread/);
    expect(lint(withStory(protectedCard.id, { goalIds: ['alexey'], role: 'ambient' }))).toMatch(/protected or non-ordinary/);
    expect(lint(c => ({ ...withStory(ordinary.id, { lines: ['pace'], role: 'ambient' })(c), cards: withStory(ordinary.id, { lines: ['pace'], role: 'ambient' })(c).cards
      .map(card => ({ ...card, choices: card.choices.map(({ lineStep: _step, ...ch }) => { void _step; return ch; }) })) }))).toMatch(/no choice ever writes/);
    expect(lint(c => ({ ...withStory(ordinary.id, { goalIds: ['alexey'], role: 'ambient' })(c), cards: withStory(ordinary.id, { goalIds: ['alexey'], role: 'ambient' })(c).cards
      .map(card => card.id === ordinary.id ? { ...card, requires: { fact: 'no.such.fact', equals: 'x' } } : card) }))).toMatch(/can never hold/);
  });
  it('demands an anchor for every ordinary scene available inside the focused range (flag on or off), and a range inside the episode', () => {
    const stripped = (c: GameContent): GameContent => ({ ...c, cards: c.cards.map(({ story: _s, ...card }) => { void _s; return card; }) });
    expect(focusedEncountersErrors(stripped(content)).join('\n')).toMatch(/has no story anchor inside the focused range/);
    expect(focusedEncountersErrors(configured(stripped(content), { on: false })).join('\n')).toMatch(/has no story anchor inside the focused range/);
    expect(focusedEncountersErrors(content)).toEqual([]);
    expect(focusedEncountersErrors(configured(content, { on: false, range: [1, 40] })).join('\n')).toMatch(/beyond the episode/);
    const gated = { ...content, cards: content.cards.map(card => card.id === ordinary.id ? { ...card, chapter: 'any' as const, requires: { dayGte: 15 } } : card) };
    expect(focusedEncountersErrors(configured({ ...gated, cards: gated.cards.map(({ story: _s, ...card }) => { void _s; return card; }) })).join('\n')).not.toContain(ordinary.id);   // not available on days 1–10: no anchor needed there
    const everything = { ...content, cards: content.cards.map(card => isFacetWeightedDrawCandidate(card) ? { ...card, story: { goalIds: ['order' as const], role: 'ambient' as const } } : card) };
    expect(focusedEncountersErrors(configured(everything))).toEqual([]);
  });
});
