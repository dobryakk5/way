import { BEATS, deriveBeatState } from './beats';
import { evaluateCondition } from './conditions';
import type { ActionLogic, Card, Choice, DevelopmentContent, DevelopmentEvent, DrawResult, GameContent, GameState, HeroDevelopment } from './index';
import { validateHeroDevelopmentProfile } from './heroDevelopmentProfile';

// A new hero has no stage: the first one appears only after a stable observed center (see heroDevelopmentProfile.ts).
export function initialDevelopment(): HeroDevelopment {
  return { available: [], evidence: [], transitions: [], initialRebaseCount: 0 };
}
/** A hero who starts with an authored stage (migrated v4 saves, scenario fixtures). Never used by a new game. */
export function legacyAuthoredDevelopment(content: GameContent, logic: ActionLogic, available: ActionLogic[]): HeroDevelopment {
  const arc = content.development.arcs.find(a => a.from === logic);
  return { developmentCurrent: logic, currentOrigin: 'legacy-authored', initialStage: { logic, origin: 'legacy-authored', day: 0, available: [...available] },
    available: [...available], evidence: [], transitions: [], initialRebaseCount: 0, ...(arc ? { activeArcId: arc.id, transitionTarget: arc.to } : {}) };
}
function record(state: GameState, content: GameContent, events: DevelopmentEvent[], cardId: string, choiceId?: string, variantId?: string): GameState {
  const added = events.filter(e => e.arcId === state.development.activeArcId && evaluateCondition(e.when, state, content))
    .map(({when: _when, ...e}) => ({...e, day:state.day, slot:state.slot, cardId, ...(choiceId ? {choiceId} : {}), ...(variantId ? {variantId} : {})}));
  const evidence = [...state.development.evidence];
  for (const e of added) if (!evidence.some(x => x.eventId === e.eventId && x.day === e.day && x.slot === e.slot)) evidence.push(e);
  return evidence.length === state.development.evidence.length ? state : {...state, development:{...state.development, evidence}};
}
export function recordDevelopmentChoice(state: GameState, content: GameContent, card: Card, choice: Choice): GameState {
  return prepareDevelopmentPromotion(record(state,content,choice.developmentEvents??[],card.id,choice.id),content);
}
export function recordDevelopmentPresentation(state: GameState, content: GameContent, draw: DrawResult): GameState {
  return record(state,content,draw.card.development?.presentedEvents??[],draw.card.id,undefined,draw.variantId);
}
/** A `beats` arc is ready when every beat has its evidence in order and the new way was used in a different context than it was first tried. */
function beatsProgress(state: GameState, arc: DevelopmentContent['arcs'][number]) {
  const beats = deriveBeatState(state.development.evidence, arc.id);
  const done = BEATS.flatMap(b => beats[b].done ? [beats[b].done!] : []);
  const ready = done.length === BEATS.length && beats.transfer.done!.contextId !== beats.trial.done!.contextId;
  return { arc, events: state.development.evidence.filter(e => e.arcId === arc.id), completed: [] as never[], transfer: done.filter(e => e.kind === 'transfer'), pressure: done.filter(e => e.kind === 'pressure'),
    contexts: [...new Set(done.filter(e => e.kind === 'trial' || e.kind === 'transfer').map(e => e.contextId))], ready, evidenceIds: done.map(e => e.eventId), beats };
}
export function developmentProgress(state: GameState, content: GameContent) {
  const arc = content.development.arcs.find(a => a.id === state.development.activeArcId && a.from === state.development.developmentCurrent);
  if (!arc) return undefined;
  if (arc.model === 'beats') return beatsProgress(state, arc);
  const events = state.development.evidence.filter(e => e.arcId === arc.id);
  let lastWithdrawal = -1;
  events.forEach((e,i) => { if(e.kind === 'withdrawal') lastWithdrawal = i; });
  const completed = arc.cycles.flatMap(c => {
    const trial = events.findIndex((e,i) => i > lastWithdrawal && e.eventId === c.trial);
    const outcome = events.findIndex((e,i) => i > trial && trial >= 0 && e.eventId === c.consequence);
    const review = events.findIndex((e,i) => i > outcome && outcome >= 0 && e.eventId === c.review);
    return review >= 0 ? [{trial:events[trial]!,consequence:events[outcome]!,review:events[review]!,index:review}] : [];
  });
  const firstReview = completed.length ? Math.min(...completed.map(c => c.index)) : Infinity;
  const transfer = events.filter((e,i) => i > firstReview && e.kind === 'transfer');
  const pressure = events.filter((e,i) => i > firstReview && e.kind === 'pressure');
  const contexts = new Set([...completed.map(c => c.trial.contextId),...transfer.map(e => e.contextId)]);
  const limitation = events.filter(e => e.kind === 'limitation');
  let latestTrial:typeof events[number]|undefined;
  for(const e of events)if(e.kind==='trial')latestTrial=e;
  const latestTrialReviewed=completed.some(c=>c.trial===latestTrial);
  const ready = latestTrialReviewed && limitation.length > 0 && completed.length > 0 && transfer.length > 0 && contexts.size >= arc.minContexts && pressure.length > 0;
  return {arc,events,completed,transfer,pressure,contexts:[...contexts],ready,
    evidenceIds: [...new Set([...limitation,...completed.flatMap(c=>[c.trial,c.consequence,c.review]),...transfer,...pressure].map(e=>e.eventId))]};
}
export function prepareDevelopmentPromotion(state: GameState, content: GameContent): GameState {
  const progress = developmentProgress(state,content);
  const development = {...state.development};
  if(progress?.ready) development.pendingPromotion={arcId:progress.arc.id,to:progress.arc.to};
  else delete development.pendingPromotion;
  return {...state,development};
}
export function commitDevelopmentPromotion(state: GameState, content: GameContent): GameState {
  const progress=developmentProgress(state,content);
  if(!progress?.ready || state.development.transitions.some(t=>t.arcId===progress.arc.id)) return state;
  const nextArc=content.development.arcs.find(a=>a.from===progress.arc.to);
  const { pendingPromotion: _pending, activeArcId: _arc, transitionTarget: _target, ...kept } = state.development;
  const development:HeroDevelopment={...kept,developmentCurrent:progress.arc.to,currentOrigin:'promotion',
    available:[...new Set([...state.development.available,progress.arc.to])],
    transitions:[...state.development.transitions,{arcId:progress.arc.id,from:progress.arc.from,to:progress.arc.to,day:state.day,evidenceIds:progress.evidenceIds}],
    ...(nextArc?{activeArcId:nextArc.id,transitionTarget:nextArc.to}:{})};
  return {...state,development};
}
const ADVANCED_KINDS: readonly string[] = ['consequence', 'review', 'transfer', 'pressure'];
/**
 * The one allowed correction of a wrong first center. Allowed only while the run still stands on its `observed-initial` center:
 * no consequence/review/transfer/pressure of the current arc, no promotion pending, and a *different* observed center that is
 * already stable (two evenings with new independent actions, see evaluateEvening).
 */
export function initialRebaseTarget(state: GameState): ActionLogic | undefined {
  const d = state.development; const p = state.heroDevelopmentProfile;
  if (d.currentOrigin !== 'observed-initial' || d.initialRebaseCount !== 0 || d.pendingPromotion || !d.developmentCurrent) return undefined;
  if (p.status !== 'stable' || !p.observedPrimary || p.observedPrimary === d.developmentCurrent) return undefined;
  if (d.activeArcId && d.evidence.some(e => e.arcId === d.activeArcId && ADVANCED_KINDS.includes(e.kind))) return undefined;
  return p.observedPrimary;
}
const closedArcId = (d: HeroDevelopment) => d.activeArcId ?? `initial:${d.developmentCurrent}`;
function rebased(d: HeroDevelopment, content: GameContent, to: ActionLogic, day: number): HeroDevelopment {
  const { pendingPromotion: _p, activeArcId: _a, transitionTarget: _t, ...kept } = d;
  const arc = content.development.arcs.find(a => a.from === to);
  return { ...kept, developmentCurrent: to, currentOrigin: 'observed-initial', available: [to], initialRebaseCount: 1,
    transitions: [...d.transitions, { arcId: closedArcId(d), from: d.developmentCurrent!, to, day, evidenceIds: [], reason: 'initial-reconciliation' as const }],
    ...(arc ? { activeArcId: arc.id, transitionTarget: arc.to } : {}) };
}
/** Closes the old arc (its evidence stays in history, never carried over) and starts from the corrected center. */
export function rebaseInitialDevelopment(state: GameState, content: GameContent): GameState {
  const to = initialRebaseTarget(state);
  return to ? { ...state, development: rebased(state.development, content, to, state.day) } : state;
}
/** The evening step after the profile has been updated: a correction if one is due, otherwise the usual promotion. */
export function advanceDevelopmentAtEvening(state: GameState, content: GameContent): GameState {
  return initialRebaseTarget(state) ? rebaseInitialDevelopment(state, content) : commitDevelopmentPromotion(state, content);
}
export function developmentCardEligible(state:GameState,card:Card):boolean {
  const stages=card.development?.stages;
  if(!stages) return true;
  const current=state.development.developmentCurrent;
  return !!current && stages.includes(current);
}
export function validateDevelopmentEvidence(state:GameState,content:GameContent):boolean {
  const d=state.development;
  const known=content.development.stages.map(s=>s.id);
  const profile=state.heroDevelopmentProfile;
  if(!d.developmentCurrent){
    // No stage yet: nothing may claim to belong to one, and a stable observed center would already have created it.
    return !d.currentOrigin&&!d.initialStage&&!d.available.length&&!d.evidence.length&&!d.transitions.length&&!d.activeArcId&&!d.transitionTarget&&!d.pendingPromotion&&!profile.eveningSnapshots.some(s=>s.observedPrimary);
  }
  const init=d.initialStage;
  if(!init||!known.includes(init.logic)||init.available.some(id=>!known.includes(id))||new Set(init.available).size!==init.available.length||!init.available.includes(init.logic))return false;
  if(init.origin==='observed-initial'){
    const first=profile.eveningSnapshots.find(s=>s.observedPrimary);
    if(!first||first.day!==init.day||first.observedPrimary!==init.logic||first.status!=='stable'||init.available.length!==1)return false;
  }
  if(!known.includes(d.developmentCurrent)||d.available.some(id=>!known.includes(id))||new Set(d.available).size!==d.available.length||!d.available.includes(d.developmentCurrent))return false;
  const keys=new Set<string>();
  let lastPosition=-1;
  for(const e of d.evidence){
    const position=e.day*content.episode.slotsPerDay+e.slot;
    if(position<lastPosition||e.day>state.day||(init.origin==='observed-initial'&&e.day<=init.day))return false;lastPosition=position;
    const key=`${e.eventId}/${e.day}/${e.slot}`;if(keys.has(key))return false;keys.add(key);
    if(d.transitions.some(t=>t.arcId===e.arcId&&e.day>t.day))return false;
    const card=content.cards.find(c=>c.id===e.cardId);
    const h=state.history.find(h=>h.day===e.day&&h.slot===e.slot&&h.cardId===e.cardId);
    const current=state.current?.cardId===e.cardId&&state.day===e.day&&state.slot===e.slot;
    const choices=card?.choices.concat(...(card.choiceVariants??[]).map(v=>v.choices))??[];
    const definition=e.choiceId?choices.find(c=>c.id===e.choiceId)?.developmentEvents?.find(x=>x.eventId===e.eventId):card?.development?.presentedEvents?.find(x=>x.eventId===e.eventId);
    if(!definition||definition.arcId!==e.arcId||definition.kind!==e.kind||definition.beat!==e.beat||definition.contextId!==e.contextId||(!h&&!current)||(e.choiceId&&h?.choiceId!==e.choiceId))return false;
    const presentedVariant = state.observations.find(o=>o.kind==='variant'&&o.day===e.day&&o.slot===e.slot&&card?.textVariants?.some(v=>v.id===o.id))?.id;
    if(e.choiceId&&e.variantId || !e.choiceId&&e.variantId!==presentedVariant)return false;
    const prefix=state.history.filter(h=>h.day<e.day||h.day===e.day&&h.slot<e.slot);
    const shown:GameState['shown']={};for(const h of prefix)(shown[h.cardId]??=[]).push(h.day);
    const snapshot={...state,history:prefix,shown};
    if(!evaluateCondition(definition.when,snapshot,content))return false;
  }
  const startArc=content.development.arcs.find(a=>a.from===init.logic);
  let reconstructed:HeroDevelopment={developmentCurrent:init.logic,currentOrigin:init.origin,initialStage:init,available:[...init.available],evidence:[],transitions:[],initialRebaseCount:0,
    ...(startArc?{activeArcId:startArc.id,transitionTarget:startArc.to}:{})};
  for(const t of d.transitions){
    if(t.reason==='initial-reconciliation'){
      const snap=profile.eveningSnapshots.find(s=>s.day===t.day);
      const before={...state,development:{...reconstructed,evidence:d.evidence.filter(e=>e.day<=t.day)}};
      if(reconstructed.currentOrigin!=='observed-initial'||reconstructed.initialRebaseCount!==0||t.from!==reconstructed.developmentCurrent||t.to===t.from||t.evidenceIds.length||
        t.arcId!==closedArcId(reconstructed)||t.day<1||t.day>state.day||t.day<=init.day||!snap||snap.status!=='stable'||snap.observedPrimary!==t.to||
        d.evidence.some(e=>e.arcId===reconstructed.activeArcId&&e.day<=t.day&&ADVANCED_KINDS.includes(e.kind))||developmentProgress(before,content)?.ready)return false;
      reconstructed=rebased(reconstructed,content,t.to,t.day);continue;
    }
    const arc=content.development.arcs.find(a=>a.id===t.arcId);
    if(!arc||arc.from!==reconstructed.developmentCurrent||arc.to!==t.to||t.from!==arc.from||t.day<1||t.day>state.day||(init.origin==='observed-initial'&&t.day<=init.day))return false;
    const snapshot={...state,development:{...reconstructed,evidence:d.evidence.filter(e=>e.day<=t.day)}};
    const progress=developmentProgress(snapshot,content);
    if(!progress?.ready||JSON.stringify([...t.evidenceIds].sort())!==JSON.stringify([...progress.evidenceIds].sort()))return false;
    reconstructed=commitDevelopmentPromotion(snapshot,content).development;
  }
  const expected=prepareDevelopmentPromotion({...state,development:{...reconstructed,evidence:d.evidence}},content).development;
  return d.developmentCurrent===expected.developmentCurrent&&d.currentOrigin===expected.currentOrigin&&d.initialRebaseCount===expected.initialRebaseCount&&JSON.stringify(d.available)===JSON.stringify(expected.available)&&d.activeArcId===expected.activeArcId&&d.transitionTarget===expected.transitionTarget&&JSON.stringify(d.pendingPromotion)===JSON.stringify(expected.pendingPromotion)&&validateHeroDevelopmentProfile(state,content);
}
