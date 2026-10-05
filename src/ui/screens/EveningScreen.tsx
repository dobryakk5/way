import { m } from 'framer-motion';
import { content } from '../../content';
import { eveningText } from '../../engine/day';
import type { GameState } from '../../engine/types';
export function EveningScreen({game,onContinue,onPause}:{game:GameState;onContinue:()=>void;onPause:()=>void}) {
 const records=game.journal.filter(e=>e.day===game.day);
 return <main className="screen narrative-screen evening-screen"><m.section className="narrative-card evening-card" initial={{opacity:0}} animate={{opacity:1}}>
  <p className="eyebrow">Вечер · День {game.day}</p>
  <p className="narrative-text">{game.nights.find(n=>n.day===game.day)?.primary ?? eveningText(game,content)}</p>
  {records.length>0&&<details className="journal"><summary>Записи этого дня</summary>{records.map(e=><p key={`${e.kind}:${e.id}`}>{(e.kind==='insight'?content.insights:content.wisdoms).find(x=>x.id===e.id)?.text}</p>)}</details>}
  {game.nights.find(n=>n.day===game.day)?.note&&<p>{game.nights.find(n=>n.day===game.day)?.note}</p>}
  <button className="choice-button" onClick={onPause}>На сегодня достаточно</button>
  <button className="primary-button" type="button" onClick={onContinue}>{game.day>=content.episode.days?'Граница продолжения':'Начать новый день'}</button>
 </m.section></main>;
}
