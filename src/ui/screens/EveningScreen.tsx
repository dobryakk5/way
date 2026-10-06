import { useState } from 'react';
import { m } from 'framer-motion';
import { content } from '../../content';
import { eveningText } from '../../engine/day';
import type { GameState } from '../../engine/types';
import { useAutoAdvance, usePageVisible } from '../useAutoAdvance';

export function EveningScreen({ game, onContinue, blocked }: { game: GameState; onContinue: () => void; blocked: boolean }) {
  const [paused, setPaused] = useState(false);
  const visible = usePageVisible();
  const night = game.nights.find(n => n.day === game.day);
  const summary = night?.primary || eveningText(game, content);
  const duration = Math.min(6500, Math.max(2800, summary.split(/\s+/).length * 180));
  const running = !paused && !blocked && visible;
  const lastDay = game.day >= content.episode.days;
  useAutoAdvance(running, duration, onContinue);

  return <main className="screen narrative-screen evening-screen"><m.section className="narrative-card evening-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <p className="eyebrow">Вечер · День {game.day}</p>
    <div className="evening-ornament" aria-hidden="true"><i /></div>
    <h2 className="evening-title">Мастерская затихает</h2>
    <div className="evening-summary"><p>{summary}</p></div>
    <p className="transition-note">Итоги останутся в дневнике.</p>
    <div className="day-transition-progress" aria-hidden="true">{running && <span style={{ animationDuration: `${duration}ms` }} />}</div>
    <div className="transition-actions">
      <button type="button" className="text-button" onClick={() => setPaused(!paused)}>{paused ? 'Продолжить автоматически' : 'Задержаться'}</button>
      <button type="button" className="text-button transition-next" disabled={blocked} onClick={onContinue}>{lastDay ? 'Эпилог' : `День ${game.day + 1}`} <span aria-hidden="true">→</span></button>
    </div>
    <p className="transition-status" role="status">{blocked ? 'Сохраняем день…' : paused ? 'Можно остаться здесь сколько хочется' : lastDay ? 'История подходит к завершению…' : 'Утро наступит само…'}</p>
  </m.section></main>;
}
