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
        <p className="eyebrow">Интерактивная история о выборе и взрослении</p>
        <h1 id="game-title"><span className="title-main">{contentMeta.ui.gameTitle}:</span><span className="title-accent">Становление</span></h1>
        <p className="tagline">{contentMeta.ui.tagline}</p>
        <p className="start-note">Большой заказ, ученик и люди рядом. Мир не спрашивает, кто ты — он запоминает, как ты поступаешь.</p>

        <div className="start-illustration">
          <img
            src="/art/start-pottery-workshop.webp"
            alt="Гончарная мастерская в закатном свете: керамика на столе и горящая печь"
            width={960}
            height={720}
            decoding="async"
          />
        </div>

        <fieldset className="goal-options"><legend>С чего начинается путь</legend>{content.episode.goals.map(g=><label key={g.id}><input type="radio" name="goal" checked={goal===g.id} onChange={()=>setGoal(g.id)}/>{g.label}</label>)}</fieldset>
        <button className="primary-button" type="button" onClick={()=>onStart(goal)}>
          {contentMeta.ui.start}
        </button>
      </section>
    </main>
  );
}
