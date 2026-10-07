import type { DaySummary, ProfileStatus } from '../../engine/types';

/** Names of the three levels. The UI translates the status; the summary stores no second copy of it. */
export const LEVEL_LABEL: Record<ProfileStatus, string> = {
  insufficient: 'Первые наблюдения',
  provisional: 'Картина складывается',
  stable: 'Есть устойчивая гипотеза'
};

/** Presentation only. Nothing here reads the engine or writes back. */
export function DaySummaryView({ summary }: { summary: DaySummary }) {
  const { worldChanges, unfinished, reflection } = summary;
  const coverage = Math.round(Math.min(1, Math.max(0, reflection.coverage)) * 100);
  return <div className="day-summary">
    {worldChanges.length > 0 && <section className="day-summary-block">
      <h3 className="day-summary-title">Что изменилось</h3>
      <ul>{worldChanges.map((item, i) => <li key={`${item.templateId}:${i}`}>{item.text}</li>)}</ul>
    </section>}
    {unfinished.length > 0 && <section className="day-summary-block">
      <h3 className="day-summary-title">Что осталось открытым</h3>
      <ul>{unfinished.map((item, i) => <li key={`${item.threadId}:${i}`}>{item.text}</li>)}</ul>
    </section>}
    <section className="day-summary-block day-summary-reflection">
      <h3 className="day-summary-title">Что игра уже заметила</h3>
      <p className="day-summary-level">{LEVEL_LABEL[reflection.status]}</p>
      <div className="day-summary-bar" role="img" aria-label={`Наблюдений собрано: ${coverage}%`}><i style={{ width: `${coverage}%` }} /></div>
      <p>{reflection.text}</p>
      {reflection.echo && <p className="day-summary-echo">{reflection.echo.text}</p>}
      {reflection.transition && <p className="day-summary-transition">{reflection.transition.text}</p>}
    </section>
  </div>;
}
