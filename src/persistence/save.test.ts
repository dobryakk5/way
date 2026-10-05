import 'fake-indexeddb/auto';
import { IDBObjectStore } from 'fake-indexeddb';
import { describe,it,expect,vi } from 'vitest';
import { play } from '../../scripts/play';
import { content } from '../content';
import { drawCard,persistDraw } from '../engine/draw';
import { prepareEvening } from '../engine/day';
import { loadSave,writeSave,restoreBackup,validateSave,acquireProfileLock, type SaveRecord } from './save';
import type { GameState } from '../engine/types';
const record=(game:GameState):SaveRecord=>({schema:1,started:true,game});
const db=()=>new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('put-local-profile',1);r.onsuccess=()=>resolve(r.result);});
async function corrupt(raw:unknown) {const d=await db();await new Promise<void>(resolve=>{const t=d.transaction('saves','readwrite');t.objectStore('saves').put(raw,'active');t.oncomplete=()=>resolve();});}

describe('atomic local saves and recovery',()=>{
 it('roundtrips every playable phase without drawing, applying or rolling on restore',async()=>{
  const captured:GameState[]=[];
  play(17,{beforeStep:s=>{
   if(s.phase==='slot')captured.push(persistDraw(s,drawCard(s,content)!,content));
   else if(s.phase==='evening')captured.push(prepareEvening(s,content));
   else captured.push(s);return s;
  }});
  const final=play(17).state;captured.push(final);
  for(const phase of ['morning','slot','intention','route','goal','dice','evening','boundary']){
   const states=captured.filter(s=>s.phase===phase);expect(states.length,phase).toBeGreaterThan(0);
   for(const s of states.slice(0,3)){expect(validateSave(record(s)),phase).toBeDefined();await writeSave(record(s));expect((await loadSave()).record).toEqual(record(s));}
  }
  const rolled=captured.find(s=>s.phase==='dice'&&s.current)!;await writeSave(record(rolled));expect((await loadSave()).record!.game.current).toEqual(rolled.current);
 });
 it('rejects unknown versions, malformed numbers, contradictory slots and changed presented effects',()=>{
  const good=record(play(5).state);expect(validateSave(good)).toBeDefined();
  for(const modify of [(r:SaveRecord)=>{r.game.version=99;},(r:SaveRecord)=>{r.game.resources.strength=NaN;},(r:SaveRecord)=>{r.game.history.pop();},(r:SaveRecord)=>{r.game.facts['alexey.path']='missing';}]){const bad=structuredClone(good);modify(bad);expect(validateSave(bad)).toBeUndefined();}
  let shown:GameState|undefined;play(3,{onDraw:(s,d)=>{if(!shown)shown=persistDraw(s,d,content);}});const bad=record(shown!);bad.game.current!.choices![0]!.effects.resources={wealth:100};expect(validateSave(bad)).toBeUndefined();
 });
 it('keeps a damaged original and restores only an explicitly requested correct backup',async()=>{
  const a=record(play(1).state),b=record(play(2).state);await writeSave(a);await writeSave(b);
  const raw={schema:99,original:'preserve me'};await corrupt(raw);const loaded=await loadSave();expect(loaded.damaged).toBe(true);expect(loaded.backup).toEqual(a);expect(loaded.raw).toEqual(raw);
  expect(await restoreBackup()).toEqual(a);expect((await loadSave()).record).toEqual(a);
  const d=await db();const originals=await new Promise<unknown[]>(resolve=>{const r=d.transaction('saves','readonly').objectStore('saves').getAll();r.onsuccess=()=>resolve(r.result);});expect(originals).toContainEqual(raw);
 });
 it('an aborted write does not replace the active record or claim success',async()=>{
  const a=record(play(4).state);await writeSave(a);
  const put=vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(()=>{throw new DOMException('Disk full','QuotaExceededError');});
  await expect(writeSave(record(play(6).state))).rejects.toThrow();put.mockRestore();expect((await loadSave()).record).toEqual(a);
 });
 it('allows only the owning tab to hold the profile lock',async()=>{
  let held=false;let release:(()=>void)|undefined;
  vi.stubGlobal('navigator',{locks:{request:async(_name:string,_options:unknown,callback:(lock:object|null)=>Promise<void>)=>{if(held)return callback(null);held=true;try{await callback({});}finally{held=false;}}}});
  let acquired=0,blocked=0;
  acquireProfileLock(r=>{acquired++;release=r;},()=>blocked++);acquireProfileLock(()=>acquired++,()=>blocked++);
  expect(acquired).toBe(1);expect(blocked).toBe(1);release!();await Promise.resolve();vi.unstubAllGlobals();
 });
});
