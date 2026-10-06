import { ACTION_LOGICS } from './constants';
import { FACETS } from './facets';
import { allChoices } from './variants';
import type {
  ActionLogic, Card, Choice, Condition, DevelopmentProfileEveningSnapshot, DevelopmentProfileSlice, DiagnosticCase,
  DiagnosticSelectionOrigin, DiagnosticSignalDefinition, DiagnosticSource, EmergingSignal, GameContent, GameState,
  HeroDevelopmentProfile, HeroDevelopmentProfileEvidence, LifeFacet, LogicVector, PendingMotive, ProfileAlgorithmConfig,
  ProfileConfigRegistry, ProfileStatus
} from './types';

type Ev = HeroDevelopmentProfileEvidence;
const EPS = 1e-9;
const ge = (a: number, b: number) => a >= b - EPS;
export const zeroVector = (): LogicVector => Object.fromEntries(ACTION_LOGICS.map(l => [l, 0])) as LogicVector;
const independent = (e: Pick<Ev, 'selectionOrigin'>) => e.selectionOrigin !== 'adaptive';
const logicIndex = (l: ActionLogic) => ACTION_LOGICS.indexOf(l);

// ---------------------------------------------------------------------------------------------
// Configuration and empty state
// ---------------------------------------------------------------------------------------------
export function algorithmConfig(registry: ProfileConfigRegistry, version: string): ProfileAlgorithmConfig {
  const config = registry.algorithms[version];
  if (!config) throw new Error(`Unknown profile algorithm version ${version}`);
  return config;
}
export function profileConfig(state: Pick<GameState, 'heroDevelopmentProfile'>, content: GameContent): ProfileAlgorithmConfig {
  return algorithmConfig(content.profile, state.heroDevelopmentProfile.algorithmVersion);
}
const emptyFacets = (): HeroDevelopmentProfile['facets'] =>
  Object.fromEntries(FACETS.map(f => [f, { sufficient: false }])) as HeroDevelopmentProfile['facets'];
export function createEmptyHeroDevelopmentProfile(registry: ProfileConfigRegistry): HeroDevelopmentProfile {
  algorithmConfig(registry, registry.currentAlgorithmVersion);
  return { algorithmVersion: registry.currentAlgorithmVersion, evidence: [], cases: [], status: 'insufficient',
    emergingSignals: [], coverage: 0, confidence: 0, facets: emptyFacets(), eveningSnapshots: [] };
}

// ---------------------------------------------------------------------------------------------
// Vector validation (shared by the content checker and the save validator)
// ---------------------------------------------------------------------------------------------
export function vectorProblems(v: unknown): string[] {
  const problems: string[] = [];
  if (!v || typeof v !== 'object') return ['vector is not an object'];
  const keys = Object.keys(v);
  if (keys.length !== ACTION_LOGICS.length || ACTION_LOGICS.some(l => !keys.includes(l))) return ['vector must have exactly the 8 logics'];
  const values = ACTION_LOGICS.map(l => (v as Record<string, unknown>)[l]);
  if (values.some(x => typeof x !== 'number' || !Number.isFinite(x) || x < 0)) return ['vector values must be finite and non-negative'];
  const nums = values as number[];
  if (Math.abs(nums.reduce((a, b) => a + b, 0) - 1) > 1e-9) problems.push('vector must sum to 1');
  if (nums.filter(x => x > 0).length < 2) problems.push('vector needs at least two non-zero components');
  if (Math.max(...nums) > 0.7 + 1e-12) problems.push('vector maximum must not exceed 0.70');
  return problems;
}
export const isValidVector = (v: unknown): v is LogicVector => vectorProblems(v).length === 0;
/** A stored contribution: an authored vector (<= 0.70 per component) or, under contrast scoring, any normalised non-negative vector. */
export function isValidEvidenceVector(v: unknown, config: ProfileAlgorithmConfig): v is LogicVector {
  if (config.scoring !== 'contrast') return isValidVector(v);
  if (!v || typeof v !== 'object') return false;
  const keys = Object.keys(v);
  if (keys.length !== ACTION_LOGICS.length || ACTION_LOGICS.some(l => !keys.includes(l))) return false;
  const nums = ACTION_LOGICS.map(l => (v as Record<string, unknown>)[l]);
  if (nums.some(x => typeof x !== 'number' || !Number.isFinite(x) || x < 0)) return false;
  return Math.abs((nums as number[]).reduce((a, b) => a + b, 0) - 1) <= 1e-9;
}

// ---------------------------------------------------------------------------------------------
// Scoring mode (algorithm branches are immutable: branch 1 = 'full', branch 2 = 'contrast')
// ---------------------------------------------------------------------------------------------
/**
 * What an option contributes. 'full': its whole authored vector. 'contrast': only what sets it apart from the options the hero did
 * not take (chosen minus the mean of the rejected, negatives dropped, normalised). The composition of a scene then matters
 * less than the choice made in it. Without alternatives, or with nothing that separates them, the authored vector stands.
 */
export function contributionVector(config: ProfileAlgorithmConfig, chosen: LogicVector, rejected: readonly LogicVector[]): LogicVector {
  if (config.scoring !== 'contrast' || !rejected.length) return { ...chosen };
  const diff = zeroVector(); let sum = 0;
  for (const l of ACTION_LOGICS) { diff[l] = Math.max(0, chosen[l] - rejected.reduce((a, o) => a + o[l], 0) / rejected.length); sum += diff[l]; }
  if (sum < 1e-9) return { ...chosen };
  for (const l of ACTION_LOGICS) diff[l] /= sum;
  return diff;
}
/** The set of choices that was on screen together with `choiceId` (the card's own, or the variant that contains it). */
const shownSet = (card: Card, choiceId: string): Choice[] => [card.choices, ...(card.choiceVariants ?? []).map(v => v.choices)].find(set => set.some(c => c.id === choiceId)) ?? [];
const rejectedActions = (card: Card, choice: Choice) => shownSet(card, choice.id).filter(c => c.id !== choice.id).flatMap(c => c.diagnosticAction ? [c.diagnosticAction.vector] : []);
const rejectedBehaviors = (card: Card, choice: Choice) => shownSet(card, choice.id).filter(c => c.id !== choice.id).flatMap(c => c.diagnosticBehavior ? [c.diagnosticBehavior.signal.vector] : []);
const rejectedMotives = (choice: Choice, optionId: string) => (choice.diagnosticMotive?.options ?? []).filter(o => o.id !== optionId).map(o => o.signal.vector);

// ---------------------------------------------------------------------------------------------
// Pure arithmetic over the evidence journal
// ---------------------------------------------------------------------------------------------
interface CaseView { caseId: string; action: Ev; motive?: Ev; behavior?: Ev }
function caseViews(evidence: readonly Ev[]): CaseView[] {
  const byId = new Map<string, CaseView>(); const ordered: CaseView[] = [];
  for (const e of evidence) if (e.source === 'action' && !byId.has(e.caseId)) { const v = { caseId: e.caseId, action: e }; byId.set(e.caseId, v); ordered.push(v); }
  for (const e of evidence) {
    const v = byId.get(e.caseId);
    if (!v || e.source === 'action') continue;
    if (e.source === 'motive') v.motive = e; else v.behavior = e;
  }
  return ordered;
}

function independentWindow(views: CaseView[], config: ProfileAlgorithmConfig): CaseView[] {
  return views.filter(v => independent(v.action)).slice(-config.windowCases);
}
export type ProfileScope =
  | { kind: 'lifetime' } | { kind: 'current' }
  | { kind: 'facet'; facet: LifeFacet; window: 'lifetime' | 'current' };
interface Targets { nTarget: number; wTarget: number; kTarget: number; deltaTarget: number }

function sliceOf(views: CaseView[], onlyIndependent: boolean, config: ProfileAlgorithmConfig, targets: Targets, facet?: LifeFacet): DevelopmentProfileSlice {
  const sums = zeroVector(); let W = 0; const contexts = new Set<string>(); let N = 0; const caseIds: string[] = [];
  const add = (e: Ev, share: number) => {
    if (onlyIndependent && !independent(e)) return;
    const w = e.developmentWeight * config.sourceWeights[e.source] * share;
    W += w;
    for (const l of ACTION_LOGICS) sums[l] += w * e.vector[l];
  };
  for (const v of views) {
    const share = facet ? 1 / v.action.facets.length : 1;
    N++; caseIds.push(v.caseId); contexts.add(v.action.contextId);
    add(v.action, share); if (v.motive) add(v.motive, share); if (v.behavior) add(v.behavior, share);
  }
  const K = contexts.size;
  const coverage = 0.35 * Math.min(N / targets.nTarget, 1) + 0.35 * Math.min(W / targets.wTarget, 1) + 0.3 * Math.min(K / targets.kTarget, 1);
  if (!(W > 0)) return { N, W, K, delta: 0, coverage, confidence: 0, caseIds };
  const distribution = zeroVector();
  for (const l of ACTION_LOGICS) distribution[l] = sums[l] / W;
  const [first, second] = topTwo(distribution);
  const delta = distribution[first] - distribution[second];
  return { distribution, N, W, K, delta, coverage, confidence: coverage * Math.min(delta / targets.deltaTarget, 1), caseIds };
}
/** The two largest shares; a tie keeps the earlier logic of the model. */
function topTwo(d: LogicVector): [ActionLogic, ActionLogic] {
  let first = ACTION_LOGICS[0]!; let second = ACTION_LOGICS[1]!;
  if (d[second] > d[first]) [first, second] = [second, first];
  for (let i = 2; i < ACTION_LOGICS.length; i++) {
    const l = ACTION_LOGICS[i]!;
    if (d[l] > d[first]) { second = first; first = l; } else if (d[l] > d[second]) second = l;
  }
  return [first, second];
}
/** Leaders ordered by share; ties keep the model order so the result is deterministic. */
export function leaders(d: LogicVector): ActionLogic[] {
  return [...ACTION_LOGICS].sort((a, b) => d[b] - d[a] || logicIndex(a) - logicIndex(b));
}
interface Views { all: CaseView[]; window: CaseView[] }
const viewsOf = (evidence: readonly Ev[], config: ProfileAlgorithmConfig): Views => { const all = caseViews(evidence); return { all, window: independentWindow(all, config) }; };
function sliceInViews(v: Views, config: ProfileAlgorithmConfig, scope: ProfileScope): DevelopmentProfileSlice {
  if (scope.kind === 'lifetime') return sliceOf(v.all, false, config, config.confidence);
  if (scope.kind === 'current') return sliceOf(v.window, true, config, config.confidence);
  const base = scope.window === 'lifetime' ? v.all : v.window;
  return sliceOf(base.filter(c => c.action.facets.includes(scope.facet)), scope.window === 'current', config, config.facetConfidence, scope.facet);
}
export function calculateSlice(evidence: readonly Ev[], config: ProfileAlgorithmConfig, scope: ProfileScope): DevelopmentProfileSlice {
  return sliceInViews(viewsOf(evidence, config), config, scope);
}
export function calculateProfileSlice(state: Pick<GameState, 'heroDevelopmentProfile'>, content: GameContent, scope: ProfileScope, asOfEvidenceCount?: number): DevelopmentProfileSlice {
  const p = state.heroDevelopmentProfile;
  return calculateSlice(asOfEvidenceCount === undefined ? p.evidence : p.evidence.slice(0, asOfEvidenceCount), profileConfig(state, content), scope);
}
export function facetSufficient(slice: DevelopmentProfileSlice | undefined, config: ProfileAlgorithmConfig): boolean {
  const f = config.facetConfidence;
  return !!slice?.distribution && slice.N >= f.minCases && ge(slice.W, f.minWeight) && slice.K >= f.minContexts && ge(slice.confidence, f.minConfidence);
}

/** Derived numbers are a cache of the journal: recomputing never changes the journal or the evening conclusions. */
type Live = Pick<HeroDevelopmentProfile, 'lifetimeDistribution' | 'currentDistribution' | 'coverage' | 'confidence'>;
type Facets = HeroDevelopmentProfile['facets'];
// The journal is append-only and never mutated in place, so its derived numbers can be remembered per array.
const liveCache = new WeakMap<readonly Ev[], { config: ProfileAlgorithmConfig; live: Live }>();
/** Distributions that follow every decision. */
export function liveProfile(evidence: readonly Ev[], config: ProfileAlgorithmConfig): Live {
  const cached = liveCache.get(evidence);
  if (cached && cached.config === config) return cached.live;
  const views = viewsOf(evidence, config);
  const lifetime = sliceInViews(views, config, { kind: 'lifetime' });
  const current = sliceInViews(views, config, { kind: 'current' });
  const live: Live = { ...(lifetime.distribution ? { lifetimeDistribution: lifetime.distribution } : {}),
    ...(current.distribution ? { currentDistribution: current.distribution } : {}), coverage: current.coverage, confidence: current.confidence };
  liveCache.set(evidence, { config, live });
  return live;
}
/** Facet slices of a journal prefix. They are an explanatory view, refreshed each night as of the last snapshot. */
export function facetProfiles(evidence: readonly Ev[], config: ProfileAlgorithmConfig): Facets {
  const views = viewsOf(evidence, config);
  const facets = emptyFacets();
  for (const facet of FACETS) {
    const l = sliceInViews(views, config, { kind: 'facet', facet, window: 'lifetime' });
    const c = sliceInViews(views, config, { kind: 'facet', facet, window: 'current' });
    facets[facet] = { ...(l.W > 0 ? { lifetime: l } : {}), ...(c.W > 0 ? { current: c } : {}), sufficient: facetSufficient(c, config) };
  }
  return facets;
}
export const derivedProfile = (evidence: readonly Ev[], config: ProfileAlgorithmConfig): Live & { facets: Facets } => ({ ...liveProfile(evidence, config), facets: facetProfiles(evidence, config) });
const facetCache = new WeakMap<DevelopmentProfileEveningSnapshot, Facets>();
/** Facets as of the latest evening snapshot (empty before the first night). */
export function facetsAsOfLastEvening(p: Pick<HeroDevelopmentProfile, 'evidence' | 'eveningSnapshots'>, config: ProfileAlgorithmConfig): Facets {
  const snap = p.eveningSnapshots.at(-1);
  if (!snap) return emptyFacets();
  let known = facetCache.get(snap);
  if (!known) { known = facetProfiles(p.evidence.slice(0, snap.asOfEvidenceCount), config); facetCache.set(snap, known); }
  return known;
}
export function recalculateHeroDevelopmentProfile(state: GameState, content: GameContent): GameState {
  const p = state.heroDevelopmentProfile; const config = profileConfig(state, content);
  const { lifetimeDistribution: _l, currentDistribution: _c, ...rest } = p;
  return { ...state, heroDevelopmentProfile: { ...rest, ...liveProfile(p.evidence, config), facets: facetsAsOfLastEvening(p, config) } };
}

// ---------------------------------------------------------------------------------------------
// Whole-number percentages
// ---------------------------------------------------------------------------------------------
export function largestRemainderPercent(distribution: LogicVector): Record<ActionLogic, number> {
  const raw = ACTION_LOGICS.map(l => ({ l, value: distribution[l] * 100 }));
  const result = Object.fromEntries(raw.map(r => [r.l, Math.floor(r.value + 1e-9)])) as Record<ActionLogic, number>;
  let missing = 100 - ACTION_LOGICS.reduce((sum, l) => sum + result[l], 0);
  const order = [...raw].sort((a, b) => Math.round((b.value - Math.floor(b.value + 1e-9)) * 1e9) - Math.round((a.value - Math.floor(a.value + 1e-9)) * 1e9) || logicIndex(a.l) - logicIndex(b.l));
  for (let i = 0; missing > 0 && order.length; i = (i + 1) % order.length, missing--) result[order[i]!.l]++;
  return result;
}

// ---------------------------------------------------------------------------------------------
// Origin of a presented scene
// ---------------------------------------------------------------------------------------------
const usesDevelopment = new WeakMap<object, boolean>();
export function conditionUsesDevelopment(c: Condition | undefined): boolean {
  if (!c) return false;
  let known = usesDevelopment.get(c);
  if (known === undefined) { known = /"(heroStage|availableLogic|developmentEvent|developmentBeat|developmentSince)"/.test(JSON.stringify(c)); usesDevelopment.set(c, known); }
  return known;
}
/** A scene that exists for the hero because of a stage/arc/profile hypothesis can never be "neutral". */
export function dependsOnDevelopment(card: Card, variantId?: string, choices?: readonly Choice[]): boolean {
  if (card.development || conditionUsesDevelopment(card.requires)) return true;
  const variant = variantId ? card.textVariants?.find(v => v.id === variantId) : undefined;
  if (variant && conditionUsesDevelopment(variant.when)) return true;
  const chosen = choices?.length ? card.choiceVariants?.find(v => v.choices.every((c, i) => c.id === choices[i]?.id)) : undefined;
  return !!chosen && conditionUsesDevelopment(chosen.when);
}
export function isDiagnosticCard(card: Card): boolean {
  return !!card.diagnostic && allChoices(card).some(c => c.diagnosticAction);
}
/** Neutral unless the scene is development-gated; `probe` is decided only by the selector, never inferred here. */
export function naturalSelectionOrigin(card: Card, variantId?: string, choices?: readonly Choice[]): DiagnosticSelectionOrigin {
  return dependsOnDevelopment(card, variantId, choices) ? 'adaptive' : 'neutral';
}

// ---------------------------------------------------------------------------------------------
// Cases, evidence, motives, behavior
// ---------------------------------------------------------------------------------------------
export const diagnosticCaseId = (runId: string, day: number, slot: number, cardId: string, choiceId: string, situationId: string) =>
  `${runId}/${day}/${slot}/${cardId}/${choiceId}/${situationId}`;
const evidenceId = (caseId: string, source: DiagnosticSource) => `${caseId}#${source}`;

/** Does any versioned scene continue this situation with a diagnostic behavior? */
const continuations = new WeakMap<GameContent['cards'], Set<string>>();
export function continuationSituations(content: GameContent): Set<string> {
  let found = continuations.get(content.cards);
  if (!found) {
    found = new Set(content.cards.flatMap(c => allChoices(c).flatMap(ch => ch.diagnosticBehavior ? [ch.diagnosticBehavior.continuesSituationId] : [])));
    continuations.set(content.cards, found);
  }
  return found;
}
export function expiresInDays(card: Card, config: ProfileAlgorithmConfig) {
  return card.diagnostic?.expiresInDays ?? config.defaultExpiresInDays;
}
/** A case is open only while a motive or a behavior can still arrive. */
function settle(c: DiagnosticCase): DiagnosticCase {
  const status = c.motiveState === 'pending' || c.behaviorState === 'pending' ? 'open' : c.behaviorState === 'expired' ? 'expired' : 'complete';
  return status === c.status ? c : { ...c, status };
}
export const motivesShownOn = (cases: readonly DiagnosticCase[], day: number) =>
  cases.filter(c => c.openedDay === day && ['pending', 'recorded', 'skipped'].includes(c.motiveState)).length;
function withProfile(state: GameState, content: GameContent, patch: Partial<Pick<HeroDevelopmentProfile, 'evidence' | 'cases'>>): GameState {
  return recalculateHeroDevelopmentProfile({ ...state, heroDevelopmentProfile: { ...state.heroDevelopmentProfile, ...patch } }, content);
}
function newEvidence(state: GameState, content: GameContent, base: Omit<Ev, 'id' | 'algorithmVersion' | 'scoringVersion' | 'rubricVersion' | 'contentVersion' | 'vector'>, signal: DiagnosticSignalDefinition, rejected: readonly LogicVector[]): Ev {
  const config = profileConfig(state, content);
  return { ...base, id: evidenceId(base.caseId, base.source), vector: contributionVector(config, signal.vector, rejected), algorithmVersion: state.heroDevelopmentProfile.algorithmVersion,
    scoringVersion: config.scoringVersion, rubricVersion: config.rubricVersion, contentVersion: state.contentVersion };
}
const hasEvidence = (p: HeroDevelopmentProfile, caseId: string, source: DiagnosticSource) => p.evidence.some(e => e.caseId === caseId && e.source === source);

/** Opens a case and records its action. A repeated call for the same decision changes nothing. */
export function openDiagnosticCase(state: GameState, content: GameContent, card: Card, choice: Choice, selectionOrigin: DiagnosticSelectionOrigin): GameState {
  const d = card.diagnostic;
  if (!d || !choice.diagnosticAction || choice.diagnosticBehavior) return state;
  const p = state.heroDevelopmentProfile;
  const id = diagnosticCaseId(state.runId, state.day, state.slot, card.id, choice.id, d.situationId);
  if (p.cases.some(c => c.id === id) || hasEvidence(p, id, 'action')) return state;
  const config = profileConfig(state, content);
  const action = newEvidence(state, content, { caseId: id, situationId: d.situationId, source: 'action', day: state.day, slot: state.slot,
    cardId: card.id, choiceId: choice.id, ...(state.current?.variantId ? { variantId: state.current.variantId } : {}),
    contextId: d.contextId, facets: [...d.facets], pressure: d.pressure ?? false, selectionOrigin, developmentWeight: d.developmentWeight }, choice.diagnosticAction, rejectedActions(card, choice));
  const motive = choice.diagnosticMotive;
  const motiveState: DiagnosticCase['motiveState'] = !motive ? 'none' : motivesShownOn(p.cases, state.day) < config.motivePrompt.maxPerDay ? 'pending' : 'suppressed';
  const behaviorState: DiagnosticCase['behaviorState'] = continuationSituations(content).has(d.situationId) ? 'pending' : 'none';
  const opened: DiagnosticCase = settle({ id, situationId: d.situationId, openedDay: state.day, openedSlot: state.slot, cardId: card.id, choiceId: choice.id,
    contextId: d.contextId, facets: [...d.facets], pressure: d.pressure ?? false, actionOrigin: selectionOrigin, developmentWeight: d.developmentWeight,
    actionEvidenceId: action.id, motiveState, behaviorState, status: 'open', expiresDay: state.day + expiresInDays(card, config) });
  return withProfile(state, content, { evidence: [...p.evidence, action], cases: [...p.cases, opened] });
}
/** Action registration is part of opening the case; kept as a separate entry point for the journal contract. */
export const recordDiagnosticAction = (state: GameState, content: GameContent, card: Card, choice: Choice, selectionOrigin: DiagnosticSelectionOrigin) =>
  openDiagnosticCase(state, content, card, choice, selectionOrigin);

export function pendingMotiveFor(state: GameState, caseId: string, choice: Choice, next: PendingMotive['resume']['next']): PendingMotive | undefined {
  const c = state.heroDevelopmentProfile.cases.find(x => x.id === caseId);
  const m = choice.diagnosticMotive;
  if (!c || c.motiveState !== 'pending' || !m) return undefined;
  return { caseId, promptId: m.promptId, text: m.text, options: m.options.map(o => ({ id: o.id, label: o.label })), resume: { day: state.day, slot: state.slot, next } };
}
export function recordDiagnosticMotive(state: GameState, content: GameContent, caseId: string, promptId: string, optionId: string): GameState {
  const p = state.heroDevelopmentProfile;
  const c = p.cases.find(x => x.id === caseId);
  if (!c || c.motiveState !== 'pending' || hasEvidence(p, caseId, 'motive')) return state;
  const card = content.cards.find(x => x.id === c.cardId);
  const motive = card && allChoices(card).find(x => x.id === c.choiceId)?.diagnosticMotive;
  const option = motive?.promptId === promptId ? motive.options.find(o => o.id === optionId) : undefined;
  if (!option) throw new Error('Unknown motive option');
  const ev = newEvidence(state, content, { caseId, situationId: c.situationId, source: 'motive', day: c.openedDay, slot: c.openedSlot, cardId: c.cardId, choiceId: c.choiceId,
    motiveOptionId: optionId, contextId: c.contextId, facets: [...c.facets], pressure: c.pressure, selectionOrigin: c.actionOrigin, developmentWeight: c.developmentWeight }, option.signal, rejectedMotives(allChoices(card!).find(x => x.id === c.choiceId)!, optionId));
  const cases = p.cases.map(x => x.id === caseId ? settle({ ...x, motiveState: 'recorded', motiveEvidenceId: ev.id }) : x);
  return withProfile(state, content, { evidence: [...p.evidence, ev], cases });
}
export function skipDiagnosticMotive(state: GameState, content: GameContent, caseId: string): GameState {
  const p = state.heroDevelopmentProfile;
  const c = p.cases.find(x => x.id === caseId);
  if (!c || c.motiveState !== 'pending') return state;
  return withProfile(state, content, { cases: p.cases.map(x => x.id === caseId ? settle({ ...x, motiveState: 'skipped' }) : x) });
}
/** The open case a follow-up decision belongs to. Content must make this unique; the runtime stays deterministic if it is not. */
export function behaviorOwner(state: GameState, choice: Choice): DiagnosticCase | undefined {
  const b = choice.diagnosticBehavior;
  if (!b) return undefined;
  const found = state.heroDevelopmentProfile.cases.filter(c => c.situationId === b.continuesSituationId && c.status === 'open' && c.behaviorState === 'pending' && state.day <= c.expiresDay)
    .sort((x, y) => y.openedDay - x.openedDay || y.openedSlot - x.openedSlot || x.id.localeCompare(y.id));
  if (found.length > 1) console.warn(`Ambiguous diagnostic behavior owner for ${b.continuesSituationId}; using the most recent case`);
  return found[0];
}
export function recordDiagnosticBehavior(state: GameState, content: GameContent, card: Card, choice: Choice, selectionOrigin: DiagnosticSelectionOrigin): GameState {
  const owner = behaviorOwner(state, choice);
  if (!owner || !choice.diagnosticBehavior) return state;
  const p = state.heroDevelopmentProfile;
  if (hasEvidence(p, owner.id, 'behavior')) return state;
  const ev = newEvidence(state, content, { caseId: owner.id, situationId: owner.situationId, source: 'behavior', day: state.day, slot: state.slot, cardId: card.id, choiceId: choice.id,
    ...(state.current?.variantId ? { variantId: state.current.variantId } : {}),
    contextId: owner.contextId, facets: [...owner.facets], pressure: owner.pressure, selectionOrigin, developmentWeight: owner.developmentWeight }, choice.diagnosticBehavior.signal, rejectedBehaviors(card, choice));
  const cases = p.cases.map(x => x.id === owner.id ? settle({ ...x, behaviorState: 'recorded', behaviorEvidenceId: ev.id }) : x);
  return withProfile(state, content, { evidence: [...p.evidence, ev], cases });
}
/** Applied at evening, after every slot of the day: the last day of a window still accepts behavior. */
export function expireDiagnosticCases(state: GameState, content: GameContent): GameState {
  const p = state.heroDevelopmentProfile;
  if (!p.cases.some(c => c.behaviorState === 'pending' && state.day >= c.expiresDay)) return state;
  return withProfile(state, content, { cases: p.cases.map(c => c.behaviorState === 'pending' && state.day >= c.expiresDay ? settle({ ...c, behaviorState: 'expired' }) : c) });
}

// ---------------------------------------------------------------------------------------------
// Evening conclusions
// ---------------------------------------------------------------------------------------------
const independentActionCount = (evidence: readonly Ev[]) => evidence.filter(e => e.source === 'action' && independent(e)).length;

/** Development logic known at the start of the evening of `day`, before the same night's commit. */
export function developmentCurrentBefore(state: Pick<GameState, 'development'>, day: number): ActionLogic | undefined {
  const d = state.development;
  if (!d.initialStage) return d.developmentCurrent;
  let current: ActionLogic | undefined = d.initialStage.origin === 'observed-initial' && day <= d.initialStage.day ? undefined : d.initialStage.logic;
  for (const t of d.transitions) if (t.day < day) current = t.to;
  return current;
}

function pressureCandidate(views: CaseView[], config: ProfileAlgorithmConfig, current: ActionLogic): ActionLogic | undefined {
  const f = config.fallback;
  const sub = views.filter(v => v.action.pressure);
  const s = sliceOf(sub, true, config, config.confidence);
  if (!s.distribution || s.N < f.minActions || s.K < f.minContexts) return undefined;
  const [first] = leaders(s.distribution);
  if (!ge(s.distribution[first!], f.minShare) || !ge(s.delta, f.minDelta)) return undefined;
  return logicIndex(first!) < logicIndex(current) ? first : undefined;
}
function strongActions(views: CaseView[], logic: ActionLogic, minComponent: number) {
  return views.filter(v => ge(v.action.vector[logic], minComponent));
}
/** One pure step of the nightly state machine. Everything it needs is the previous snapshot and the evidence prefix. */
export function evaluateEvening(prev: DevelopmentProfileEveningSnapshot | undefined, evidence: readonly Ev[], day: number, developmentCurrent: ActionLogic | undefined, config: ProfileAlgorithmConfig): DevelopmentProfileEveningSnapshot {
  const views = independentWindow(caseViews(evidence), config);
  const current = sliceOf(views, true, config, config.confidence);
  const sc = config.stableCandidate; const pv = config.provisional;
  const total = independentActionCount(evidence);
  const leader = current.distribution ? leaders(current.distribution)[0] : undefined;
  // F: how many life facets the window's decisions came from. Required only for the very first stable center of a run.
  const facetSpan = new Set(views.flatMap(v => v.action.facets)).size;
  const facetsOk = prev?.observedPrimary !== undefined || !sc.minFacetsFirstStable || facetSpan >= sc.minFacetsFirstStable;
  const criteria = facetsOk && !!current.distribution && !!leader && day >= sc.minDay && current.N >= sc.minCases && ge(current.W, sc.minWeight) && current.K >= sc.minContexts &&
    ge(current.distribution[leader], sc.minLeaderShare) && ge(current.delta, sc.minDelta) && ge(current.confidence, sc.minConfidence);
  const material = day >= pv.minDay && current.N >= pv.minCases && current.K >= pv.minContexts;
  let observed = prev?.observedPrimary; let candidate = prev?.candidatePrimary; let since = prev?.candidateSinceDay; let anchor = prev?.candidateSinceIndependentActionCount;
  let status: ProfileStatus;
  if (criteria && leader) {
    if (candidate === leader && since !== undefined && anchor !== undefined) {
      if (observed === leader && prev?.status === 'stable') status = 'stable';
      else if (day > since && total - anchor >= sc.minNewIndependentActionsBetweenConfirmations) { observed = leader; status = 'stable'; }
      else status = 'provisional';
    } else { candidate = leader; since = day; anchor = total; status = 'provisional'; }
  } else {
    candidate = undefined; since = undefined; anchor = undefined;
    status = observed !== undefined || material ? 'provisional' : 'insufficient';
  }
  let fallbackCandidate: ActionLogic | undefined; let fallback: ActionLogic | undefined; let leadingEdge: ActionLogic | undefined;
  let emergingSignals: EmergingSignal[] = [];
  if (developmentCurrent) {
    fallbackCandidate = pressureCandidate(views, config, developmentCurrent);
    if (fallbackCandidate && prev?.fallbackCandidate === fallbackCandidate) fallback = fallbackCandidate;
    const idx = logicIndex(developmentCurrent);
    const next = ACTION_LOGICS[idx + 1];
    const le = config.leadingEdge;
    if (next && current.distribution && ge(current.distribution[next], le.minShare)) {
      const strong = strongActions(views, next, le.minComponent);
      if (strong.length >= le.minActions && new Set(strong.map(v => v.action.contextId)).size >= le.minContexts) leadingEdge = next;
    }
    const em = config.emerging;
    for (const logic of ACTION_LOGICS.slice(idx + 2)) {
      const strong = strongActions(views, logic, em.minComponent);
      const contextIds = [...new Set(strong.map(v => v.action.contextId))];
      if (strong.length >= em.minActions && contextIds.length >= em.minContexts) emergingSignals.push({ logic, actionCount: strong.length, contextIds, evidenceIds: strong.map(v => v.action.id) });
    }
  }
  emergingSignals = emergingSignals.sort((a, b) => logicIndex(a.logic) - logicIndex(b.logic));
  return { day, status, current, ...(observed ? { observedPrimary: observed } : {}), ...(candidate ? { candidatePrimary: candidate, candidateSinceDay: since!, candidateSinceIndependentActionCount: anchor! } : {}),
    asOfEvidenceCount: evidence.length, ...(developmentCurrent ? { developmentCurrent } : {}), ...(fallbackCandidate ? { fallbackCandidate } : {}),
    ...(fallback ? { fallback } : {}), ...(leadingEdge ? { leadingEdge } : {}), emergingSignals };
}
function adoptSnapshot(p: HeroDevelopmentProfile, snap: DevelopmentProfileEveningSnapshot): HeroDevelopmentProfile {
  const { observedPrimary: _o, candidatePrimary: _c, candidateSinceDay: _d, candidateSinceIndependentActionCount: _a, fallback: _f, leadingEdge: _l, ...rest } = p;
  return { ...rest, status: snap.status, emergingSignals: snap.emergingSignals,
    ...(snap.observedPrimary ? { observedPrimary: snap.observedPrimary } : {}),
    ...(snap.candidatePrimary ? { candidatePrimary: snap.candidatePrimary, candidateSinceDay: snap.candidateSinceDay!, candidateSinceIndependentActionCount: snap.candidateSinceIndependentActionCount! } : {}),
    ...(snap.fallback ? { fallback: snap.fallback } : {}), ...(snap.leadingEdge ? { leadingEdge: snap.leadingEdge } : {}),
    eveningSnapshots: [...p.eveningSnapshots, snap] };
}
/**
 * Candidate/stable state, fallback, leading edge and signals for this evening, saved once.
 * Calling it again for the same day returns the same state.
 */
export function updateProfileAtEvening(state: GameState, content: GameContent): GameState {
  const p = state.heroDevelopmentProfile;
  if (p.eveningSnapshots.some(s => s.day === state.day)) return state;
  const snap = evaluateEvening(p.eveningSnapshots.at(-1), p.evidence, state.day, developmentCurrentBefore(state, state.day), profileConfig(state, content));
  return recalculateHeroDevelopmentProfile({ ...state, heroDevelopmentProfile: adoptSnapshot(p, snap) }, content);
}
export const updateObservedPrimaryAtEvening = updateProfileAtEvening;
export const updateFallbackLeadingEdgeAndSignals = updateProfileAtEvening;

/** First stable observed center becomes the starting stage; later centers never overwrite a stage. */
export function establishInitialDevelopmentCurrent(state: GameState, content: GameContent): GameState {
  const d = state.development; const p = state.heroDevelopmentProfile;
  if (d.developmentCurrent || !p.observedPrimary || p.status !== 'stable') return state;
  const logic = p.observedPrimary;
  const arc = content.development.arcs.find(a => a.from === logic);
  return { ...state, development: { ...d, developmentCurrent: logic, currentOrigin: 'observed-initial',
    initialStage: { logic, origin: 'observed-initial', day: state.day, available: [logic] }, available: [logic],
    ...(arc ? { activeArcId: arc.id, transitionTarget: arc.to } : {}) } };
}
export interface FirstStageReadiness {
  decisions: number; neededDecisions: number; enoughDecisions: boolean;
  contexts: number; neededContexts: number; facets: number; neededFacets: number;
  /** The live leader when it already passes share, gap and confidence; the evenings still have to confirm it. */
  leader?: ActionLogic; candidate?: ActionLogic;
}
/** What the first stable center is still waiting for, read from the live journal. Explanatory only: the evenings decide. */
export function firstStageReadiness(state: Pick<GameState, 'heroDevelopmentProfile'>, content: GameContent): FirstStageReadiness {
  const p = state.heroDevelopmentProfile; const config = profileConfig(state, content); const sc = config.stableCandidate;
  const views = independentWindow(caseViews(p.evidence), config);
  const s = sliceOf(views, true, config, config.confidence);
  const top = s.distribution ? leaders(s.distribution)[0] : undefined;
  const clear = !!top && ge(s.distribution![top], sc.minLeaderShare) && ge(s.delta, sc.minDelta) && ge(s.confidence, sc.minConfidence);
  return { decisions: s.N, neededDecisions: sc.minCases, enoughDecisions: s.N >= sc.minCases && ge(s.W, sc.minWeight),
    contexts: s.K, neededContexts: sc.minContexts, facets: new Set(views.flatMap(v => v.action.facets)).size, neededFacets: sc.minFacetsFirstStable ?? 0,
    ...(clear ? { leader: top } : {}), ...(p.candidatePrimary ? { candidate: p.candidatePrimary } : {}) };
}

// ---------------------------------------------------------------------------------------------
// Targeted probes and independence quota (enabled only through rollout.adaptiveSelection)
// ---------------------------------------------------------------------------------------------
export interface IndependenceStats { independentCases: number; probeCases: number; lastFreeOrigin?: DiagnosticSelectionOrigin }
export function independenceStats(state: GameState, content: GameContent): IndependenceStats {
  const config = profileConfig(state, content);
  const views = independentWindow(caseViews(state.heroDevelopmentProfile.evidence), config);
  const last = state.heroDevelopmentProfile.cases.at(-1);
  return { independentCases: views.length, probeCases: views.filter(v => v.action.selectionOrigin === 'probe').length, ...(last ? { lastFreeOrigin: last.actionOrigin } : {}) };
}
export function probeAllowed(stats: IndependenceStats, config: ProfileAlgorithmConfig): boolean {
  const p = config.probe;
  if (stats.independentCases < p.shareRuleFromIndependentCases) return stats.probeCases < p.maxBeforeShareRule;
  return (stats.probeCases + 1) / (stats.independentCases + 1) <= p.maxShareOfIndependentWindow + EPS;
}
/** The two leading logics, from the independent window only. Lifetime data contains adaptive evidence and must never steer probes. */
export function probePair(state: GameState): [ActionLogic, ActionLogic] | undefined {
  const d = state.heroDevelopmentProfile.currentDistribution;
  if (!d) return undefined;
  const [a, b] = leaders(d);
  if (!a || !b || d[a] === d[b]) return undefined;
  return [a, b];
}

// ---------------------------------------------------------------------------------------------
// Audit: every number back to its source decision
// ---------------------------------------------------------------------------------------------
export interface EvidenceAuditRow {
  evidence: Ev; sourceCoefficient: number; effectiveWeight: number; contribution: LogicVector;
  inCurrent: boolean; reason: string;
}
export function auditProfile(state: GameState, content: GameContent): EvidenceAuditRow[] {
  const p = state.heroDevelopmentProfile; const config = profileConfig(state, content);
  const window = new Set(independentWindow(caseViews(p.evidence), config).map(v => v.caseId));
  return p.evidence.map(e => {
    const sourceCoefficient = config.sourceWeights[e.source];
    const effectiveWeight = e.developmentWeight * sourceCoefficient;
    const contribution = zeroVector();
    for (const l of ACTION_LOGICS) contribution[l] = effectiveWeight * e.vector[l];
    const inWindow = window.has(e.caseId); const indep = independent(e);
    const reason = !indep ? 'adaptive: only in the historical profile' : !inWindow ? 'outside the last independent cases' : 'in the independent window';
    return { evidence: e, sourceCoefficient, effectiveWeight, contribution, inCurrent: indep && inWindow, reason };
  });
}

// ---------------------------------------------------------------------------------------------
// Validation: nothing derived is trusted, everything is replayed from the journal
// ---------------------------------------------------------------------------------------------
function almostEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => almostEqual(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).filter(k => (a as Record<string, unknown>)[k] !== undefined); const kb = Object.keys(b).filter(k => (b as Record<string, unknown>)[k] !== undefined);
    return ka.length === kb.length && ka.every(k => k in b && almostEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
}
export function validateHeroDevelopmentProfile(state: GameState, content: GameContent): boolean {
  const p = state.heroDevelopmentProfile;
  const config = content.profile.algorithms[p.algorithmVersion];
  if (!config) return false;
  const slots = content.episode.slotsPerDay;
  const ids = new Set<string>(); const sources = new Set<string>(); let last = -1;
  for (const e of p.evidence) {
    const pos = e.day * slots + e.slot;
    if (pos < last || e.day > state.day || e.day < 1 || e.slot < 0 || e.slot >= slots) return false; last = pos;
    if (ids.has(e.id) || sources.has(`${e.caseId}|${e.source}`) || e.id !== evidenceId(e.caseId, e.source)) return false;
    ids.add(e.id); sources.add(`${e.caseId}|${e.source}`);
    if (e.algorithmVersion !== p.algorithmVersion || e.scoringVersion !== config.scoringVersion || e.rubricVersion !== config.rubricVersion || e.contentVersion !== state.contentVersion) return false;
    if (!isValidEvidenceVector(e.vector, config) || !(e.developmentWeight >= 0 && e.developmentWeight <= 1) || !['neutral', 'probe', 'adaptive'].includes(e.selectionOrigin)) return false;
    const card = content.cards.find(c => c.id === e.cardId); const choice = card && allChoices(card).find(c => c.id === e.choiceId);
    if (!card || !choice) return false;
    const h = state.history.find(x => x.day === e.day && x.slot === e.slot);
    if (!h || h.cardId !== e.cardId || h.choiceId !== e.choiceId) return false;
    const owner = p.cases.find(c => c.id === e.caseId);
    if (!owner || owner.situationId !== e.situationId) return false;
    if (e.source === 'action') {
      const d = card.diagnostic;
      if (!d || !choice.diagnosticAction || choice.diagnosticBehavior || !almostEqual(contributionVector(config, choice.diagnosticAction.vector, rejectedActions(card, choice)), e.vector) || d.situationId !== e.situationId ||
        d.contextId !== e.contextId || (d.pressure ?? false) !== e.pressure || d.developmentWeight !== e.developmentWeight || JSON.stringify(d.facets) !== JSON.stringify(e.facets)) return false;
      if (e.caseId !== diagnosticCaseId(state.runId, e.day, e.slot, e.cardId, e.choiceId, e.situationId) || owner.actionEvidenceId !== e.id) return false;
    } else {
      if (e.contextId !== owner.contextId || e.pressure !== owner.pressure || e.developmentWeight !== owner.developmentWeight || JSON.stringify(e.facets) !== JSON.stringify(owner.facets)) return false;
      if (e.source === 'motive') {
        const option = choice.diagnosticMotive?.options.find(o => o.id === e.motiveOptionId);
        if (!option || !almostEqual(contributionVector(config, option.signal.vector, rejectedMotives(choice, option.id)), e.vector) || e.cardId !== owner.cardId || e.choiceId !== owner.choiceId || e.day !== owner.openedDay || e.slot !== owner.openedSlot ||
          e.selectionOrigin !== owner.actionOrigin || owner.motiveEvidenceId !== e.id) return false;
      } else {
        const b = choice.diagnosticBehavior;
        if (!b || b.continuesSituationId !== owner.situationId || !almostEqual(contributionVector(config, b.signal.vector, rejectedBehaviors(card, choice)), e.vector) || owner.behaviorEvidenceId !== e.id) return false;
        if (e.day < owner.openedDay || e.day * slots + e.slot <= owner.openedDay * slots + owner.openedSlot || e.day > owner.expiresDay) return false;
      }
    }
  }
  // Cases: every state must be explained by the journal and by the versioned content.
  const caseIds = new Set<string>(); const shownPerDay = new Map<number, number>();
  for (const c of p.cases) {
    if (caseIds.has(c.id)) return false; caseIds.add(c.id);
    const action = p.evidence.find(e => e.id === c.actionEvidenceId);
    if (!action || action.source !== 'action' || action.caseId !== c.id || action.day !== c.openedDay || action.slot !== c.openedSlot || action.cardId !== c.cardId || action.choiceId !== c.choiceId ||
      action.contextId !== c.contextId || action.pressure !== c.pressure || action.developmentWeight !== c.developmentWeight || action.selectionOrigin !== c.actionOrigin ||
      JSON.stringify(action.facets) !== JSON.stringify(c.facets)) return false;
    const card = content.cards.find(x => x.id === c.cardId); const choice = card && allChoices(card).find(x => x.id === c.choiceId);
    if (!card?.diagnostic || !choice) return false;
    const motiveEvidence = p.evidence.find(e => e.caseId === c.id && e.source === 'motive');
    const behaviorEvidence = p.evidence.find(e => e.caseId === c.id && e.source === 'behavior');
    if ((c.motiveEvidenceId ?? undefined) !== motiveEvidence?.id || (c.behaviorEvidenceId ?? undefined) !== behaviorEvidence?.id) return false;
    if (c.expiresDay !== c.openedDay + expiresInDays(card, config)) return false;
    // Motive: the daily limit is replayed in case order.
    const shown = shownPerDay.get(c.openedDay) ?? 0;
    if (!choice.diagnosticMotive) { if (c.motiveState !== 'none') return false; }
    else {
      const expectShown = shown < config.motivePrompt.maxPerDay;
      if (expectShown ? c.motiveState === 'none' || c.motiveState === 'suppressed' : c.motiveState !== 'suppressed') return false;
      if (expectShown) shownPerDay.set(c.openedDay, shown + 1);
    }
    if ((c.motiveState === 'recorded') !== !!motiveEvidence) return false;
    if ((c.motiveState === 'pending') !== (state.pendingMotive?.caseId === c.id)) return false;
    // Behavior.
    const continued = continuationSituations(content).has(c.situationId);
    if (!continued) { if (c.behaviorState !== 'none') return false; }
    else {
      if (c.behaviorState === 'none') return false;
      if ((c.behaviorState === 'recorded') !== !!behaviorEvidence) return false;
      const windowOpen = state.day < c.expiresDay || (state.day === c.expiresDay && state.preparedEveningDay !== state.day);
      if (c.behaviorState === 'pending' && !windowOpen) return false;
      if (c.behaviorState === 'expired' && windowOpen) return false;
    }
    if (settle(c) !== c) return false;
  }
  if (state.pendingMotive && !p.cases.some(c => c.id === state.pendingMotive!.caseId && c.motiveState === 'pending')) return false;
  // Derived numbers and nightly conclusions are replayed, never trusted.
  const derived = { ...liveProfile(p.evidence, config), facets: facetsAsOfLastEvening(p, config) };
  if (!almostEqual(derived, { lifetimeDistribution: p.lifetimeDistribution, currentDistribution: p.currentDistribution, coverage: p.coverage, confidence: p.confidence, facets: p.facets })) return false;
  let prev: DevelopmentProfileEveningSnapshot | undefined; let count = 0;
  for (const s of p.eveningSnapshots) {
    if ((prev && s.day <= prev.day) || s.day > state.day || s.asOfEvidenceCount < count || s.asOfEvidenceCount > p.evidence.length) return false;
    if (s.day === state.day && state.preparedEveningDay !== state.day) return false;
    if (p.evidence.slice(0, s.asOfEvidenceCount).some(e => e.day > s.day)) return false;
    if (!almostEqual(s, evaluateEvening(prev, p.evidence.slice(0, s.asOfEvidenceCount), s.day, developmentCurrentBefore(state, s.day), config))) return false;
    prev = s; count = s.asOfEvidenceCount;
  }
  const expected = prev ? adoptSnapshot({ ...p, eveningSnapshots: [] }, prev) : undefined;
  if (expected) {
    if (p.status !== expected.status || p.observedPrimary !== expected.observedPrimary || p.candidatePrimary !== expected.candidatePrimary || p.candidateSinceDay !== expected.candidateSinceDay ||
      p.candidateSinceIndependentActionCount !== expected.candidateSinceIndependentActionCount || p.fallback !== expected.fallback || p.leadingEdge !== expected.leadingEdge ||
      !almostEqual(p.emergingSignals, expected.emergingSignals)) return false;
  } else if (p.status !== 'insufficient' || p.observedPrimary || p.candidatePrimary || p.fallback || p.leadingEdge || p.emergingSignals.length) return false;
  return true;
}
