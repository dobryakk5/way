import { LazyMotion, domMax, MotionConfig } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { content } from './content';
import { drawCard } from './engine/draw';
import { useGameStore } from './store/useGameStore';
import { EveningScreen } from './ui/screens/EveningScreen';
import { GameScreen } from './ui/screens/GameScreen';
import { MorningScreen } from './ui/screens/MorningScreen';
import { StartScreen } from './ui/screens/StartScreen';
import { DirectionScreen } from './ui/screens/DirectionScreen';
import { GoalScreen } from './ui/screens/GoalScreen';
import { DiceScreen } from './ui/screens/DiceScreen';
import { MotiveScreen } from './ui/screens/MotiveScreen';
import { JourneyScreen } from './ui/screens/JourneyScreen';
import { EmailLogin } from './ui/components/EmailLogin';
import { JournalScreen } from './ui/screens/JournalScreen';
import { DebugPanel } from './debug/DebugPanel';

type UtilityScreen = 'journey' | 'journal' | null;

export default function App() {
 const store=useGameStore();const game=store.game;let screen:ReactNode;const [utility,setUtility]=useState<UtilityScreen>(null);
 useEffect(()=>store.initialize(),[store.initialize]);
 useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[game.day,game.slot,game.phase,utility]);
 if(!store.ready)screen=<main className="screen"><p className="loading-copy">Открываем сохранённый путь…</p></main>;
 else if(store.readOnly)screen=<main className="screen"><section className="narrative-card"><h2>Профиль занят</h2><p>{store.saveError}</p><button className="primary-button" onClick={()=>location.reload()}>Проверить снова</button></section></main>;
 else if(store.recovery)screen=<main className="screen"><section className="narrative-card"><h2>Восстановление пути</h2><p>{store.saveError}</p>{store.hasBackup&&<button className="primary-button" onClick={()=>void store.recover()}>Восстановить последнюю корректную копию</button>}<button className="choice-button" onClick={()=>void store.restart()}>Сохранить исходную запись отдельно и начать заново</button></section></main>;
 else if(utility==='journey')screen=<JourneyScreen game={game} onClose={()=>setUtility(null)} onRestart={()=>{setUtility(null);void store.restart();}}/>;
 else if(utility==='journal')screen=<JournalScreen game={game} onClose={()=>setUtility(null)}/>;
 else if(store.error)screen=<main className="screen"><section className="narrative-card"><h2>Не удалось продолжить</h2><p>{store.error}</p><p>Текущее прохождение сохранено в сессии.</p><button className="choice-button" onClick={()=>useGameStore.setState({error:undefined})}>Вернуться к текущей сцене</button></section></main>;
 else if(!store.started)screen=<StartScreen onStart={goal=>store.start(undefined,goal)}/>;
 else if(store.paused)screen=<main className="screen"><section className="narrative-card"><h2>На сегодня достаточно</h2><p>День {game.day}. Мир подождёт: отсутствие в игре ничего не меняет.</p><button className="primary-button" onClick={store.resume}>Продолжить с этой ночи</button></section></main>;
 else if(game.phase==='boundary')screen=<main className="screen"><section className="narrative-card"><h2>Доступная история прожита</h2><p>Написаны первые {content.episode.days} дней. Это граница доступного продолжения, а не конец жизни героя. Его состояние и записи остаются здесь.</p><button className="primary-button" onClick={()=>setUtility('journey')}>Мой путь</button><button className="choice-button boundary-journal" onClick={()=>setUtility('journal')}>Открыть дневник</button></section></main>;
 else if(game.phase==='goal')screen=<GoalScreen key={game.day} game={game} onChoose={store.setGoal}/>;
 else if(game.phase==='motive')screen=<MotiveScreen game={game} onAnswer={store.answerMotive} onSkip={store.skipMotive} saving={store.saveStatus==='saving'}/>;
 else if(game.phase==='dice')screen=<DiceScreen key={`${game.day}:${game.slot}`} game={game} onRoll={store.roll} onOpen={store.openEncounter} blocked={store.saveStatus!=='saved'||store.choiceWritePending}/>;
 else if(game.phase==='morning')screen=<MorningScreen game={game} onContinue={store.beginDay}/>;
 else if(game.phase==='intention'||game.phase==='route')screen=<DirectionScreen game={game} onIntention={store.setIntention} onRoute={store.setRoute}/>;
 else if(game.phase==='slot')screen=<GameScreen key={`${game.day}:${game.slot}`} game={game} draw={drawCard(game,content)} onChoose={store.choose} busy={store.choiceWritePending}/>;
 else screen=<EveningScreen key={game.day} game={game} onContinue={store.finishEvening} onOpen={setUtility} blocked={store.saveStatus!=='saved'||store.choiceWritePending}/>;
 const status=({loading:'Открываем…',idle:'',saving:'Сохраняем…',saved:'Сохранено',failed:'Не сохранено',readonly:'Только просмотр'})[store.saveStatus];
 return <LazyMotion features={domMax}><MotionConfig reducedMotion="user">{store.ready&&!store.readOnly&&!store.recovery&&<nav className="session-bar"><div className="session-brand" aria-label="Путь: Становление"><span className="mini-seal" aria-hidden="true">П</span><span className="session-brand-copy"><span>Путь</span><small>Становление</small></span></div><div className="session-actions"><EmailLogin/><span className="save-status" role="status" aria-live="polite">{status}</span>{store.saveStatus==='failed'&&<button onClick={store.retrySave}>Повторить запись</button>}{store.started&&<><button className={utility==='journal'?'active':''} onClick={()=>setUtility(utility==='journal'?null:'journal')}>Записи</button><button className={utility==='journey'?'active':''} onClick={()=>setUtility(utility==='journey'?null:'journey')}>{utility==='journey'?'Вернуться':'Мой путь'}</button></>}</div></nav>}{store.saveStatus==='failed'&&!store.recovery&&<p className="save-warning" role="alert">{store.saveError} Сессия доступна; перед закрытием попробуйте сохранить снова.</p>}{screen}<DebugPanel game={game}/></MotionConfig></LazyMotion>;
}
