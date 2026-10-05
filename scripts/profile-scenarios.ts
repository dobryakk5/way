import { content } from '../src/content';
import { ACTION_LOGICS, deterministicRandom } from '../src/engine';
import type { ActionLogic, Choice, DrawResult, GameContent, GameState } from '../src/engine';
import { play, type PlayOptions } from './play';
const score=(c:Choice,logic:ActionLogic)=>(c.diagnosticAction?.vector??c.diagnosticBehavior?.signal.vector)?.[logic];
/** Picks the shown choice that leans most toward `logic`; a decision with no markup falls through to the default policy. */
export function leaning(logic:ActionLogic,noise=0):Pick<PlayOptions,'pick'|'pickMotive'>{
 return {
  pick:(state:GameState,draw:DrawResult)=>{
   const scored=draw.choices.map(c=>score(c,logic));if(scored.some(s=>s===undefined))return undefined;
   const flip=deterministicRandom(state.seed,state.day,state.slot,`noise:${logic}`,state.episodeId)<noise;
   const nums=scored as number[];const bestIndex=nums.reduce<number>((best,s,i)=>s>nums[best]!?i:best,0);
   // With two choices a flip takes the other one, exactly as before; with more it takes the next one in the shown order.
   return draw.choices[flip?(bestIndex+1)%draw.choices.length:bestIndex]!.id;
  },
  pickMotive:(state:GameState)=>{
   const m=state.pendingMotive!;const card=content.cards.find(c=>c.id===state.history.at(-1)!.cardId)!;
   const options=card.choices.concat(...(card.choiceVariants??[]).map(v=>v.choices)).find(c=>c.id===state.history.at(-1)!.choiceId)?.diagnosticMotive?.options??[];
   void m;return options.sort((x,y)=>y.signal.vector[logic]-x.signal.vector[logic])[0]?.id;
  }
 };
}
export const playLeaning=(seed:number,logic:ActionLogic,noise=0,extra:PlayOptions={})=>play(seed,{...leaning(logic,noise),...extra});
export const targets=ACTION_LOGICS;
export function profileSummary(state:GameState,c:GameContent=content){
 const p=state.heroDevelopmentProfile;
 const firstStable=p.eveningSnapshots.find(s=>s.status==='stable');
 return {status:p.status,observedPrimary:p.observedPrimary,candidatePrimary:p.candidatePrimary,developmentCurrent:state.development.developmentCurrent,
  firstStableDay:firstStable?.day,firstStableAs:firstStable?.observedPrimary,cases:p.cases.length,independent:p.evidence.filter(e=>e.source==='action'&&e.selectionOrigin!=='adaptive').length,algorithm:c.profile.currentAlgorithmVersion};
}
