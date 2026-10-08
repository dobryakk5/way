export type Resource = 'wealth' | 'strength' | 'peace' | 'bonds';
export type Quality = 'attention' | 'honesty' | 'compassion' | 'letgo' | 'courage';
export type LifeFacet = 'work' | 'relationships' | 'body' | 'inner';
export type FactValue = string | boolean;
export type ActionLogic = 'opportunist' | 'diplomat' | 'expert' | 'achiever' | 'individualist' | 'strategist' | 'alchemist' | 'ironic';
export type DevelopmentKind = 'limitation' | 'trial' | 'review' | 'withdrawal' | 'transfer' | 'pressure' | 'consequence';
export type DevelopmentBeat = 'trial' | 'consequence' | 'review' | 'transfer' | 'pressure';
export interface DevelopmentEvent {
  eventId: string; arcId: string; contextId: string; kind: DevelopmentKind; when?: Condition;
  // A withdrawal belongs to one beat of a `beats` arc: the beat that was not mastered in this attempt.
  beat?: DevelopmentBeat;
}
export interface DevelopmentEvidence extends Omit<DevelopmentEvent, 'when'> {
  day: number; slot: number; cardId: string; choiceId?: string; variantId?: string;
}
export type CurrentOrigin = 'observed-initial' | 'promotion' | 'legacy-authored';
export type TransitionReason = 'promotion' | 'initial-reconciliation';
export interface HeroDevelopment {
  developmentCurrent?: ActionLogic; currentOrigin?: CurrentOrigin;
  // Audit record of how the very first stage came to exist; transitions are recorded separately.
  initialStage?: { logic: ActionLogic; origin: 'observed-initial' | 'legacy-authored'; day: number; available: ActionLogic[] };
  // Only logics confirmed in this run (or carried over as legacy). Earlier stages are never added by position.
  available: ActionLogic[]; transitionTarget?: ActionLogic; activeArcId?: string;
  evidence: DevelopmentEvidence[];
  pendingPromotion?: { arcId: string; to: ActionLogic };
  // A promotion, or the single correction of a wrong first center (`initial-reconciliation`, which closes `arcId` without promoting). One history for both.
  transitions: { arcId: string; from: ActionLogic; to: ActionLogic; day: number; evidenceIds: string[]; reason?: TransitionReason }[];
  // 0 until the one allowed correction of an `observed-initial` center has been used.
  initialRebaseCount: 0 | 1;
}
export interface DevelopmentContent {
  stages: { id: ActionLogic; name: string; description: string; ability: string; lens: string; wonder: string }[];
  arcs: { id: string; from: ActionLogic; to: ActionLogic; ability: string; question: string;
    // 'cycles' (default, expert-achiever): repeated trial/consequence/review cycles. 'beats': one required piece of evidence per beat, derived in beats.ts.
    model?: 'cycles' | 'beats';
    cycles: { trial: string; consequence: string; review: string }[]; minContexts: number; promotionText: string }[];
}
export type Condition =
  | { all: Condition[] } | { any: Condition[] } | { not: Condition }
  | { quality: Quality; gte?: number; lte?: number }
  | { resource: Resource; gte?: number; lte?: number }
  | { fact: string; equals: FactValue } | { flag: string } | { chapter: number }
  | { dayGte?: number; dayLte?: number } | { shown: string }
  | { chose: { card: string; choice: string } } | { topQuality: Quality; gte?: number }
  | { intention: LifeFacet } | { heroStage: ActionLogic } | { availableLogic: ActionLogic } | { developmentEvent: string }
  // State of one beat of a `beats` arc, derived from the evidence journal.
  | { developmentBeat: { arc: string; beat: DevelopmentBeat; is: 'done' | 'open' | 'withdrawn' } }
  // Enough ordinary decisions OR enough completed evenings since the beat was done / last withdrawn: spacing between beats and retry cooldown.
  | { developmentSince: { arc: string; beat: DevelopmentBeat; of: 'done' | 'withdrawal'; decisions: number; evenings: number } };
export interface Effects {
  resources?: Partial<Record<Resource, number>>;
  qualities?: Partial<Record<Quality, number>>;
  setFlags?: string[]; clearFlags?: string[]; setFacts?: Record<string, FactValue>;
  schedule?: { cardId: string; inDays: number; latestDay?: number }[];
  wisdomId?: string;
}
export type GoalId = 'order' | 'workshop' | 'alexey';
export type DecisionKind = 'pursue' | 'cost' | 'perspective' | 'experiment' | 'reconsider';
export type StoryLine = 'pace' | 'apprentice' | 'commitments';
export type DiagnosticSource = 'action' | 'motive' | 'behavior';
export type DiagnosticSelectionOrigin = 'neutral' | 'probe' | 'adaptive';
export type ProfileStatus = 'insufficient' | 'provisional' | 'stable';
export type LogicVector = Record<ActionLogic, number>;
export type RubricAxis = 'SELF' | 'OTHERS' | 'COMPLEXITY' | 'TIME' | 'PERSPECTIVE' | 'UNCERTAINTY';
export type DiagnosticRationale = Record<RubricAxis, string>;
export interface DiagnosticSignalDefinition {
  vector: LogicVector; rationale: DiagnosticRationale; scoringVersion: '1'; rubricVersion: '1';
}
export interface DiagnosticMotivePrompt {
  promptId: string; text: string; optional: true;
  options: { id: string; label: string; signal: DiagnosticSignalDefinition }[];
}
export interface DiagnosticBehaviorDefinition { continuesSituationId: string; signal: DiagnosticSignalDefinition }
// WORLD-IMPACT v1 (REQs/WORLD-IMPACT-v1.md): content-side audit metadata only. Never a fact of the world, never read by a Condition.
export type ImpactLevel = 'minor' | 'meaningful' | 'major';
export interface ChoiceImpactMeta {
  level: ImpactLevel;
  require?: { minObservable?: number; delayed?: boolean; crossCharacter?: boolean };
}
export interface Choice {
  id: string; label: string; effects: Effects; servesFacets?: LifeFacet[]; impact?: ChoiceImpactMeta;
  obligation?: string; decisionKinds?: DecisionKind[]; pursuesGoals?: GoalId[]; lineStep?: { line: StoryLine; step: string }; response?: string;
  developmentEvents?: DevelopmentEvent[];
  diagnosticAction?: DiagnosticSignalDefinition;
  diagnosticMotive?: DiagnosticMotivePrompt;
  diagnosticBehavior?: DiagnosticBehaviorDefinition;
}
export interface CardTextVariant {
  id: string; when: Condition; text: string;
  kind: 'perception' | 'consequence' | 'shadow' | 'intention';
  familiarCardId?: string;
}
export interface ChoiceVariant { when: Condition; choices: Choice[] }
/** The first variant whose `when` holds replaces the card image; same order semantics as `textVariants`. */
export interface VisualVariant { id: string; when: Condition; image: string; alt?: string }
/** The image a presented scene carries; chosen once when the scene is first shown and never recomputed. */
export interface ResolvedCardVisual { variantId?: string; image: string; alt?: string }
export interface CardDiagnostic {
  situationId: string; contextId: string; facets: LifeFacet[];
  developmentWeight: number; pressure?: boolean; expiresInDays?: number;
  // The scene can tell these logics apart; used for targeted probe selection only.
  distinguishes?: ActionLogic[];
}
export type CardType = 'situation' | 'routine' | 'chain' | 'crisis';
/**
 * FOCUSED-ENCOUNTERS v1.1: authored story anchors of an ORDINARY free scene. Content only: never saved, never read by scoring,
 * diagnostics or development. It says what story the scene belongs to; `requires` still decides whether it can happen at all.
 */
export interface FocusedStoryMeta {
  /** Existing story lines only (never a new registry). */
  lines?: StoryLine[];
  /** Ids of existing `threads.json` records. */
  threadIds?: string[];
  goalIds?: GoalId[];
  /** Literary role of the circumstance; independent of `Card.type`. */
  role: 'complication' | 'opportunity' | 'consequence' | 'relationship' | 'ambient';
  /** Only for a specially approved everyday scene (tier P5); requires `role: 'ambient'`. */
  worldFallback?: boolean;
}
export interface Card {
  id: string; chapter: number | 'any'; type: CardType; character?: string;
  facets?: LifeFacet[]; text: string;
  // 2 choices: the classic swipe pair. 3..4: shown in authored order (the diagnostic and development packages are position-balanced).
  choices: Choice[];
  textVariants?: CardTextVariant[]; choiceVariants?: ChoiceVariant[];
  // Optional base image (path under public/, no leading slash needed). Cards without one keep the UI's own scene art.
  image?: string; visualVariants?: VisualVariant[];
  key?: boolean; required?: boolean; at?: { day: number; slot: number };
  requires?: Condition; mustShowBy?: number; fixedSides?: boolean; weight?: number;
  once?: boolean; cooldownDays?: number;
  crisis?: { resource: Resource; edge: 0 | 100 };
  shadow?: { quality: Quality; evidence: Condition };
  tags?: string[];
  development?: { stages?: ActionLogic[]; arcId?: string; presentedEvents?: DevelopmentEvent[] };
  diagnostic?: CardDiagnostic;
  story?: FocusedStoryMeta;
}
export interface Insight {
  id: string; title: string; text: string; requires: Condition; effects: Effects;
  window: { fromDay: number; throughDay: number }; visibleResult: Condition;
}
export interface Wisdom { id: string; text: string }
export interface Reflection { id: string; text: string; optionalNote: boolean }
export interface DayText {
  id: string; part: 'morning' | 'evening'; day?: number; quality?: Quality;
  text: string; textVariants?: CardTextVariant[];
}
export interface Ending { id: string; title: string; text: string; requires: Condition; priority: number }
export interface PortraitFragment {
  id: string; text: string; requires: Condition;
  group: 'order' | 'alexey' | 'market' | 'relationship' | 'shadow';
}
export interface Trace {
  source: { cardId: string; choiceId: string };
  readers: { kind: 'card' | 'text' | 'ending' | 'fact'; id: string }[];
  // Concrete immediate response, available in the journal and evening, never a generic wisdom.
  response: string;
  visibleByDay?: number;
}
export interface IntentionOption { id: string; facet: LifeFacet; label: string }
export interface RouteOption { id: string; label: string; facets: LifeFacet[]; routePool: string }
export interface RouteMoment { day: number; slot: number; options: [RouteOption, RouteOption] }
export interface Opportunity {
  id: string; facet: LifeFacet; opensWhen: Condition; throughDay: number;
  resolvedFact: string; takenValue: FactValue; expiredValue: FactValue;
  // Exposure must be an actual shown card or an explicit, informed route decision.
  offeredAt: { day: number; slot: number }; offerText: string; cardIds: string[];
}
export interface EpisodeContract {
  id: string; title: string; days: number; daysPerChapter: number; slotsPerDay: number;
  intentionOptions: IntentionOption[]; routeMoments: RouteMoment[];
  routePools: Record<string, string[]>; opportunities: Opportunity[];
  finalFacts: string[]; initialFacts: Record<string, FactValue>;
  inheritedFactKeys: string[];
  chapters: { id: number; from: number; through: number; title: string }[];
  milestones: { id: string; day: number; slot: number }[];
  goalReviewDays: number[]; goals: { id: GoalId; label: string }[];
}
export interface FactDefinition { values: FactValue[]; initial: FactValue; finalValues?: FactValue[] }
export type Phase = 'morning' | 'intention' | 'route' | 'slot' | 'evening' | 'insight' | 'reflection' | 'chapter' | 'ending' | 'goal' | 'dice' | 'boundary' | 'motive';
export interface GameState {
  version: number; contentVersion: string; episodeId: string; runId: string; seed: number;
  // Present only for runs created after server persistence was introduced. Legacy runs remain local-only.
  serverPersistence?: {
    enabled: true;
    schema: 1;
    processedThroughDay?: number;
    lastProcessedSeq?: number;
    serverDevelopmentProjection?: {
      taxonomyVersion: string;
      evidenceModelVersion: string;
      calculationVersion: string;
      profileStatus: 'insufficient_data' | 'provisional' | 'stable' | 'transition';
      centerScores: Record<string, number>;
      currentCenter: string | null;
      currentCenterConfidence: number | null;
      emergingCenter: string | null;
      emergingCenterConfidence: number | null;
      evidenceCount: number;
    };
  };
  chapter: number; day: number; slot: number; phase: Phase;
  current?: { cardId: string; /** Legacy side of a two-choice card only. */ leftChoiceId?: string; /** Authored semantic ids; semantics always follow choiceId, never the index. */ choiceIds: string[]; text: string; variantId?: string; choices?: Choice[];
    // Frozen at first presentation; never recomputed after a reload or a profile update.
    selectionOrigin?: DiagnosticSelectionOrigin;
    // Frozen at first presentation like the text: a later change of facts never repaints a scene already shown.
    visual?: ResolvedCardVisual;
    // Stable server-persistence identity for this exact presentation. Numeric ids are derived from author keys.
    persistence?: {
      sceneInstanceId: string;
      sceneId: number;
      scenePresentationId: number;
      gameSlot: number;
      selectionOrigin: DiagnosticSelectionOrigin;
      choices: {
        authorChoiceId: string;
        choiceId: number;
        presentationId: number;
        position: number;
      }[];
    } };
  resources: Record<Resource, number>; qualities: Record<Quality, number>;
  declaredIntention?: LifeFacet; intentionHistory: { day: number; facet: LifeFacet }[];
  activeRoute?: { day: number; slot: number; optionId: string; facets: LifeFacet[] };
  routeHistory: { day: number; slot: number; optionId: string }[];
  opportunityState: Record<string, 'open' | 'taken' | 'expired'>;
  opportunityExposure: Record<string, { day: number; via: 'card' | 'route' }>;
  facts: Record<string, FactValue>; flags: string[]; inheritedFacts: Record<string, FactValue>;
  shown: Record<string, number[]>;
  scheduled: { cardId: string; day: number; latestDay?: number }[];
  pendingCrises: string[]; pendingWisdoms: string[];
  pendingInsight?: string; appliedInsights: string[]; pendingReflection?: string;
  resumePhase?: Phase; eveningPrimaryId?: string; preparedEveningDay?: number;
  lastMorningVariant?: { day: number; quality: Quality }; morningText?: string;
  journal: { day: number; kind: 'wisdom' | 'insight' | 'reflection'; id: string; note?: string }[];
  history: { day: number; slot: number; cardId: string; choiceId: string; text?: string; label?: string; facets?: LifeFacet[]; decisionKinds?: DecisionKind[]; goalId?: GoalId; response?: string }[];
  // Audit events are observations, not resources or personality scores.
  observations: { day: number; slot: number; kind: 'variant' | 'trace' | 'insight' | 'opportunity' | 'dropped'; id: string; text?: string }[];
  summaryCommitted: boolean;
  goal?: { id: GoalId; wording: string };
  goalHistory: { day: number; id: GoalId; wording: string; action: 'select' | 'keep' | 'clarify' | 'change' }[];
  evidence: { day: number; slot: number; cardId: string; choiceId: string; line: StoryLine; step: string }[];
  diceHistory: { day: number; slot: number; candidates: string[]; candidateOrigins?: DiagnosticSelectionOrigin[]; face?: number; cardId?: string }[];
  nights: { day: number; primary: string; note?: string; resources: Record<Resource, number>; /** Projection only: nothing in the engine reads it back. */ summary?: DaySummary }[];
  milestones: Record<string, { day: number; facts: Record<string, FactValue>; text: string }>;
  development: HeroDevelopment;
  heroDevelopmentProfile: HeroDevelopmentProfile;
  pendingMotive?: PendingMotive;
}
export interface EpisodeSummary {
  schemaVersion: number; episodeId: string; runId: string; endingId: string;
  facts: Record<string, FactValue>; completedAt: string; declaredIntention?: LifeFacet;
}
export interface WorldProfile { schemaVersion: number; archive: EpisodeSummary[]; selectedRunByEpisode: Record<string, string> }
export interface PlaytestMetrics {
  schemaVersion: number; episodeId: string; firstRunId?: string; reachedEnding: boolean;
  wantsNextStory?: boolean; firstEndingAction?: 'finish' | 'next' | 'share' | 'journal' | 'replay';
  firstRunHistory?: GameState['history'];
  events: { name: string; elapsedMs: number; day?: number; cardId?: string }[];
}
export interface GameContent {
  cards: Card[]; insights: Insight[]; endings: Ending[]; reflections: Reflection[];
  wisdoms: Wisdom[]; dayTexts: DayText[]; episode: EpisodeContract;
  factsSchema: Record<string, FactDefinition>; traces: Trace[]; portraitFragments: PortraitFragment[];
  development: DevelopmentContent;
  profile: ProfileConfigRegistry;
  threads: ThreadDefinition[];
  summaryTemplates: SummaryTemplates;
}

// ---------------------------------------------------------------------------------------------
// Day Reflection (REQs/DAY-REFLECTION-v1.md): a deterministic projection of the day's proven events. Never an input to the engine.
// ---------------------------------------------------------------------------------------------
export type SummarySource =
  | { kind: 'choice'; day: number; slot: number; cardId: string; choiceId: string }
  | { kind: 'observation'; day: number; slot: number; observationKind: 'trace' | 'opportunity' | 'variant'; id: string }
  | { kind: 'insight'; day: number; id: string }
  | { kind: 'scheduled'; cardId: string; day: number; latestDay?: number }
  | { kind: 'exposure'; day: number; opportunityId: string }
  | { kind: 'snapshot'; day: number };
export type ThreadStage = 'dormant' | 'open' | 'resolved' | 'abandoned';
/** A promise is firm only when the scheduled card is required and has a latest day; the runtime state proves it, not this record. */
export interface ThreadFollowUp { cardId: string; firmTexts: string[]; tomorrowTexts?: string[] }
export type ThreadDefinition =
  | { id: string; kind: 'fact'; fact: string; stages: Record<string, ThreadStage>;
      /** Said while the thread is open; the other stages are silent. */ texts: { open: string[] }; followUp?: ThreadFollowUp }
  | { id: string; kind: 'opportunity'; opportunityId: string; texts: Record<'open' | 'resolved' | 'abandoned', string[]> }
  | { id: string; kind: 'chain'; texts: string[]; followUp: ThreadFollowUp };
export interface SummaryChangeTemplate {
  id: string; priority: number; texts: string[];
  source: { cardId: string; choiceId: string; fact?: { key: string; value: FactValue } } | { observation: { kind: 'trace' | 'opportunity' | 'variant'; id: string } } | { insight: string };
}
/** An authored, neutral description of what a chosen action was, never the name of a stage; completes the sentence "Сегодня… ты <text>". */
export interface SummaryObservation { id: string; text: string }
export interface SummaryTemplates {
  rulesVersion: string;
  changes: SummaryChangeTemplate[];
  observations: SummaryObservation[];
  /** "cardId/choiceId" -> observation id. At most one per choice; kept outside the cards so presented pairs and saves stay byte-identical. */
  observed: Record<string, string>;
  echo: { repeat: string[]; varied: string[] };
  reflection: {
    just_started: string[]; forming: string[]; refining: string[]; downgrade: string[]; unsettled: string[];
    provisional: Record<ActionLogic, string[]>; stable: Record<ActionLogic, string[]>;
  };
}
export type ReflectionCase = 'downgrade' | 'refining' | 'provisional' | 'forming' | 'just_started' | 'stable' | 'unsettled';
/** What the day's own decisions literally were. Not a profile reading: it comes from authored labels of the chosen actions only. */
export interface DayEcho {
  kind: 'repeat' | 'varied'; observationId?: string;
  sources: Extract<SummarySource, { kind: 'choice' }>[];
  templateId: string; text: string;
}
export interface DaySummary {
  schema: 1; day: number; contentVersion: string; rulesVersion: string;
  /** The algorithm of this run's profile, never the current default. */
  profileAlgorithmVersion: string;
  worldChanges: { source: SummarySource; templateId: string; text: string }[];
  unfinished: { threadId: string; source: SummarySource; promise: 'firm' | 'soft'; templateId: string; text: string }[];
  reflection: {
    status: ProfileStatus; previousStatus?: ProfileStatus; previousCandidate?: ActionLogic; coverage: number;
    candidate?: ActionLogic; observed?: ActionLogic;
    case: ReflectionCase; templateId: string; text: string;
    /** Shown when the profile has nothing content-ful to say yet (not for provisional-with-candidate or stable). */
    echo?: DayEcho;
    transition?: { arcId: string; text: string };
  };
}

// ---------------------------------------------------------------------------------------------
// Hero development profile (v2.4 addendum). Observation of action logic, separate from `development`.
// ---------------------------------------------------------------------------------------------
export type LogicRubric = Record<ActionLogic, Record<RubricAxis, string>>;
export interface ProfileAlgorithmConfig {
  scoringVersion: string; rubricVersion: string;
  // 'full': an option contributes its whole vector (branch 1). 'contrast': what sets it apart from the rejected options (branch 2).
  scoring?: 'full' | 'contrast'; windowCases: number; defaultExpiresInDays: number;
  motivePrompt: { maxPerDay: number };
  probe: { maxShareOfIndependentWindow: number; maxBeforeShareRule: number; shareRuleFromIndependentCases: number };
  sourceWeights: Record<DiagnosticSource, number>;
  provisional: { minDay: number; minCases: number; minContexts: number };
  stableCandidate: { minDay: number; minCases: number; minWeight: number; minContexts: number; minLeaderShare: number; minDelta: number;
    minConfidence: number; evenings: number; minNewIndependentActionsBetweenConfirmations: number;
    // First-ever stable center only: the window's action cases must span at least this many facets (absent = not enforced).
    minFacetsFirstStable?: number };
  confidence: { nTarget: number; wTarget: number; kTarget: number; deltaTarget: number };
  facetConfidence: { nTarget: number; wTarget: number; kTarget: number; deltaTarget: number; minCases: number; minWeight: number; minContexts: number; minConfidence: number };
  fallback: { minActions: number; minContexts: number; minShare: number; minDelta: number; evenings: number };
  leadingEdge: { minShare: number; minActions: number; minComponent: number; minContexts: number };
  emerging: { minActions: number; minComponent: number; minContexts: number };
  rubric: { axes: Record<RubricAxis, string>; logics: LogicRubric };
}
/** Where free story attention goes (derived from history, never stored). Affects only how often ordinary free story scenes appear. */
export interface FacetAttentionConfig {
  windowSize: number; minEvidence: number; playerWeight: number;
  minMultiplier: number; maxMultiplier: number; declaredIntentionMultiplier: number;
}
/** FOCUSED-ENCOUNTERS v1.1: the days (inclusive) on which the context-aware selector applies when `rollout.focusedEncounters` is on. */
export interface FocusedEncountersConfig { fromDay: number; throughDay: number }
export interface ProfileConfigRegistry {
  currentAlgorithmVersion: string;
  // Rollout switches live outside immutable algorithm branches: they select content, they never change scoring.
  rollout: { adaptiveSelection: boolean; developmentArcs: boolean; facetAttention: boolean; focusedEncounters: boolean };
  facetAttention: FacetAttentionConfig;
  focusedEncounters: FocusedEncountersConfig;
  algorithms: Record<string, ProfileAlgorithmConfig>;
}
export interface HeroDevelopmentProfileEvidence {
  id: string; caseId: string; situationId: string; source: DiagnosticSource;
  day: number; slot: number; cardId: string; choiceId: string; variantId?: string; motiveOptionId?: string;
  contextId: string; facets: LifeFacet[]; pressure: boolean;
  selectionOrigin: DiagnosticSelectionOrigin; developmentWeight: number; vector: LogicVector;
  algorithmVersion: string; scoringVersion: string; rubricVersion: string; contentVersion: string;
}
export interface DiagnosticCase {
  id: string; situationId: string; openedDay: number; openedSlot: number; cardId: string; choiceId: string;
  contextId: string; facets: LifeFacet[]; pressure: boolean; actionOrigin: DiagnosticSelectionOrigin; developmentWeight: number;
  actionEvidenceId: string; motiveEvidenceId?: string; behaviorEvidenceId?: string;
  motiveState: 'none' | 'pending' | 'recorded' | 'skipped' | 'suppressed';
  behaviorState: 'none' | 'pending' | 'recorded' | 'expired';
  status: 'open' | 'complete' | 'expired'; expiresDay: number;
}
export interface DevelopmentProfileSlice {
  distribution?: LogicVector; N: number; W: number; K: number; delta: number; coverage: number; confidence: number; caseIds: string[];
}
export interface EmergingSignal { logic: ActionLogic; actionCount: number; contextIds: string[]; evidenceIds: string[] }
export interface DevelopmentProfileEveningSnapshot {
  day: number; status: ProfileStatus; current: DevelopmentProfileSlice;
  observedPrimary?: ActionLogic; candidatePrimary?: ActionLogic; candidateSinceDay?: number; candidateSinceIndependentActionCount?: number;
  asOfEvidenceCount: number;
  // Development logic known at the start of this evening, before any commit of the same night.
  developmentCurrent?: ActionLogic;
  fallbackCandidate?: ActionLogic; fallback?: ActionLogic; leadingEdge?: ActionLogic; emergingSignals: EmergingSignal[];
}
export interface HeroDevelopmentProfile {
  algorithmVersion: string;
  evidence: HeroDevelopmentProfileEvidence[]; cases: DiagnosticCase[];
  status: ProfileStatus;
  lifetimeDistribution?: LogicVector; currentDistribution?: LogicVector;
  observedPrimary?: ActionLogic; candidatePrimary?: ActionLogic; candidateSinceDay?: number; candidateSinceIndependentActionCount?: number;
  fallback?: ActionLogic; leadingEdge?: ActionLogic; emergingSignals: EmergingSignal[];
  coverage: number; confidence: number;
  facets: Record<LifeFacet, { lifetime?: DevelopmentProfileSlice; current?: DevelopmentProfileSlice; sufficient: boolean }>;
  eveningSnapshots: DevelopmentProfileEveningSnapshot[];
}
export interface PendingMotive {
  caseId: string; promptId: string; text: string; options: { id: string; label: string }[];
  resume: { day: number; slot: number; next: 'next-slot' | 'evening' };
}

// ---------------------------------------------------------------------------------------------
// World impact (REQs/WORLD-IMPACT-v1.md): what the hero can actually see of her own past decisions.
// Reports and tests only; nothing here is stored in GameState.
// ---------------------------------------------------------------------------------------------
export type ObservableImpactKind = 'callback' | 'choice' | 'visual' | 'delayed' | 'cross-character';
export interface ObservableImpactEvent {
  sourceCardId: string; sourceChoiceId: string; day: number; visibleCardId: string;
  kinds: ObservableImpactKind[]; sourceCharacter?: string; visibleCharacter?: string;
  /** Day of the source decision, to tell an immediate reaction from a later one. */
  sourceDay: number;
}
