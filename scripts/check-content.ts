import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { content, contentMeta } from '../src/content';
import { ACTION_LOGICS, allChoices, evaluateCondition, startEpisode, FACETS, fitsSchedule } from '../src/engine';
import { isFacetWeightedDrawCandidate } from '../src/engine/facets';
import { buildImpactGraph, conditionReachable, decisionAtoms, impactOf } from '../src/engine/impact';
import type { Card, Condition, GameContent } from '../src/engine/types';
import * as schemas from './schema';
import { forbiddenText } from './stoplist';
import { loadSourceJson } from './v25/parse-package';
import { checkSource } from './v25/source-checks';
import { checkParity } from './v25/parity';
/** Before `stable` a text describes repeated actions in concrete situations, never a lasting property of the person. */
export const PERSONAL_TRAIT_PATTERN=/обычно|всегда|никогда|ты такой|ты из тех|по натуре|свойственн|склонен|склонна|предпочита|для тебя главн|тебе важно|ты —/i;
/** Day Reflection contract (REQs/DAY-REFLECTION-v1.md, sections 5, 6 and 14). */
export function summaryErrors(c:GameContent):string[]{
 const errors:string[]=[];const fail=(x:string)=>errors.push(x);
 const cardOf=(id:string)=>c.cards.find(x=>x.id===id);
 const choicesOf=(id:string)=>{const card=cardOf(id);return card?allChoices(card):[];};
 const schedulers=(cardId:string)=>c.cards.flatMap(card=>allChoices(card).flatMap(ch=>(ch.effects.schedule??[]).filter(sc=>sc.cardId===cardId)));
 const ids=c.threads.map(t=>t.id);if(new Set(ids).size!==ids.length)fail('Duplicate thread ids');
 const templateIds=c.summaryTemplates.changes.map(t=>t.id);if(new Set(templateIds).size!==templateIds.length)fail('Duplicate summary template ids');
 const followCards=c.threads.flatMap(t=>'followUp'in t&&t.followUp?[t.followUp.cardId]:[]);
 if(new Set(followCards).size!==followCards.length)fail('One follow-up card belongs to two threads');
 const opportunityFacts=new Set(c.episode.opportunities.map(o=>o.resolvedFact));
 const opportunityThreads=c.threads.flatMap(t=>t.kind==='opportunity'?[t.opportunityId]:[]);
 if(new Set(opportunityThreads).size!==opportunityThreads.length)fail('One opportunity belongs to two threads');
 const soon=/завтра|послезавтра|сегодня/i;
 for(const t of c.summaryTemplates.changes){
  if('cardId'in t.source){
   const ch=choicesOf(t.source.cardId).find(x=>x.id===(t.source as {choiceId:string}).choiceId);
   if(!ch)fail(`Summary template ${t.id} points at an unknown choice`);
   else if(t.source.fact&&ch.effects.setFacts?.[t.source.fact.key]!==t.source.fact.value)fail(`Summary template ${t.id} claims a fact its choice does not set`);
  }else if('insight'in t.source){const id=t.source.insight;if(!c.insights.some(i=>i.id===id))fail(`Summary template ${t.id} points at an unknown insight`);}
 }
 const followUp=(t:{id:string},f:{cardId:string;firmTexts:string[];tomorrowTexts?:string[]}|undefined)=>{
  if(!f)return;
  const card=cardOf(f.cardId);
  if(!card){fail(`Thread ${t.id}: unknown follow-up card ${f.cardId}`);return;}
  // Only a required chain with a latest day can be promised: the engine refuses to skip it.
  const firm=!!card.required&&schedulers(card.id).some(sc=>sc.latestDay!==undefined);
  if(card.required&&!firm)fail(`Thread ${t.id}: required follow-up ${card.id} is scheduled without latestDay`);
  if(firm&&!f.firmTexts.length)fail(`Thread ${t.id}: a firm follow-up needs firmTexts`);
  if(!firm&&(f.firmTexts.length||f.tomorrowTexts?.length))fail(`Thread ${t.id}: ${card.id} is not guaranteed, it cannot carry a firm promise`);
  if(f.firmTexts.some(x=>soon.test(x)))fail(`Thread ${t.id}: firmTexts must not name a day`);
  if(f.tomorrowTexts?.some(x=>!/завтра/i.test(x)))fail(`Thread ${t.id}: tomorrowTexts must say 'завтра'`);
  if(!schedulers(card.id).length)fail(`Thread ${t.id}: nothing schedules ${card.id}`);
 };
 for(const t of c.threads){
  const soft=t.kind==='fact'?t.texts.open:t.kind==='chain'?t.texts:[...t.texts.open,...t.texts.resolved,...t.texts.abandoned];
  if(soft.some(x=>soon.test(x)))fail(`Thread ${t.id}: only a firm follow-up may name a day`);
  if(t.kind==='fact'){
   const def=c.factsSchema[t.fact];
   if(!def){fail(`Thread ${t.id}: unknown fact ${t.fact}`);continue;}
   if(opportunityFacts.has(t.fact))fail(`Thread ${t.id}: ${t.fact} belongs to an opportunity, use an opportunity thread`);
   const values=def.values.map(String).sort(),stages=Object.keys(t.stages).sort();
   if(values.join('|')!==stages.join('|'))fail(`Thread ${t.id}: stages must cover exactly the values of ${t.fact}`);
   if(t.stages[String(def.initial)]!=='dormant')fail(`Thread ${t.id}: the initial value of ${t.fact} must be dormant`);
   const setters=new Set(c.cards.flatMap(card=>allChoices(card).flatMap(ch=>Object.entries(ch.effects.setFacts??{}).filter(([k])=>k===t.fact).map(([,v])=>String(v)))));
   for(const [v,stage] of Object.entries(t.stages))if(stage!=='dormant'&&!setters.has(v))fail(`Thread ${t.id}: stage of ${t.fact}=${v} is unreachable`);
   if(!Object.values(t.stages).includes('open'))fail(`Thread ${t.id}: no open stage`);
   followUp(t,t.followUp);
  }else if(t.kind==='opportunity'){
   if(!c.episode.opportunities.some(o=>o.id===t.opportunityId))fail(`Thread ${t.id}: unknown opportunity ${t.opportunityId}`);
  }else{
   if(cardOf(t.followUp.cardId)?.type!=='chain')fail(`Thread ${t.id}: a chain thread needs a chain card`);
   followUp(t,t.followUp);
  }
 }
 const r=c.summaryTemplates.reflection;
 for(const logic of ACTION_LOGICS){
  const p=r.provisional[logic],s=r.stable[logic];
  if(p.some(x=>s.includes(x)))fail(`Reflection ${logic}: provisional and stable texts must differ`);
  for(const x of p){
   if(!/^В нескольких ситуациях ты /.test(x)||!/Посмотрим/.test(x))fail(`Reflection ${logic}: a provisional text describes repeated actions and ends with a caution`);
  }
 }
 const beforeStable:[string,string[]][]=[['just_started',r.just_started],['forming',r.forming],['refining',r.refining],['downgrade',r.downgrade],['unsettled',r.unsettled],
  ...ACTION_LOGICS.map((l):[string,string[]]=>[`provisional.${l}`,r.provisional[l]])];
 for(const [name,list] of beforeStable)for(const x of list)if(PERSONAL_TRAIT_PATTERN.test(x))fail(`Reflection ${name}: states a lasting property of the person before stable: ${x}`);
 for(const e of echoErrors(c))errors.push(e);
 return errors;
}
/** The behavioural echo describes only what the chosen actions literally were (REQs/DAY-REFLECTION-v1.md, 6.3). */
export function echoErrors(c:GameContent):string[]{
 const errors:string[]=[];const fail=(x:string)=>errors.push(x);
 const t=c.summaryTemplates;
 const ids=t.observations.map(o=>o.id);if(new Set(ids).size!==ids.length)fail('Duplicate observation ids');
 for(const o of t.observations){
  if(PERSONAL_TRAIT_PATTERN.test(o.text)||/(^|[^а-яё])ты([^а-яё]|$)/i.test(o.text))fail(`Observation ${o.id} states a property of the person or addresses them`);
  if(ACTION_LOGICS.some(l=>o.id.includes(l)))fail(`Observation ${o.id} is named after a stage`);
  if(Object.values(t.observed).filter(v=>v===o.id).length<2)fail(`Observation ${o.id} is used by fewer than two choices, so it can never repeat`);
 }
 for(const [key,id] of Object.entries(t.observed)){
  const [cardId,choiceId]=key.split('/');
  const card=c.cards.find(x=>x.id===cardId);
  if(!card||!allChoices(card).some(ch=>ch.id===choiceId))fail(`Observation mapping ${key} points at an unknown choice`);
  if(!ids.includes(id))fail(`Observation mapping ${key} uses unknown observation ${id}`);
 }
 for(const x of t.echo.repeat){
  if((x.match(/\{action\}/g)??[]).length!==1)fail('An echo repeat text must contain {action} exactly once');
  if(!/^Сегодня /.test(x)||!/посмотрим/i.test(x))fail('An echo repeat text speaks about today and ends with a caution');
  if(PERSONAL_TRAIT_PATTERN.test(x))fail(`Echo text states a lasting property: ${x}`);
 }
 for(const x of t.echo.varied){if(!/^Сегодня /.test(x)||PERSONAL_TRAIT_PATTERN.test(x))fail(`Echo varied text must speak about today only: ${x}`);}
 return errors;
}
/** Files of the visual layer live under public/; a content path is relative to it, with or without a leading slash. */
export const publicAsset = (image: string) => join(process.cwd(), 'public', image.replace(/^\/+/, ''));
/**
 * World impact contract (REQs/WORLD-IMPACT-v1.md, sections 6, 13, 15, 16): variants must be reachable and unambiguous, and a choice
 * that claims to matter must have consequences the hero can actually meet. The consequences are read from the real content.
 */
export function impactErrors(c: GameContent, assetExists: (image: string) => boolean = image => existsSync(publicAsset(image))): string[] {
 const errors: string[] = []; const fail = (x: string) => errors.push(x);
 for (const card of c.cards) {
  for (const v of card.textVariants ?? []) if (!conditionReachable(c, v.when)) fail(`Text variant ${card.id}/${v.id} can never hold: nothing writes what it reads`);
  card.choiceVariants?.forEach((v, i) => {
   if (!conditionReachable(c, v.when)) fail(`Choice variant #${i} of ${card.id} can never hold: nothing writes what it reads`);
   const ids = v.choices.map(ch => ch.id).join('|');
   if (ids === card.choices.map(ch => ch.id).join('|')) fail(`Choice variant #${i} of ${card.id} offers the same choices as the base pair`);
  });
  if (card.image && !assetExists(card.image)) fail(`Card ${card.id}: image ${card.image} does not exist`);
  const variants = card.visualVariants ?? [];
  if (new Set(variants.map(v => v.id)).size !== variants.length) fail(`Duplicate visualVariant ids in ${card.id}`);
  variants.forEach((v, i) => {
   if (!assetExists(v.image)) fail(`Visual variant ${card.id}/${v.id}: image ${v.image} does not exist`);
   if (!conditionReachable(c, v.when)) fail(`Visual variant ${card.id}/${v.id} can never hold: nothing writes what it reads`);
   if (!decisionAtoms(v.when).length) fail(`Visual variant ${card.id}/${v.id} does not depend on any decision`);
   // First match wins: a later variant whose conjunction contains an earlier one's can never be reached (an exact duplicate included).
   const conj = (x: Condition): string[] => 'all' in x ? x.all.flatMap(conj) : [JSON.stringify(x)];
   const mine = conj(v.when);
   for (const earlier of variants.slice(0, i)) if (conj(earlier.when).every(a => mine.includes(a))) fail(`Visual variant ${card.id}/${v.id} is shadowed by ${earlier.id}`);
  });
 }
 const graph = buildImpactGraph(c);
 for (const card of c.cards) for (const ch of allChoices(card)) {
  if (!ch.impact) continue;
  const where = `${card.id}/${ch.id}`;
  const { count, kinds } = impactOf(graph, card.id, ch.id);
  const base = ch.impact.level === 'minor' ? 0 : ch.impact.level === 'meaningful' ? 1 : 2;
  const need = Math.max(base, ch.impact.require?.minObservable ?? 0);
  if (count < need) fail(`${ch.impact.level} choice ${where} has ${count} observable consequence(s), needs ${need}`);
  if (ch.impact.level === 'major' && count >= need && !(kinds.has('delayed') || kinds.has('cross-character') || kinds.has('choice')))
   fail(`major choice ${where} has only immediate consequences: it needs a delayed, cross-character or future-choice one`);
  if (ch.impact.require?.delayed && !kinds.has('delayed')) fail(`Choice ${where} requires a delayed consequence and has none`);
  if (ch.impact.require?.crossCharacter && !kinds.has('cross-character')) fail(`Choice ${where} requires a cross-character consequence and has none`);
  if (ch.impact.require?.minObservable !== undefined && ch.impact.level === 'minor') fail(`Choice ${where}: a minor choice has no requirements`);
 }
 return errors;
}
/**
 * FOCUSED-ENCOUNTERS v1.1, section 12.1. `story` is a content anchor of an ORDINARY free scene only; the protected categories stay unmarked.
 * Anchors are checked against what can really happen (a line some choice writes, a thread that exists, a `requires` that can be met),
 * not only against non-empty fields. When the rollout flag is on, every ordinary scene of the covered chapters needs an anchor.
 */
/** The first day a condition can hold, looking only at calendar terms (a card gated to a later day is not available inside an earlier range). */
function earliestDay(x:Condition|undefined):number{
 if(!x)return 1;
 if('all'in x)return Math.max(1,...x.all.map(earliestDay));
 if('any'in x)return Math.min(...x.any.map(earliestDay));
 if('dayGte'in x&&x.dayGte!==undefined)return x.dayGte;
 return 1;
}
export function focusedEncountersErrors(c:GameContent):string[]{
 const errors:string[]=[];const fail=(x:string)=>errors.push(x);
 const threadIds=new Set(c.threads.map(t=>t.id));
 const writtenLines=new Set(c.cards.flatMap(card=>allChoices(card).flatMap(ch=>ch.lineStep?[ch.lineStep.line]:[])));
 const range=c.profile.focusedEncounters;
 if(range.throughDay>c.episode.days)fail(`focusedEncounters.throughDay ${range.throughDay} is beyond the episode (${c.episode.days} days)`);
 for(const card of c.cards){
  const story=card.story;
  if(!story)continue;
  if(!isFacetWeightedDrawCandidate(card))fail(`story on a protected or non-ordinary scene ${card.id}: neutral, probe, development, route-only, fixed, obligatory and chain scenes are not marked`);
  for(const id of story.threadIds??[])if(!threadIds.has(id))fail(`story.threadIds of ${card.id} names an unknown thread ${id}`);
  for(const line of story.lines??[])if(!writtenLines.has(line))fail(`story.lines of ${card.id}: no choice ever writes the line ${line}, it can never be fresh`);
  if(story.worldFallback&&story.role!=='ambient')fail(`worldFallback needs role ambient ${card.id}`);
  if(card.requires&&!conditionReachable(c,card.requires))fail(`story scene ${card.id} has a requires that can never hold`);
 }
 if(c.profile.rollout.focusedEncounters){
  const covered=c.episode.chapters.filter(ch=>ch.from<=range.throughDay&&ch.through>=range.fromDay).map(ch=>ch.id);
  for(const card of c.cards)if(isFacetWeightedDrawCandidate(card)&&!card.story&&(card.chapter==='any'||covered.includes(card.chapter))&&earliestDay(card.requires)<=range.throughDay)fail(`ordinary scene ${card.id} has no story anchor inside the focused range ${range.fromDay}-${range.throughDay}`);
 }
 return errors;
}
export function validateContent(c: GameContent): string[] {
 const errors: string[]=[]; const fail=(s:string)=>errors.push(s);
 const check=(name:string,schema:{safeParse(v:unknown):{success:boolean;error?:unknown}},v:unknown)=>{const r=schema.safeParse(v);if(!r.success)fail(`${name}: ${JSON.stringify(r.error)}`);};
 check('development',schemas.developmentSchema,c.development);check('profile config',schemas.profileConfigSchema,c.profile);
 check('cards',schemas.cardSchema.array(),c.cards);check('episode',schemas.episodeSchema,c.episode);
 check('facts',schemas.factsSchema,c.factsSchema);check('traces',schemas.traceSchema.array(),c.traces);
 check('portraits',schemas.portraitFragmentSchema.array(),c.portraitFragments);check('days',schemas.dayTextSchema.array(),c.dayTexts);
 check('insights',schemas.insightSchema.array(),c.insights);check('endings',schemas.endingSchema.array(),c.endings);
 check('wisdoms',schemas.wisdomSchema.array(),c.wisdoms);check('reflections',schemas.reflectionSchema.array(),c.reflections);
 check('threads',schemas.threadSchema.array(),c.threads);check('summary templates',schemas.summaryTemplatesSchema,c.summaryTemplates);
 if(errors.length)return errors;
 let expectedDay=1;
 for(const chapter of c.episode.chapters){if(chapter.from!==expectedDay||chapter.through<chapter.from)fail('Chapter calendar has a gap or overlap');expectedDay=chapter.through+1;}
 if(expectedDay!==c.episode.days+1)fail('Chapter calendar does not cover available days');
 for(const card of c.cards)if(card.at&&(card.at.day>c.episode.days||!c.episode.chapters.some(ch=>ch.id===card.chapter&&card.at!.day>=ch.from&&card.at!.day<=ch.through)))fail(`Scene outside calendar ${card.id}`);
 for(const milestone of c.episode.milestones)if(!c.cards.some(card=>card.at?.day===milestone.day&&card.at.slot===milestone.slot))fail(`Milestone lacks a scene ${milestone.id}`);
 const ids=new Map(c.cards.map(card=>[card.id,card]));
 const unique=(name:string,values:string[])=>{if(new Set(values).size!==values.length)fail(`Duplicate ${name}`);};
 unique('card ids',c.cards.map(x=>x.id));
 for(const [name,items] of Object.entries({insights:c.insights,endings:c.endings,wisdoms:c.wisdoms,reflections:c.reflections,days:c.dayTexts,portraits:c.portraitFragments}))unique(name,items.map(x=>x.id));
 unique('trace sources',c.traces.map(t=>`${t.source.cardId}/${t.source.choiceId}`));
 const writers=new Set<string>(); const readers=new Set<string>();const factReaders=new Set<string>();const factWriters=new Set<string>();
 function walk(x:Condition|undefined){
  if(!x)return;
  if('all'in x)return x.all.forEach(walk);if('any'in x)return x.any.forEach(walk);if('not'in x)return walk(x.not);
  if('heroStage'in x&&!c.development.stages.some(s=>s.id===x.heroStage))fail(`Unknown stage ${x.heroStage}`);
  if('availableLogic'in x&&!c.development.stages.some(s=>s.id===x.availableLogic))fail(`Unknown available logic ${x.availableLogic}`);
  if('developmentEvent'in x&&!developmentEvents.some(e=>e.eventId===x.developmentEvent))fail(`Unknown development event ${x.developmentEvent}`);
  for(const atom of ['developmentBeat','developmentSince'] as const)if(atom in x){
   const arc=(x as unknown as Record<string,{arc:string}>)[atom]!.arc;
   if(c.development.arcs.find(a=>a.id===arc)?.model!=='beats')fail(`${atom} refers to ${arc}, which is not a beats arc`);
  }
  if('fact'in x){factReaders.add(x.fact);if(!c.factsSchema[x.fact]?.values.includes(x.equals))fail(`Unknown fact/value ${x.fact}/${x.equals}`);}
  if('flag'in x)readers.add(x.flag);
  if('shown'in x&&!ids.has(x.shown))fail(`Unknown shown ${x.shown}`);
  if('chose'in x&&!ids.get(x.chose.card)?.choices.concat(...(ids.get(x.chose.card)?.choiceVariants??[]).map(v=>v.choices)).some(ch=>ch.id===x.chose.choice))fail(`Unknown choice ${JSON.stringify(x.chose)}`);
 }
 const developmentEvents=c.cards.flatMap(card=>[...(card.development?.presentedEvents??[]),...allChoices(card).flatMap(ch=>ch.developmentEvents??[])]);
 unique('development event ids',developmentEvents.map(e=>e.eventId));
 unique('stage ids',c.development.stages.map(s=>s.id));
 unique('development arcs',c.development.arcs.map(a=>a.id));
 for(const card of c.cards){
  if(card.development?.stages&&(card.at||card.required||card.mustShowBy||card.type==='chain'||c.episode.routeMoments.some(r=>r.options.some(o=>c.episode.routePools[o.routePool]?.includes(card.id)))))fail(`Required scene cannot be stage gated ${card.id}`);
 }
 for(const e of developmentEvents){walk(e.when);if(!c.development.arcs.some(a=>a.id===e.arcId))fail(`Unknown arc ${e.arcId}`);}
 for(const a of c.development.arcs){
  const from=c.development.stages.findIndex(s=>s.id===a.from);
  if(c.development.stages[from+1]?.id!==a.to)fail(`Non-adjacent development transition ${a.id}`);
  if(!c.cards.some(card=>card.development?.stages?.includes(a.to)||card.textVariants?.some(v=>JSON.stringify(v.when).includes(JSON.stringify({heroStage:a.to})))))fail(`No content for reachable stage ${a.to}`);
 }
 for(const card of c.cards){
  if((card.at||card.required||card.type==='chain')&&/heroStage|availableLogic|developmentEvent/.test(JSON.stringify(card.requires??{})))fail(`Required story cannot depend on development ${card.id}`);
  const beatsArc=(id:string)=>c.development.arcs.find(a=>a.id===id)?.model==='beats';
  for(const e of card.development?.presentedEvents??[])if(!['limitation','consequence'].includes(e.kind)||beatsArc(e.arcId))fail(`Choice event used as presentation ${e.eventId}`);
  // In a beats arc the player's own decision is the evidence of every beat, including the consequence she accepts; a limitation does not exist there.
  for(const ch of allChoices(card))for(const e of ch.developmentEvents??[])if(beatsArc(e.arcId)?e.kind==='limitation':['consequence','limitation'].includes(e.kind))fail(`Presentation event used as decision ${e.eventId}`);
  for(const ch of allChoices(card))for(const e of ch.developmentEvents??[])if(beatsArc(e.arcId)?(e.kind==='withdrawal')!==(e.beat!==undefined):e.beat!==undefined)fail(`A withdrawal names its beat, in beats arcs only ${e.eventId}`);
 }
 for(const a of c.development.arcs)for(const cycle of a.cycles)for(const kind of ['trial','consequence','review'] as const)if(!developmentEvents.some(e=>e.arcId===a.id&&e.eventId===cycle[kind]&&e.kind===kind))fail(`Missing cycle ${a.id}/${kind}`);
 const slots=new Map<string,string>();const perDay=new Map<number,number>();
 function reserve(day:number,slot:number,label:string){const key=`${day}/${slot}`;if(slots.has(key))fail(`Reserved collision ${key}`);slots.set(key,label);perDay.set(day,(perDay.get(day)??0)+1);}
 const targetSources=new Map<string,Card[]>();const texts:string[]=[];
 for(const card of c.cards){
  if(card.character&&!contentMeta.characters.some(ch=>ch.id===card.character))fail(`Unknown character ${card.character}`);
  if(card.at)reserve(card.at.day,card.at.slot,card.id);
  walk(card.requires);walk(card.shadow?.evidence);texts.push(card.text);
  unique(`choice ids ${card.id}`,allChoices(card).map(ch=>ch.id));
  for(const v of card.textVariants??[]){walk(v.when);texts.push(v.text);if(v.familiarCardId&&!ids.has(v.familiarCardId))fail(`Unknown familiar scene ${v.id}`);}
  for(const v of card.choiceVariants??[])walk(v.when);
  for(const v of card.visualVariants??[])walk(v.when);
  for(const ch of allChoices(card)){
   texts.push(ch.label);if(!ch.servesFacets?.length)fail(`Missing servesFacets ${card.id}/${ch.id}`);
   if(!card.key&&Object.values(ch.effects.qualities??{}).some(n=>Math.abs(n)>1))fail(`Non-key quality ±2 ${card.id}`);
   for(const f of ch.effects.setFlags??[])writers.add(f);
   for(const f of ch.effects.clearFlags??[])readers.add(f);
   for(const [k,v]of Object.entries(ch.effects.setFacts??{})){factWriters.add(k);if(!c.factsSchema[k]?.values.includes(v))fail(`Invalid setFacts ${k}`);}
   if(ch.effects.wisdomId&&!c.wisdoms.some(w=>w.id===ch.effects.wisdomId))fail(`Unknown wisdom ${card.id}`);
   for(const s of ch.effects.schedule??[]){
    const target=ids.get(s.cardId);if(!target||target.type!=='chain'){fail(`Unknown/non-chain schedule ${s.cardId}`);continue;}
    targetSources.set(s.cardId,[...(targetSources.get(s.cardId)??[]),card]);
    if(target.required&&s.latestDay===undefined)fail(`Required chain without latestDay ${s.cardId}`);
    const bounds=(x:Condition|undefined):number=>!x?c.episode.days:'dayLte'in x?x.dayLte??c.episode.days:'all'in x?Math.min(...x.all.map(bounds)):c.episode.days;
    const last=card.at?.day??Math.min(c.episode.chapters.find(ch=>ch.id===card.chapter)?.through??c.episode.days,bounds(card.requires));
    if(last+s.inDays>c.episode.days||(s.latestDay!==undefined&&last+s.inDays>s.latestDay))fail(`Schedule exceeds window ${card.id}->${s.cardId}`);
   }
   if(['situation','chain'].includes(card.type)&&!c.traces.some(t=>t.source.cardId===card.id&&t.source.choiceId===ch.id))fail(`No trace ${card.id}/${ch.id}`);
  }
  if(card.shadow){
   const e=JSON.stringify(card.shadow.evidence);if(!e.includes('chose')&&!e.includes('flag'))fail(`Shadow has no action evidence ${card.id}`);
   const v=card.textVariants?.find(v=>v.kind==='shadow');
   if(!v||!JSON.stringify(v.when).includes(JSON.stringify(card.shadow.evidence))||!JSON.stringify(v.when).includes('"gte":8'))fail(`Shadow is not conjunctively gated ${card.id}`);
   writers.add(`observed_shadow_${card.shadow.quality}`);
  }
 }
 for(const card of c.cards.filter(x=>x.type==='chain')){
  const sources=targetSources.get(card.id)??[];if(!sources.length)fail(`No source for ${card.id}`);
  if(card.at&&!sources.some(src=>src.at&&allChoices(src).every(ch=>ch.effects.schedule?.some(s=>s.cardId===card.id&&src.at!.day+s.inDays===card.at!.day))))fail(`Fixed chain is not scheduled by every predecessor answer ${card.id}`);
 }
 for(const r of c.episode.routeMoments){
  reserve(r.day,r.slot,'route');unique('route option ids',r.options.map(o=>o.id));
  for(const o of r.options){
   const pool=c.episode.routePools[o.routePool]??[];
   if(pool.length<2)fail(`Route pool <2 ${o.routePool}`);
   const state={...startEpisode(c,1,'validate'),day:r.day,slot:r.slot,chapter:Math.ceil(r.day/c.episode.daysPerChapter)};
   const possible=pool.filter(id=>{const card=ids.get(id);return card&&!card.at&&['situation','routine'].includes(card.type)&&card.facets?.some(f=>o.facets.includes(f))&&(card.chapter==='any'||card.chapter===state.chapter)&&evaluateCondition(card.requires,state,c);});
   if(possible.length<2)fail(`Route pool lacks two reachable scenes ${o.routePool}`);
  }
 }
 for(const [d,n]of perDay)if(n>2)fail(`Reserved slots >2 on day ${d}`);
 // Explore mutually exclusive required branches separately: alternatives must not be double-counted.
 let schedules: { cardId:string; day:number; latestDay?:number }[][]=[[]];
 for(const src of c.cards.filter(card=>card.at)){
  const alternatives=allChoices(src).map(ch=>(ch.effects.schedule??[]).filter(item=>ids.get(item.cardId)?.required&&!ids.get(item.cardId)?.at)
    .map(item=>({cardId:item.cardId,day:src.at!.day+item.inDays,...(item.latestDay!==undefined?{latestDay:item.latestDay}:{})})));
  const distinct=[...new Map(alternatives.map(a=>[JSON.stringify(a),a])).values()];
  if(distinct.some(a=>a.length))schedules=schedules.flatMap(prefix=>distinct.map(a=>[...prefix,...a]));
 }
 for(const scheduled of schedules){
  const state={...startEpisode(c,1,'capacity'),day:1,slot:0,scheduled};
  try{if(!fitsSchedule(state,c))fail('Required deadline capacity is insufficient');}catch(e){fail(String(e));}
 }
 validateDiagnostics(c,fail);
 for(const e of impactErrors(c))fail(e);
 // v2.5 package: the extraction itself, and its structural parity with whatever of it is already in the runtime content.
 try{const source=loadSourceJson();for(const e of checkSource(source).errors)fail(`v2.5 source: ${e}`);for(const e of checkParity(source,c))fail(e);}catch(e){fail(`v2.5 source unreadable: ${String(e)}`);}
 unique('opportunity facet',c.episode.opportunities.map(o=>o.facet));
 for(const o of c.episode.opportunities){
  walk(o.opensWhen);factWriters.add(o.resolvedFact);texts.push(o.offerText);
  if(o.offeredAt.day>o.throughDay||!c.episode.routeMoments.some(r=>r.day===o.offeredAt.day&&r.slot===o.offeredAt.slot))fail(`Opportunity lacks informed route exposure ${o.id}`);
  if(!c.factsSchema[o.resolvedFact]?.values.includes(o.takenValue)||!c.factsSchema[o.resolvedFact]?.values.includes(o.expiredValue)||o.takenValue===o.expiredValue)fail(`Invalid opportunity outcomes ${o.id}`);
  for(const v of [o.takenValue,o.expiredValue])if(!c.portraitFragments.some(f=>JSON.stringify(f.requires).includes(JSON.stringify({fact:o.resolvedFact,equals:v}))))fail(`Opportunity outcome has no reader ${o.id}/${v}`);
  if(!o.cardIds.every(id=>ids.has(id))||!o.cardIds.some(id=>allChoices(ids.get(id)!).some(ch=>ch.effects.setFacts?.[o.resolvedFact]===o.takenValue)))fail(`No taken action ${o.id}`);
 }
 for(const i of c.insights){walk(i.requires);walk(i.visibleResult);texts.push(i.text);for(const f of i.effects.setFlags??[])writers.add(f);if(i.window.fromDay!==6||i.window.throughDay!==8||!('any'in i.requires))fail(`Insight window/alternative ${i.id}`);}
 for(const f of c.portraitFragments){walk(f.requires);texts.push(f.text);}
 for(const d of c.dayTexts){texts.push(d.text);for(const v of d.textVariants??[]){walk(v.when);texts.push(v.text);}}
 for(const e of c.endings){walk(e.requires);texts.push(e.text);const s=JSON.stringify(e.requires);if(/quality|intention|facet|insight/i.test(s))fail('Ending must depend only on world outcome');}
 for(const f of writers)if(!readers.has(f))fail(`Unread flag ${f}`);for(const f of readers)if(!writers.has(f))fail(`Unwritten flag ${f}`);
 for(const f of factWriters)if(!factReaders.has(f))fail(`Unread fact ${f}`);for(const f of factReaders)if(!factWriters.has(f))fail(`Unwritten fact ${f}`);
 for(const k of c.episode.finalFacts)for(const value of c.factsSchema[k]?.finalValues??[])if(!c.cards.some(card=>allChoices(card).some(ch=>ch.effects.setFacts?.[k]===value)))fail(`Unreachable final value ${k}/${value}`);
 for(const outcome of ['fulfilled','revised','deferred']){
  const s=startEpisode(c,1,'validate');s.facts['workshop.orderOutcome']=outcome;
  if(c.endings.filter(e=>evaluateCondition(e.requires,s,c)).length!==1)fail(`Ending coverage ${outcome}`);
 }
 const story=c.cards.filter(x=>['situation','chain'].includes(x.type));
 for(const facet of FACETS){if(story.filter(x=>x.facets?.includes(facet)).length<6)fail(`Facet coverage ${facet}`);if(['body','inner'].includes(facet)&&story.filter(x=>x.type==='situation'&&x.facets?.includes(facet)&&!x.tags?.some(t=>t.startsWith('insight:'))).length<3)fail(`Ordinary coverage ${facet}`);}
 if(story.filter(card=>card.choices.some(a=>card.choices.some(b=>a.servesFacets?.some(f=>!b.servesFacets?.includes(f))))).length<8)fail('Cross-facet scenes <8');
 for(const chapter of [1,2])if(c.cards.filter(x=>x.chapter===chapter).flatMap(x=>x.textVariants??[]).filter(v=>v.kind==='perception').length<(chapter===1?3:6))fail(`Perception count chapter ${chapter}`);
 if(c.cards.flatMap(x=>x.textVariants??[]).filter(v=>v.kind==='perception'&&v.familiarCardId).length<3)fail('Fewer than 3 familiar returns');
 for(const t of c.traces){
  texts.push(t.response);if(!ids.has(t.source.cardId)||!allChoices(ids.get(t.source.cardId)!).some(x=>x.id===t.source.choiceId))fail('Invalid trace source');
  for(const r of t.readers){if(r.kind==='card'&&!ids.has(r.id))fail(`Invalid trace card ${r.id}`);if(r.kind==='ending'&&!c.endings.some(e=>e.id===r.id))fail(`Invalid trace ending ${r.id}`);if(r.kind==='fact'&&!c.factsSchema[r.id])fail(`Invalid trace fact ${r.id}`);if(r.kind==='text'&&r.id!==`choice:${t.source.cardId}/${t.source.choiceId}`)fail(`Invalid trace text ${r.id}`);}
 }
 const keys=story.filter(x=>x.key);
 if(keys.filter(card=>allChoices(card).every(ch=>c.traces.find(t=>t.source.cardId===card.id&&t.source.choiceId===ch.id)?.readers.some(r=>r.kind==='card'))).length/keys.length<.7)fail('Key delayed traces <70%');
 texts.push(...c.wisdoms.map(w=>w.text),...c.reflections.map(r=>r.text));
 for(const t of texts)if(forbiddenText(t))fail(`Stoplist: ${t}`);
 return errors;
}
/** Diagnostic markup: shape was checked by Zod, here are the meanings between cards, scenes and logics. */
export function validateDiagnostics(c: GameContent, fail:(s:string)=>void) {
 const diagnostic=c.cards.filter(card=>card.diagnostic);
 const evidenceOf=(ch:{diagnosticAction?:unknown;diagnosticBehavior?:unknown})=>ch.diagnosticAction??ch.diagnosticBehavior;
 const text=(v:unknown)=>JSON.stringify(v);
 type Signal=NonNullable<Card['choices'][number]['diagnosticAction']>;
 const signalsOf=(ch:Card['choices'][number]):[string,Signal][]=>[...(ch.diagnosticAction?[['action',ch.diagnosticAction] as [string,Signal]]:[]),...(ch.diagnosticBehavior?[['behavior',ch.diagnosticBehavior.signal] as [string,Signal]]:[]),...(ch.diagnosticMotive?.options.map(o=>['motive',o.signal] as [string,Signal])??[])];
 const sameSituation=new Map<string,Card[]>();
 for(const card of c.cards){
  const choices=allChoices(card);
  if(card.diagnostic){
   if(!choices.every(ch=>ch.diagnosticAction))fail(`Every choice of a diagnostic scene needs diagnosticAction ${card.id}`);
   if(choices.some(ch=>ch.diagnosticBehavior))fail(`A diagnostic scene cannot also continue another situation ${card.id}`);
   sameSituation.set(card.diagnostic.situationId,[...(sameSituation.get(card.diagnostic.situationId)??[]),card]);
   if(card.diagnostic.developmentWeight<=0)fail(`Diagnostic weight must be positive ${card.id}`);
  }else if(choices.some(ch=>ch.diagnosticAction||ch.diagnosticMotive))fail(`diagnosticAction without card.diagnostic ${card.id}`);
  for(const ch of choices){
   if(ch.diagnosticMotive&&!ch.diagnosticAction)fail(`Motive question without an action ${card.id}/${ch.id}`);
   if(ch.diagnosticAction&&ch.diagnosticBehavior)fail(`Choice is both action and behavior ${card.id}/${ch.id}`);
   for(const [kind,sig] of signalsOf(ch)){
    const real=Object.values(sig.rationale).filter(t=>t!=='не наблюдается').length;
    // A decision or a later behavior needs two grounds; a motive is one stated reason and needs one.
    if(real<(kind==='motive'?1:2))fail(`Rationale lacks observed axes ${card.id}/${ch.id}/${kind}`);
    // Each non-zero component needs a ground: with a handful of axes it is enough that the dominant logics are not blank rationale.
    if(ACTION_LOGICS.filter(l=>sig.vector[l]>0).length>4)fail(`Too many logics in one signal ${card.id}/${ch.id}`);
   }
   if(ch.diagnosticMotive&&ch.diagnosticMotive.options.length<2)fail(`Motive needs 2+ options ${card.id}/${ch.id}`);
  }
  if(card.diagnostic?.pressure&&!card.diagnostic.facets.length)fail(`Pressure scene without facets ${card.id}`);
  if(card.diagnostic?.distinguishes){
   const [a,b]=card.diagnostic.distinguishes;
   if(a===b||!card.tags?.includes('probe-only'))fail(`Probe scene must be a distinct pair tagged probe-only ${card.id}`);
   const vectors=choices.map(ch=>ch.diagnosticAction!.vector);
   if(!vectors.some(v=>v[a!]-v[b!]>=.15)||!vectors.some(v=>v[b!]-v[a!]>=.15))fail(`Probe does not separate ${a} and ${b}: ${card.id}`);
  }else if(card.tags?.includes('probe-only'))fail(`probe-only scene without distinguishes ${card.id}`);
  if(card.tags?.includes('probe-only')&&(card.at||card.required||card.mustShowBy||card.type!=='situation'||card.development||card.requires))fail(`Probe scene must be free and independent ${card.id}`);
 }
 // The same situation may appear in several wordings only if its markup is identical.
 for(const [id,cards] of sameSituation)if(cards.length>1){
  const [first,...rest]=cards;const shape=(card:Card)=>text([card.diagnostic!.contextId,card.diagnostic!.developmentWeight,card.diagnostic!.facets,allChoices(card).map(ch=>[ch.id,ch.diagnosticAction!.vector])]);
  for(const other of rest)if(shape(other)!==shape(first!))fail(`Situation ${id} is marked differently in ${first!.id} and ${other.id}`);
 }
 const situationIds=new Set(sameSituation.keys());
 const followers=new Map<string,Card[]>();
 for(const card of c.cards)for(const ch of allChoices(card))if(ch.diagnosticBehavior){
  const id=ch.diagnosticBehavior.continuesSituationId;
  if(!situationIds.has(id))fail(`Follow-up continues an unknown situation ${card.id}/${id}`);
  followers.set(id,[...new Set([...(followers.get(id)??[]),card])]);
  const targets=allChoices(card).every(x=>x.diagnosticBehavior?.continuesSituationId===id);
  if(!targets)fail(`Every choice of a follow-up must continue the same situation ${card.id}`);
  if(ch.diagnosticAction)fail(`Follow-up choice cannot open a case ${card.id}/${ch.id}`);
 }
 // A continued situation must have exactly one owning scene, otherwise one decision could belong to two open cases.
 for(const id of followers.keys())if((sameSituation.get(id)??[]).length!==1)fail(`Continued situation must have one owner scene: ${id}`);
 // The follow-up must be reachable inside the owner's window: a scheduled continuation or an authored fixed day.
 for(const [id,cards] of followers){
  const owner=sameSituation.get(id)?.[0];if(!owner)continue;
  const window=owner.diagnostic!.expiresInDays??c.profile.algorithms[c.profile.currentAlgorithmVersion]!.defaultExpiresInDays;
  for(const follower of cards){
   const scheduledBy=allChoices(owner).flatMap(ch=>(ch.effects.schedule??[]).filter(sc=>sc.cardId===follower.id));
   const reachable=scheduledBy.length>0||(follower.at!==undefined&&owner.at!==undefined&&follower.at.day-owner.at.day<=window);
   if(!reachable)fail(`Follow-up ${follower.id} is not tied to its owner ${owner.id}`);
   for(const sc of scheduledBy)if(sc.inDays>window)fail(`Follow-up ${follower.id} arrives after the window of ${owner.id}`);
  }
 }
 // Every logic, and the state without a center, needs independent content where it is the dominant reading.
 // A day window is calendar, not a hypothesis about the hero: it does not make a scene dependent.
 const calendarOnly=(x:Condition|undefined):boolean=>!x||('all'in x?x.all.every(calendarOnly):('dayGte'in x||'dayLte'in x));
 const neutralOptions=c.cards.filter(card=>card.diagnostic&&!card.tags?.includes('probe-only')&&!card.development&&calendarOnly(card.requires)).flatMap(card=>allChoices(card).map(ch=>({card,v:ch.diagnosticAction!.vector})));
 for(const l of ACTION_LOGICS){const own=neutralOptions.filter(o=>ACTION_LOGICS.every(x=>o.v[x]<=o.v[l]));if(own.length<3||new Set(own.map(o=>o.card.diagnostic!.situationId)).size<2)fail(`Too little independent content dominated by ${l}`);}
 // A diagnostic scene must not depend on an undefined stage, and a required scene cannot be gated.
 for(const card of diagnostic)if(card.development?.stages&&(card.at||card.required||card.mustShowBy))fail(`Gated diagnostic scene cannot be required ${card.id}`);
 void evidenceOf;
 for(const e of summaryErrors(c))fail(e);
 for(const e of focusedEncountersErrors(c))fail(e);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const errors=validateContent(content);if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`CONTENT v2.5 OK: ${content.cards.length} cards, ${content.episode.days} days`);
}
