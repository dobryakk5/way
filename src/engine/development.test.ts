import { describe,it,expect } from 'vitest';
import { content } from '../content';
import { DEVELOPMENT_SCENARIOS, playDevelopment } from '../../scripts/development-scenarios';
import { play } from '../../scripts/play';
import { prepareEvening } from './day';
import { drawCard,persistDraw } from './draw';
import { applyChoice } from './apply';
import { developmentProgress,developmentCardEligible } from './development';
import { validateSave } from '../persistence/save';
import type { GameState } from './types';
const envelope=(game:GameState)=>({schema:1,started:true,game});
function snapshot(day:number,slot:number,phase:GameState['phase']='slot',name='grow') {
 let found:GameState|undefined;
 play(1,{...DEVELOPMENT_SCENARIOS[name],beforeStep:s=>{if(!found&&s.day===day&&s.slot===slot&&s.phase===phase)found=structuredClone(s);return s;}});
 if(!found)throw new Error('Snapshot not reached');return found;
}
describe('hero development in the real episode',()=>{
 it.each(['control','withdraw'])('%s completes the same episode without promotion',name=>{
  const {state}=playDevelopment(1,name);expect(state.development.developmentCurrent).toBe('expert');expect(state.history).toHaveLength(120);expect(state.nights).toHaveLength(30);expect(state.development.transitions).toHaveLength(0);
 });
 it('one trial and its shown result do not substitute for review or transfer',()=>{
  const s=snapshot(17,3);const draw=drawCard(s,content)!;const shown=persistDraw(s,draw,content);
  expect(shown.development.evidence.some(e=>e.eventId==='cycle-17-result')).toBe(true);
  expect(developmentProgress(shown,content)?.ready).toBe(false);
  const reviewed=applyChoice(shown,content,draw.card.id,'a');expect(developmentProgress(reviewed,content)?.completed).toHaveLength(1);expect(reviewed.development.developmentCurrent).toBe('expert');expect(reviewed.development.pendingPromotion).toBeUndefined();
 });
 it('withdrawal cancels mastery; a fresh completed cycle permits another attempt',()=>{
  const s=snapshot(17,3,'evening','retry');expect(developmentProgress(s,content)?.completed).toHaveLength(0);expect(s.development.evidence.some(e=>e.kind==='withdrawal')).toBe(true);
  const {state}=playDevelopment(1,'retry');expect(state.development.developmentCurrent).toBe('achiever');expect(state.development.transitions[0]?.evidenceIds).toContain('dev_retry_1-review');expect(state.development.transitions[0]?.evidenceIds).not.toContain('cycle-17-review');
 });
 it('does not promote while the newest trial still awaits its consequence and review',()=>{
  const s=snapshot(25,3,'evening');
  s.development.evidence.push({eventId:'new-open-trial',arcId:'expert-achiever',contextId:'delivery',kind:'trial',day:25,slot:3,cardId:'example'});
  expect(developmentProgress(s,content)?.ready).toBe(false);
 });
 it('repetition within one context cannot replace transfer to another',()=>{
  const s=snapshot(25,3,'evening');s.development.evidence=s.development.evidence.map(e=>({...e,contextId:'kiln'}));expect(developmentProgress(s,content)?.ready).toBe(false);
 });
 it('agreed inspection retains delegation, and the night commits once',()=>{
  const s=snapshot(25,3,'evening');expect(s.development.developmentCurrent).toBe('expert');expect(s.development.pendingPromotion?.to).toBe('achiever');
  const night=prepareEvening(s,content);expect(night.development.developmentCurrent).toBe('achiever');expect(night.development.available).toContain('expert');expect(night.development.transitions).toHaveLength(1);expect(prepareEvening(night,content)).toEqual(night);expect(night.nights.at(-1)?.primary).toContain('Его мастерство остаётся');
 });
 it('restores presented trials, consequences, pending promotion and the night exactly',()=>{
  for(const [day,slot,phase] of [[17,0,'slot'],[17,3,'slot'],[25,3,'evening']] as const){
   let s=snapshot(day,slot,phase);if(s.phase==='slot')s=persistDraw(s,drawCard(s,content)!,content);
   const restored=validateSave(envelope(structuredClone(s)))?.game;expect(restored).toEqual(s);
   if(s.phase==='slot'){const id=s.current!.choiceIds[0]!;expect(applyChoice(restored!,content,s.current!.cardId,id)).toEqual(applyChoice(s,content,s.current!.cardId,id));}
   else expect(prepareEvening(restored!,content)).toEqual(prepareEvening(s,content));
  }
 });
 it.each(['grow','retry','late'])('%s shows new stage content and keeps every fixed obligation',name=>{
  const {state,draws}=playDevelopment(1,name);expect(state.development.developmentCurrent).toBe('achiever');expect(draws.some(d=>d.cardId.startsWith('dev_achiever_'))).toBe(true);expect(draws.some(d=>d.variantId==='d30_0_pace_achiever')).toBe(true);
  for(const c of content.cards.filter(c=>c.at))expect(draws.some(d=>d.cardId===c.id&&d.day===c.at!.day&&d.slot===c.at!.slot)).toBe(true);
  expect(state.scheduled.some(s=>content.cards.find(c=>c.id===s.cardId)?.required)).toBe(false);
 });
 it('never admits incompatible optional scenes into dice candidates',()=>{
  play(19,{...DEVELOPMENT_SCENARIOS.grow,beforeStep:s=>{if(s.phase==='dice')for(const id of s.diceHistory.at(-1)!.candidates)expect(developmentCardEligible(s,content.cards.find(c=>c.id===id)!)).toBe(true);return s;}});
 });
 it('rejects invented, out-of-order, unsupported and prematurely committed receipts',()=>{
  const good=envelope(playDevelopment(1,'grow').state);expect(validateSave(good)).toBeDefined();
  for(const change of [
   (s:GameState)=>{s.development.evidence[0]!.cardId='nonexistent';},
   (s:GameState)=>{s.development.evidence.reverse();},
   (s:GameState)=>{s.development.evidence.find(e=>e.eventId==='cycle-17-trial')!.choiceId='a';},
   (s:GameState)=>{s.development.transitions[0]!.day=17;},
   (s:GameState)=>{s.development.evidence.find(e=>e.eventId==='cycle-17-result')!.contextId='invented';}
  ]){const bad=structuredClone(good);change(bad.game);expect(validateSave(bad)).toBeUndefined();}
 });
});
