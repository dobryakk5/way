import assert from 'node:assert/strict';
import { play } from './play';
for(const first of ['show','prepare'])for(const route of ['workshop','marta']){
 const {state,draws}=play(12345,{choices:{c1_alexey_broken_jug:first},routes:{2:route}});
 assert.equal(draws.find(d=>d.day===2&&d.slot===0)?.cardId,'c1_alexey_after_jug');
 assert.equal(draws.find(d=>d.day===2&&d.slot===2)?.source,'route');
 assert.equal(state.intentionHistory[0]?.day,1);
}
console.log('Phase 4 v2.2 smoke OK: both cup choices × both routes');
