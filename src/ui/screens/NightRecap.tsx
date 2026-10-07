import { content } from '../../content';
import { evaluateCondition } from '../../engine/conditions';
import { INSIGHT_NOTE } from '../../engine/day';
import type { GameState, PortraitFragment } from '../../engine/types';
import { DaySummaryView } from './DaySummaryView';

type Night = GameState['nights'][number];
export interface NightPart { label?: string; text: string }

const FAIR_LABEL: Partial<Record<PortraitFragment['group'], string>> = { order: 'Заказ', alexey: 'Алексей', market: 'Рынок' };

/**
 * The stored evening text is one string glued from several sources (the fair outcome by group, a promotion, the insight note).
 * Presentation splits it back along those seams; whatever it cannot attribute stays one plain part.
 */
export function nightParts(game: GameState, night: Night): NightPart[] {
  let rest = night.primary;
  const parts: NightPart[] = [];
  const milestone = Object.values(game.milestones).find(m => m.day === night.day && m.text && rest.startsWith(m.text));
  if (milestone) {
    const scope = { ...game, facts: milestone.facts };
    const fragments = content.portraitFragments.filter(f => FAIR_LABEL[f.group] && evaluateCondition(f.requires, scope, content));
    if (fragments.map(f => f.text).join(' ') === milestone.text) {
      parts.push(...fragments.map(f => ({ label: FAIR_LABEL[f.group]!, text: f.text })));
      rest = rest.slice(milestone.text.length);
    }
  }
  // The day summary shows the promotion under its reflection; saying it twice in one evening is noise.
  const promotion = night.summary?.reflection.transition?.text;
  if (promotion) rest = rest.replace(promotion, '');
  const insight = rest.includes(INSIGHT_NOTE);
  rest = rest.replace(INSIGHT_NOTE, '').replace(/\s+/g, ' ').trim();
  if (rest) parts.push({ text: rest });
  if (insight) parts.push({ label: 'Озарение', text: INSIGHT_NOTE });
  return parts;
}

/** `details: false` keeps only how the day ended; the evening links to the rest instead of repeating it. */
export function NightRecap({ game, night, details = true }: { game: GameState; night: Night; details?: boolean }) {
  const parts = nightParts(game, night);
  return <div className="night-recap">
    {parts.length > 0 && <section className="night-recap-main">
      <h3 className="day-summary-title">Чем закончился день</h3>
      {parts.length === 1 && !parts[0]!.label
        ? <p className="night-recap-lead">{parts[0]!.text}</p>
        : <ul className="night-recap-list">{parts.map((part, i) => <li key={i}>
            {part.label && <span className="night-recap-label">{part.label}</span>}
            <p>{part.text}</p>
          </li>)}</ul>}
    </section>}
    {details && night.summary && <DaySummaryView summary={night.summary} />}
    {night.note && <section className="day-summary-block night-recap-question">
      <h3 className="day-summary-title">Вопрос на завтра</h3>
      <p>{night.note}</p>
    </section>}
  </div>;
}
