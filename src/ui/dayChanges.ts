import { content } from '../content';
import { ACTION_LOGICS, developmentScale } from '../engine';
import type { ActionLogic, GameState } from '../engine/types';
import { LEVEL_LABEL } from './screens/DaySummaryView';

/**
 * What tonight added to the two utility screens, in a few words each. The evening shows the conclusion of the day;
 * these lines only say where the details went. An empty list means the screen did not change today.
 */
type Night = GameState['nights'][number];
const stageName = (id: ActionLogic) => content.development.stages.find(s => s.id === id)?.name ?? id;
const LAST = ACTION_LOGICS.length - 1;
const GOAL_VERB = { select: 'выбрана', clarify: 'уточнена', change: 'изменена' } as const;
const KIND_NAME = { insight: 'Озарение', wisdom: 'Новая запись', reflection: 'Рефлексия' } as const;

export function journalChanges(game: GameState, night: Night | undefined): string[] {
  const out: string[] = [];
  const s = night?.summary;
  if (s?.worldChanges.length) out.push(`Что изменилось: ${s.worldChanges.length}`);
  if (s?.unfinished.length) out.push(`Осталось открытым: ${s.unfinished.length}`);
  for (const kind of ['insight', 'wisdom', 'reflection'] as const)
    if (game.journal.some(j => j.day === game.day && j.kind === kind)) out.push(KIND_NAME[kind]);
  return out;
}

export function journeyChanges(game: GameState): string[] {
  const out: string[] = [];
  const p = game.heroDevelopmentProfile;
  const today = p.eveningSnapshots.find(s => s.day === game.day);
  const previous = p.eveningSnapshots.find(s => s.day === game.day - 1);
  if (today) {
    if (today.status !== (previous?.status ?? 'insufficient')) out.push(LEVEL_LABEL[today.status]);
    if (today.status === 'stable' && today.observedPrimary && today.observedPrimary !== previous?.observedPrimary) out.push(`Центр героя: ${stageName(today.observedPrimary)}`);
    else if (today.status !== 'stable' && today.candidatePrimary && today.candidatePrimary !== previous?.candidatePrimary) out.push(`Наметился способ: ${stageName(today.candidatePrimary)}`);
  }
  const dev = game.development;
  const promotion = dev.transitions.find(t => t.day === game.day && t.reason !== 'initial-reconciliation');
  if (promotion) out.push(`Закрепился новый способ: ${stageName(promotion.to)}`);
  else if (today && dev.developmentCurrent && today.developmentCurrent !== dev.developmentCurrent) out.push(`Освоенный способ: ${stageName(dev.developmentCurrent)}`);
  if (dev.evidence.some(e => e.day === game.day)) out.push('Новая сцена развития');
  const scale = developmentScale(game, content);
  if (scale && scale.previousPosition === undefined) out.push('Появилась шкала решений');
  else if (scale?.previousPosition !== undefined) {
    // The same threshold the journey scale uses for "almost did not move".
    const shift = (scale.position - scale.previousPosition) * LAST;
    if (Math.abs(shift) >= 0.15) out.push(`Шкала сдвинулась ${shift > 0 ? 'вправо' : 'влево'}`);
  }
  const goal = [...game.goalHistory].reverse().find(g => g.day === game.day);
  if (goal && goal.action !== 'keep') out.push(`Цель ${GOAL_VERB[goal.action]}: ${goal.wording}`);
  return out;
}
