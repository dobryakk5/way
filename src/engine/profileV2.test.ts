import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { applyChoice } from './apply';
import { drawCard, persistDraw } from './draw';
import { contributionVector, createEmptyHeroDevelopmentProfile, evaluateEvening, isValidEvidenceVector, validateHeroDevelopmentProfile, zeroVector } from './heroDevelopmentProfile';
import { makeCard, makeContent, makeState } from './testUtils';
import type { ActionLogic, Card, Choice, DiagnosticSignalDefinition, HeroDevelopmentProfileEvidence, LifeFacet, LogicVector } from './types';

const v1 = content.profile.algorithms['1']!;
const v2 = content.profile.algorithms['2']!;
const rationale = { SELF: 'a', OTHERS: 'b', COMPLEXITY: 'c', TIME: 'd', PERSPECTIVE: 'e', UNCERTAINTY: 'f' };
const mix = (parts: Partial<Record<ActionLogic, number>>): LogicVector => ({ ...zeroVector(), ...parts });
const signal = (vector: LogicVector): DiagnosticSignalDefinition => ({ vector, rationale, scoringVersion: '1', rubricVersion: '1' });
const closeTo = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('algorithm branch 2: contrast scoring', () => {
  it('keeps branch 1 as it was and adds an immutable branch 2 with its own gates', () => {
    expect(v1.scoring ?? 'full').toBe('full'); expect(v1.stableCandidate.minLeaderShare).toBe(0.3); expect(v1.stableCandidate.minFacetsFirstStable).toBeUndefined();
    expect(v2.scoring).toBe('contrast'); expect(v2.scoringVersion).toBe('2');
    expect([v2.stableCandidate.minLeaderShare, v2.stableCandidate.minDelta, v2.stableCandidate.minConfidence, v2.stableCandidate.minFacetsFirstStable]).toEqual([0.34, 0.1, 0.5, 2]);
  });

  it('contributes only what sets the chosen option apart from the rejected ones', () => {
    const chosen = mix({ expert: 0.6, achiever: 0.25, strategist: 0.15 });
    const rejected = [mix({ opportunist: 0.6, diplomat: 0.15, achiever: 0.25 })];
    // expert 0.6 − 0, achiever 0.25 − 0.25, strategist 0.15 − 0 → normalised 0.8 / 0.2
    const c = contributionVector(v2, chosen, rejected);
    closeTo(c.expert, 0.8); closeTo(c.strategist, 0.2); closeTo(c.achiever, 0); closeTo(c.opportunist, 0);
    expect(contributionVector(v1, chosen, rejected)).toEqual(chosen);
  });

  it('averages several rejected options and falls back to the authored vector when nothing separates them', () => {
    const chosen = mix({ expert: 0.6, achiever: 0.4 });
    const c = contributionVector(v2, chosen, [mix({ expert: 0.6, achiever: 0.4 }), mix({ expert: 0.6, achiever: 0.4 })]);
    expect(c).toEqual(chosen);
    expect(contributionVector(v2, chosen, [])).toEqual(chosen);
    const some = contributionVector(v2, mix({ ironic: 0.6, alchemist: 0.4 }), [mix({ ironic: 0.2, alchemist: 0.8 }), mix({ ironic: 0, opportunist: 1 })]);
    closeTo(some.ironic, 1); expect(Object.values(some).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('accepts a normalised contrast vector as stored evidence only under contrast scoring', () => {
    const single = mix({ ironic: 1 });
    expect(isValidEvidenceVector(single, v2)).toBe(true);
    expect(isValidEvidenceVector(single, v1)).toBe(false);
    expect(isValidEvidenceVector(mix({ ironic: 0.5 }), v2)).toBe(false);
    expect(isValidEvidenceVector({ ...single, extra: 0 }, v2)).toBe(false);
  });

  const choice = (id: string, vector: LogicVector): Choice => ({ id, label: id, effects: {}, servesFacets: ['work'], diagnosticAction: signal(vector) });
  const scene = (): Card => ({ ...makeCard({ id: 'scene', type: 'situation', facets: ['work'] }), choices: [
    choice('A', mix({ opportunist: 0.6, diplomat: 0.15, achiever: 0.25 })), choice('B', mix({ expert: 0.6, achiever: 0.25, strategist: 0.15 })),
    choice('C', mix({ achiever: 0.6, expert: 0.25, strategist: 0.15 })), choice('D', mix({ diplomat: 0.6, expert: 0.25, achiever: 0.15 }))],
    diagnostic: { situationId: 'scene', contextId: 'ctx', facets: ['work'], developmentWeight: 1 } });

  it('stores the contrast of a real decision, replays it in validation and rejects a vector that was altered', () => {
    const data = makeContent({ cards: [scene()], traces: [], profile: { ...content.profile, currentAlgorithmVersion: '2' } });
    const base = makeState({ seed: 4, day: 1, slot: 0 });
    const state = { ...base, heroDevelopmentProfile: createEmptyHeroDevelopmentProfile(data.profile) };
    const shown = persistDraw(state, drawCard(state, data)!, data);
    const after = applyChoice(shown, data, 'scene', 'B');
    const e = after.heroDevelopmentProfile.evidence[0]!;
    // B vs mean(A, C, D): expert 0.6 − 0.0833…, achiever 0.25 − 0.1333…, strategist 0.15 − 0.05 …
    const rejectedMean = (l: ActionLogic) => ['A', 'C', 'D'].reduce((s, id) => s + (scene().choices.find(c => c.id === id)!.diagnosticAction!.vector[l]), 0) / 3;
    const raw = ['expert', 'achiever', 'strategist'].map(l => Math.max(0, (scene().choices[1]!.diagnosticAction!.vector as Record<string, number>)[l]! - rejectedMean(l as ActionLogic)));
    const sum = raw.reduce((a, b) => a + b, 0);
    closeTo(e.vector.expert, raw[0]! / sum); closeTo(e.vector.achiever, raw[1]! / sum); closeTo(e.vector.strategist, raw[2]! / sum);
    expect(e.scoringVersion).toBe('2'); expect(e.algorithmVersion).toBe('2');
    expect(validateHeroDevelopmentProfile(after, data)).toBe(true);
    const tampered = structuredClone(after); tampered.heroDevelopmentProfile.evidence[0]!.vector = mix({ expert: 1 });
    expect(validateHeroDevelopmentProfile(tampered, data)).toBe(false);
  });
});

describe('first stable center needs decisions from at least two life facets (branch 2 only)', () => {
  function ev(i: number, facet: LifeFacet): HeroDevelopmentProfileEvidence {
    return { id: `c${i}#action`, caseId: `c${i}`, situationId: `s${i}`, source: 'action', day: 1 + Math.floor(i / 4), slot: i % 4, cardId: `card${i}`, choiceId: 'A',
      contextId: ['kiln', 'market', 'home', 'river'][i % 4]!, facets: [facet], pressure: false, selectionOrigin: 'neutral', developmentWeight: 1, vector: mix({ expert: 1 }),
      algorithmVersion: '2', scoringVersion: '2', rubricVersion: '1', contentVersion: 'test' };
  }
  const journal = (n: number, facetOf: (i: number) => LifeFacet) => Array.from({ length: n }, (_, i) => ev(i, facetOf(i)));

  it('does not establish a center from a single facet, however clear and long', () => {
    const one = (n: number) => journal(n, () => 'work');
    const first = evaluateEvening(undefined, one(14), 4, undefined, v2);
    const second = evaluateEvening(first, one(18), 5, undefined, v2);
    expect(first.candidatePrimary).toBeUndefined(); expect(second.observedPrimary).toBeUndefined(); expect(second.status).not.toBe('stable');
    // Branch 1 does not have the gate.
    const old = evaluateEvening(evaluateEvening(undefined, one(14), 4, undefined, v1), one(18), 5, undefined, v1);
    expect(old.observedPrimary).toBe('expert');
  });

  it('establishes it when the window spans two facets, and does not ask again for a later update', () => {
    const two = (n: number) => journal(n, i => i % 2 ? 'relationships' : 'work');
    const a = evaluateEvening(undefined, two(14), 4, undefined, v2);
    const b = evaluateEvening(a, two(18), 5, undefined, v2);
    expect(b.observedPrimary).toBe('expert'); expect(b.status).toBe('stable');
    // Once a center exists, a later window from one facet still confirms/keeps it without the facet gate.
    const later = evaluateEvening(b, journal(48, () => 'body'), 8, undefined, v2);
    expect(later.observedPrimary).toBe('expert');
  });
});
