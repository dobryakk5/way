import { describe,it,expect } from 'vitest';
import { content } from '../content';
import { beginSlots,checkInsight,prepareEvening,leaveEvening,nextChapter,openInsight,resolveInsight,queueEndingReflection,resolveReflection,prepareMorning } from './day';
import { makeState } from './testUtils';
import { chooseIntention } from './navigation';
const evening=(day:number)=>makeState({day,chapter:day<=5?1:2,phase:'evening',qualities:{attention:8,compassion:8,honesty:0,letgo:0,courage:0}});
describe('v2.2 days and insights',()=>{
 it.each([1,5,9,10])('does not activate outside the window: day %i',day=>expect(checkInsight(evening(day),content)).toBeUndefined());
 it('applies one insight in evening even without opening its screen; preparation is idempotent',()=>{
  const e=prepareEvening(evening(6),content);expect(e.appliedInsights).toEqual(['insight_silence']);expect(e.flags).toContain('insight_silence');
  expect(e.journal).toContainEqual({day:6,kind:'insight',id:'insight_silence'});expect(prepareEvening(e,content)).toEqual(e);
  const next=leaveEvening(e,content);expect(next.phase).toBe('morning');expect(next.day).toBe(7);
  const e7=prepareEvening({...next,phase:'evening'},content);expect(e7.appliedInsights).toEqual(['insight_silence','insight_gaze']);
 });
 it('does not apply effects again when opening a journal insight',()=>{
  const e=prepareEvening(evening(6),content);const opened=openInsight(e,'insight_silence');const closed=resolveInsight(opened,content);
  expect(closed.phase).toBe('evening');expect(closed.flags).toEqual(e.flags);expect(closed.journal).toEqual(e.journal);
 });
 it('at day 8 competition selects only one and never backfills on day 9',()=>{
  const e=prepareEvening(evening(8),content);expect(e.appliedInsights).toHaveLength(1);
  expect(prepareEvening({...e,day:9,preparedEveningDay:8},content).appliedInsights).toHaveLength(1);
 });
 it('both insights can independently activate on the last allowed evening',()=>{
  for(const q of ['attention','compassion'] as const){const e=evening(8);e.qualities.attention=0;e.qualities.compassion=0;e.qualities[q]=8;
   expect(prepareEvening(e,content).appliedInsights).toEqual([q==='attention'?'insight_silence':'insight_gaze']);}
 });
 it('has action-based entry with no quality threshold',()=>{
  const e=makeState({day:6,phase:'evening',shown:{c1_old_bowl:[2],c2_marta_window_result:[6]},facts:{'liaison.martaHelp':'hero'}});
  const a=prepareEvening(e,content);expect(a.appliedInsights).toContain('insight_silence');
  const b=prepareEvening({...a,day:7},content);expect(b.appliedInsights).toContain('insight_gaze');
 });
 it('moves through chapter without reflection and permits a free intention change on day 6',()=>{
  const chapter=leaveEvening(evening(5),content);expect(chapter.phase).toBe('chapter');
  const morning=nextChapter(chapter,content);const question=beginSlots(morning,content);expect(question.phase).toBe('intention');
  const chosen=chooseIntention(question,content,'body');expect(chosen.resources).toEqual(question.resources);expect(chosen.qualities).toEqual(question.qualities);expect(chosen.slot).toBe(0);
 });
 it('skips final reflection without changing outcome or writing a note',()=>{
  const s=makeState({phase:'ending',summaryCommitted:true});const q=queueEndingReflection(s,content);const skipped=resolveReflection(q,content);
  expect(skipped.phase).toBe('ending');expect(skipped.journal).toEqual(s.journal);expect(skipped.facts).toEqual(s.facts);
 });
 it('keeps the morning goal and throttles quality variants',()=>{
  const s=makeState({phase:'morning',day:4,qualities:{attention:3,honesty:0,compassion:0,letgo:0,courage:0}});
  const first=prepareMorning(s,content);expect(first.lastMorningVariant).toEqual({day:4,quality:'attention'});expect(first.morningText).toContain('ярмарки');
  const second=prepareMorning({...first,day:5,qualities:{...s.qualities,honesty:4}},content);expect(second.lastMorningVariant).toEqual(first.lastMorningVariant);
 });
});
