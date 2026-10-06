import { create } from 'zustand';
import { content } from '../content';
import { answerMotive, skipMotive, applyChoice, beginSlots, chooseIntention, chooseRoute, drawCard, persistDraw, leaveEvening, nextChapter, prepareEvening, startEpisode, chooseGoal, prepareEncounter, rollEncounter, openEncounter, fairDieFace } from '../engine';
import type { GameState, GoalId, LifeFacet } from '../engine/types';
import { acquireProfileLock, loadSave, writeSave, restoreBackup, preserveAndRestart } from '../persistence/save';
import { attachPresentedScenePersistence, presentedScenePayload } from '../persistence/presentedScene';
import { enqueueSceneInstance } from '../persistence/sceneInstanceOutbox';
import { enqueueChoiceEvent, markChoiceEventPending } from '../persistence/eventOutbox';
import { reconcileHeldChoiceEvents } from '../persistence/outboxRecovery';
import { syncGamePersistence } from '../sync/gamePersistenceSync';
import { completeCharacterDay, type CompleteDayResponse } from '../sync/dayComplete';
interface GameStore {
 game: GameState; started: boolean; error: string | undefined;
 ready: boolean; readOnly: boolean; saveStatus: 'loading' | 'idle' | 'saving' | 'saved' | 'failed' | 'readonly'; saveError: string | undefined;
 recovery: boolean; hasBackup: boolean; paused: boolean; choiceWritePending: boolean;
 initialize: () => void; recover: () => Promise<void>; restart: () => Promise<void>; retrySave: () => void;
 start: (seed?: number, goal?: GoalId) => void; reset: (seed?: number) => void; beginDay: () => void;
 choose: (cardId: string, choiceId: string) => void; finishEvening: () => void; pause: () => void; resume: () => void;
 setIntention: (facet: LifeFacet) => void; setRoute: (optionId: string) => void;
 setGoal: (id:GoalId, action:'select'|'keep'|'clarify'|'change', wording?:string) => void;
 roll: () => void; openEncounter: () => void;
 answerMotive: (optionId: string) => void; skipMotive: () => void;
}
const persistenceApiBase = import.meta.env.VITE_GAME_API_BASE_URL?.trim().replace(/\/$/, '');
const newState = (seed = Date.now() >>> 0) => {
 const game=startEpisode(content,seed,crypto.randomUUID());
 if(persistenceApiBase)return game;
 const local={...game};delete local.serverPersistence;return local;
};
const gameSessionId = crypto.randomUUID();
export function present(state: GameState): GameState {
 if (state.phase === 'chapter') return nextChapter(state, content);
 if (state.phase === 'evening') return prepareEvening(state, content);
 if (state.phase !== 'slot') return state;
 const encounter = prepareEncounter(state,content);
 if (encounter.phase === 'dice') return encounter;
 const draw = drawCard(state, content);
 if (!draw) throw new Error(`Нет ситуации для дня ${state.day}, слот ${state.slot}.`);
 return attachPresentedScenePersistence(persistDraw(state, draw, content));
}
let initialized=false;
let releaseLock:(()=>void)|undefined;
if(import.meta.hot){
 import.meta.hot.dispose(()=>{releaseLock?.();initialized=false;});
 import.meta.hot.accept(()=>window.location.reload());
}
let queue=Promise.resolve();let revision=0;
export const useGameStore = create<GameStore>((set,get) => {
 const persist = (): Promise<boolean> => {
  const store=get();if(!store.ready || store.readOnly || store.recovery)return Promise.resolve(true);
  const game=structuredClone(store.game);const rev=++revision;
  set({saveStatus:'saving',saveError:undefined});
  const task=queue.catch(()=>{}).then(()=>writeSave({schema:1,started:store.started,game}));
  queue=task.then(()=>{
   if(rev===revision)set({saveStatus:'saved',saveError:undefined});
  }).catch(e=>{if(rev===revision)set({saveStatus:'failed',saveError:e instanceof Error?e.message:String(e)});});
  return task.then(()=>true,()=>false);
 };
 const queuePresentedScene = async (game: GameState) => {
  const payload=presentedScenePayload(game);
  if(payload)await enqueueSceneInstance(payload);
 };
 const applyCanonicalDevelopment = (game: GameState, result: CompleteDayResponse): GameState => {
  if(!game.serverPersistence?.enabled)return game;
  return {
   ...game,
   serverPersistence:{
    ...game.serverPersistence,
    processedThroughDay:result.gameDay,
    lastProcessedSeq:result.lastSeq,
    canonicalDevelopment:{
     taxonomyVersion:result.taxonomyVersion,
     evidenceModelVersion:result.evidenceModelVersion,
     calculationVersion:result.calculationVersion,
     profileStatus:result.profileStatus,
     centerScores:{...result.centerScores},
     currentCenter:result.currentCenter,
     currentCenterConfidence:result.currentCenterConfidence,
     emergingCenter:result.emergingCenter,
     emergingCenterConfidence:result.emergingCenterConfidence,
     evidenceCount:result.evidenceCount
    }
   }
  };
 };
 const scheduleRemoteSync = (game: GameState) => {
  if(!persistenceApiBase||!game.serverPersistence?.enabled)return;
  void syncGamePersistence({characterId:game.runId,apiBaseUrl:persistenceApiBase}).catch(()=>undefined);
 };
 const afterLocalSave = (game: GameState, saved: boolean) => {
  if(!saved)return;
  void queuePresentedScene(game).then(()=>scheduleRemoteSync(game)).catch(e=>{
   set({error:e instanceof Error?e.message:String(e)});
  });
 };
 const commitGame = (game: GameState) => {
  set({game,error:undefined});
  void persist().then(saved=>afterLocalSave(game,saved));
 };
 const transition = (fn: (state: GameState) => GameState) => {
  if(get().readOnly||get().recovery||get().choiceWritePending)return;
  try {const prev=get().game;const next=fn(prev);if(next===prev)return;commitGame(present(next));}
  catch(e){set({error:e instanceof Error?e.message:String(e)});}
 };
 return {
  error:undefined, game:newState(), started:false,  ready:false,readOnly:false,
  saveStatus:'loading',saveError:undefined,recovery:false,hasBackup:false,paused:false,choiceWritePending:false,
  initialize:()=>{
   if(initialized)return;initialized=true;
   acquireProfileLock(release=>{
    releaseLock=release;
    void loadSave().then(saved=>{
     if(saved.damaged){set({ready:true,recovery:true,hasBackup:!!saved.backup,saveStatus:'failed',saveError:'Сохранение повреждено или относится к другой версии. Исходная запись сохранена.'});return;}
     if(!saved.record){set({ready:true,saveStatus:'idle'});return;}
     const game=attachPresentedScenePersistence(saved.record.game);
     set({ready:true,saveStatus:'saved',game,started:saved.record.started});
     void reconcileHeldChoiceEvents(game).then(()=>queuePresentedScene(game)).then(()=>scheduleRemoteSync(game)).catch(e=>{
      set({error:e instanceof Error?e.message:String(e)});
     });
    }).catch(e=>set({ready:true,recovery:true,saveStatus:'failed',saveError:`Не удалось прочитать сохранение: ${String(e)}. Исходный профиль не заменён.`}));
   },()=>set({ready:true,readOnly:true,saveStatus:'readonly',saveError:'Прохождение открыто в другой вкладке или браузер не поддерживает защиту профиля. Закройте другую вкладку и обновите эту.'}));
  },
  recover:async()=>{if(get().readOnly)return;try{await queue;const record=await restoreBackup();const game=attachPresentedScenePersistence(record.game);set({game,started:record.started,recovery:false,saveStatus:'saved',saveError:undefined,error:undefined});await reconcileHeldChoiceEvents(game);await queuePresentedScene(game);scheduleRemoteSync(game);}catch(e){set({saveStatus:'failed',saveError:String(e)});}},
  restart:async()=>{if(get().readOnly)return;try{await queue;await preserveAndRestart();set({game:newState(),started:false,recovery:false,paused:false,choiceWritePending:false,error:undefined});void persist();}catch(e){set({saveStatus:'failed',saveError:String(e)});}},
  retrySave:()=>{void persist().then(async saved=>{if(!saved)return;const game=get().game;await reconcileHeldChoiceEvents(game);await queuePresentedScene(game);scheduleRemoteSync(game);});},
  start:(seed,goal='order')=>{if(get().readOnly||get().recovery)return;const game=chooseGoal(newState(seed),content,goal,'select');set({game,started:true,error:undefined,paused:false,choiceWritePending:false});void persist().then(saved=>afterLocalSave(game,saved));},
  reset:(seed)=>{if(get().readOnly)return;const game=newState(seed);set({game,started:false,error:undefined,choiceWritePending:false});void persist();},
  beginDay:()=>transition(s=>beginSlots(s,content)),
  setGoal:(id,action,wording)=>transition(s=>chooseGoal(s,content,id,action,wording)),
  setIntention:(facet)=>transition(s=>chooseIntention(s,content,facet)),
  setRoute:(id)=>transition(s=>chooseRoute(s,content,id)),
  choose:(cardId,authorChoiceId)=>{
   const store=get();if(store.readOnly||store.recovery||store.choiceWritePending)return;
   try{
    const source=attachPresentedScenePersistence(store.game);
    const next=applyChoice(source,content,cardId,authorChoiceId);
    if(next===source)return;
    const shown=present(next);
    const scene=presentedScenePayload(source);
    const persistence=source.current?.persistence;
    const selected=persistence?.choices.find(choice=>choice.authorChoiceId===authorChoiceId);
    if(!source.serverPersistence?.enabled||!scene||!persistence||!selected){
     commitGame(shown);
     return;
    }
    const event={
     eventId:crypto.randomUUID(),
     characterId:source.runId,
     gameSessionId,
     seq:source.history.length+1,
     gameDay:source.day,
     eventType:'CHOICE_MADE' as const,
     sceneInstanceId:persistence.sceneInstanceId,
     choiceId:selected.choiceId,
     occurredAt:new Date().toISOString()
    };
    set({choiceWritePending:true,error:undefined});
    void (async()=>{
     await enqueueSceneInstance(scene);
     await enqueueChoiceEvent(event,'held');
     set({game:shown,error:undefined});
     const saved=await persist();
     if(!saved){set({choiceWritePending:false});return;}
     await markChoiceEventPending(event.eventId,false);
     await queuePresentedScene(shown);
     set({choiceWritePending:false});
     scheduleRemoteSync(shown);
    })().catch(e=>set({choiceWritePending:false,error:e instanceof Error?e.message:String(e)}));
   }catch(e){set({choiceWritePending:false,error:e instanceof Error?e.message:String(e)});}
  },
  finishEvening:()=>{
   const store=get();
   if(store.readOnly||store.recovery||store.choiceWritePending)return;
   const source=store.game;
   if(source.phase!=='evening')return;
   if(!source.serverPersistence?.enabled||!persistenceApiBase){
    transition(s=>leaveEvening(s,content));
    return;
   }
   set({choiceWritePending:true,error:undefined});
   void (async()=>{
    await queue;
    await reconcileHeldChoiceEvents(source);
    await queuePresentedScene(source);
    let synced=await syncGamePersistence({characterId:source.runId,apiBaseUrl:persistenceApiBase});
    if(synced.status!=='events'||!['ok','idle'].includes(synced.result.status)){
     throw new Error(`Не удалось синхронизировать день: ${synced.status}`);
    }

    let completed=await completeCharacterDay({
     characterId:source.runId,
     gameDay:source.day,
     lastSeq:source.history.length,
     apiBaseUrl:persistenceApiBase
    });
    if(completed.status==='incomplete'){
     synced=await syncGamePersistence({characterId:source.runId,apiBaseUrl:persistenceApiBase});
     if(synced.status!=='events'||!['ok','idle'].includes(synced.result.status)){
      throw new Error('Не удалось досинхронизировать события дня');
     }
     completed=await completeCharacterDay({
      characterId:source.runId,
      gameDay:source.day,
      lastSeq:source.history.length,
      apiBaseUrl:persistenceApiBase
     });
    }
    if(completed.status!=='ok'){
     if(completed.status==='paused-auth')throw new Error('Для завершения дня нужно снова войти в систему');
     if(completed.status==='retry')throw new Error('Сервер временно недоступен. Завершение дня можно повторить');
     if(completed.status==='incomplete')throw new Error(`Не все события дня доставлены: ${completed.missingSeq.join(', ')}`);
     throw new Error(`Сервер отклонил завершение дня: ${completed.code}`);
    }

    const advanced=leaveEvening(source,content);
    const next=applyCanonicalDevelopment(present(advanced),completed.result);
    set({game:next,error:undefined});
    const saved=await persist();
    if(!saved)throw new Error('День завершён на сервере, но локальное сохранение не записалось');
    await queuePresentedScene(next);
    set({choiceWritePending:false});
    scheduleRemoteSync(next);
   })().catch(e=>set({
    choiceWritePending:false,
    error:e instanceof Error?e.message:String(e)
   }));
  },
  pause:()=>set({paused:true}),resume:()=>set({paused:false}),
  roll:()=>transition(s=>rollEncounter(s,content,fairDieFace(()=>crypto.getRandomValues(new Uint32Array(1))[0]!))),
  openEncounter:()=>transition(openEncounter),
  answerMotive:(optionId)=>transition(s=>answerMotive(s,content,optionId)),
  skipMotive:()=>transition(s=>skipMotive(s,content))
 };
});
