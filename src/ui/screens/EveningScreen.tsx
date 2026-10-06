import { m } from 'framer-motion';
import { content } from '../../content';
import { eveningText } from '../../engine/day';
import type { GameState } from '../../engine/types';

function recordText(entry: GameState['journal'][number]) {
 if (entry.kind === 'insight') return content.insights.find(x => x.id === entry.id)?.text;
 if (entry.kind === 'reflection') return content.reflections.find(x => x.id === entry.id)?.text;
 return content.wisdoms.find(x => x.id === entry.id)?.text;
}

export function EveningScreen({game,onContinue,onPause}:{game:GameState;onContinue:()=>void;onPause:()=>void}) {
 const records=game.journal.filter(e=>e.day===game.day);
 const night=game.nights.find(n=>n.day===game.day);
 return <main className="screen narrative-screen evening-screen"><m.section className="narrative-card evening-card" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
  <p className="eyebrow">Вечер · День {game.day}</p>
  <div className="evening-ornament" aria-hidden="true"><i/></div>
  <h2 className="evening-title">День остаётся<br/>не только в памяти</h2>
  <div className="evening-summary"><p>{night?.primary ?? eveningText(game,content)}</p></div>
  {records.length>0&&<details className="journal evening-records"><summary>Записи этого дня <span>{records.length}</span></summary>{records.map(e=><article key={`${e.kind}:${e.id}`}><p>{recordText(e) ?? 'Запись сохранена в истории.'}</p>{e.note&&<p className="journal-note">{e.note}</p>}</article>)}</details>}
  {night?.note&&<p className="night-note">{night.note}</p>}
  <div className="evening-actions"><button className="choice-button" onClick={onPause}>На сегодня достаточно</button>
  <button className="primary-button" type="button" onClick={onContinue}>{game.day>=content.episode.days?'Граница продолжения':'Следующее утро'}</button></div>
 </m.section></main>;
}
