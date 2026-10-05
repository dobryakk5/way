import { deriveBeatState, enoughTimeSince, lastArcDecision } from './beats';
import { QUALITY_ORDER } from './constants';
import type { Condition, GameContent, GameState, Quality } from './types';

function findChoiceQualityDelta(
  content: GameContent,
  cardId: string,
  choiceId: string,
  quality: Quality
): number {
  const card = content.cards.find((candidate) => candidate.id === cardId);
  const choice = card && [...card.choices, ...(card.choiceVariants ?? []).flatMap(v => v.choices)].find(candidate => candidate.id === choiceId);
  return choice?.effects.qualities?.[quality] ?? 0;
}

function lastPositiveGrowthIndex(
  state: GameState,
  content: GameContent,
  quality: Quality
): number {
  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const item = state.history[index];
    if (!item) continue;

    if (findChoiceQualityDelta(content, item.cardId, item.choiceId, quality) > 0) {
      return index;
    }
  }

  return -1;
}

export function rankQualities(state: GameState, content: GameContent): Quality[] {
  return [...QUALITY_ORDER].sort((left, right) => {
    const valueDifference = state.qualities[right] - state.qualities[left];
    if (valueDifference !== 0) return valueDifference;

    const historyDifference =
      lastPositiveGrowthIndex(state, content, right) -
      lastPositiveGrowthIndex(state, content, left);
    if (historyDifference !== 0) return historyDifference;

    return QUALITY_ORDER.indexOf(left) - QUALITY_ORDER.indexOf(right);
  });
}

export function topQuality(state: GameState, content: GameContent): Quality {
  return rankQualities(state, content)[0] ?? 'attention';
}

function inRange(value: number, gte?: number, lte?: number): boolean {
  if (gte !== undefined && value < gte) return false;
  if (lte !== undefined && value > lte) return false;
  return true;
}

export function evaluateCondition(
  condition: Condition | undefined,
  state: GameState,
  content: GameContent
): boolean {
  if (!condition) return true;

  if ('all' in condition) {
    return condition.all.every((item) => evaluateCondition(item, state, content));
  }

  if ('any' in condition) {
    return condition.any.some((item) => evaluateCondition(item, state, content));
  }

  if ('not' in condition) {
    return !evaluateCondition(condition.not, state, content);
  }

  if ('quality' in condition) {
    return inRange(
      state.qualities[condition.quality],
      condition.gte,
      condition.lte
    );
  }

  if ('resource' in condition) {
    return inRange(
      state.resources[condition.resource],
      condition.gte,
      condition.lte
    );
  }

  if ('flag' in condition) {
    return state.flags.includes(condition.flag);
  }

  if ('chapter' in condition) {
    return state.chapter === condition.chapter;
  }

  if ('dayGte' in condition || 'dayLte' in condition) {
    return inRange(state.day, condition.dayGte, condition.dayLte);
  }

  if ('shown' in condition) {
    return (state.shown[condition.shown]?.length ?? 0) > 0;
  }

  if ('chose' in condition) {
    return state.history.some(
      (item) =>
        item.cardId === condition.chose.card &&
        item.choiceId === condition.chose.choice
    );
  }

  if ('topQuality' in condition) {
    const top = topQuality(state, content);
    if (top !== condition.topQuality) return false;
    return condition.gte === undefined || state.qualities[top] >= condition.gte;
  }

  if ('heroStage' in condition) return state.development.developmentCurrent === condition.heroStage;
  if ('availableLogic' in condition) return state.development.available.includes(condition.availableLogic);
  if ('developmentEvent' in condition) return state.development.evidence.some(e => e.eventId === condition.developmentEvent);
  if ('developmentBeat' in condition) {
    const b = condition.developmentBeat;
    return deriveBeatState(state.development.evidence, b.arc)[b.beat].status === b.is;
  }
  if ('developmentSince' in condition) {
    const s = condition.developmentSince;
    const info = deriveBeatState(state.development.evidence, s.arc)[s.beat];
    let at: { day: number; slot: number } | undefined = s.of === 'done' ? info.done : info.lastWithdrawal;
    if (s.of === 'withdrawal' && at) { const last = lastArcDecision(state, content, s.arc); if (last && (last.day > at.day || last.day === at.day && last.slot > at.slot)) at = last; }
    return !!at && enoughTimeSince(state, content, s.arc, at, s.decisions, s.evenings);
  }
  if ('fact' in condition) return state.facts[condition.fact] === condition.equals;
  if ('intention' in condition) return state.declaredIntention === condition.intention;

  return false;
}

/**
 * Консервативная проверка: true только когда условие уже точно не сможет
 * стать истинным позже в этом прохождении. Она нужна для безопасной очистки
 * просроченных chain; сомнительные случаи всегда сохраняются.
 */
export function isConditionImpossible(
  condition: Condition | undefined,
  state: GameState,
  content: GameContent
): boolean {
  if (!condition) return false;
  if (evaluateCondition(condition, state, content)) return false;

  if ('all' in condition) {
    return condition.all.some((item) =>
      isConditionImpossible(item, state, content)
    );
  }

  if ('any' in condition) {
    return condition.any.every((item) =>
      isConditionImpossible(item, state, content)
    );
  }

  if ('chapter' in condition) {
    return condition.chapter < state.chapter;
  }

  if ('dayGte' in condition || 'dayLte' in condition) {
    return condition.dayLte !== undefined && state.day > condition.dayLte;
  }

  if ('chose' in condition) {
    const card = content.cards.find(
      (candidate) => candidate.id === condition.chose.card
    );
    const wasShown = (state.shown[condition.chose.card]?.length ?? 0) > 0;
    const once = card?.once ?? !(
      card?.type === 'routine' || card?.type === 'crisis'
    );
    return Boolean(card && once && wasShown);
  }

  // Flags, resources, qualities, shown, topQuality, sums, journal counts and `not` may still change.
  return false;
}
