import { content } from '../content';
import { auditProfile, calculateProfileSlice, drawCard, facetAttention, facetPattern, facetTargetDistribution, fitsSchedule, portrait, profileConfig } from '../engine';
import type { GameState } from '../engine';
const round = (n: number) => Math.round(n * 10000) / 10000;
// Attention of the last decisions (a distribution of where free choices went, not a state of a sphere) and the target it gives the free story draw.
const attentionDebug = (game: GameState) => {
  const config = content.profile.facetAttention, a = facetAttention(game, content, config);
  return { enabled: content.profile.rollout.facetAttention, window: config.windowSize, evidence: a.evidence, attention: rounded(a.distribution), target: rounded(facetTargetDistribution(a, config)) };
};
const rounded = (v?: Record<string, number>) => v && Object.fromEntries(Object.entries(v).map(([k, n]) => [k, round(n)]));
// Every number of the profile can be traced to an actual card and choice here.
export function ProfileDebug({game}:{game:GameState}) {
 const p=game.heroDevelopmentProfile;const config=profileConfig(game,content);
 const current=calculateProfileSlice(game,content,{kind:'current'});
 const rows=auditProfile(game,content);
 return <details><summary>Профиль логики героя</summary><pre>{JSON.stringify({
  versions:{algorithm:p.algorithmVersion,scoring:config.scoringVersion,rubric:config.rubricVersion,content:game.contentVersion},
  status:p.status,observedPrimary:p.observedPrimary,candidatePrimary:p.candidatePrimary,candidateSinceDay:p.candidateSinceDay,
  developmentCurrent:game.development.developmentCurrent,currentOrigin:game.development.currentOrigin,transitionTarget:game.development.transitionTarget,
  fallback:p.fallback,leadingEdge:p.leadingEdge,emergingSignals:p.emergingSignals,
  currentDistribution:rounded(p.currentDistribution),lifetimeDistribution:rounded(p.lifetimeDistribution),
  N:current.N,W:round(current.W),K:current.K,delta:round(current.delta),coverage:round(current.coverage),confidence:round(current.confidence),
  facets:Object.fromEntries(Object.entries(p.facets).map(([f,x])=>[f,{sufficient:x.sufficient,current:x.current&&{N:x.current.N,W:round(x.current.W),K:x.current.K,confidence:round(x.current.confidence),distribution:rounded(x.current.distribution)}}])),
  snapshots:p.eveningSnapshots.map(s=>({day:s.day,status:s.status,observedPrimary:s.observedPrimary,candidatePrimary:s.candidatePrimary,asOfEvidenceCount:s.asOfEvidenceCount,N:s.current.N,confidence:round(s.current.confidence)})),
 },null,2)}</pre>
  <details><summary>Случаи ({p.cases.length})</summary><pre>{p.cases.map(c=>`${c.id}\n  action → motive:${c.motiveState} → behavior:${c.behaviorState} | ${c.status} | expiresDay ${c.expiresDay}`).join('\n')}</pre></details>
  <details><summary>Свидетельства ({rows.length})</summary><pre>{rows.map(r=>JSON.stringify({caseId:r.evidence.caseId,situationId:r.evidence.situationId,source:r.evidence.source,selectionOrigin:r.evidence.selectionOrigin,
   at:`${r.evidence.day}/${r.evidence.slot}`,card:r.evidence.cardId,choice:r.evidence.choiceId,vector:rounded(r.evidence.vector),developmentWeight:r.evidence.developmentWeight,
   sourceCoefficient:r.sourceCoefficient,effectiveWeight:round(r.effectiveWeight),contribution:rounded(r.contribution),current:r.inCurrent,reason:r.reason})).join('\n')}</pre></details></details>;
}
export function DebugPanel({game}:{game:GameState}) {
 if(new URLSearchParams(window.location.search).get('debug')!=='1')return null;
 const draw=drawCard(game,content);
 return <><details className="debug-panel"><summary>Отладка</summary><pre>{JSON.stringify({phase:game.phase,day:game.day,slot:game.slot,
 intention:game.declaredIntention,route:game.activeRoute,opportunities:game.opportunityState,exposure:game.opportunityExposure,
 facets:facetPattern(game,content),facetAttention:attentionDebug(game),facts:game.facts,qualities:game.qualities,flags:game.flags,
 current:game.current,baseText:draw?.card.text,variant:draw?.variantId,schedule:game.scheduled,crises:game.pendingCrises,
 deadlinesFit:fitsSchedule(game,content),traces:content.traces.filter(t=>game.history.some(h=>h.cardId===t.source.cardId&&h.choiceId===t.source.choiceId)),
 observations:game.observations,portrait:game.phase==='ending'?portrait(game,content):undefined},null,2)}</pre><ProfileDebug game={game}/></details></>;
}
