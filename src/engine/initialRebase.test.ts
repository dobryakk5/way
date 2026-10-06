import { describe, expect, it } from 'vitest';
import { play } from '../../scripts/play';
import { leaning } from '../../scripts/profile-scenarios';
import { content } from '../content';
import { initialRebaseTarget, rebaseInitialDevelopment, validateDevelopmentEvidence } from './development';
import { makeState } from './testUtils';
import type { ActionLogic, DevelopmentEvidence, GameContent, GameState } from './types';

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

  // The shipped diagnostic pool (32 scenes) is used up around the time a center forms, so a hero who changes course afterwards has too few
  // new decisions to be re-read in time. These runs use a pool of three copies of it (same vectors, other ids) to exercise the whole path.
  const pool = [1, 2].flatMap(k => content.cards.filter(c => c.id.startsWith('neutral.') && c.type === 'situation').map(c => {
    const copy = structuredClone(c); copy.id = `${c.id}~${k}`; copy.diagnostic!.situationId = `${c.diagnostic!.situationId}~${k}`; delete copy.requires;
    for (const ch of copy.choices) delete ch.effects.schedule; return copy;
  }));
  const big = { ...content, cards: [...content.cards, ...pool] } as GameContent;
  const motiveFor = (logic: ActionLogic) => (s: GameState) => {
    const h = s.history.at(-1)!; const options = big.cards.find(c => c.id === h.cardId)!.choices.find(c => c.id === h.choiceId)!.diagnosticMotive!.options;
    return [...options].sort((x, y) => y.signal.vector[logic] - x.signal.vector[logic])[0]!.id;
  };
  const switching = (seed: number, a: ActionLogic, b: ActionLogic) => {
    const first = leaning(a, 0.05), second = leaning(b, 0.05);
    return play(seed, { content: big, pick: (s, d) => (s.development.developmentCurrent ? second : first).pick!(s, d), pickMotive: s => motiveFor(s.development.developmentCurrent ? b : a)(s) }).state;
  };

  // Which seed corrects a center depends on the whole draw sequence, so the runs are found rather than hard-coded.
  const find = (a: ActionLogic, b: ActionLogic, ok: (g: GameState) => boolean) => {
    for (let seed = 1; seed <= 24; seed++) { const g = switching(seed, a, b); if (ok(g)) return g; }
    throw new Error(`no run corrects ${a} → ${b} in 24 seeds`);
  };
  const corrected = (g: GameState) => g.development.initialRebaseCount === 1 && g.development.transitions.some(t => t.reason === 'initial-reconciliation');

  it('corrects a real run (opportunist first, then diplomatic decisions) and the saved state replays and validates', () => {
    const game = find('opportunist', 'diplomat', corrected);
    expect(game.development.initialRebaseCount).toBe(1);
    const rebase = game.development.transitions.filter(t => t.reason === 'initial-reconciliation');
    expect(rebase).toHaveLength(1); expect(rebase[0]).toMatchObject({ from: 'opportunist', to: 'diplomat', evidenceIds: [] });
    expect(game.development.developmentCurrent).toBe('diplomat'); expect(game.development.available).toEqual(['diplomat']);
    expect(validateDevelopmentEvidence(game, big)).toBe(true);
  });

  it('a corrected center can still be promoted later, and nothing else rebases it again', () => {
    const game = find('diplomat', 'expert', g => corrected(g) && g.development.transitions.length === 2);
    expect(game.development.initialRebaseCount).toBe(1);
    expect(game.development.transitions.map(t => t.reason ?? 'promotion')).toEqual(['initial-reconciliation', 'promotion']);
    expect(game.development.currentOrigin).toBe('promotion');
    expect(validateDevelopmentEvidence(game, big)).toBe(true);
  });

  it('refuses a state whose correction is unsupported by the profile or by the evidence', () => {
    const game = find('opportunist', 'diplomat', corrected);
    const wrongTarget = structuredClone(game); wrongTarget.development.transitions.find(t => t.reason)!.to = 'strategist';
    expect(validateDevelopmentEvidence(wrongTarget, big)).toBe(false);
    const second = structuredClone(game); second.development.initialRebaseCount = 0;
    expect(validateDevelopmentEvidence(second, big)).toBe(false);
    const forged = structuredClone(game); forged.development.transitions.find(t => t.reason)!.day = 3;
    expect(validateDevelopmentEvidence(forged, big)).toBe(false);
  });
});
