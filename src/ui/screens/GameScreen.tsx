import { content } from '../../content';
import { useState } from 'react';
import { m } from 'framer-motion';
import type { Choice, GameState } from '../../engine/types';
import type { DrawResult } from '../../engine/draw';
import { ResourceStrip } from '../components/ResourceStrip';
import { GameCard } from '../components/GameCard';
import { Die } from '../components/Die';

interface GameScreenProps {
  game: GameState;
  draw: DrawResult | undefined;
  onChoose: (cardId: string, choiceId: string) => void;
  busy?: boolean;
}

export function GameScreen({ game, draw, onChoose, busy = false }: GameScreenProps) {
  const [previewChoice, setPreviewChoice] = useState<Choice | undefined>(undefined);


  const total = content.episode.slotsPerDay;
  const dice = game.diceHistory.find(d => d.day === game.day && d.slot === game.slot && d.cardId === draw?.card.id);
  const chapter = content.episode.chapters.find(ch => ch.id === game.chapter);

  if (!draw) {
    return (
      <main className="screen game-screen">
        <p className="loading-copy">Ситуация недоступна. Вернитесь к началу пробного пути.</p>
      </main>
    );
  }

  return (
    <main className="game-screen">
      <div className="game-shell">
        <ResourceStrip game={game} previewChoice={previewChoice} />

        <div className="game-meta">
          <span>Глава {game.chapter} · {chapter?.title}</span>
          <span>День {game.day}</span>
          <span className="day-progress" aria-label={`Событие ${game.slot + 1} из ${total}`}>
            {Array.from({ length: total }, (_, i) => <i key={i} className={i < game.slot ? 'done' : i === game.slot ? 'current' : ''} aria-hidden="true" />)}
            <span>{game.slot + 1} / {total}</span>
          </span>
        </div>

        {game.slot === 0 && game.morningText && <details className="morning-context" open={game.day === 1}>
          <summary>{game.day === chapter?.from ? `Новая глава · ${chapter.title}` : 'Этим утром'}</summary>
          <p>{game.morningText}</p>
        </details>}
        {dice?.face && <div className="encounter-result"><Die face={dice.face} small /><span>Случайная встреча <span className="encounter-value">· выпало {dice.face}</span></span></div>}

        <m.div className="scene-reveal" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .24 }}>
        <GameCard
          key={`${game.day}:${game.slot}:${draw.card.id}`}
          draw={draw}
          onPreviewChoice={setPreviewChoice}
          onChoose={(choiceId) => onChoose(draw.card.id, choiceId)}
          busy={busy}
        />
        </m.div>

        {game.history.length === 0 && <p className="swipe-hint">{draw.choices.length === 2 ? 'Выбери ответ или смахни карточку' : 'Выбери ответ, чтобы продолжить'}</p>}
      </div>
    </main>
  );
}
