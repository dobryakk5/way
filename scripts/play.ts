import { content } from '../src/content';
import { answerMotive, skipMotive, applyChoice, beginSlots, chooseIntention, chooseRoute, deterministicRandom, drawCard, enterSlot, leaveEvening, nextChapter, persistDraw, startEpisode, chooseGoal, prepareEncounter, rollEncounter, openEncounter, fairDieFace } from '../src/engine';
import type { Choice, DrawResult, GameContent, GameState, LifeFacet, Quality } from '../src/engine';
export const POLICIES = ['random','always-first','always-second','always-costly','greedy-resources','greedy-qualities','mixed'] as const;
export type PolicyName = typeof POLICIES[number];
export const resourceScore = (c:Choice) => Object.values(c.effects.resources??{}).reduce((a,b)=>a+b,0);
export const costScore = (c:Choice) => Object.values(c.effects.resources??{}).reduce((a,b)=>a+Math.max(0,-b),0);
export function chooseByPolicy(policy:PolicyName,state:GameState,choices:Choice[]):Choice {
 const random=deterministicRandom(state.seed,state.day,state.slot,'policy',state.episodeId);
 if(policy==='always-first')return choices[0]!;if(policy==='always-second')return choices[1]!;
 if(policy==='random')return choices[Math.min(choices.length-1,Math.floor(random*choices.length))]!;
 if(policy==='mixed')return chooseByPolicy(random<.15?'random':random<.66?'always-costly':'greedy-resources',state,choices);
 const score=policy==='always-costly'?costScore:policy==='greedy-resources'?resourceScore:(c:Choice)=>Object.values(c.effects.qualities??{}).reduce((a,b)=>a+b,0);
 const scores=choices.map(score);const best=Math.max(...scores);const top=scores.flatMap((s,i)=>s===best?[i]:[]);return choices[top[Math.min(top.length-1,Math.floor(random*top.length))]!]!;
}
export interface PlayOptions {
 content?:GameContent; policy?:PolicyName; facet?:LifeFacet; quality?:Quality;
 choices?:Record<string,string>; routes?:Record<number,string>;
 // Motive answers by card id: an option id, or 'skip'. Without an entry the answer is deterministic pseudo-random (about a third are skipped).
 motives?:Record<string,string>;
 // Policies that read the shown pair: a choice id for a scene, an option id (or 'skip') for a motive question.
 pick?:(state:GameState,draw:DrawResult)=>string|undefined;
 pickMotive?:(state:GameState)=>string|undefined;
 // Explicit starting stage for scenarios that rehearse a hero who already has one (the production start has none).
 start?:(state:GameState)=>GameState;
 // Continue an existing state (for example a migrated save) instead of starting a new run.
 resume?:GameState;
 onDraw?:(state:GameState,draw:DrawResult)=>void;
 beforeStep?:(state:GameState)=>GameState;
}
export function play(seed:number,options:PlayOptions={}) {
 const c=options.content??content;const policy=options.policy??'random';
 let state=options.resume??chooseGoal(startEpisode(c,seed,`sim-${seed}`),c,'order','select');if(options.start)state=options.start(state);let transitions=0;let crises=0;
 const draws:{day:number;slot:number;cardId:string;source:string;variantId?:string}[]=[];
 while(state.phase!=='boundary'&&state.phase!=='ending'){
  if(++transitions>400)throw new Error('Transition loop');
  if(options.beforeStep)state=options.beforeStep(state);
  switch(state.phase){
   case 'goal':state=chooseGoal(state,c,state.goal?.id??'order','keep');break;
   case 'dice':state=state.current?openEncounter(state):rollEncounter(state,c,fairDieFace(()=>Math.floor(deterministicRandom(seed,state.day,state.slot,'die',state.episodeId)*4294967292)));break;
   case 'morning':state=beginSlots(state,c);break;
   case 'chapter':state=nextChapter(state,c);break;
   case 'intention':{
    const i=policy==='always-first'?0:policy==='always-second'?1:Math.floor(deterministicRandom(seed,state.day,0,'intention',state.episodeId)*4);
    state=chooseIntention(state,c,options.facet??c.episode.intentionOptions[i]!.facet);break;
   }
   case 'route':{
    const r=c.episode.routeMoments.find(r=>r.day===state.day&&r.slot===state.slot)!;
    const random=deterministicRandom(seed,state.day,state.slot,'route',state.episodeId);
    const option=options.routes?.[state.day]??(options.facet?r.options.find(o=>o.facets.includes(options.facet!))?.id:undefined)??r.options[policy==='always-first'?0:policy==='always-second'?1:random<.5?0:1].id;
    state=chooseRoute(state,c,option);break;
   }
   case 'evening':state=leaveEvening(state,c);break;
   case 'motive':{
    const pending=state.pendingMotive!;const card=state.history.at(-1)!.cardId;
    const random=deterministicRandom(seed,state.day,state.slot,'motive',state.episodeId);
    const wanted=options.motives?.[card]??options.pickMotive?.(state)??(random<.34?'skip':pending.options[Math.min(pending.options.length-1,Math.floor((random-.34)/.66*pending.options.length))]!.id);
    state=wanted==='skip'?skipMotive(state,c):answerMotive(state,c,wanted);break;
   }
   case 'slot':{
    const encounter=prepareEncounter(state,c);if(encounter.phase==='dice'){state=encounter;break;}
    const draw=drawCard(state,c);if(!draw)throw new Error(`Empty slot ${seed}/${state.day}/${state.slot}`);
    options.onDraw?.(state,draw);
    draws.push({day:state.day,slot:state.slot,cardId:draw.card.id,source:draw.source,...(draw.variantId?{variantId:draw.variantId}:{})});
    if(draw.source==='crisis')crises++;
    state=persistDraw(state,draw,c);
    const requested=options.choices?.[draw.card.id];
    const targeted=options.quality?[...draw.choices].sort((a,b)=>(b.effects.qualities?.[options.quality!]??0)-(a.effects.qualities?.[options.quality!]??0))[0]:undefined;
    const facetChoices=options.facet?draw.choices.filter(ch=>ch.servesFacets?.includes(options.facet!)):[];
    const facetChoice=facetChoices.length===1?facetChoices[0]:undefined;
    const choice=draw.choices.find(ch=>ch.id===requested)??draw.choices.find(ch=>ch.id===options.pick?.(state,draw))??targeted??facetChoice??chooseByPolicy(policy,state,draw.choices);
    const next=applyChoice(state,c,draw.card.id,choice.id);if(next===state)throw new Error('Choice was not applied');state=next;break;
   }
   default:state=enterSlot(state,c);break;
  }
 }
 return {state,draws,crises};
}
