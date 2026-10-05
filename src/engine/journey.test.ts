import { describe,it,expect } from 'vitest';
import { content } from '../content';
import { play } from '../../scripts/play';
import { prepareEncounter, rollEncounter, openEncounter, journeyPeriod, fairDieFace, chooseGoal } from './journey';
import { prepareEvening, leaveEvening } from './day';
import { drawCard, persistDraw } from './draw';
import { eligible } from './schedule';
import { startEpisode } from './world';
import { makeCard,makeContent,makeState } from './testUtils';

describe('continuous journey',()=>{
 it.each(['always-first','always-second','mixed'] as const)('has 120 decisions, thirty idempotent nights and a stable fair with %s',policy=>{
  const {state}=play(71,{policy});expect(state.history).toHaveLength(120);expect(state.nights).toHaveLength(30);expect(state.phase).toBe('boundary');
  expect(state.milestones.fair!.facts['workshop.orderOutcome']).toBe(state.facts['workshop.orderOutcome']);
  expect(state.observations.filter(o=>o.id==='fair_result')).toHaveLength(1);
  expect(leaveEvening(state,content)).toBe(state);
  for(const line of ['pace','apprentice','commitments'])expect(state.evidence.some(e=>e.line===line&&e.day>=21)).toBe(true);
  for(const night of state.nights){const s={...state,day:night.day,phase:'evening' as const,preparedEveningDay:night.day};expect(prepareEvening(s,content)).toBe(s);}
 });
 it('retains the fair facts across all subsequent choices and carries resources into day eleven',()=>{
  let evening:ReturnType<typeof makeState>|undefined,morning:ReturnType<typeof makeState>|undefined;
  const {state}=play(5,{beforeStep:s=>{if(s.day===10&&s.phase==='evening')evening=prepareEvening(s,content);if(s.day===11&&s.phase==='morning')morning=s;return s;}});
  expect(morning!.resources).toEqual(evening!.resources);expect(state.milestones.fair).toEqual(evening!.milestones.fair);
 });
 it.each(['keep','clarify','change'] as const)('reviews a goal without effects: %s',action=>{
  const base=chooseGoal(startEpisode(content,9,'goals'),content,'order','select');const question={...base,day:11,phase:'goal' as const};
  const changed=chooseGoal(question,content,action==='change'?'alexey':'order',action,action==='clarify'?'Заказ с согласованным сроком':undefined);
  expect(changed.resources).toEqual(question.resources);expect(changed.qualities).toEqual(question.qualities);expect(changed.history).toEqual(question.history);expect(changed.slot).toBe(0);expect(changed.goalHistory.at(-1)?.action).toBe(action);
 });
 it('reads only completed days and provides concrete evidence for every description',()=>{
  const state=play(19).state;
  for(const period of [1,7,30] as const){const r=journeyPeriod(state,content,period);expect(r.available).toBe(period);expect(r.from).toBe(31-period);for(const f of r.facets)expect(f.evidence.every(h=>h.day>=r.from&&h.day<=r.through)).toBe(true);}
  const partial={...state,nights:state.nights.slice(0,2)};expect(journeyPeriod(partial,content,7).available).toBe(2);expect(journeyPeriod(partial,content,30).through).toBe(2);
  const short={...partial,history:state.history.slice(0,1)};expect(journeyPeriod(short,content,7).decisions.every(d=>!d.recurring)).toBe(true);
 });
});
describe('die encounters',()=>{
 const cards=Array.from({length:6},(_,i)=>makeCard({id:`free${i}`,type:'situation',once:false}));const c=makeContent({cards});const pending=prepareEncounter(makeState(),c);
 it.each([1,2,3,4,5,6])('selects the fixed candidate for face %i and cannot reroll',face=>{
  expect(pending.phase).toBe('dice');const rolled=rollEncounter(pending,c,face);expect(rolled.current?.cardId).toBe(pending.diceHistory[0]!.candidates[face-1]);expect(rolled.resources).toEqual(pending.resources);expect(rolled.history).toEqual(pending.history);
  expect(rollEncounter(rolled,c,7-face)).toBe(rolled);const restored=JSON.parse(JSON.stringify(rolled));expect(openEncounter(restored).current).toEqual(rolled.current);
  expect(prepareEncounter(openEncounter(rolled),c)).toEqual(openEncounter(rolled));
 });
 it('falls back with fewer than six candidates and yields to fixed scenes, crises and chains',()=>{
  expect(prepareEncounter(makeState(),makeContent({cards:cards.slice(0,5)})).phase).toBe('slot');
  const forced=[makeCard({id:'fixed',type:'situation',at:{day:1,slot:0}}),makeCard({id:'crisis',type:'crisis',chapter:'any',crisis:{resource:'strength',edge:0}}),makeCard({id:'chain',type:'chain',required:true})];
  for(const card of forced){const s=makeState({resources:{wealth:50,strength:0,peace:50,bonds:50},scheduled:[{cardId:'chain',day:1,latestDay:1}]});const cc=makeContent({cards:[...cards,card]});expect(prepareEncounter(s,cc).phase).toBe('slot');}
 });
 it('candidate sets always contain six eligible distinct scenes and dice appear at most once per day',()=>{
  const state=play(31).state;expect(new Set(state.diceHistory.map(d=>d.day)).size).toBe(state.diceHistory.length);
  play(31,{beforeStep:s=>{if(s.phase==='dice'&&!s.current){const d=s.diceHistory.at(-1)!;expect(d.candidates).toHaveLength(6);for(const id of d.candidates)expect(eligible(s,content.cards.find(c=>c.id===id)!,content)).toBe(true);}return s;}});
 });
 it('avoids modulo bias with rejection sampling',()=>{const values=[4294967295,4294967292,5];expect(fairDieFace(()=>values.shift()!)).toBe(6);});
 it('stores the exact text and response pair',()=>{const s=makeState();const d=drawCard(s,c)!;const shown=persistDraw(s,d,c);expect(shown.current?.choices).toEqual(d.choices);});
});
