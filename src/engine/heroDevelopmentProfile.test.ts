import { describe, it, expect } from 'vitest';
import { content } from '../content';
import { ACTION_LOGICS } from './constants';
import { applyChoice } from './apply';
import { prepareEvening, leaveEvening } from './day';
import { drawCard, persistDraw } from './draw';
import {
  calculateSlice, derivedProfile, developmentCurrentBefore, evaluateEvening, facetSufficient, firstStageReadiness, developmentScale, largestRemainderPercent, probeAllowed, zeroVector,
  independenceStats, openDiagnosticCase, recordDiagnosticBehavior
} from './heroDevelopmentProfile';
import { answerMotive, skipMotive } from './navigation';
import { makeCard, makeContent, makeState } from './testUtils';
import type { ActionLogic, Card, DiagnosticSelectionOrigin, DiagnosticSignalDefinition, GameState, HeroDevelopmentProfileEvidence, LifeFacet, LogicVector } from './types';

type Ev = HeroDevelopmentProfileEvidence;
const config = content.profile.algorithms['1']!;
const rationale = { SELF: 'a', OTHERS: 'b', COMPLEXITY: 'c', TIME: 'd', PERSPECTIVE: 'e', UNCERTAINTY: 'f' };
function vec(top: ActionLogic, neighbor: ActionLogic, share = 0.7): LogicVector {
  const v = zeroVector(); v[top] = share; v[neighbor] = 1 - share; return v;
}
const signal = (vector: LogicVector): DiagnosticSignalDefinition => ({ vector, rationale, scoringVersion: '1', rubricVersion: '1' });

interface EvOptions { source?: Ev['source']; origin?: DiagnosticSelectionOrigin; weight?: number; facets?: LifeFacet[]; pressure?: boolean; day?: number; slot?: number; vector?: LogicVector }
function evidence(caseId: string, context: string, vector: LogicVector, o: EvOptions = {}): Ev {
  const source = o.source ?? 'action';
  return { id: `${caseId}#${source}`, caseId, situationId: `s-${caseId}`, source, day: o.day ?? 1, slot: o.slot ?? 0, cardId: `card-${caseId}`, choiceId: 'a',
    contextId: context, facets: o.facets ?? ['work'], pressure: o.pressure ?? false, selectionOrigin: o.origin ?? 'neutral', developmentWeight: o.weight ?? 1, vector: o.vector ?? vector,
    algorithmVersion: '1', scoringVersion: '1', rubricVersion: '1', contentVersion: 'test' };
}
const CONTEXTS = ['kiln', 'market', 'home', 'river'];
/** n independent actions: `target` at 0.70 with its neighbour at 0.30, spread across `contexts` contexts. */
function journal(n: number, target: ActionLogic = 'expert', neighbor: ActionLogic = 'achiever', contexts = 4, o: EvOptions = {}, from = 0): Ev[] {
  return Array.from({ length: n }, (_, i) => evidence(`c${from + i}`, CONTEXTS[(from + i) % contexts]!, vec(target, neighbor), { ...o, slot: (from + i) % 4, day: 1 + Math.floor((from + i) / 4) }));
}
const closeTo = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('arithmetic of the profile', () => {
  it('has no distribution and zero confidence when the weight is zero', () => {
    const s = calculateSlice([], config, { kind: 'current' });
    expect(s.distribution).toBeUndefined(); expect(s.confidence).toBe(0); expect(s.W).toBe(0);
    const zero = calculateSlice(journal(3, 'expert', 'achiever', 3, { weight: 0 }), config, { kind: 'current' });
    expect(zero.distribution).toBeUndefined(); expect(zero.confidence).toBe(0);
  });
  it('gives a case weight 0.5 with only an action, 0.8 with a motive, 1.0 with a behavior too', () => {
    const base = [evidence('x', 'kiln', vec('expert', 'achiever'))];
    closeTo(calculateSlice(base, config, { kind: 'current' }).W, 0.5);
    const motive = evidence('x', 'kiln', vec('expert', 'achiever'), { source: 'motive' });
    closeTo(calculateSlice([...base, motive], config, { kind: 'current' }).W, 0.8);
    const behavior = evidence('x', 'kiln', vec('expert', 'achiever'), { source: 'behavior' });
    closeTo(calculateSlice([...base, motive, behavior], config, { kind: 'current' }).W, 1.0);
  });
  it('does not redistribute the coefficient of a skipped motive', () => {
    const only = calculateSlice(journal(2), config, { kind: 'current' });
    closeTo(only.W, 1.0); // 2 × 0.5, not 2 × 0.8
    closeTo(only.distribution!.expert, 0.7);
  });
  it('counts a case once however many sources it has', () => {
    const e = [evidence('x', 'kiln', vec('expert', 'achiever')), evidence('x', 'kiln', vec('expert', 'achiever'), { source: 'motive' }), evidence('x', 'kiln', vec('expert', 'achiever'), { source: 'behavior' })];
    expect(calculateSlice(e, config, { kind: 'current' }).N).toBe(1);
  });
  it('slides the 24-case window by the position of the original action', () => {
    const e = [...journal(24, 'diplomat', 'expert'), ...journal(10, 'strategist', 'alchemist', 4, {}, 24)];
    const s = calculateSlice(e, config, { kind: 'current' });
    expect(s.N).toBe(24); expect(s.caseIds[0]).toBe('c10'); expect(s.caseIds.at(-1)).toBe('c33');
    expect(calculateSlice(e, config, { kind: 'lifetime' }).N).toBe(34);
  });
  it('does not bring a case back into the window with a late motive', () => {
    const e = journal(30);
    const late = [...e, evidence('c0', 'kiln', vec('diplomat', 'opportunist'), { source: 'motive', day: 9 })];
    expect(calculateSlice(late, config, { kind: 'current' }).caseIds).toEqual(calculateSlice(e, config, { kind: 'current' }).caseIds);
    expect(calculateSlice(late, config, { kind: 'current' }).distribution).toEqual(calculateSlice(e, config, { kind: 'current' }).distribution);
    expect(calculateSlice(late, config, { kind: 'lifetime' }).W).toBeGreaterThan(calculateSlice(e, config, { kind: 'lifetime' }).W);
  });
  it('keeps a late adaptive behavior out of the current profile but in the historical one', () => {
    const e = journal(6);
    const adaptiveBehavior = evidence('c0', 'kiln', vec('individualist', 'strategist'), { source: 'behavior', origin: 'adaptive', day: 5 });
    closeTo(calculateSlice([...e, adaptiveBehavior], config, { kind: 'current' }).W, calculateSlice(e, config, { kind: 'current' }).W);
    expect(calculateSlice([...e, adaptiveBehavior], config, { kind: 'lifetime' }).W).toBeGreaterThan(calculateSlice(e, config, { kind: 'lifetime' }).W);
  });
  it('lets adaptive actions into the lifetime distribution only', () => {
    const e = [...journal(6), ...journal(6, 'strategist', 'alchemist', 4, { origin: 'adaptive' }, 6)];
    const lifetime = calculateSlice(e, config, { kind: 'lifetime' }); const current = calculateSlice(e, config, { kind: 'current' });
    expect(lifetime.N).toBe(12); expect(current.N).toBe(6);
    expect(lifetime.distribution!.strategist).toBeGreaterThan(0.2); expect(current.distribution!.strategist).toBe(0);
  });
  it('rounds eight equal shares to 13,13,13,13,12,12,12,12 and always sums to 100', () => {
    const equal = Object.fromEntries(ACTION_LOGICS.map(l => [l, 0.125])) as LogicVector;
    const pct = largestRemainderPercent(equal);
    expect(ACTION_LOGICS.map(l => pct[l])).toEqual([13, 13, 13, 13, 12, 12, 12, 12]);
    const odd = { ...zeroVector(), expert: 0.4137, achiever: 0.3333, diplomat: 0.1529, ironic: 0.1001 };
    expect(Object.values(largestRemainderPercent(odd)).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('cannot reach confidence 0.60 on the minimal N=12, W=5, K=3 even with maximal separation', () => {
    const coverage = 0.35 * (12 / 24) + 0.35 * (5 / 10) + 0.3 * (3 / 4);
    closeTo(coverage, 0.575); expect(coverage).toBeLessThan(config.stableCandidate.minConfidence);
  });
  it('matches the specified example: 12 cases, 4 contexts, 0.70/0.30, action only → W=6, confidence 0.685', () => {
    const s = calculateSlice(journal(12), config, { kind: 'current' });
    closeTo(s.W, 6); closeTo(s.confidence, 0.685); expect(s.K).toBe(4);
  });
});

describe('evening state machine', () => {
  const day = (d: number, e: Ev[], prev?: ReturnType<typeof evaluateEvening>, current?: ActionLogic) => evaluateEvening(prev, e, d, current, config);
  it('does not establish a center after one qualifying evening', () => {
    const s = day(3, journal(12));
    expect(s.candidatePrimary).toBe('expert'); expect(s.observedPrimary).toBeUndefined(); expect(s.status).toBe('provisional');
  });
  it('does not establish a center on a second evening with the same data and no new independent actions', () => {
    const e = journal(12); const first = day(3, e); const second = day(4, e, first);
    expect(second.observedPrimary).toBeUndefined(); expect(second.status).toBe('provisional'); expect(second.candidatePrimary).toBe('expert'); expect(second.candidateSinceDay).toBe(3);
  });
  it('establishes a center when the same candidate holds after at least two new independent actions', () => {
    const first = day(3, journal(12)); const second = day(4, journal(14), first);
    expect(second.observedPrimary).toBe('expert'); expect(second.status).toBe('stable');
    const oneNew = day(4, journal(13), first); expect(oneNew.observedPrimary).toBeUndefined();
  });
  it('counts only independent actions, not a motive or a behavior, toward the new-observation condition', () => {
    const e = journal(12); const first = day(3, e);
    const extra = [evidence('c0', 'kiln', vec('expert', 'achiever'), { source: 'motive' }), evidence('c1', 'market', vec('expert', 'achiever'), { source: 'behavior' }),
      evidence('a1', 'kiln', vec('expert', 'achiever'), { origin: 'adaptive' }), evidence('a2', 'kiln', vec('expert', 'achiever'), { origin: 'adaptive' })];
    expect(day(4, [...e, ...extra], first).observedPrimary).toBeUndefined();
  });
  it('restarts the confirmation when the leader changes', () => {
    const first = day(3, journal(12, 'expert', 'achiever'));
    const e = [...journal(12, 'expert', 'achiever'), ...journal(30, 'diplomat', 'opportunist', 4, {}, 12)];
    const second = day(4, e, first);
    expect(second.candidatePrimary).toBe('diplomat'); expect(second.candidateSinceDay).toBe(4); expect(second.candidateSinceIndependentActionCount).toBe(42); expect(second.observedPrimary).toBeUndefined();
  });
  it('keeps the earlier conclusion as "being refined" and needs a new two-point confirmation to restore it', () => {
    const d3 = day(3, journal(12)); const d4 = day(4, journal(14), d3);
    expect(d4.status).toBe('stable');
    const mixed = [...journal(14), ...journal(8, 'diplomat', 'opportunist', 4, {}, 14), ...journal(8, 'strategist', 'alchemist', 4, {}, 22)];
    const d5 = day(5, mixed, d4);
    expect(d5.candidatePrimary).toBeUndefined(); expect(d5.observedPrimary).toBe('expert'); expect(d5.status).toBe('provisional');
    const back = [...journal(14), ...journal(8, 'diplomat', 'opportunist', 4, {}, 14), ...journal(8, 'strategist', 'alchemist', 4, {}, 22), ...journal(24, 'expert', 'achiever', 4, {}, 30)];
    const d6 = day(6, back, d5);
    expect(d6.candidatePrimary).toBe('expert'); expect(d6.status).toBe('provisional'); // a single evening does not restore it
    const d7 = day(7, [...back, ...journal(2, 'expert', 'achiever', 4, {}, 54)], d6);
    expect(d7.status).toBe('stable');
  });
  it('is insufficient before day 3, with fewer than 5 cases or fewer than 2 contexts', () => {
    expect(day(2, journal(12)).status).toBe('insufficient');
    expect(day(3, journal(4)).status).toBe('insufficient');
    expect(day(3, journal(12, 'expert', 'achiever', 1)).status).toBe('insufficient');
    expect(day(3, journal(12, 'expert', 'achiever', 1)).candidatePrimary).toBeUndefined();
  });
  it('never infers a center from a single context or from adaptive evidence', () => {
    expect(day(4, journal(12, 'expert', 'achiever', 1)).candidatePrimary).toBeUndefined();
    const adaptive = day(4, journal(12, 'expert', 'achiever', 4, { origin: 'adaptive' }));
    expect(adaptive.candidatePrimary).toBeUndefined(); expect(adaptive.status).toBe('insufficient');
  });
  it('does not turn one strong Strategist answer into a center', () => {
    const e = [...journal(11, 'expert', 'achiever'), evidence('s', 'kiln', { ...zeroVector(), strategist: 0.7, alchemist: 0.3 })];
    const s = day(3, e); expect(s.candidatePrimary).toBe('expert');
    expect(day(4, [...e, ...journal(2, 'expert', 'achiever', 4, {}, 20)], s).observedPrimary).toBe('expert');
  });
  it('never reports a fallback equal to or later than the development logic', () => {
    const under = (logic: ActionLogic, cur: ActionLogic) => { const e = journal(12, logic, 'achiever', 4, { pressure: true });
      const a = day(3, e, undefined, cur); return day(4, e, a, cur).fallback; };
    expect(under('diplomat', 'expert')).toBe('diplomat');
    expect(under('expert', 'expert')).toBeUndefined();
    expect(under('strategist', 'expert')).toBeUndefined();
  });
  it('requires two consecutive evenings for a fallback', () => {
    const e = journal(12, 'diplomat', 'opportunist', 4, { pressure: true });
    expect(day(3, e, undefined, 'expert').fallback).toBeUndefined();
    expect(day(3, e, undefined, 'expert').fallbackCandidate).toBe('diplomat');
  });
  it('reports a distant Strategist as an emerging signal, never as the next step', () => {
    const e = [...journal(6, 'expert', 'achiever'), ...journal(6, 'strategist', 'alchemist', 4, {}, 6)];
    const s = day(5, e, undefined, 'expert');
    expect(s.emergingSignals.map(x => x.logic)).toContain('strategist');
    expect(s.leadingEdge).toBeUndefined();
    const state = makeState({ development: { developmentCurrent: 'expert', available: ['expert'], evidence: [], transitions: [], initialRebaseCount: 0 } });
    expect(state.development.transitionTarget).toBeUndefined();
  });
  it('reports the next adjacent logic as a leading edge, not a permission', () => {
    const e = [...journal(8, 'expert', 'achiever'), ...journal(5, 'achiever', 'individualist', 4, {}, 8)];
    const s = day(5, e, undefined, 'expert');
    expect(s.leadingEdge).toBe('achiever');
  });
  it('reconstructs an evening snapshot from its evidence prefix, unaffected by later evidence', () => {
    const e = journal(14); const first = day(3, e.slice(0, 12));
    const frozen = structuredClone(first);
    const later = [...e, evidence('c0', 'kiln', vec('diplomat', 'opportunist'), { source: 'behavior', day: 9 })];
    expect(evaluateEvening(undefined, later.slice(0, first.asOfEvidenceCount), 3, undefined, config)).toEqual(frozen);
    expect(first.asOfEvidenceCount).toBe(12);
  });
});

describe('readiness for the first center', () => {
  const v2 = content.profile.algorithms['2']!;
  const ready = (evidence: Ev[], candidatePrimary?: ActionLogic) =>
    firstStageReadiness({ heroDevelopmentProfile: { algorithmVersion: '2', evidence, ...(candidatePrimary ? { candidatePrimary } : {}) } as GameState['heroDevelopmentProfile'] }, content);
  const twoFacets = (n: number) => journal(n).map((e, i) => ({ ...e, facets: [i % 2 ? 'work' : 'relationships'] as LifeFacet[] }));
  it('counts what the evening criteria still lack', () => {
    const r = ready(twoFacets(8));
    expect(r).toMatchObject({ decisions: 8, neededDecisions: v2.stableCandidate.minCases, enoughDecisions: false, contexts: 4, facets: 2 });
    expect(ready(journal(14)).facets).toBe(1);
  });
  it('names the leader exactly when the evening would take it as a candidate', () => {
    const evidence = twoFacets(14);
    expect(ready(evidence).leader).toBe('expert');
    expect(evaluateEvening(undefined, evidence, 4, undefined, v2).candidatePrimary).toBe('expert');
    const mixed = evidence.map((e, i) => i % 2 ? e : { ...e, vector: vec('diplomat', 'opportunist') });
    expect(ready(mixed).leader).toBeUndefined();
    expect(evaluateEvening(undefined, mixed, 4, undefined, v2).candidatePrimary).toBeUndefined();
    expect(ready(evidence, 'expert').candidate).toBe('expert');
  });
});

describe('development scale', () => {
  const scale = (evidence: Ev[], snapshotAt?: number) => developmentScale({ heroDevelopmentProfile: { algorithmVersion: '2', evidence,
    eveningSnapshots: snapshotAt === undefined ? [] : [{ asOfEvidenceCount: snapshotAt }] } as unknown as GameState['heroDevelopmentProfile'] }, content);
  const pure = (l: ActionLogic) => { const v = zeroVector(); v[l] = 1; return v; };
  it('runs from 0 at the first logic to 1 at the last and has nothing to show without decisions', () => {
    expect(scale([])).toBeUndefined();
    closeTo(scale(journal(3, 'opportunist', 'diplomat', 4, { vector: pure('opportunist') }))!.position, 0);
    closeTo(scale(journal(3, 'ironic', 'alchemist', 4, { vector: pure('ironic') }))!.position, 1);
  });
  it('follows recent decisions much faster than the window average, and remembers the last evening', () => {
    const old = journal(12, 'expert', 'achiever', 4, { vector: pure('expert') });
    const recent = journal(3, 'strategist', 'alchemist', 4, { vector: pure('strategist') }, 12);
    const s = scale([...old, ...recent], old.length)!;
    const average = (12 * 2 + 3 * 5) / 15 / 7;
    expect(s.position).toBeGreaterThan(average + 0.1);
    closeTo(s.previousPosition!, 2 / 7);
  });
  it('ignores adaptive decisions', () => {
    const own = journal(4, 'expert', 'achiever', 4, { vector: pure('expert') });
    const adaptive = journal(4, 'ironic', 'alchemist', 4, { vector: pure('ironic'), origin: 'adaptive' }, 4);
    closeTo(scale([...own, ...adaptive])!.position, 2 / 7);
  });
});

describe('slices of life facets', () => {
  it('splits a two-facet case between facets without doubling the general profile', () => {
    const e = journal(8, 'expert', 'achiever', 4, { facets: ['work', 'relationships'] });
    const general = calculateSlice(e, config, { kind: 'current' });
    const work = calculateSlice(e, config, { kind: 'facet', facet: 'work', window: 'current' });
    const relationships = calculateSlice(e, config, { kind: 'facet', facet: 'relationships', window: 'current' });
    closeTo(work.W, general.W / 2); closeTo(relationships.W, general.W / 2); expect(work.N).toBe(8);
    closeTo(general.W, 4);
  });
  it('uses its own targets: a small facet subset can be sufficient while the same numbers would be tiny against N=24', () => {
    const e = journal(4, 'expert', 'achiever', 2, { weight: 1 });
    const slice = calculateSlice(e, config, { kind: 'facet', facet: 'work', window: 'current' });
    expect(slice.N).toBe(4); expect(slice.W).toBe(2);
    expect(facetSufficient(slice, config)).toBe(true); // W=2 ≥ 1.5, K=2, confidence ≥ 0.45
    const generalConfidence = calculateSlice(e, config, { kind: 'current' }).confidence;
    expect(generalConfidence).toBeLessThan(config.facetConfidence.minConfidence);
    expect(facetSufficient(calculateSlice(journal(3, 'expert', 'achiever', 2), config, { kind: 'facet', facet: 'work', window: 'current' }), config)).toBe(false);
  });
  it('builds the facet slice from the common window, not from its own last 24', () => {
    const e = [...journal(30, 'expert', 'achiever', 4, { facets: ['body'] }), ...journal(24, 'diplomat', 'expert', 4, { facets: ['work'] }, 30)];
    const body = calculateSlice(e, config, { kind: 'facet', facet: 'body', window: 'current' });
    expect(body.N).toBe(0); expect(derivedProfile(e, config).facets.body.sufficient).toBe(false);
  });
});

describe('probe quota', () => {
  it('allows at most one probe before three independent cases, then at most one third', () => {
    expect(probeAllowed({ independentCases: 0, probeCases: 0 }, config)).toBe(true);
    expect(probeAllowed({ independentCases: 2, probeCases: 1 }, config)).toBe(false);
    expect(probeAllowed({ independentCases: 8, probeCases: 2 }, config)).toBe(true); // 3/9
    expect(probeAllowed({ independentCases: 8, probeCases: 3 }, config)).toBe(false); // 4/9 > 1/3
    expect(probeAllowed({ independentCases: 23, probeCases: 7 }, config)).toBe(true); // exactly one third afterwards
    expect(probeAllowed({ independentCases: 23, probeCases: 8 }, config)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// State-level behavior over a small authored world
// ---------------------------------------------------------------------------------------------
function diagCard(id: string, situationId: string, o: { at: { day: number; slot: number }; motive?: boolean; behaviorOf?: string; context?: string; expires?: number; facets?: LifeFacet[]; pressure?: boolean }): Card {
  const action = signal(vec('expert', 'achiever'));
  const other = signal(vec('diplomat', 'opportunist'));
  const motive = { promptId: `${id}-why`, text: 'Что было главным?', optional: true as const, options: [{ id: 'm1', label: 'Качество', signal: signal(vec('expert', 'individualist')) }, { id: 'm2', label: 'Договорённость', signal: signal(vec('diplomat', 'achiever')) }] };
  const behavior = o.behaviorOf ? { continuesSituationId: o.behaviorOf, signal: signal(vec('achiever', 'expert')) } : undefined;
  return makeCard({ id, type: 'situation', at: o.at, diagnostic: { situationId, contextId: o.context ?? 'kiln', facets: o.facets ?? ['work'], developmentWeight: 1, ...(o.pressure ? { pressure: true } : {}), ...(o.expires ? { expiresInDays: o.expires } : {}) },
    choices: [{ id: 'a', label: 'A', effects: {}, ...(behavior ? { diagnosticBehavior: behavior } : { diagnosticAction: action }), ...(o.motive ? { diagnosticMotive: motive } : {}) },
      { id: 'b', label: 'B', effects: {}, ...(behavior ? { diagnosticBehavior: behavior } : { diagnosticAction: other }) }] });
}
const world = (cards: Card[]) => makeContent({ cards });
function at(state: GameState, day: number, slot: number): GameState { return { ...state, day, slot, phase: 'slot' }; }
function show(state: GameState, c: ReturnType<typeof world>) { return persistDraw(state, drawCard(state, c)!, c); }
function choose(state: GameState, c: ReturnType<typeof world>, choiceId = 'a') { const shown = show(state, c); return applyChoice(shown, c, shown.current!.cardId, choiceId); }

describe('registration of actions, motives and behavior', () => {
  const c = world([diagCard('m1', 's-m1', { at: { day: 1, slot: 0 }, motive: true }), diagCard('m2', 's-m2', { at: { day: 1, slot: 1 }, motive: true })]);
  it('stops on a motive question without advancing the slot, and the answer advances it exactly once', () => {
    const asked = choose(makeState(), c);
    expect(asked.phase).toBe('motive'); expect(asked.slot).toBe(0); expect(asked.history).toHaveLength(1); expect(asked.pendingMotive?.options.map(o => o.id)).toEqual(['m1', 'm2']);
    expect(asked.heroDevelopmentProfile.evidence.map(e => e.source)).toEqual(['action']);
    const answered = answerMotive(asked, c, 'm1');
    expect(answered.slot).toBe(1); expect(answered.phase).toBe('slot'); expect(answered.pendingMotive).toBeUndefined();
    expect(answered.heroDevelopmentProfile.evidence.map(e => e.source)).toEqual(['action', 'motive']);
    expect(answerMotive(answered, c, 'm1')).toBe(answered); // a stale handler is harmless
  });
  it('records different evidence for the same action with a different motive', () => {
    const asked = choose(makeState(), c);
    const a = answerMotive(asked, c, 'm1').heroDevelopmentProfile.evidence[1]!; const b = answerMotive(asked, c, 'm2').heroDevelopmentProfile.evidence[1]!;
    expect(a.vector).not.toEqual(b.vector); expect(a.choiceId).toBe(b.choiceId);
  });
  it('skipping a motive creates no evidence and guesses nothing', () => {
    const skipped = skipMotive(choose(makeState(), c), c);
    expect(skipped.heroDevelopmentProfile.evidence).toHaveLength(1); expect(skipped.heroDevelopmentProfile.cases[0]!.motiveState).toBe('skipped'); expect(skipped.slot).toBe(1);
  });
  it('shows at most one motive question per day; the later one is suppressed without evidence', () => {
    const afterFirst = skipMotive(choose(makeState(), c), c);
    const second = choose(afterFirst, c);
    expect(second.phase).toBe('slot'); expect(second.heroDevelopmentProfile.cases[1]!.motiveState).toBe('suppressed');
    expect(second.heroDevelopmentProfile.evidence.filter(e => e.source === 'motive')).toHaveLength(0); expect(second.pendingMotive).toBeUndefined();
    const nextDay = choose(at(afterFirst, 2, 0), world([diagCard('m3', 's-m3', { at: { day: 2, slot: 0 }, motive: true })]));
    expect(nextDay.phase).toBe('motive');
  });
  it('rejects an option that was never offered', () => {
    expect(() => answerMotive(choose(makeState(), c), c, 'nope')).toThrow();
  });
  it('is idempotent for the same decision', () => {
    const shown = show(makeState(), c); const card = c.cards[0]!;
    const once = openDiagnosticCase(shown, c, card, card.choices[0]!, 'neutral');
    expect(openDiagnosticCase(once, c, card, card.choices[0]!, 'neutral')).toBe(once);
  });
});

describe('follow-up behavior', () => {
  const cards = [diagCard('open', 'meeting', { at: { day: 1, slot: 0 }, expires: 2 }), diagCard('after', 's-after', { at: { day: 3, slot: 3 }, behaviorOf: 'meeting' })];
  const c = world(cards);
  it('accepts behavior in the last slot of the final day, and then the case expires in the evening', () => {
    let s = choose(makeState(), c);
    expect(s.heroDevelopmentProfile.cases[0]!.behaviorState).toBe('pending'); expect(s.heroDevelopmentProfile.cases[0]!.expiresDay).toBe(3);
    s = at(s, 3, 3);
    s = choose(s, c);
    const caseAfter = s.heroDevelopmentProfile.cases[0]!;
    expect(caseAfter.behaviorState).toBe('recorded'); expect(caseAfter.status).toBe('complete');
    const behavior = s.heroDevelopmentProfile.evidence.find(e => e.source === 'behavior')!;
    expect(behavior.day).toBe(3); expect(behavior.slot).toBe(3); expect(behavior.contextId).toBe('kiln'); expect(behavior.developmentWeight).toBe(1);
    expect(s.heroDevelopmentProfile.cases).toHaveLength(1); // the follow-up did not open a case of its own
    // Not taken: the window closes only at that evening.
    let open = at(choose(makeState(), c), 3, 3); open = { ...open, phase: 'evening' };
    expect(open.heroDevelopmentProfile.cases[0]!.behaviorState).toBe('pending');
    const night = prepareEvening(open, c);
    expect(night.heroDevelopmentProfile.cases[0]!.behaviorState).toBe('expired'); expect(night.heroDevelopmentProfile.cases[0]!.status).toBe('expired');
  });
  it('treats a follow-up without an open case as an ordinary decision', () => {
    const s = choose(at(makeState(), 3, 3), c);
    expect(s.heroDevelopmentProfile.evidence).toHaveLength(0); expect(s.history).toHaveLength(1);
  });
  it('after expiry a late follow-up no longer attaches', () => {
    let s = choose(makeState(), c); s = leaveEvening(prepareEvening({ ...at(s, 3, 3), phase: 'evening' }, c), c);
    const late = choose({ ...at(s, 4, 0), preparedEveningDay: 3 }, world([diagCard('open', 'meeting', { at: { day: 1, slot: 0 }, expires: 2 }), diagCard('after', 's-after', { at: { day: 4, slot: 0 }, behaviorOf: 'meeting' })]));
    expect(late.heroDevelopmentProfile.evidence.filter(e => e.source === 'behavior')).toHaveLength(0);
  });
  it('picks the most recent open case deterministically if content is ambiguous, without failing', () => {
    const twin = [diagCard('o1', 'meeting', { at: { day: 1, slot: 0 } }), diagCard('o2', 'meeting', { at: { day: 1, slot: 1 } }), cards[1]!];
    const w = world(twin);
    let s = choose(makeState(), w); s = choose(s, w);
    expect(s.heroDevelopmentProfile.cases.map(x => x.cardId)).toEqual(['o1', 'o2']);
    const shown = show(at(s, 3, 3), w);
    const warn = console.warn; console.warn = () => undefined;
    const after = recordDiagnosticBehavior(shown, w, w.cards[2]!, w.cards[2]!.choices[0]!, 'neutral'); console.warn = warn;
    expect(after.heroDevelopmentProfile.cases.find(x => x.cardId === 'o2')!.behaviorState).toBe('recorded');
    expect(after.heroDevelopmentProfile.cases.find(x => x.cardId === 'o1')!.behaviorState).toBe('pending');
  });
  it('gives behavior the context, weight and facets of the original case and its own selection origin', () => {
    const w = world([diagCard('open', 'meeting', { at: { day: 1, slot: 0 }, context: 'market', facets: ['relationships'], pressure: true }), cards[1]!]);
    const s = choose(at(choose(makeState(), w), 3, 3), w);
    const e = s.heroDevelopmentProfile.evidence.find(x => x.source === 'behavior')!;
    expect(e.contextId).toBe('market'); expect(e.facets).toEqual(['relationships']); expect(e.pressure).toBe(true);
  });
});

describe('selection origin and the evening commit', () => {
  it('freezes the origin of the shown scene in the saved current card', () => {
    const c = world([diagCard('m1', 's-m1', { at: { day: 1, slot: 0 } })]);
    const shown = show(makeState(), c);
    expect(shown.current!.selectionOrigin).toBe('neutral');
    const gated = world([{ ...diagCard('g', 's-g', { at: { day: 1, slot: 0 } }), development: { stages: ['expert'] } }]);
    expect(show(makeState({ development: { developmentCurrent: 'expert', available: ['expert'], evidence: [], transitions: [], initialRebaseCount: 0 } }), gated).current!.selectionOrigin).toBe('adaptive');
  });
  it('records an adaptive action as adaptive evidence', () => {
    const gated = world([{ ...diagCard('g', 's-g', { at: { day: 1, slot: 0 } }), development: { stages: ['expert'] } }]);
    const s = choose(makeState({ development: { developmentCurrent: 'expert', available: ['expert'], evidence: [], transitions: [], initialRebaseCount: 0 } }), gated);
    expect(s.heroDevelopmentProfile.evidence[0]!.selectionOrigin).toBe('adaptive');
    expect(s.heroDevelopmentProfile.currentDistribution).toBeUndefined(); expect(s.heroDevelopmentProfile.lifetimeDistribution).toBeDefined();
  });
  it('processes the same evening only once', () => {
    const c = world([diagCard('m1', 's-m1', { at: { day: 1, slot: 0 } })]);
    const s = { ...choose(makeState(), c), phase: 'evening' as const };
    const night = prepareEvening(s, c);
    expect(prepareEvening(night, c)).toBe(night);
    expect(night.heroDevelopmentProfile.eveningSnapshots).toHaveLength(1);
    expect(leaveEvening(night, c).heroDevelopmentProfile.eveningSnapshots).toHaveLength(1);
  });
  it('knows the development logic as it was at the start of each evening', () => {
    const d = { developmentCurrent: 'achiever' as const, currentOrigin: 'promotion' as const, initialStage: { logic: 'expert' as const, origin: 'observed-initial' as const, day: 6, available: ['expert' as const] },
      available: ['expert' as const, 'achiever' as const], evidence: [], transitions: [{ arcId: 'expert-achiever', from: 'expert' as const, to: 'achiever' as const, day: 25, evidenceIds: [] }], initialRebaseCount: 0 as const };
    expect(developmentCurrentBefore({ development: d }, 6)).toBeUndefined();
    expect(developmentCurrentBefore({ development: d }, 7)).toBe('expert');
    expect(developmentCurrentBefore({ development: d }, 25)).toBe('expert');
    expect(developmentCurrentBefore({ development: d }, 26)).toBe('achiever');
  });
  it('counts independent cases for the probe quota from the independent window only', () => {
    const e = [...journal(6), ...journal(4, 'expert', 'achiever', 4, { origin: 'probe' }, 6), ...journal(5, 'expert', 'achiever', 4, { origin: 'adaptive' }, 10)];
    const state = makeState(); state.heroDevelopmentProfile = { ...state.heroDevelopmentProfile, evidence: e };
    const stats = independenceStats(state, makeContent());
    expect(stats.independentCases).toBe(10); expect(stats.probeCases).toBe(4);
  });
});
