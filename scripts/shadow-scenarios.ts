import { pathToFileURL } from 'node:url';
import { content } from '../src/content';
import type { Condition, Quality } from '../src/engine';
import { play } from './play';
export function shadowScenarios() {
 const witnesses=[];
 for(const quality of ['attention','honesty','compassion','letgo','courage'] as Quality[]){
  const card=content.cards.find(c=>c.shadow?.quality===quality)!;
  const choices:Record<string,string>={};
  const visit=(e:Condition)=>{if('all'in e)e.all.forEach(visit);if('chose'in e)choices[e.chose.card]=e.chose.choice;};visit(card.shadow!.evidence);
  const route=content.episode.routeMoments.find(r=>r.options.some(o=>content.episode.routePools[o.routePool]?.includes(card.id)))!;
  const option=route.options.find(o=>content.episode.routePools[o.routePool]?.includes(card.id))!;
  let witness;
  for(let seed=1;seed<=1000;seed++){
   const {state}=play(seed,{quality,choices,routes:{[route.day]:option.id}});
   if(state.flags.includes(`observed_shadow_${quality}`)){witness={quality,seed,choices,routes:{[route.day]:option.id},scene:card.id};break;}
  }
  if(!witness)throw new Error(`No actual-play shadow witness for ${quality}`);
  witnesses.push(witness);
 }
 return witnesses;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(shadowScenarios(),null,2));
