import { describe, it, expect } from 'vitest';
import { content } from '../content';
import { playLeaning, leaning, profileSummary } from '../../scripts/profile-scenarios';
import { DEVELOPMENT_SCENARIOS } from '../../scripts/development-scenarios';
import { play } from '../../scripts/play';
import { validateSave, migrateSave } from '../persistence/save';
import legacyV4 from '../persistence/legacy-v4.json';
import { createInitialGameState, drawCard, persistDraw, prepareEvening, leaveEvening, applyChoice, startEpisode, chooseGoal, beginSlots, answerMotive, skipMotive, diagnosticCaseId } from './index';
import type { ActionLogic, GameContent, GameState } from './index';
const envelope = (game: GameState) => ({ schema: 1, started: true, game });
const adaptiveContent: GameContent = { ...content, profile: { ...content.profile, rollout: { adaptiveSelection: true, developmentArcs: false, facetAttention: false } } };

describe('a new hero', () => {
  it('has no stage, no available logics and no observations', () => {
    const s = createInitialGameState(1);
    expect(s.development).toEqual({ available: [], evidence: [], transitions: [], initialRebaseCount: 0 });
    expect(s.heroDevelopmentProfile.evidence).toEqual([]); expect(s.heroDevelopmentProfile.currentDistribution).toBeUndefined(); expect(s.heroDevelopmentProfile.status).toBe('insufficient');
  });
  it('is not given the Expert (or any stage) by the production start', () => {
    const fresh = chooseGoal(startEpisode(content, 5, 'x'), content, 'order', 'select');
    expect(fresh.development.developmentCurrent).toBeUndefined(); expect(fresh.development.available).toEqual([]); expect(fresh.development.activeArcId).toBeUndefined();
  });
  it('does not take a center from a single strong answer', () => {
    let s = beginSlots(chooseGoal(startEpisode(content, 3, 'one'), content, 'order', 'select'), content);
    const draw = drawCard(s, content)!; s = persistDraw(s, draw, content);
    const choice = draw.choices.reduce((a, b) => (b.diagnosticAction?.vector.strategist ?? 0) > (a.diagnosticAction?.vector.strategist ?? 0) ? b : a);
    s = applyChoice(s, content, draw.card.id, choice.id);
    expect(s.heroDevelopmentProfile.observedPrimary).toBeUndefined(); expect(s.development.developmentCurrent).toBeUndefined();
  });
});

describe('establishing the first center from real decisions', () => {
  for (const logic of ['opportunist', 'diplomat', 'expert', 'achiever'] as ActionLogic[]) {
    it(`a consistent ${logic} becomes its own first center, and the stage is not promoted that night`, () => {
      let established = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const { state } = playLeaning(seed, logic, 0.1);
        const d = state.development; const first = state.heroDevelopmentProfile.eveningSnapshots.find(s => s.observedPrimary);
        if (!first) continue; established++;
        expect(first.observedPrimary).toBe(logic); expect(d.initialStage).toMatchObject({ logic, origin: 'observed-initial', day: first.day });
        expect(d.available[0]).toBe(logic); expect(d.transitions.every(t => t.day > first.day)).toBe(true);
        expect(d.evidence.every(e => e.day > first.day)).toBe(true);
        expect(validateSave(envelope(state))).toBeDefined();
      }
      expect(established).toBeGreaterThanOrEqual(5);
    });
  }
  it('random play does not produce a stable center', () => {
    for (let seed = 1; seed <= 12; seed++) expect(profileSummary(play(seed, { policy: 'random' }).state).status).not.toBe('stable');
  });
  it('requires two evenings and two new independent actions between them', () => {
    const { state } = playLeaning(2, 'expert', 0.1); const p = state.heroDevelopmentProfile;
    const cand = p.eveningSnapshots.find(s => s.candidatePrimary)!; const stable = p.eveningSnapshots.find(s => s.status === 'stable')!;
    expect(stable.day).toBeGreaterThan(cand.day);
    expect(stable.current.N - 0).toBeGreaterThanOrEqual(12);
    const independent = (n: number) => p.evidence.slice(0, n).filter(e => e.source === 'action' && e.selectionOrigin !== 'adaptive').length;
    expect(independent(stable.asOfEvidenceCount) - cand.candidateSinceIndependentActionCount!).toBeGreaterThanOrEqual(2);
  });
  it('the expert → achiever arc still needs real experience and does not change the diagnostic numbers', () => {
    const { state } = play(3, { ...leaning('expert', 0.1), choices: DEVELOPMENT_SCENARIOS.grow!.choices! });
    expect(state.development.transitions).toHaveLength(1); expect(state.development.currentOrigin).toBe('promotion'); expect(state.development.available).toEqual(['expert', 'achiever']);
    const t = state.development.transitions[0]!;
    expect(t.evidenceIds).toContain('cycle-20-review');
    // The night that commits the transition changes the stage, not a single diagnostic number.
    let eve: GameState | undefined;
    play(3, { ...leaning('expert', 0.1), choices: DEVELOPMENT_SCENARIOS.grow!.choices!, beforeStep: s => { if (!eve && s.phase === 'evening' && s.day === t.day) eve = structuredClone(s); return s; } });
    const night = prepareEvening(eve!, content);
    expect(night.development.transitions).toHaveLength(1); expect(eve!.development.transitions).toHaveLength(0);
    const pick = (g: GameState) => ({ e: g.heroDevelopmentProfile.evidence, c: g.heroDevelopmentProfile.currentDistribution, l: g.heroDevelopmentProfile.lifetimeDistribution });
    expect(pick(night)).toEqual(pick(eve!));
    // The same decisions without the arc scenes' special answers leave the same hero in the same stage without promotion.
    const control = play(3, { ...leaning('expert', 0.1), choices: DEVELOPMENT_SCENARIOS.control!.choices! });
    expect(control.state.development.transitions).toHaveLength(0); expect(control.state.development.developmentCurrent).toBe('expert');
  });
});

describe('saves under the strict v5 validation, on real play', () => {
  it('every phase of a played run restores exactly, including the motive question, candidate evenings and the first stage', () => {
    const captured: GameState[] = []; let n = 0;
    const out = play(2, { ...leaning('expert', 0.1), beforeStep: s => {
      const keep = s.phase === 'motive' || s.phase === 'evening' || s.phase === 'dice' || (n++ % 4 === 0);
      if (keep) captured.push(structuredClone(s.phase === 'slot' ? persistDraw(s, drawCard(s, content)!, content) : s.phase === 'evening' ? prepareEvening(s, content) : s)); return s; } });
    captured.push(out.state);
    const phases = new Set(captured.map(s => s.phase));
    for (const p of ['motive', 'evening', 'slot', 'morning']) expect(phases.has(p as GameState['phase']), p).toBe(true);
    for (const s of captured) expect(validateSave(envelope(structuredClone(s)))?.game, `${s.phase} ${s.day}/${s.slot}`).toEqual(s);
    const motive = captured.find(s => s.phase === 'motive')!;
    const restored = validateSave(envelope(structuredClone(motive)))!.game; const opt = restored.pendingMotive!.options[0]!.id;
    expect(answerMotive(restored, content, opt)).toEqual(answerMotive(motive, content, opt));
    expect(skipMotive(restored, content)).toEqual(skipMotive(motive, content));
    expect(restored.pendingMotive).toEqual(motive.pendingMotive);
  });
  it('rejects saves with forged derived percentages, vectors, cases or snapshots', () => {
    const { state } = playLeaning(2, 'expert', 0.1); const good = envelope(state); expect(validateSave(good)).toBeDefined();
    const mutations: ((g: GameState) => void)[] = [
      g => { g.heroDevelopmentProfile.currentDistribution!.expert = 0.99; },
      g => { g.heroDevelopmentProfile.lifetimeDistribution!.expert = 0.99; },
      g => { g.heroDevelopmentProfile.confidence = g.heroDevelopmentProfile.confidence > 0.5 ? 0.123 : 1; },
      g => { g.heroDevelopmentProfile.evidence[0]!.vector = { ...g.heroDevelopmentProfile.evidence[0]!.vector, expert: 0.7, achiever: 0.3, diplomat: 0 }; },
      g => { g.heroDevelopmentProfile.evidence[0]!.developmentWeight = 0.1; },
      g => { g.heroDevelopmentProfile.evidence.pop(); },
      g => { g.heroDevelopmentProfile.cases[0]!.status = 'open'; },
      g => { g.heroDevelopmentProfile.observedPrimary = 'strategist'; },
      g => { g.heroDevelopmentProfile.eveningSnapshots[2]!.current.confidence = 0.99; },
      g => { g.heroDevelopmentProfile.eveningSnapshots[2]!.asOfEvidenceCount += 3; },
      g => { g.heroDevelopmentProfile.status = 'insufficient'; },
      g => { g.heroDevelopmentProfile.evidence[1] = { ...g.heroDevelopmentProfile.evidence[0]! }; },
      g => { g.development.initialStage!.logic = 'diplomat'; },
      g => { g.heroDevelopmentProfile.algorithmVersion = '9'; }
    ];
    for (const [i, mutate] of mutations.entries()) { const bad = structuredClone(good); mutate(bad.game); expect(validateSave(bad), `mutation ${i}`).toBeUndefined(); }
  });
  it('does not accept a stage that was never earned by a stable observed center', () => {
    const s = chooseGoal(startEpisode(content, 4, 'fake'), content, 'order', 'select'); const bad = structuredClone(play(4, { policy: 'random' }).state);
    bad.development = { ...bad.development, developmentCurrent: 'diplomat', currentOrigin: 'observed-initial', available: ['diplomat'], initialStage: { logic: 'diplomat', origin: 'observed-initial', day: 6, available: ['diplomat'] } };
    expect(validateSave(envelope(bad))).toBeUndefined(); void s;
  });
});

describe('legacy runs keep their authored stage', () => {
  it('a migrated v4 hero collects observations only from new decisions and keeps the authored stage', () => {
    const oldContent = { ...content, ...legacyV4 } as unknown as GameContent;
    const authored = (s: GameState): GameState => ({ ...s, development: { ...s.development, developmentCurrent: 'expert', currentOrigin: 'legacy-authored', initialStage: { logic: 'expert', origin: 'legacy-authored', day: 0, available: ['opportunist', 'diplomat', 'expert'] },
      available: ['opportunist', 'diplomat', 'expert'], activeArcId: 'expert-achiever', transitionTarget: 'achiever' } });
    let snap: GameState | undefined;
    play(2, { content: oldContent, ...leaning('diplomat', 0.05), start: authored, beforeStep: s => { if (!snap && s.day === 4 && s.phase === 'morning') snap = structuredClone(s); return s; } });
    const { heroDevelopmentProfile: _p, pendingMotive: _m, development: d, current: _c, diceHistory, ...rest } = snap!;
    const v4 = { schema: 1, started: true, game: { ...rest, nights: rest.nights.map(({ summary: _s, ...n }) => n), version: 4, contentVersion: legacyV4.contentVersion, diceHistory: diceHistory.map(({ candidateOrigins: _o, ...x }) => x),
      development: { current: d.developmentCurrent, available: d.available, growingEdge: d.transitionTarget, activeArcId: d.activeArcId, evidence: d.evidence, transitions: d.transitions } } };
    const migrated = migrateSave(v4)!.game; expect(migrated.heroDevelopmentProfile.cases).toHaveLength(0);
    const { state } = play(2, { ...leaning('diplomat', 0.05), resume: migrated });
    const p = state.heroDevelopmentProfile;
    expect(p.cases.length).toBeGreaterThan(10); expect(p.cases.every(c => c.openedDay >= 4)).toBe(true);
    expect(p.observedPrimary).toBe('diplomat');
    // The observed center never replaces the authored stage.
    expect(state.development.initialStage).toMatchObject({ logic: 'expert', origin: 'legacy-authored' });
    expect(state.development.developmentCurrent === 'expert' || state.development.developmentCurrent === 'achiever').toBe(true);
    expect(state.development.currentOrigin).not.toBe('observed-initial');
    expect(validateSave(envelope(state))).toBeDefined();
  });
});

describe('adaptive selection (rollout flag)', () => {
  it('is on in the shipped content, together with the development arcs', () => { expect(content.profile.rollout.adaptiveSelection).toBe(true); expect(content.profile.rollout.developmentArcs).toBe(true); });
  it('keeps probes within a third of the independent window, and probe scenes only ever come from the selector', () => {
    for (const seed of [1, 2, 3]) {
      const { state, draws } = play(seed, { content: adaptiveContent, policy: 'mixed' });
      const probes = draws.filter(d => content.cards.find(c => c.id === d.cardId)?.tags?.includes('probe-only'));
      const e = state.heroDevelopmentProfile.evidence.filter(x => x.source === 'action'); const independent = e.filter(x => x.selectionOrigin !== 'adaptive');
      const probeCases = e.filter(x => x.selectionOrigin === 'probe').length;
      expect(probeCases).toBe(probes.length);
      expect(probeCases / Math.max(1, independent.length)).toBeLessThanOrEqual(1 / 3 + 1e-9);
      expect(validateSave(envelope(state))).toBeDefined();
    }
    const off = play(1, { policy: 'mixed' }).draws; expect(off.some(d => content.cards.find(c => c.id === d.cardId)?.tags?.includes('probe-only'))).toBe(false);
  });
  it('freezes the candidate origins together with the six dice cards', () => {
    const { state } = play(6, { content: adaptiveContent, policy: 'mixed' });
    for (const d of state.diceHistory) { expect(d.candidateOrigins).toHaveLength(6); if (d.cardId) expect(['neutral', 'probe', 'adaptive']).toContain(d.candidateOrigins![d.candidates.indexOf(d.cardId)]); }
  });
});
void diagnosticCaseId; void leaveEvening;
