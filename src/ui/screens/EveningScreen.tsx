import { m } from 'framer-motion';
import { content } from '../../content';
import { eveningText } from '../../engine/day';
import type { GameState } from '../../engine/types';
import { journalChanges, journeyChanges } from '../dayChanges';
import { NightRecap } from './NightRecap';

export type EveningLink = 'journal' | 'journey';

/**
 * The evening is read, not timed: the next day starts only when the player presses the button.
 * It says how the day ended; what changed in the records and on the path is one link away, shown only when something did.
 */
export function EveningScreen({ game, onContinue, onOpen, blocked }: { game: GameState; onContinue: () => void; onOpen: (to: EveningLink) => void; blocked: boolean }) {
  const night = game.nights.find(n => n.day === game.day);
  const lastDay = game.day >= content.episode.days;
  const links = ([['journal', 'Записи', journalChanges(game, night)], ['journey', 'Мой путь', journeyChanges(game)]] as const).filter(([, , items]) => items.length > 0);

  return <main className="screen narrative-screen evening-screen"><m.section className="narrative-card evening-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <p className="eyebrow">Вечер · День {game.day}</p>
    <div className="evening-ornament" aria-hidden="true"><i /></div>
    <h2 className="evening-title">Мастерская затихает</h2>
    {night ? <NightRecap game={game} night={night} details={false} /> : <div className="evening-summary"><p>{eveningText(game, content)}</p></div>}
    {links.length > 0 && <nav className="evening-links" aria-label="Подробнее о дне">
      {links.map(([to, title, items]) => <button key={to} type="button" className="evening-link" onClick={() => onOpen(to)}>
        <span className="evening-link-title">{title} <span aria-hidden="true">→</span></span>
        <span className="evening-link-items">{items.join(' · ')}</span>
      </button>)}
    </nav>}
    <div className="transition-actions">
      <button type="button" className="primary-button evening-next" disabled={blocked} onClick={onContinue}>{lastDay ? 'Эпилог' : `Перейти к дню ${game.day + 1}`} <span aria-hidden="true">→</span></button>
    </div>
    <p className="transition-status" role="status">{blocked ? 'Сохраняем день…' : 'Когда будешь готов — дальше'}</p>
  </m.section></main>;
}
