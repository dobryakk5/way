import { content } from '../src/content';
import { legacyAuthoredDevelopment } from '../src/engine';
import type { GameState } from '../src/engine';
import { play, type PlayOptions } from './play';
// The authored hero of the Alexey line: an explicit fixture, because a new game no longer starts with any stage.
export const legacyExpertStart=(s:GameState):GameState=>({...s,development:legacyAuthoredDevelopment(content,'expert',['opportunist','diplomat','expert'])});
const controlled: Record<string,string> = Object.fromEntries([14,17,20,22,25,28].flatMap(d=>[[`d${d}_0_apprentice`,'a'],[`d${d}_3_apprentice`,'b']]));
const trials = Object.fromEntries([17,20,22,25,28].flatMap(d=>[[`d${d}_0_apprentice`,'b'],[`d${d}_3_apprentice`,'a']]));
const retriesDeclined=Object.fromEntries([1,2,3].flatMap(n=>[[`dev_retry_${n}`,'a'],[`dev_retry_${n}_review`,'b']]));
const scenarios:Record<string,PlayOptions>={
 control:{policy:'always-first',choices:{...controlled,...retriesDeclined}},
 withdraw:{policy:'always-first',choices:{...controlled,...Object.fromEntries([17,20,22,25,28].map(d=>[`d${d}_0_apprentice`,'b'])),...Object.fromEntries([1,2,3].flatMap(n=>[[`dev_retry_${n}`,'b'],[`dev_retry_${n}_review`,'b']]))}},
 grow:{policy:'always-first',choices:{...controlled,...trials,...retriesDeclined}},
 retry:{policy:'always-first',choices:{...controlled,...retriesDeclined,d17_0_apprentice:'b',dev_retry_1:'b',dev_retry_1_review:'a',d25_0_apprentice:'b',d25_3_apprentice:'a'}},
 late:{policy:'always-first',choices:{...controlled,...retriesDeclined,d22_0_apprentice:'b',d22_3_apprentice:'a',d28_0_apprentice:'b',d28_3_apprentice:'a'}}
};
export const DEVELOPMENT_SCENARIOS:Record<string,PlayOptions>=Object.fromEntries(Object.entries(scenarios).map(([name,o])=>[name,{...o,start:legacyExpertStart}]));
export const playDevelopment=(seed:number,name:keyof typeof DEVELOPMENT_SCENARIOS)=>play(seed,DEVELOPMENT_SCENARIOS[name]);
