import { describe,it,expect } from 'vitest';
import { content } from '../content';
import { play } from '../../scripts/play';

// Split from scenarios.test.ts: one file of synchronous 30-day runs must stay well under the 60 s the vitest worker allows between reports.
describe('route scenarios',()=>{
 for(const route of content.episode.routeMoments)for(const option of route.options){
  it(`both candidates are reachable at ${route.day}/${route.slot}/${option.id}, despite a crisis`,()=>{
   const seen=new Set<string>();
   for(let seed=1;seed<=60;seed++)play(seed,{routes:{[route.day]:option.id},beforeStep:s=>s.day===route.day&&s.slot===route.slot?{...s,resources:{...s.resources,strength:0}}:s,
    onDraw:(s,d)=>{if(s.day===route.day&&s.slot===route.slot){expect(d.source).toBe('route');expect(d.card.facets?.some(f=>option.facets.includes(f))).toBe(true);seen.add(d.card.id);}}});
   expect(seen.size).toBeGreaterThanOrEqual(2);
  },120000); // dozens of full 30-day plays: slow under a parallel run, not a hang
 }
});
