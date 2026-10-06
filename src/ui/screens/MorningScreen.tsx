import { content } from '../../content';
import type { GameState } from '../../engine/types';

const CHAPTER_ART: Record<number, string> = {
  1: 'chapter-1-preparation.webp',
  2: 'chapter-2-to-fair.webp',
  3: 'chapter-3-price-of-result.webp',
  4: 'chapter-4-new-venture.webp'
};

export function MorningScreen({game,onContinue}:{game:GameState;onContinue:()=>void}) {
 const chapter=content.episode.chapters.find(ch=>ch.id===game.chapter);
 const isChapterOpening=Boolean(chapter&&game.day===chapter.from);
 const art=CHAPTER_ART[game.chapter];

 return <main className="screen narrative-screen morning-screen"><section className={`narrative-card ${isChapterOpening?'chapter-opening-card':''}`}>
  {isChapterOpening&&art&&<div className="chapter-opening-art" aria-hidden="true">
   <img src={`${import.meta.env.BASE_URL}art/chapters/${art}`} alt="" />
   <div className="chapter-opening-shade"/>
   <div className="chapter-opening-copy"><span>Глава {game.chapter}</span><strong>{chapter?.title}</strong></div>
  </div>}
  {!isChapterOpening&&<p className="eyebrow">Глава {game.chapter} · {chapter?.title}</p>}
  <h2>День {game.day}</h2>
  <p className="narrative-text">{game.morningText}</p><button className="primary-button" type="button" onClick={onContinue}>{isChapterOpening?'Начать главу':'Начать день'}</button>
 </section></main>;
}
