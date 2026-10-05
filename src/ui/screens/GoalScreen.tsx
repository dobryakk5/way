import { useState } from 'react';
import { content } from '../../content';
import type { GameState, GoalId } from '../../engine/types';
export function GoalScreen({game,onChoose}:{game:GameState;onChoose:(id:GoalId,action:'keep'|'clarify'|'change',wording?:string)=>void}) {
 const [clarifying,setClarifying]=useState(false);
 const goal=game.goal ?? content.episode.goals[0]!;
 const clarifications:Record<GoalId,string>={order:'Выполнить обещанный заказ с согласованным сроком и пределом нагрузки',workshop:'Укрепить мастерскую так, чтобы работа не держалась только на мастере',alexey:'Подготовить Алексея к самостоятельной работе с точками общей проверки'};
 return <main className="screen"><section className="narrative-card">
  <p className="eyebrow">День {game.day} · Цель героя</p><h2>Чего он хочет теперь?</h2>
  <p>{game.goal?.wording ?? content.episode.goals[0]!.label}</p><p>После прожитых событий можно сохранить цель, уточнить её условия или выбрать другую. Это не меняет ресурсы.</p>
  <div className="direction-options">
   <button className="choice-button" onClick={()=>onChoose(goal.id,'keep')}>Сохранить цель</button>
   <button className="choice-button" onClick={()=>setClarifying(!clarifying)}>Уточнить цель</button>
   {clarifying&&<button className="choice-button" onClick={()=>onChoose(goal.id,'clarify',clarifications[goal.id])}>{clarifications[goal.id]}</button>}
   {content.episode.goals.filter(g=>g.id!==goal.id).map(g=><button className="choice-button" key={g.id} onClick={()=>onChoose(g.id,'change')}>{g.label}</button>)}
  </div>
 </section></main>;
}
