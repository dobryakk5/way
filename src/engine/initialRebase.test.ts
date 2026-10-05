import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { play } from '../../scripts/play';
import { leaning } from '../../scripts/profile-scenarios';
import { content } from '../content';
import { validateSave } from '../persistence/save';
import { initialRebaseTarget, rebaseInitialDevelopment } from './development';
import { makeState } from './testUtils';
import type { ActionLogic, DevelopmentEvidence, GameState } from './types';

const ev = (eventId: string, kind: DevelopmentEvidence['kind']): DevelopmentEvidence =>
  ({ eventId, arcId: 'expert-achiever', contextId: 'kiln', kind, day: 8, slot: 1, cardId: 'x', choiceId: 'b' });
/** A run standing on an `observed-initial` center while the profile now confirms another one. */
function standing(over: { current?: ActionLogic; observed?: ActionLogic; status?: 'stable' | 'provisional'; origin?: 'observed-initial' | 'promotion' | 'legacy-authored';
  count?: 0 | 1; evidence?: DevelopmentEvidence[]; pending?: boolean } = {}): GameState {
  const current = over.current ?? 'expert';
  const arc = content.development.arcs.find(a => a.from === current);
  const base = makeState({ day: 14 });
  return { ...base,
    development: { developmentCurrent: current, currentOrigin: over.origin ?? 'observed-initial', initialStage: { logic: current, origin: 'observed-initial', day: 6, available: [current] }, available: [current],
      evidence: over.evidence ?? [], transitions: [], initialRebaseCount: over.count ?? 0, ...(arc ? { activeArcId: arc.id, transitionTarget: arc.to } : {}),
      ...(over.pending && arc ? { pendingPromotion: { arcId: arc.id, to: arc.to } } : {}) },
    heroDevelopmentProfile: { ...base.heroDevelopmentProfile, status: over.status ?? 'stable', observedPrimary: over.observed ?? 'diplomat' } };
}

describe('single correction of a wrong first center (initial rebase)', () => {
  it('is allowed before the first consequence — a trial alone does not block it', () => {
    const s = standing({ evidence: [ev('cycle-17-trial', 'trial')] });
    expect(initialRebaseTarget(s)).toBe('diplomat');
    const r = rebaseInitialDevelopment(s, content).development;
    expect(r.developmentCurrent).toBe('diplomat'); expect(r.currentOrigin).toBe('observed-initial'); expect(r.initialRebaseCount).toBe(1);
    expect(r.available).toEqual(['diplomat']); expect(r.pendingPromotion).toBeUndefined();
    expect(r.transitions).toEqual([{ arcId: 'expert-achiever', from: 'expert', to: 'diplomat', day: 14, evidenceIds: [], reason: 'initial-reconciliation' }]);
    // The old arc's evidence stays in the history but belongs to a closed arc; the diplomat has no written arc yet.
    expect(r.evidence).toHaveLength(1); expect(r.activeArcId).toBeUndefined(); expect(r.transitionTarget).toBeUndefined();
  });

  it('starts the adjacent arc of the corrected center when one exists', () => {
    const r = rebaseInitialDevelopment(standing({ current: 'diplomat', observed: 'expert' }), content).development;
    expect(r.developmentCurrent).toBe('expert'); expect(r.activeArcId).toBe('expert-achiever'); expect(r.transitionTarget).toBe('achiever');
    expect(r.transitions[0]).toMatchObject({ arcId: 'initial:diplomat', from: 'diplomat', to: 'expert', reason: 'initial-reconciliation' });
  });

  it.each([
    ['after the first consequence', standing({ evidence: [ev('cycle-17-trial', 'trial'), ev('cycle-17-result', 'consequence')] })],
    ['after a review', standing({ evidence: [ev('cycle-17-review', 'review')] })],
    ['after a transfer', standing({ evidence: [ev('cycle-22-transfer', 'transfer')] })],
    ['under pressure', standing({ evidence: [ev('cycle-28-pressure', 'pressure')] })],
    ['after a promotion', standing({ origin: 'promotion' })],
    ['for a legacy-authored hero', standing({ origin: 'legacy-authored' })],
    ['when the new primary is not stable yet', standing({ status: 'provisional' })],
    ['a second time', standing({ count: 1 })],
    ['while a promotion is pending', standing({ pending: true })],
    ['when the observed center is the current one', standing({ observed: 'expert' })]
  ])('is forbidden %s', (_name, state) => {
    expect(initialRebaseTarget(state)).toBeUndefined();
    expect(rebaseInitialDevelopment(state, content)).toBe(state);
  });

  const switching = (seed: number, a: ActionLogic, b: ActionLogic) => {
    const first = leaning(a, 0.05), second = leaning(b, 0.05);
    return play(seed, { pick: (s, d) => (s.development.developmentCurrent ? second : first).pick!(s, d), pickMotive: s => (s.development.developmentCurrent ? second : first).pickMotive!(s) }).state;
  };

  it('corrects a real run (expert first, then diplomatic decisions) and the saved state replays and validates', () => {
    const game = switching(2, 'expert', 'diplomat');
    expect(game.development.initialRebaseCount).toBe(1);
    expect(game.development.developmentCurrent).toBe('diplomat');
    const rebase = game.development.transitions.filter(t => t.reason === 'initial-reconciliation');
    expect(rebase).toHaveLength(1); expect(rebase[0]).toMatchObject({ from: 'expert', to: 'diplomat', evidenceIds: [] });
    expect(game.development.available).toEqual(['diplomat']);
    expect(validateSave({ schema: 1, started: true, game })).toBeDefined();
  });

  it('a corrected center can still be promoted later, and nothing else rebases it again', () => {
    const game = switching(2, 'diplomat', 'expert');
    expect(game.development.initialRebaseCount).toBe(1);
    expect(game.development.transitions.map(t => t.reason ?? 'promotion')).toEqual(['initial-reconciliation', 'promotion']);
    expect(game.development.developmentCurrent).toBe('achiever'); expect(game.development.currentOrigin).toBe('promotion');
    expect(validateSave({ schema: 1, started: true, game })).toBeDefined();
  });

  it('refuses a save whose correction is unsupported by the profile or by the evidence', () => {
    const game = switching(2, 'expert', 'diplomat');
    const wrongTarget = structuredClone(game); wrongTarget.development.transitions.find(t => t.reason)!.to = 'strategist';
    expect(validateSave({ schema: 1, started: true, game: wrongTarget })).toBeUndefined();
    const second = structuredClone(game); second.development.initialRebaseCount = 0;
    expect(validateSave({ schema: 1, started: true, game: second })).toBeUndefined();
    const forged = structuredClone(game); forged.development.transitions.find(t => t.reason)!.day = 3;
    expect(validateSave({ schema: 1, started: true, game: forged })).toBeUndefined();
  });
});
