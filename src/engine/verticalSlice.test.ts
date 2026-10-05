import { describe,it,expect } from 'vitest';
import { content } from '../content';
import { play } from '../../scripts/play';
import { applyChoice,beginSlots,chooseIntention,drawCard,persistDraw,startEpisode } from './index';
import { useGameStore } from '../store/useGameStore';
describe('v2.2 playable slice',()=>{
 it.each(['show','prepare'])('returns cup at day2/0 after %s, even with crises',first=>{
  const {draws,state}=play(42,{choices:{c1_alexey_broken_jug:first},beforeStep:s=>s.day<=2&&s.slot===0?{...s,resources:{wealth:0,strength:0,peace:0,bonds:0}}:s});
  expect(draws.find(d=>d.day===1&&d.slot===0)?.cardId).toBe('c1_alexey_broken_jug');
  expect(draws.find(d=>d.day===2&&d.slot===0)?.variantId).toBe(first==='show'?'cup_show':'cup_prepare');
  expect(state.history).toHaveLength(120);
 });
 it('asks intention after first choice, before slot1; choosing it has no effects',()=>{
  const s=beginSlots(startEpisode(content,1,'test'),content);expect(s.phase).toBe('slot');const d=drawCard(s,content)!;
  const question=applyChoice(persistDraw(s,d,content),content,d.card.id,'show');expect(question.phase).toBe('intention');expect(question.slot).toBe(1);
  const answer=chooseIntention(question,content,'body');expect(answer.phase).toBe('slot');expect(answer.history).toHaveLength(1);expect(answer.resources).toEqual(question.resources);
 });
 it('rejects a duplicate or unpresented answer without consuming a slot',()=>{
  const s=beginSlots(startEpisode(content,1,'test'),content);const d=drawCard(s,content)!;
  expect(applyChoice(s,content,d.card.id,'show')).toBe(s);
  const presented=persistDraw(s,d,content);const next=applyChoice(presented,content,d.card.id,'show');expect(applyChoice(next,content,d.card.id,'show')).toBe(next);
 });
 it('store presents and completes all thirty days',()=>{
  useGameStore.getState().start(8);let guard=0;
  while(useGameStore.getState().game.phase!=='boundary'&&guard++<400){
   const store=useGameStore.getState(),g=store.game;
   if(g.phase==='morning')store.beginDay();else if(g.phase==='goal')store.setGoal(g.goal!.id,'keep');
   else if(g.phase==='dice'){if(g.current)store.openEncounter();else store.roll();}
   else if(g.phase==='intention')store.setIntention('relationships');else if(g.phase==='route')store.setRoute(content.episode.routeMoments.find(r=>r.day===g.day&&r.slot===g.slot)!.options[0].id);
   else if(g.phase==='slot'){expect(g.current).toBeDefined();store.choose(g.current!.cardId,g.current!.choiceIds[0]!);}
   else if(g.phase==='motive'){if(g.pendingMotive!.options.length%2)store.skipMotive();else store.answerMotive(g.pendingMotive!.options[0]!.id);}
   else if(g.phase==='evening')store.finishEvening();
  }
  const s=useGameStore.getState();expect(s.error).toBeUndefined();expect(s.game.phase).toBe('boundary');expect(s.game.history).toHaveLength(120);expect(s.game.nights).toHaveLength(30);
 });
});
