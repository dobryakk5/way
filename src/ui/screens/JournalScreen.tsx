import { content } from '../../content';
import type { GameState } from '../../engine/types';

function recordText(entry: GameState['journal'][number]) {
  if (entry.kind === 'insight') return content.insights.find(x => x.id === entry.id)?.text;
  if (entry.kind === 'reflection') return content.reflections.find(x => x.id === entry.id)?.text;
  return content.wisdoms.find(x => x.id === entry.id)?.text;
}

const kindLabel = {
  wisdom: 'Запись',
  insight: 'Озарение',
  reflection: 'Рефлексия',
} as const;

export function JournalScreen({ game, onClose }: { game: GameState; onClose: () => void }) {
  const days = [...new Set(game.journal.map(x => x.day))].sort((a, b) => b - a);

  return <main className="screen journal-screen">
    <section className="narrative-card journal-card">
      <div className="subscreen-head">
        <button className="subscreen-back" type="button" onClick={onClose}>← К игре</button>
        <span>Записи пути</span>
      </div>
      <p className="eyebrow">То, что осталось после решений</p>
      <h2>Дневник</h2>
      <p className="screen-lead">Здесь собираются мудрости, озарения и вопросы, которые уже стали частью истории. Они не оценивают выбор — только сохраняют прожитое.</p>

      {days.length === 0
        ? <div className="empty-state"><span className="empty-mark" aria-hidden="true">·</span><h3>Пока тихо</h3><p>Первая запись появится после события, которое оставит заметный след.</p></div>
        : <div className="journal-days">{days.map(day => <section className="journal-day" key={day}>
            <div className="journal-day-head"><span>День {day}</span><i /></div>
            {game.journal.filter(x => x.day === day).map((entry, index) => <article className="journal-entry-card" key={`${entry.kind}:${entry.id}:${index}`}>
              <p className="journal-kind">{kindLabel[entry.kind]}</p>
              <p className="journal-entry-text">{recordText(entry) ?? 'Запись сохранена в истории.'}</p>
              {entry.note && <p className="journal-note">{entry.note}</p>}
            </article>)}
          </section>)}</div>}
    </section>
  </main>;
}
