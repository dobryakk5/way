import { create } from 'zustand';
import { content } from '../content';
import { answerMotive, skipMotive, applyChoice, beginSlots, chooseIntention, chooseRoute, drawCard, persistDraw, leaveEvening, nextChapter, prepareEvening, startEpisode, chooseGoal, prepareEncounter, rollEncounter, openEncounter, fairDieFace } from '../engine';
import type { GameState, GoalId, LifeFacet } from '../engine/types';
import { acquireProfileLock, loadSave, writeSave, restoreBackup, preserveAndRestart } from '../persistence/save';
interface GameStore {
 game: GameState; started: boolean; error: string | undefined;
 ready: boolean; readOnly: boolean; saveStatus: 'loading' | 'idle' | 'saving' | 'saved' | 'failed' | 'readonly'; saveError: string | undefined;
 recovery: boolean; hasBackup: boolean; paused: boolean;
 initialize: () => void; recover: () => Promise<void>; restart: () => Promise<void>; retrySave: () => void;
 start: (seed?: number, goal?: GoalId) => void; reset: (seed?: number) => void; beginDay: () => void;
 choose: (cardId: string, choiceId: string) => void; finishEvening: () => void; pause: () => void; resume: () => void;
 setIntention: (facet: LifeFacet) => void; setRoute: (optionId: string) => void;
 setGoal: (id:GoalId, action:'select'|'keep'|'clarify'|'change', wording?:string) => void;
 roll: () => void; openEncounter: () => void;
 answerMotive: (optionId: string) => void; skipMotive: () => void;
}
const newState = (seed = Date.now() >>> 0) => startEpisode(content, seed, crypto.randomUUID());
export function present(state: GameState): GameState {
 if (state.phase === 'chapter') return nextChapter(state, content);
 if (state.phase === 'evening') return prepareEvening(state, content);
 if (state.phase !== 'slot') return state;
 const encounter = prepareEncounter(state,content);
 if (encounter.phase === 'dice') return encounter;
 const draw = drawCard(state, content);
 if (!draw) throw new Error(`Нет ситуации для дня ${state.day}, слот ${state.slot}.`);
 return persistDraw(state, draw, content);
}
let initialized=false;
let releaseLock:(()=>void)|undefined;
if(import.meta.hot){
 import.meta.hot.dispose(()=>{releaseLock?.();initialized=false;});
 import.meta.hot.accept(()=>window.location.reload());
}
let queue=Promise.resolve();let revision=0;
export const useGameStore = create<GameStore>((set,get) => {
 const persist = () => {
  const store=get();if(!store.ready || store.readOnly || store.recovery)return;
  const game=structuredClone(store.game);const rev=++revision;
  set({saveStatus:'saving',saveError:undefined});
  queue=queue.catch(()=>{}).then(()=>writeSave({schema:1,started:store.started,game})).then(()=>{
   if(rev===revision)set({saveStatus:'saved',saveError:undefined});
  }).catch(e=>{if(rev===revision)set({saveStatus:'failed',saveError:e instanceof Error?e.message:String(e)});});
 };
 const transition = (fn: (state: GameState) => GameState) => {
  if(get().readOnly||get().recovery)return;
  try {const prev=get().game;const next=fn(prev);if(next===prev)return;set({game:present(next),error:undefined});persist();}
  catch(e){set({error:e instanceof Error?e.message:String(e)});}
 };
 return {
  error:undefined, game:newState(), started:false,  ready:false,readOnly:false,
  saveStatus:'loading',saveError:undefined,recovery:false,hasBackup:false,paused:false,
  initialize:()=>{
   if(initialized)return;initialized=true;
   acquireProfileLock(release=>{
    releaseLock=release;
    void loadSave().then(saved=>{
     if(saved.damaged)set({ready:true,recovery:true,hasBackup:!!saved.backup,saveStatus:'failed',saveError:'Сохранение повреждено или относится к другой версии. Исходная запись сохранена.'});
     else set({ready:true,saveStatus:saved.record?'saved':'idle',...(saved.record?{game:saved.record.game,started:saved.record.started}:{})});
    }).catch(e=>set({ready:true,recovery:true,saveStatus:'failed',saveError:`Не удалось прочитать сохранение: ${String(e)}. Исходный профиль не заменён.`}));
   },()=>set({ready:true,readOnly:true,saveStatus:'readonly',saveError:'Прохождение открыто в другой вкладке или браузер не поддерживает защиту профиля. Закройте другую вкладку и обновите эту.'}));
  },
  recover:async()=>{if(get().readOnly)return;try{await queue;const record=await restoreBackup();set({game:record.game,started:record.started,recovery:false,saveStatus:'saved',saveError:undefined,error:undefined});}catch(e){set({saveStatus:'failed',saveError:String(e)});}},
  restart:async()=>{if(get().readOnly)return;try{await queue;await preserveAndRestart();set({game:newState(),started:false,recovery:false,paused:false,error:undefined});persist();}catch(e){set({saveStatus:'failed',saveError:String(e)});}},
  retrySave:persist,
  start:(seed,goal='order')=>{if(get().readOnly||get().recovery)return;set({game:chooseGoal(newState(seed),content,goal,'select'),started:true,error:undefined,paused:false});persist();},
  reset:(seed)=>{if(get().readOnly)return;set({game:newState(seed),started:false,error:undefined});persist();},
  beginDay:()=>transition(s=>beginSlots(s,content)),
  setGoal:(id,action,wording)=>transition(s=>chooseGoal(s,content,id,action,wording)),
  setIntention:(facet)=>transition(s=>chooseIntention(s,content,facet)),
  setRoute:(id)=>transition(s=>chooseRoute(s,content,id)),
  choose:(cardId,choiceId)=>transition(s=>applyChoice(s,content,cardId,choiceId)),
  finishEvening:()=>transition(s=>leaveEvening(s,content)),
  pause:()=>set({paused:true}),resume:()=>set({paused:false}),
  roll:()=>transition(s=>rollEncounter(s,content,fairDieFace(()=>crypto.getRandomValues(new Uint32Array(1))[0]!))),
  openEncounter:()=>transition(openEncounter),
  answerMotive:(optionId)=>transition(s=>answerMotive(s,content,optionId)),
  skipMotive:()=>transition(s=>skipMotive(s,content))
 };
});
