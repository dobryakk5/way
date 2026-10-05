import type { GameState } from '../../engine/types';
export function DiceScreen({game,onRoll,onOpen,saving}:{game:GameState;onRoll:()=>void;onOpen:()=>void;saving:boolean}) {
 const dice=game.diceHistory.at(-1)!;
 return <main className="screen"><section className="narrative-card">
  <p className="eyebrow">День {game.day} · До ночи: {4-game.slot} событий</p><h2>Свободная встреча</h2>
  <p>Шесть возможных встреч уже определены. Кубик выберет одну; решение останется за героем.</p>
  <div className="die" aria-label={dice.face?`Выпало ${dice.face}`:'Кубик готов'}>{dice.face ?? '⚄'}</div>
  {dice.face?<><p>Выпало {dice.face}. Эта встреча уже закреплена за броском.</p><button className="primary-button" disabled={saving} onClick={onOpen}>Открыть встречу</button></>:<button className="primary-button" disabled={saving} onClick={onRoll}>Бросить кубик</button>}
 </section></main>;
}
