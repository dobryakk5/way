import type { GameState } from '../../engine/types';
// A quiet pause, not a test: no logic names, no scores. The world has already moved; this only adds the hero's own reason.
export function MotiveScreen({game,onAnswer,onSkip,saving}:{game:GameState;onAnswer:(optionId:string)=>void;onSkip:()=>void;saving:boolean}) {
 const pending=game.pendingMotive;
 if(!pending)return null;
 return <main className="screen narrative-screen motive-screen"><section className="narrative-card" aria-labelledby="motive-title">
  <p className="eyebrow">День {game.day} · Одно уточнение</p>
  <h2 id="motive-title">{pending.text}</h2>
  <p className="motive-note">Решение уже принято, мир на него ответил. Это только запись о том, что было для героя главным.</p>
  <div className="direction-options">{pending.options.map(o=><button type="button" className="choice-button" key={o.id} disabled={saving} onClick={()=>onAnswer(o.id)}>{o.label}</button>)}</div>
  <button type="button" className="choice-button motive-skip" disabled={saving} onClick={onSkip}>Не выбирать объяснение</button>
 </section></main>;
}
