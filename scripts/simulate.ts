import { writeFileSync } from 'node:fs';
import { content } from '../src/content';
import { CONTENT_VERSION } from '../src/content/version';
import { evaluateCondition, facetPattern, dominantFacet, pickEnding, portrait, FACETS } from '../src/engine';
import { play, POLICIES } from './play';
import { shadowScenarios } from './shadow-scenarios';
const runs=Number(process.env.SIM_RUNS??1000);
if(!Number.isInteger(runs)||runs<1)throw new Error('SIM_RUNS must be a positive integer');
const failures:string[]=[];
const summaries=POLICIES.map(policy=>{
 const endings:Record<string,number>={},facts:Record<string,Record<string,number>>={},opportunities:Record<string,Record<string,number>>={},seen:Record<string,number>={},insights:Record<string,number[]>={},shadows:Record<string,number>={};
 let crises=0,dropped=0,scheduled=0,mismatches=0;const facets={work:0,relationships:0,body:0,inner:0};
 for(let seed=1;seed<=runs;seed++){
  const {state,draws,crises:n}=play(seed,{policy});crises+=n;
  const ending=pickEnding(state,content).id;endings[ending]=(endings[ending]??0)+1;
  if(state.history.length!==content.episode.days*content.episode.slotsPerDay)failures.push(`${policy}/${seed}: choice count differs from calendar`);
  if(state.nights.length!==content.episode.days)failures.push(`${policy}/${seed}: night count`);
  if(state.milestones.fair?.day!==10)failures.push(`${policy}/${seed}: fair milestone`);
  if(state.scheduled.some(s=>content.cards.find(c=>c.id===s.cardId)?.required))failures.push(`${policy}/${seed}: unfinished mandatory continuation`);
  for(const card of content.cards.filter(c=>c.at))if(!draws.some(d=>d.cardId===card.id&&d.day===card.at!.day&&d.slot===card.at!.slot))failures.push(`Missed fixed ${card.id}`);
  for(const r of content.episode.routeMoments){
   const h=state.routeHistory.find(h=>h.day===r.day&&h.slot===r.slot);const o=r.options.find(o=>o.id===h?.optionId);const d=draws.find(d=>d.day===r.day&&d.slot===r.slot);
   if(!o||!d||!content.episode.routePools[o.routePool]?.includes(d.cardId))failures.push(`Wrong route ${policy}/${seed}/${r.day}`);
  }
  for(const id of new Set(draws.map(d=>d.cardId)))seen[id]=(seen[id]??0)+1;
  for(const [k,v]of Object.entries(state.facts)){facts[k]??={};facts[k]![String(v)]=(facts[k]![String(v)]??0)+1;}
  for(const [k,v]of Object.entries(state.opportunityState)){opportunities[k]??={};opportunities[k]![v]=(opportunities[k]![v]??0)+1;}
  for(const i of state.appliedInsights){
   const day=state.observations.find(o=>o.kind==='insight'&&o.id===i)!.day;(insights[i]??=[]).push(day);
   if(day<6||day>8||!evaluateCondition(content.insights.find(x=>x.id===i)!.visibleResult,state,content))failures.push(`Insight result ${i}`);
  }
  for(const q of ['attention','honesty','compassion','letgo','courage'])if(state.flags.includes(`observed_shadow_${q}`))shadows[q]=(shadows[q]??0)+1;
  dropped+=state.observations.filter(o=>o.kind==='dropped').length;
  for(const h of state.history){const card=content.cards.find(c=>c.id===h.cardId)!;const ch=[...card.choices,...(card.choiceVariants??[]).flatMap(v=>v.choices)].find(c=>c.id===h.choiceId)!;scheduled+=ch.effects.schedule?.filter(s=>!content.cards.find(c=>c.id===s.cardId)?.required).length??0;}
  const counts=facetPattern(state,content);for(const f of FACETS)facets[f]+=counts[f];
  if(dominantFacet(state,content)&&dominantFacet(state,content)!==state.declaredIntention)mismatches++;
  const text=portrait(state,content);if(text.length<500||text.length>900)failures.push(`Portrait length ${text.length}: ${policy}/${seed}`);
 }
 const averageCrises=crises/runs;const dropPct=scheduled?dropped/scheduled*100:0;
 if(policy!=='always-costly'&&averageCrises>12)failures.push(`${policy}: average crises ${averageCrises}>12`);
 if(policy==='mixed'&&dropPct>5)failures.push('mixed: optional chain drop >5%');
 const ordinary=content.cards.filter(c=>c.chapter!==3&&c.chapter!==4&&c.type==='situation'&&!c.tags?.some(t=>t==='route-only'||t==='probe-only'||t.startsWith('insight:')));
 if(policy==='mixed')for(const card of ordinary)if((seen[card.id]??0)/runs<.5)failures.push(`mixed: ordinary ${card.id}<50%`);
 return {policy,runs,endings,facts,opportunities,averageCrises,optionalDropPct:dropPct,cardShowPct:Object.fromEntries(Object.entries(seen).map(([k,n])=>[k,n/runs*100])),insightDays:Object.fromEntries(Object.entries(insights).map(([k,ds])=>[k,{min:Math.min(...ds),max:Math.max(...ds),count:ds.length}])),shadows,facets,intentionDivergenceCount:mismatches};
});
const facetScenarios=FACETS.map(facet=>{
 const outcomes:Record<string,number>={};for(let seed=1;seed<=100;seed++){const {state}=play(seed,{policy:'mixed',facet});const id=pickEnding(state,content).id;outcomes[id]=(outcomes[id]??0)+1;}return {facet,endings:outcomes};
});
const shadowWitnesses=shadowScenarios();
const report={shadowWitnesses,contentVersion:CONTENT_VERSION,runsPerPolicy:runs,summaries,facetScenarios,failures:[...new Set(failures)]};
if(process.argv.includes('--write'))writeFileSync('reports/simulation.v2.5.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({runsPerPolicy:runs,summaries:summaries.map(s=>({policy:s.policy,endings:s.endings,averageCrises:s.averageCrises,opportunities:s.opportunities})),facetScenarios,failures:report.failures.slice(0,30)},null,2));
if(failures.length)process.exitCode=1;else console.log('SIMULATION v2.5 TARGETS OK');
