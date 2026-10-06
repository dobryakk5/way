import { content } from '../../content';
import type { GameState } from '../../engine/types';
export function MorningScreen({game,onContinue}:{game:GameState;onContinue:()=>void}) {
 return <main className="screen narrative-screen morning-screen"><section className="narrative-card">
  <p className="eyebrow">Глава {game.chapter} · {content.episode.chapters.find(ch=>ch.id===game.chapter)?.title}</p><h2>День {game.day}</h2>
  <p className="narrative-text">{game.morningText}</p><button className="primary-button" type="button" onClick={onContinue}>Начать день</button>
 </section></main>;
}
