import { writeFileSync } from 'node:fs';
import { content } from '../src/content';
import { CONTENT_VERSION } from '../src/content/version';
import { validateSave } from '../src/persistence/save';
import { playDevelopment,DEVELOPMENT_SCENARIOS } from './development-scenarios';
const runs=Number(process.env.SIM_RUNS??100);
if(!Number.isInteger(runs)||runs<1)throw new Error('SIM_RUNS must be a positive integer');
const failures:string[]=[];
const trajectories=Object.keys(DEVELOPMENT_SCENARIOS).map(name=>{
 const stages:Record<string,number>={},promotionDays:Record<string,number>={};let visibleNewContent=0,retriesShown=0;
 for(let seed=1;seed<=runs;seed++){
  const {state,draws}=playDevelopment(seed,name);const d=state.development;
  stages[d.developmentCurrent??'none']=(stages[d.developmentCurrent??'none']??0)+1;
  for(const t of d.transitions)promotionDays[t.day]=(promotionDays[t.day]??0)+1;
  const fail=(message:string)=>failures.push(`${name}/${seed}: ${message}`);
  const shouldGrow=['grow','retry','late'].includes(name);
  if(d.developmentCurrent!==(shouldGrow?'achiever':'expert'))fail(`unexpected stage ${d.developmentCurrent}`);
  if(state.history.length!==120||state.nights.length!==30||state.phase!=='boundary')fail('episode incomplete');
  if(!validateSave({schema:1,started:true,game:state}))fail('invalid save/evidence');
  if(d.transitions.length!==(shouldGrow?1:0))fail('transition count');
  if(state.milestones.fair?.day!==10)fail('fair missing');
  if(state.scheduled.some(s=>content.cards.find(c=>c.id===s.cardId)?.required))fail('required continuation unfinished');
  for(const card of content.cards.filter(c=>c.at))if(!draws.some(x=>x.cardId===card.id&&x.day===card.at!.day&&x.slot===card.at!.slot))fail(`fixed scene missing ${card.id}`);
  const shown=draws.some(x=>x.cardId.startsWith('dev_achiever_')||x.variantId?.endsWith('_achiever'));
  if(shown)visibleNewContent++;if(shouldGrow&&!shown)fail('new stage content unseen');if(!shouldGrow&&shown)fail('wrong stage content shown');
  if(draws.some(x=>x.cardId==='dev_retry_1_review'))retriesShown++;
 }
 return {name,runs,stages,promotionDays,visibleNewContent,retriesShown};
});
const report={contentVersion:CONTENT_VERSION,totalRuns:runs*trajectories.length,trajectories,failures};
if(process.argv.includes('--write'))writeFileSync('reports/development.v2.4.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
