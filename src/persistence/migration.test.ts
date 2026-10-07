import 'fake-indexeddb/auto';
import { describe,it,expect,vi } from 'vitest';
import { IDBObjectStore } from 'fake-indexeddb';
import legacyV3 from './legacy-v3.json';
import legacyV4 from './legacy-v4.json';
import { content } from '../content';
import { CONTENT_VERSION } from '../content/version';
import { DEVELOPMENT_SCENARIOS,legacyExpertStart } from '../../scripts/development-scenarios';
import { play } from '../../scripts/play';
import { drawCard,persistDraw } from '../engine/draw';
import type { GameContent,GameState } from '../engine/types';
import { loadSave,migrateSave,validateSave } from './save';
const contentV3={...content,...legacyV3} as unknown as GameContent;
const contentV4={...content,...legacyV4} as unknown as GameContent;
/** The exact shape a v4 save had: no profile, no motive phase, no frozen origin, old stage field names. */
function v4Game(s:GameState){
 const {heroDevelopmentProfile:_p,pendingMotive:_m,development:d,current,diceHistory,...rest}=s;
 const {selectionOrigin:_o,...oldCurrent}=current??{} as NonNullable<GameState['current']>;
 return {...rest,nights:rest.nights.map(({summary:_s,...n})=>n),version:4,contentVersion:legacyV4.contentVersion,...(current?{current:oldCurrent}:{}),diceHistory:diceHistory.map(({candidateOrigins:_c,...x})=>x),
  development:{current:d.developmentCurrent,available:d.available,...(d.transitionTarget?{growingEdge:d.transitionTarget}:{}),...(d.activeArcId?{activeArcId:d.activeArcId}:{}),evidence:d.evidence,...(d.pendingPromotion?{pendingPromotion:d.pendingPromotion}:{}),transitions:d.transitions}};
}
const recordV4=(s:GameState)=>({schema:1,started:true,game:v4Game(s)});
function recordV3(s:GameState){const {development:_d,...game}=v4Game(s);return {schema:1,started:true,game:{...game,version:3,contentVersion:legacyV3.contentVersion}};}
async function database(){await loadSave();return new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('put-local-profile',1);r.onsuccess=()=>resolve(r.result);});}
async function put(raw:unknown){const db=await database();await new Promise<void>(resolve=>{const t=db.transaction('saves','readwrite');t.objectStore('saves').put(raw,'active');t.oncomplete=()=>resolve();});}
const snapshotsOf=(c:GameContent,seed:number,options={})=>{const out:GameState[]=[];play(seed,{content:c,start:legacyExpertStart,...options,beforeStep:s=>{out.push(s.phase==='slot'?persistDraw(s,drawCard(s,c)!,c):s);return s;}});return out;};
const without=(g:Record<string,unknown>,...keys:string[])=>Object.fromEntries(Object.entries(g).filter(([k])=>!keys.includes(k)));

describe('known v3 and v4 migrations to v5',()=>{
 it.each([[3,contentV3,recordV3],[4,contentV4,recordV4]] as const)('v%i: copies every existing phase and shown pair without replay or retrospective evidence',(_v,old,toRecord)=>{
  const snaps=[...snapshotsOf(old,2),play(2,{content:old,start:legacyExpertStart}).state];
  for(const phase of ['morning','goal','route','dice','slot','evening','boundary']){
   const s=snaps.find(s=>s.phase===phase);expect(s,phase).toBeDefined();
   const raw=toRecord(s!),converted=migrateSave(raw);expect(converted,phase).toBeDefined();
   const g=converted!.game;
   expect(without(g as unknown as Record<string,unknown>,'development','heroDevelopmentProfile','version','contentVersion','current','diceHistory'),phase)
     .toEqual(without(raw.game as unknown as Record<string,unknown>,'development','version','contentVersion','current','diceHistory'));
   expect(g.version).toBe(5);expect(g.contentVersion).toBe(CONTENT_VERSION);
   const od=_v===3?{current:'expert',available:['opportunist','diplomat','expert'],growingEdge:'achiever',activeArcId:'expert-achiever',evidence:[],transitions:[]}:(raw.game as unknown as ReturnType<typeof v4Game>).development;
   expect(g.development.developmentCurrent).toBe(od.current);expect(g.development.currentOrigin).toBe(od.transitions.length?'promotion':'legacy-authored');expect(g.development.evidence).toEqual(od.evidence);
   expect(g.development.available).toEqual(od.available);expect(g.development.transitionTarget).toBe(od.growingEdge);expect(g.development.activeArcId).toBe(od.activeArcId);
   // Old decisions were never diagnostic cases: nothing is scored retrospectively.
   expect(g.heroDevelopmentProfile.evidence).toEqual([]);expect(g.heroDevelopmentProfile.cases).toEqual([]);expect(g.heroDevelopmentProfile.status).toBe('insufficient');
   expect(g.history).toEqual((raw.game as unknown as GameState).history);
   expect(validateSave(converted)).toEqual(converted);
  }
 });
 it('v3 → v4 → v5 chain keeps the world, history, nights and the displayed pair',()=>{
  const s=snapshotsOf(contentV3,3).find(s=>s.phase==='slot'&&s.day>=3)!;
  const raw=recordV3(s),converted=migrateSave(raw)!;
  expect(converted.game.current).toEqual(s.current&&without(s.current as unknown as Record<string,unknown>,'selectionOrigin'));
  expect(converted.game.resources).toEqual(s.resources);expect(converted.game.facts).toEqual(s.facts);expect(converted.game.nights).toEqual(s.nights.map(({summary:_s,...n})=>n));expect(converted.game.shown).toEqual(s.shown);
  expect(converted.game.scheduled).toEqual(s.scheduled);expect(converted.game.runId).toBe(s.runId);
 });
 it('v4 with a completed promotion keeps its development evidence and transition, and the stage is not re-derived',()=>{
  const {state}=play(1,{...DEVELOPMENT_SCENARIOS.grow,content:contentV4});
  expect(state.development.transitions).toHaveLength(1);
  const raw=recordV4(state),converted=migrateSave(raw)!;expect(converted).toBeDefined();
  const d=converted.game.development;
  expect(d.developmentCurrent).toBe('achiever');expect(d.currentOrigin).toBe('promotion');expect(d.initialStage).toMatchObject({logic:'expert',origin:'legacy-authored'});
  expect(d.transitions).toEqual(state.development.transitions);expect(d.evidence).toEqual(state.development.evidence);
  expect(converted.game.heroDevelopmentProfile.evidence).toEqual([]);
 });
 it('preserves old metadata on a currently displayed Alexey pair',()=>{
  for(const [old,toRecord] of [[contentV3,recordV3],[contentV4,recordV4]] as const){
   let s:GameState|undefined;play(1,{content:old,start:legacyExpertStart,onDraw:(state,draw)=>{if(draw.card.id==='d17_3_apprentice')s=persistDraw(state,draw,old);}});
   const raw=toRecord(s!),converted=migrateSave(raw)!;
   expect(converted.game.current!.choices).toEqual(s!.current!.choices);expect(converted.game.current!.choices!.some(c=>c.decisionKinds?.includes('experiment'))||old===contentV4).toBe(true);expect(converted.game.development.evidence.map(e=>e.eventId)).toEqual(s!.development.evidence.map(e=>e.eventId));
   // The pair keeps its old choices, so choosing from it cannot open a diagnostic case retroactively.
   expect(converted.game.current!.choices!.some(c=>c.diagnosticAction)).toBe(false);
  }
 });
 it('archives the original atomically and does not migrate twice',async()=>{
  for(const raw of [recordV3(play(4,{content:contentV3,start:legacyExpertStart}).state),recordV4(play(4,{content:contentV4,start:legacyExpertStart}).state)]){
   await put(raw);
   const loaded=await loadSave();expect(loaded.damaged).toBe(false);expect(loaded.record).toEqual(migrateSave(raw));
   const db=await database();const all=await new Promise<unknown[]>(resolve=>{const r=db.transaction('saves','readonly').objectStore('saves').getAll();r.onsuccess=()=>resolve(r.result);});expect(all).toContainEqual(raw);expect((await loadSave()).record).toEqual(loaded.record);
  }
 });
 it('an aborted migration keeps the old active record intact',async()=>{
  const raw=recordV4(play(5,{content:contentV4,start:legacyExpertStart}).state);await put(raw);
  const mock=vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(()=>{throw new DOMException('Disk full','QuotaExceededError');});
  await expect(loadSave()).rejects.toThrow();mock.mockRestore();
  const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('put-local-profile',1);r.onsuccess=()=>resolve(r.result);});
  const kept=await new Promise<unknown>(resolve=>{const r=db.transaction('saves','readonly').objectStore('saves').get('active');r.onsuccess=()=>resolve(r.result);});expect(kept).toEqual(raw);
 });
 it('rejects unknown old versions and corrupted old world data',()=>{
  for(const [old,toRecord] of [[contentV3,recordV3],[contentV4,recordV4]] as const){
   const raw=toRecord(play(3,{content:old,start:legacyExpertStart}).state);const version=raw.game.version;
   raw.game.version=2;expect(migrateSave(raw)).toBeUndefined();raw.game.version=version;raw.game.facts['alexey.path']='invented';expect(migrateSave(raw)).toBeUndefined();
  }
 });
 it('rejects a v4 save whose development claims a transition without its evidence',()=>{
  const raw=recordV4(play(1,{...DEVELOPMENT_SCENARIOS.grow,content:contentV4}).state);
  raw.game.development.evidence=raw.game.development.evidence.filter(e=>e.eventId!=='cycle-20-review');
  expect(migrateSave(raw)).toBeUndefined();
 });
});
