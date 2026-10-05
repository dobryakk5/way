import { useState } from 'react';
import { content } from '../../content';
import type { GoalId } from '../../engine/types';
import { contentMeta } from '../../content';

interface StartScreenProps {
  onStart: (goal: GoalId) => void;
}

export function StartScreen({ onStart }: StartScreenProps) {
  const [goal,setGoal]=useState<GoalId>('order');
  return (
    <main className="screen start-screen">
      <section className="start-card" aria-labelledby="game-title">
        <p className="eyebrow">Нарративная карточная игра</p>
        <h1 id="game-title">{contentMeta.ui.gameTitle}</h1>
        <p className="tagline">{contentMeta.ui.tagline}</p>
        <p className="start-note">Большой заказ, ученик и люди рядом. Первые 30 дней: ярмарка, её последствия и новое дело.</p>
        <fieldset className="goal-options"><legend>Цель героя</legend>{content.episode.goals.map(g=><label key={g.id}><input type="radio" name="goal" checked={goal===g.id} onChange={()=>setGoal(g.id)}/>{g.label}</label>)}</fieldset>
        <button className="primary-button" type="button" onClick={()=>onStart(goal)}>
          {contentMeta.ui.start}
        </button>

      </section>
    </main>
  );
}
