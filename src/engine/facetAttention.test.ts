import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { play } from '../../scripts/play';
import { applyChoice, auditProfile, calculateProfileSlice, drawCard, persistDraw, prepareEncounter, probeScenes, independentPool, freePool } from './index';
import { cardFacetMultiplier, declaredIntentionPrior, facetAttention, facetTargetDistribution, isFacetAttentionEvidenceSource, isFacetWeightedDrawCandidate, FACETS } from './facets';
import { facetAdjustedSlice } from './draw';
import { deterministicRandom } from './rng';
import { makeCard, makeContent, makeState } from './testUtils';
import type { Card, GameContent, GameState, LifeFacet } from './types';

const config = content.profile.facetAttention;
const withFlag = (c: GameContent, on: boolean): GameContent => ({ ...c, profile: { ...c.profile, rollout: { ...c.profile.rollout, facetAttention: on } } });
const story = (id: string, facets: LifeFacet[], extra: Partial<Card> = {}): Card => makeCard({ id, type: 'situation', chapter: 'any', facets, ...extra });
const neutral = (id: string): Card => story(id, ['work'], { diagnostic: { situationId: id, contextId: 'c', facets: ['work'], developmentWeight: 1 } });
const entry = (cardId: string, facets: LifeFacet[], i = 0): GameState['history'][number] => ({ day: 1 + Math.floor(i / 3), slot: i % 3, cardId, choiceId: 'a', facets });
/** History of `n` free story decisions with the given facet per decision. */
const historyOf = (facets: LifeFacet[]) => facets.map((f, i) => entry(`s_${f}_0`, [f], i));
const times = (f: LifeFacet, n: number) => Array<LifeFacet>(n).fill(f);
const sphereCards = () => FACETS.flatMap(f => [0, 1, 2, 3].map(i => story(`s_${f}_${i}`, [f])));
const attentionOf = (facets: LifeFacet[]) => facetAttention(makeState({ history: historyOf(facets) }), makeContent({ cards: sphereCards() }), config);
const sum = (d: Record<string, number>) => Object.values(d).reduce((a, b) => a + b, 0);

describe('facet attention: what counts', () => {
  it('separates evidence sources from weighted draw candidates', () => {
    const cases: [string, Card, boolean, boolean][] = [
      ['ordinary free story', story('a', ['work']), true, true],
      ['routine', story('r', ['work'], { type: 'routine' }), true, true],
      ['route-only', story('ro', ['work'], { tags: ['route-only'] }), true, false],
      ['neutral', neutral('n'), false, false],
      ['probe', story('p', ['work'], { tags: ['probe-only'] }), false, false],
      ['development', story('d', ['work'], { development: { stages: ['expert'] } }), false, false],
      ['chain', story('c', ['work'], { type: 'chain' }), false, false],
      ['crisis', story('k', ['work'], { type: 'crisis' }), false, false],
      ['fixed', story('f', ['work'], { at: { day: 1, slot: 0 } }), false, false],
      ['key', story('ke', ['work'], { key: true }), false, false],
      ['required', story('re', ['work'], { required: true }), false, false],
      ['mustShowBy', story('m', ['work'], { mustShowBy: 3 }), false, false]
    ];
    for (const [name, card, evidence, candidate] of cases) {
      expect([name, isFacetAttentionEvidenceSource(card)]).toEqual([name, evidence]);
      expect([name, isFacetWeightedDrawCandidate(card)]).toEqual([name, candidate]);
    }
  });
  it('ignores non-evidence decisions and falls back to the choice when the saved facets are empty', () => {
    const c = makeContent({ cards: [story('free', ['work']), neutral('n'), story('legacy', ['inner'], { choices: [
      { id: 'a', label: 'A', effects: {}, servesFacets: ['inner'] }, { id: 'b', label: 'B', effects: {} }] })] });
    const state = makeState({ history: [entry('n', ['body']), entry('free', ['work']), { ...entry('legacy', []), facets: [] }] });
    const a = facetAttention(state, c, config);
    expect(a.evidence).toBe(2); expect(a.distribution.body).toBe(0); expect(a.distribution.work).toBeCloseTo(.5); expect(a.distribution.inner).toBeCloseTo(.5);
  });
});

describe('facet attention: distribution (FACET-7, 8, 9)', () => {
  it('a multi-facet choice splits one unit between its spheres, counted once per sphere', () => {
    const c = makeContent({ cards: [story('free', ['work', 'relationships'])] });
    const a = facetAttention(makeState({ history: [entry('free', ['work', 'relationships', 'work'])] }), c, config);
    expect(a.distribution.work).toBeCloseTo(.5); expect(a.distribution.relationships).toBeCloseTo(.5);
  });
  it('sums to one, and is uniform without evidence', () => {
    expect(sum(attentionOf(times('work', 5).concat(times('body', 3))).distribution)).toBeCloseTo(1);
    expect(attentionOf([])).toEqual({ distribution: { work: .25, relationships: .25, body: .25, inner: .25 }, evidence: 0 });
  });
  it('uses only the last windowSize evidence decisions', () => {
    const old = times('work', 20), recent = [...times('relationships', 8), ...times('body', 8)];
    const a = attentionOf([...old, ...recent]);
    expect(a.evidence).toBe(16); expect(a.distribution.work).toBe(0); expect(a.distribution.relationships).toBeCloseTo(.5);
  });
  it('a switch of attention takes over once the old decisions leave the window (scenario C)', () => {
    const a = attentionOf([...times('work', 16), ...times('relationships', 16)]);
    const t = facetTargetDistribution(a, config);
    expect(a.distribution.work).toBe(0); expect(t.relationships).toBeGreaterThan(t.work);
    expect(Object.entries(t).sort((x, y) => y[1] - x[1])[0]![0]).toBe('relationships');
  });
  it('an even history gives multipliers of 1 (scenario A)', () => {
    const t = facetTargetDistribution(attentionOf(FACETS.flatMap(f => times(f, 4))), config);
    for (const f of FACETS) expect(cardFacetMultiplier(story('x', [f]), t, config)).toBeCloseTo(1);
  });
});

describe('facet attention: target and multiplier (FACET-5, 6)', () => {
  it('stays uniform below minEvidence', () => {
    expect(facetTargetDistribution(attentionOf(times('work', 5)), config)).toEqual({ work: .25, relationships: .25, body: .25, inner: .25 });
  });
  it('mixes half the base with half the attention, so no sphere disappears (the example from the spec)', () => {
    const t = facetTargetDistribution({ distribution: { work: .5, relationships: .25, body: .1, inner: .15 }, evidence: 16 }, config);
    expect(t.work).toBeCloseTo(.375); expect(t.relationships).toBeCloseTo(.25); expect(t.body).toBeCloseTo(.175); expect(t.inner).toBeCloseTo(.2);
  });
  it('focus on work makes work scenes more frequent, the rest stay above zero (scenario B)', () => {
    const t = facetTargetDistribution(attentionOf([...times('work', 12), 'relationships', 'relationships', 'body', 'inner']), config);
    const m = (f: LifeFacet) => cardFacetMultiplier(story('x', [f]), t, config);
    expect(m('work')).toBeGreaterThan(1.3); expect(m('work')).toBeLessThanOrEqual(1.6);
    for (const f of FACETS) { expect(m(f)).toBeGreaterThanOrEqual(.6); expect(m(f)).toBeLessThanOrEqual(1.6); }
  });
  it('clamps extremes and the intention prior; multiplier is never outside the configured range', () => {
    const extreme = facetTargetDistribution({ distribution: { work: 1, relationships: 0, body: 0, inner: 0 }, evidence: 16 }, { ...config, playerWeight: 1 });
    expect(cardFacetMultiplier(story('x', ['work']), extreme, config, 1.15)).toBe(1.6);
    expect(cardFacetMultiplier(story('x', ['body']), extreme, config)).toBe(.6);
  });
  it('uses the mean, not the max, for several spheres; a card without facets stays at 1', () => {
    const t = { work: .4, relationships: .1, body: .25, inner: .25 };
    expect(cardFacetMultiplier(story('x', ['work', 'relationships']), t, config)).toBeCloseTo(1);
    expect(cardFacetMultiplier(story('x', []), t, config)).toBe(1);
  });
  it('the declared intention is a weak start only: 1.15 below minEvidence, nothing after', () => {
    const card = story('x', ['inner']), state = makeState({ declaredIntention: 'inner' });
    expect(declaredIntentionPrior(card, state, { distribution: { work: .25, relationships: .25, body: .25, inner: .25 }, evidence: 5 }, config)).toBe(1.15);
    expect(declaredIntentionPrior(card, state, { distribution: { work: .25, relationships: .25, body: .25, inner: .25 }, evidence: 6 }, config)).toBe(1);
    expect(declaredIntentionPrior(story('y', ['work']), state, { distribution: { work: 1, relationships: 0, body: 0, inner: 0 }, evidence: 0 }, config)).toBe(1);
  });
});

describe('facet attention: the draw', () => {
  const cards = [...FACETS.flatMap(f => [0, 1, 2, 3].map(i => story(`s_${f}_${i}`, [f]))), ...Array.from({ length: 8 }, (_, i) => neutral(`n${i}`))];
  const poolContent = (on: boolean) => withFlag(makeContent({ cards }), on);
  const stateAt = (i: number, history: GameState['history'] = []) => makeState({ seed: 100 + i, day: 1 + (i % 28), slot: i % 3, history });
  /** The pool in the same uniform shuffle prepareEncounter uses. */
  const shuffled = (s: GameState, c: GameContent) => { const r = (x: Card) => deterministicRandom(s.seed, s.day, s.slot, `candidate:${x.id}`, s.episodeId); return freePool(s, c).sort((a, b) => r(a) - r(b)); };
  const heavy = [...historyOf(times('work', 12)), ...historyOf(['relationships', 'relationships', 'body', 'inner'])];
  const slices = (on: boolean, history: GameState['history'], n = 600) => Array.from({ length: n }, (_, i) => {
    const s = stateAt(i, history), c = poolContent(on); const ordered = shuffled(s, c);
    return facetAdjustedSlice(s, c, ordered, 6);
  });
  const tally = (list: Card[][]) => { const t: Record<string, number> = { work: 0, relationships: 0, body: 0, inner: 0, neutral: 0 };
    for (const card of list.flat()) t[card.diagnostic ? 'neutral' : card.facets![0]!]!++; return t; };

  it('off: the six are the first six of the shuffle, exactly as before', () => {
    const s = stateAt(3), c = poolContent(false), ordered = shuffled(s, c);
    expect(facetAdjustedSlice(s, c, ordered, 6)).toEqual(ordered.slice(0, 6));
  });
  it('on: every non-story slot is kept as shuffled and the story slots keep their count', () => {
    for (let i = 0; i < 60; i++) {
      const s = stateAt(i, heavy), c = poolContent(true), ordered = shuffled(s, c);
      const legacy = ordered.slice(0, 6), adjusted = facetAdjustedSlice(s, c, ordered, 6);
      expect(adjusted.filter(x => x.diagnostic).map(x => x.id).sort()).toEqual(legacy.filter(x => x.diagnostic).map(x => x.id).sort());
      expect(adjusted).toHaveLength(6); expect(new Set(adjusted.map(x => x.id)).size).toBe(6);
    }
  });
  it('on: a work-heavy history brings work scenes more often, but every sphere keeps appearing; an even one changes nothing on average', () => {
    const off = tally(slices(false, heavy)), on = tally(slices(true, heavy));
    const story = (t: Record<string, number>) => FACETS.reduce((a, f) => a + t[f]!, 0);
    expect(on.work! / story(on)).toBeGreaterThan(off.work! / story(off) + .05);
    for (const f of FACETS) expect(on[f]).toBeGreaterThan(0);
    expect(on.neutral).toBe(off.neutral);
    const even = tally(slices(true, historyOf(FACETS.flatMap(f => times(f, 4)))));
    for (const f of FACETS) expect(Math.abs(even[f]! / story(even) - .25)).toBeLessThan(.04);
  });
  it('the same neutral candidates are offered whatever the attention (FACET-2), through prepareEncounter', () => {
    const neutralIds = (on: boolean, history: GameState['history']) => Array.from({ length: 40 }, (_, i) => {
      const s = prepareEncounter(stateAt(i, history), poolContent(on));
      return s.diceHistory.at(-1)?.candidates.filter(id => id.startsWith('n')).sort().join(',');
    });
    const off = neutralIds(false, []);
    expect(off.some(Boolean)).toBe(true);
    expect(neutralIds(true, heavy)).toEqual(off);
    expect(neutralIds(true, historyOf(times('inner', 16)))).toEqual(off);
  });
  it('the direct draw (pool too small for the dice) also follows attention, and keeps the story/neutral split', () => {
    const small = [...FACETS.flatMap(f => [story(`s_${f}_0`, [f]), story(`s_${f}_1`, [f])]), ...Array.from({ length: 2 }, (_, i) => neutral(`n${i}`))];
    const on = withFlag(makeContent({ cards: small }), true), off = withFlag(makeContent({ cards: small }), false);
    const drawn = (c: GameContent) => Array.from({ length: 800 }, (_, i) => drawCard(stateAt(i, heavy), c)!.card);
    const a = drawn(on), b = drawn(off);
    const work = (l: Card[]) => l.filter(x => x.facets![0] === 'work' && !x.diagnostic).length;
    expect(work(a)).toBeGreaterThan(work(b));
    expect(a.filter(x => x.diagnostic).map(x => x.id)).toEqual(b.filter(x => x.diagnostic).map(x => x.id));
    expect(a.filter(x => x.diagnostic).length).toBe(b.filter(x => x.diagnostic).length);
  });
});

describe('facet attention does not touch diagnostics or development', () => {
  const on = withFlag(content, true), off = withFlag(content, false);
  it('FACET-1: the same history and the same diagnostic choices give the same profile', () => {
    const { state } = play(2, { policy: 'mixed' });
    expect(auditProfile(state, on)).toEqual(auditProfile(state, off));
    expect(calculateProfileSlice(state, on, { kind: 'current' })).toEqual(calculateProfileSlice(state, off, { kind: 'current' }));
  });
  it('FACET-1: applying the same neutral choice moves the profile identically with the flag on and off', () => {
    const run = (c: GameContent) => {
      const { state } = play(4, { content: off });
      const { current: _drop, ...rest } = state; void _drop;
      let s: GameState = { ...rest, phase: 'slot', day: Math.min(state.day, 8), slot: 0 };
      const card = c.cards.find(x => x.diagnostic && x.choices.some(y => y.diagnosticAction) && !x.tags?.includes('probe-only'))!;
      s = persistDraw({ ...s, scheduled: [] }, { card, choices: card.choices, text: card.text, source: 'pool' }, c);
      return applyChoice(s, c, card.id, card.choices[0]!.id).heroDevelopmentProfile;
    };
    expect(run(on)).toEqual(run(off));
  });
  it('FACET-3: probe selection does not depend on the attention', () => {
    const { state } = play(3, { content: withFlag(content, true), policy: 'mixed' });
    const inner = { ...state, history: state.history.map(h => ({ ...h, facets: ['inner' as LifeFacet] })) };
    expect(probeScenes(inner, on).map(c => c.id)).toEqual(probeScenes(state, off).map(c => c.id));
    expect(independentPool(inner, on, freePool(inner, on)).map(c => c.id)).toEqual(independentPool(inner, off, freePool(inner, off)).map(c => c.id));
  });
  it('FACET-4 (scenario E): the development scene of the active stage is drawn whatever the attention was', () => {
    const dev = story('dev.pressure', ['work'], { development: { stages: ['expert'] } });
    const base = makeContent({ cards: [dev, ...sphereCards()] });
    const state = (c: GameContent) => ({ c, s: makeState({ history: historyOf(times('inner', 16)) }) });
    for (const flag of [true, false]) {
      const { c, s } = state(withFlag(base, flag));
      const d = drawCard({ ...s, development: { ...s.development, developmentCurrent: 'expert' } }, c)!;
      expect([d.card.id, d.source]).toEqual(['dev.pressure', 'development']);
    }
  });
});

describe('facet attention in a whole run', () => {
  it('is off in the shipped content', () => { expect(content.profile.rollout.facetAttention).toBe(false); });
  it('a full run with the mechanism on completes and keeps every sphere present', () => {
    const seen = { work: 0, relationships: 0, body: 0, inner: 0 };
    for (const seed of [1, 2, 3]) {
      const { state } = play(seed, { content: withFlag(content, true), policy: 'mixed' });
      for (const h of state.history) for (const f of new Set(h.facets ?? [])) seen[f]++;
    }
    for (const f of FACETS) expect(seen[f]).toBeGreaterThan(0);
  });
});
