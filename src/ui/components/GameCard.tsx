import { m, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Choice } from '../../engine/types';
import type { DrawResult } from '../../engine/draw';
import { characterName } from '../gameUi';

interface GameCardProps {
  draw: DrawResult;
  onChoose: (choiceId: string) => void;
  onPreviewChoice: (choice?: Choice) => void;
}

type Side = 'left' | 'right';

const KEY_CARD_ART: Record<string, string> = {
  c1_alexey_broken_jug: 'key-art-c0-r0',
  c1_wounded_road: 'key-art-c1-r0',
  c1_extra_change: 'key-art-c2-r0',
  c2_stones_bag: 'key-art-c0-r1',
  c2_liya_arrives: 'key-art-c1-r1',
  c2_timon_order_result: 'key-art-c2-r1'
};

function CardArt({ draw }: { draw: DrawResult }) {
  const keyArtClass = KEY_CARD_ART[draw.card.id];

  if (keyArtClass) {
    return <div
      className={`card-art card-art-key ${keyArtClass}`}
      data-character={draw.card.character ?? 'city'}
      aria-hidden="true"
    />;
  }

  return <div className="card-art" data-character={draw.card.character ?? 'city'} aria-hidden="true">
    <span className="art-halo" />
    <span className="art-window" />
    <span className="art-thread" />
    <span className="art-table" />
    <span className="art-vessel" />
    <span className="character-monogram">{characterName(draw.card.character).slice(0, 1)}</span>
  </div>;
}

/** Two choices keep the swipe pair; three or four are listed in their authored order (the order carries no meaning). */
export function GameCard(props: GameCardProps) {
  return props.draw.choices.length === 2 ? <SwipeCard {...props} /> : <ListCard {...props} />;
}

function ListCard({ draw, onChoose, onPreviewChoice }: GameCardProps) {
  const [locked, setLocked] = useState(false);
  const committed = useRef(false);
  const commit = (choiceId: string) => {
    if (committed.current) return;
    committed.current = true; setLocked(true); onPreviewChoice(undefined); onChoose(choiceId);
  };
  function handleKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const index = Number(event.key) - 1;
    const choice = Number.isInteger(index) ? draw.choices[index] : undefined;
    if (choice) { event.preventDefault(); commit(choice.id); }
  }
  return (
    <div className="card-stage card-stage-list" onKeyDown={handleKeyboard}>
      <div className="game-card game-card-list" tabIndex={0} role="group" aria-label={`Ситуация. ${draw.text}`}>
        <CardArt draw={draw} />
        <div className="card-copy">
          <p className="card-character">{characterName(draw.card.character)}</p>
          <p className="card-text">{draw.text}</p>
        </div>
      </div>
      <ol className="choice-list" aria-label="Варианты выбора">
        {draw.choices.map((choice, index) => (
          <li key={choice.id}>
            <button type="button" className="choice-button choice-button-list" disabled={locked}
              onPointerEnter={() => onPreviewChoice(choice)} onPointerLeave={() => onPreviewChoice(undefined)}
              onFocus={() => onPreviewChoice(choice)} onBlur={() => onPreviewChoice(undefined)} onClick={() => commit(choice.id)}>
              <span className="choice-number" aria-hidden="true">{index + 1}</span>
              <span className="choice-text">{choice.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SwipeCard({ draw, onChoose, onPreviewChoice }: GameCardProps) {
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const committed = useRef(false);
  const rotate = useTransform(x, [-220, 0, 220], [-9, 0, 9]);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [previewSide, setPreviewSide] = useState<Side | null>(null);
  const [locked, setLocked] = useState(false);

  const leftChoice = useMemo(
    () => draw.choices.find((choice) => choice.id === draw.leftChoiceId)!,
    [draw]
  );
  const rightChoice = useMemo(
    () => draw.choices.find((choice) => choice.id === draw.rightChoiceId)!,
    [draw]
  );

  function preview(side: Side | null) {
    setPreviewSide(side);
    onPreviewChoice(side === 'left' ? leftChoice : side === 'right' ? rightChoice : undefined);
  }

  function commit(side: Side) {
    if (committed.current) return;
    committed.current = true;
    setLocked(true);
    const choice = side === 'left' ? leftChoice : rightChoice;
    onPreviewChoice(undefined);
    onChoose(choice.id);
  }

  function handleKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      commit('left');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      commit('right');
    }
  }

  return (
    <div className="card-stage">
      <div className={`choice-label choice-label-left ${previewSide === 'left' ? 'visible' : ''}`}>
        {leftChoice.label}
      </div>
      <div className={`choice-label choice-label-right ${previewSide === 'right' ? 'visible' : ''}`}>
        {rightChoice.label}
      </div>

      <m.div
        ref={cardRef}
        className="game-card"
        style={{ x, rotate: reducedMotion ? 0 : rotate }}
        drag={locked ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.82}
        whileDrag={{ scale: reducedMotion ? 1 : 1.015 }}
        onDrag={(_event: unknown, info: { offset: { x: number } }) => {
          if (info.offset.x < -24) preview('left');
          else if (info.offset.x > 24) preview('right');
          else preview(null);
        }}
        onDragEnd={(_event: unknown, info: { offset: { x: number } }) => {
          const width = cardRef.current?.getBoundingClientRect().width ?? 320;
          const threshold = width * 0.35;
          if (info.offset.x <= -threshold) commit('left');
          else if (info.offset.x >= threshold) commit('right');
          else preview(null);
        }}
        onKeyDown={handleKeyboard}
        tabIndex={0}
        role="group"
        aria-label={`Ситуация. ${draw.text}`}
      >
        <CardArt draw={draw} />
        <div className="card-copy">
          <p className="card-character">{characterName(draw.card.character)}</p>
          <p className="card-text">{draw.text}</p>
        </div>
      </m.div>

      <div className="choice-buttons" aria-label="Варианты выбора">
        <button
          type="button"
          className="choice-button"
          disabled={locked}
          onPointerEnter={() => preview('left')}
          onPointerLeave={() => preview(null)}
          onFocus={() => preview('left')}
          onBlur={() => preview(null)}
          onClick={() => commit('left')}
        >
          <span aria-hidden="true">←</span> {leftChoice.label}
        </button>
        <button
          type="button"
          className="choice-button"
          disabled={locked}
          onPointerEnter={() => preview('right')}
          onPointerLeave={() => preview(null)}
          onFocus={() => preview('right')}
          onBlur={() => preview(null)}
          onClick={() => commit('right')}
        >
          {rightChoice.label} <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
