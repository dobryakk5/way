import { describe,it,expect } from 'vitest';
import { content } from '../content';
import { play,costScore } from '../../scripts/play';
import { shadowScenarios } from '../../scripts/shadow-scenarios';
import { applyChoice,chooseRoute,drawCard,persistDraw,prepareEvening,expireOpportunities,openOpportunities,facetPattern,resolveChoices,topQuality,pickEnding,portrait,fitsSchedule } from './index';
import { makeCard,makeContent,makeState } from './testUtils';
import { validateContent } from '../../scripts/check-content';
import { forbiddenText } from '../../scripts/stoplist';
import type { GameState,Quality } from './types';
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
function checkpoint(day:number,slot:number):GameState {
 let captured:GameState|undefined;
 play(17,{onDraw:(s)=>{if(s.day===day&&s.slot===slot)captured=clone(s);}});
 if(!captured)throw new Error('checkpoint missing');
 return captured;
}
describe('route and opportunity scenarios',()=>{
 for(const o of content.episode.opportunities){
  it(`${o.id}: taken and expired facts are both reachable and read`,()=>{
   const statuses=new Set<string>();
   for(let seed=1;seed<=80;seed++){
    const s=play(seed).state;statuses.add(s.opportunityState[o.id]!);
    expect(s.opportunityExposure[o.id]).toBeDefined();
    const value=s.opportunityState[o.id]==='taken'?o.takenValue:o.expiredValue;
    expect(s.facts[o.resolvedFact]).toBe(value);
    expect(s.observations.some(e=>e.id===`${o.id}_${value}`|| e.id===`${o.id}_departed`&&value==='missed')).toBe(true);
   }
   expect(statuses).toEqual(new Set(['taken','expired']));
  },120000); // 80 full 30-day plays: slow under a parallel run, not a hang
 }
 it('does not expire an unseen opportunity or invent a resource penalty',()=>{
  const s=makeState({day:2,phase:'evening',shown:{c1_alexey_broken_jug:[1]},facts:{...content.episode.initialFacts}});
  const opened=openOpportunities(s,content);expect(opened.opportunityState.marta_help).toBe('open');
  const unseen=expireOpportunities(opened,content);expect(unseen.opportunityState.marta_help).toBe('open');expect(unseen.facts['liaison.martaHelp']).toBe('waiting');
  const seen={...opened,opportunityExposure:{marta_help:{day:2,via:'route' as const}}};const expired=expireOpportunities(seen,content);
  expect(expired.facts['liaison.martaHelp']).toBe('other');expect(expired.resources).toEqual(s.resources);expect(expireOpportunities(expired,content)).toEqual(expired);
 });
 it('only resolves an exposed open opportunity inside the declared window',()=>{
  const s=checkpoint(2,2);s.phase='route';delete s.activeRoute;
  const routed=chooseRoute(s,content,'marta');const draw=drawCard(routed,content)!;
  const result=applyChoice(persistDraw(routed,draw,content),content,draw.card.id,'help');expect(result.opportunityState.marta_help).toBe('taken');
  const late={...routed,day:3,current:{...persistDraw(routed,draw,content).current!}};
  expect(()=>applyChoice(late,content,draw.card.id,'help')).toThrow('outside');
 });
});
describe('serialization, variants, deadline pressure',()=>{
 it('preserves route choice and presented pair/text/sides across a JSON roundtrip',()=>{
  for(const [day,slot]of [[2,2],[7,1],[9,3],[10,3]]){
   const s=checkpoint(day!,slot!);const before=drawCard(s,content)!;const saved=persistDraw(s,before,content);const after=drawCard(clone(saved),content)!;
   expect(after.choices).toEqual(before.choices);expect(after.text).toBe(before.text);expect(after.leftChoiceId).toBe(before.leftChoiceId);expect(clone(saved).activeRoute).toEqual(saved.activeRoute);
  }
 });
 it('uses conditional effects and history tags, and rejects answers outside the shown pair',()=>{
  const s=checkpoint(9,3);s.facts['workshop.preparation']='revised';
  const d=drawCard(s,content)!;expect(d.choices.map(c=>c.id)).toEqual(['revise_now','deferred']);
  const presented=persistDraw(s,d,content);expect(()=>applyChoice(presented,content,d.card.id,'fulfilled')).toThrow('outside');
  const result=applyChoice(presented,content,d.card.id,'deferred');expect(result.facts['workshop.orderOutcome']).toBe('deferred');expect(facetPattern(result,content).body).toBeGreaterThan(0);
 });
 it('reads recent positive growth from a conditional choice',()=>{
  const c=makeCard({id:'variants',type:'situation',choiceVariants:[{when:{flag:'x'},choices:[{id:'c',label:'c',effects:{qualities:{honesty:1}}},{id:'d',label:'d',effects:{}}]}]});
  const data=makeContent({cards:[c]});const s=makeState({flags:['x'],qualities:{attention:1,honesty:1,compassion:0,letgo:0,courage:0},history:[{day:1,slot:0,cardId:'variants',choiceId:'c'}]});
  expect(resolveChoices(s,c,data)[0]!.id).toBe('c');expect(topQuality(s,data)).toBe('honesty');
 });
 it('protects the three last-day free slots from crisis starvation',()=>{
  const a=makeCard({id:'a',chapter:2,type:'chain',required:true}),b=makeCard({id:'b',chapter:2,type:'chain',required:true}),c=makeCard({id:'c',chapter:2,type:'chain',required:true});
  const end=makeCard({id:'end',chapter:2,type:'situation',at:{day:10,slot:3}}),crisis=makeCard({id:'cr',type:'crisis',chapter:'any',crisis:{resource:'wealth',edge:0}});
  const data=makeContent({cards:[a,b,c,end,crisis]});let s=makeState({day:10,slot:0,chapter:2,resources:{wealth:0,strength:50,peace:50,bonds:50},scheduled:['a','b','c'].map(cardId=>({cardId,day:10,latestDay:10}))});
  for(let i=0;i<3;i++){const d=drawCard(s,data)!;expect(d.source).toBe('capacity');s=applyChoice(persistDraw(s,d,data),data,d.card.id,'a');}
  expect(drawCard(s,data)?.card.id).toBe('end');expect(s.pendingCrises).toContain('cr');expect(s.scheduled).toHaveLength(0);
 });
 it('counts route slots against deadlines and respects release days',()=>{
  const cards=[0,1,2].map(i=>makeCard({id:`required${i}`,type:'chain',chapter:2,required:true}));
  const c=makeContent({cards,episode:{...content.episode,routeMoments:[content.episode.routeMoments[3]!],opportunities:[]}});
  const s=makeState({day:9,chapter:2,slot:0,scheduled:cards.map(c=>({cardId:c.id,day:9,latestDay:9}))});
  expect(fitsSchedule(s,c)).toBe(true);expect(fitsSchedule(s,c,undefined,true)).toBe(false);
  s.scheduled.push({cardId:cards[0]!.id,day:9,latestDay:9});expect(fitsSchedule(s,c)).toBe(false);
 });
 it('never silently drops required events at evening',()=>{
  const c=makeContent({cards:[makeCard({id:'required',type:'chain',required:true})]});
  expect(()=>prepareEvening(makeState({day:6,phase:'evening',scheduled:[{cardId:'required',day:6,latestDay:6}]}),c)).toThrow('Missed required');
 });
 it('draw is pure and deterministic',()=>{
  const s=checkpoint(7,2);const before=clone(s);expect(drawCard(s,content)).toEqual(drawCard(s,content));expect(s).toEqual(before);
  expect(play(98).state).toEqual(play(98).state);
 });
});
describe('authoring contract regressions',()=>{
 it('passes the full v2.2 validator',()=>expect(validateContent(content)).toEqual([]));
 it('rejects route collisions and unknown choice references',()=>{
  const c=clone(content);c.episode.routeMoments[0]!.slot=0;c.cards[0]!.requires={chose:{card:c.cards[0]!.id,choice:'missing'}};c.traces=[];
  const e=validateContent(c).join('\n');expect(e).toMatch(/collision/);expect(e).toMatch(/Unknown choice/);expect(e).toMatch(/No trace/);
 });
 it('rejects route pools with fewer than two cards at schema validation',()=>{
  const c=clone(content);c.episode.routePools.r2_work=[];expect(validateContent(c).join('\n')).toMatch(/routePools/);
 });
 it('cost means gross losses, not losses offset by gains',()=>{
  expect(costScore({id:'x',label:'x',effects:{resources:{wealth:-10,bonds:20}}})).toBe(10);
 });
 it('stoplist handles Unicode and does not reject сад or богатство',()=>{
  expect(forbiddenText('сад, богатство, ограда')).toBe(false);expect(forbiddenText('О молитве и храмами')).toBe(true);
 });
 it('reaches every final value from actual plays',()=>{
  const values:Record<string,Set<string>>={};for(let seed=1;seed<=150;seed++){const {state}=play(seed);pickEnding(state,content);for(const k of content.episode.finalFacts)(values[k]??=new Set()).add(String(state.facts[k]));}
  for(const k of content.episode.finalFacts)expect(values[k]).toEqual(new Set(content.factsSchema[k]!.finalValues));
 },20000);
 for(const q of ['attention','honesty','compassion','letgo','courage'] as Quality[]){
  it(`shadow ${q} needs action evidence as well as quality`,()=>{
   const card=content.cards.find(c=>c.shadow?.quality===q)!;
   const day=card.requires&&'dayGte'in card.requires?card.requires.dayGte??7:7;
   const s=makeState({day,chapter:day<=5?1:2,qualities:{attention:8,honesty:8,compassion:8,letgo:8,courage:8}});
   const c=makeContent({cards:[{...card,requires:undefined,tags:[]} as unknown as typeof card]});
   const without=drawCard(s,c)!;expect(without.variantId).not.toBe(`shadow_${q}`);
   const history:GameState['history']=[];
   function add(e:NonNullable<typeof card.shadow>['evidence']){if('all'in e)e.all.forEach(add);if('chose'in e)history.push({day:1,slot:history.length,cardId:e.chose.card,choiceId:e.chose.choice});}
   add(card.shadow!.evidence);const d=drawCard({...s,history},c)!;expect(d.variantId).toBe(`shadow_${q}`);
   const shown=persistDraw({...s,history},d,c);expect(shown.flags).toContain(`observed_shadow_${q}`);
  });
 }
 it('reaches all five shadows through real decisions, with no injected qualities',()=>{
  expect(shadowScenarios().map(w=>w.quality)).toEqual(['attention','honesty','compassion','letgo','courage']);
 });
 it('fair aftermath and portrait both manifest all three world facts',()=>{
  const {state}=play(22);const after=state.observations.find(o=>o.id==='fair_result')!.text!;const final=portrait(state,content);
  for(const group of ['order','alexey','market'])expect(content.portraitFragments.some(f=>f.group===group&&after.includes(f.text)&&final.includes(f.text))).toBe(true);
 });
});
