import { describe,it,expect } from 'vitest';
import { content } from '../content';
import { play } from '../../scripts/play';
import { pickEnding,portrait } from './endings';
import { emptyWorld,finalizeEpisode,selectRun,inheritedFacts,startEpisode } from './world';
import { facetPattern,dominantFacet } from './facets';
import { makeCard,makeContent,makeState } from './testUtils';
describe('factual endings and world',()=>{
 it.each(['fulfilled','revised','deferred'])('ending depends on %s, never qualities/insights/intention',outcome=>{
  const s=play(1).state;s.facts['workshop.orderOutcome']=outcome;
  const a=pickEnding(s,content);s.qualities={attention:-20,honesty:-20,compassion:-20,letgo:-20,courage:-20};s.appliedInsights=[];s.declaredIntention='inner';
  expect(pickEnding(s,content)).toEqual(a);expect(a.id).toBe(outcome==='deferred'?'after_fair':'to_fair');
 });
 it('rejects an unresolved outcome instead of assigning a fallback ending',()=>expect(()=>pickEnding(startEpisode(content,1,'x'),content)).toThrow('Unresolved'));
 it('archives once, preserves the selected path on replay, and snapshots inheritance',()=>{
  const first=play(1).state;const a=finalizeEpisode(first,emptyWorld(),content,'2026-10-04T10:00:00Z');
  expect(finalizeEpisode(a.active,a.world,content,'2026-10-04T11:00:00Z').world.archive).toHaveLength(1);
  const b=finalizeEpisode(play(2).state,a.world,content,'2026-10-04T12:00:00Z');expect(b.world.archive).toHaveLength(2);expect(b.world.selectedRunByEpisode.fair).toBe(first.runId);
  const target={...content.episode,inheritedFactKeys:content.episode.finalFacts};
  const inherited=inheritedFacts(b.world,'fair',target);const active=startEpisode(content,3,'next',inherited);
  const changed=selectRun(b.world,'fair','sim-2');expect(changed.selectedRunByEpisode.fair).toBe('sim-2');expect(active.inheritedFacts).toEqual(inherited);
  first.facts['alexey.path']='paused';expect(a.world.archive[0]!.facts).not.toBe(first.facts);
 });
 it('does not invent shadow evidence in a portrait',()=>{
  const s=play(1).state;s.flags=s.flags.filter(f=>!f.startsWith('observed_shadow_'));
  for(const f of content.portraitFragments.filter(f=>f.group==='shadow'))expect(portrait(s,content)).not.toContain(f.text);
 });
 it('counts facets from actual resolved choices, requiring >=3 and a margin >=2',()=>{
  const card=makeCard({id:'c',type:'routine',choices:[{id:'a',label:'a',effects:{},servesFacets:['work']},{id:'b',label:'b',effects:{},servesFacets:['inner']}]});const c=makeContent({cards:[card]});
  const h=(choiceId:string,slot:number)=>({day:1,slot,cardId:'c',choiceId});const s=makeState({history:[h('a',0),h('a',1),h('b',2)]});
  expect(dominantFacet(s,c)).toBeUndefined();s.history.push(h('a',3));expect(facetPattern(s,c)).toEqual({work:3,relationships:0,body:0,inner:1});expect(dominantFacet(s,c)).toBe('work');
 });
});
