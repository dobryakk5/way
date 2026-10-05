import { content } from '../../content';
import { useMemo, useState } from 'react';
import type { Choice, GameState } from '../../engine/types';
import type { DrawResult } from '../../engine/draw';
import { ResourceStrip } from '../components/ResourceStrip';
import { GameCard } from '../components/GameCard';

interface GameScreenProps {
  game: GameState;
  draw: DrawResult | undefined;
  onChoose: (cardId: string, choiceId: string) => void;
}

export function GameScreen({ game, draw, onChoose }: GameScreenProps) {
  const [previewChoice, setPreviewChoice] = useState<Choice | undefined>(undefined);


  const progressLabel = useMemo(() => `До ночи: ${4-game.slot} событий`, [game.slot]);

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
          <span>Глава {game.chapter} · {content.episode.chapters.find(ch=>ch.id===game.chapter)?.title}</span>
          <span>День {game.day}</span>
          <span>{progressLabel}</span>
        </div>

        <GameCard
          key={`${game.day}:${game.slot}:${draw.card.id}`}
          draw={draw}
          onPreviewChoice={setPreviewChoice}
          onChoose={(choiceId) => onChoose(draw.card.id, choiceId)}
        />

        <p className="swipe-hint">{draw.choices.length === 2 ? 'Потяни карточку или выбери кнопкой · ← → на клавиатуре' : `Выбери вариант · клавиши 1–${draw.choices.length}`}</p>
      </div>
    </main>
  );
}
