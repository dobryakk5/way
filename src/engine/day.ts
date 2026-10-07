import { advanceDevelopmentAtEvening } from './development';
import { establishInitialDevelopmentCurrent, expireDiagnosticCases, updateProfileAtEvening } from './heroDevelopmentProfile';
import { evaluateCondition, isConditionImpossible, topQuality } from './conditions';
import { reconcileCrisisQueue } from './crises';
import { applyEffects } from './effects';
import { enterSlot } from './navigation';
import { expireOpportunities } from './opportunities';
import { buildDaySummary } from './daySummary';
import type { GameContent, GameState } from './types';
export function beginSlots(state: GameState, content: GameContent): GameState {
  if (state.phase !== 'morning') return state;
  return enterSlot({ ...state, slot: 0 }, content);
}
export function checkInsight(state: GameState, content: GameContent): string | undefined {
  if (state.observations.some(o => o.kind === 'insight' && o.day === state.day)) return undefined;
  return content.insights.find(i => state.day >= i.window.fromDay && state.day <= i.window.throughDay &&
    !state.appliedInsights.includes(i.id) && evaluateCondition(i.requires, state, content))?.id;
}
export function prepareEvening(state: GameState, content: GameContent): GameState {
  if (state.phase !== 'evening' || state.preparedEveningDay === state.day) return state;
  let next = expireOpportunities(state, content);
  const scheduled = next.scheduled.filter(s => {
    const card = content.cards.find(c => c.id === s.cardId);
    const impossible = !card || (s.day <= state.day && isConditionImpossible(card.requires, state, content));
    if (card?.required && (impossible || (s.latestDay !== undefined && s.latestDay <= state.day)))
      throw new Error(`Missed required chain: ${s.cardId}`);
    if (impossible) next = { ...next, observations: [...next.observations, { day: state.day, slot: state.slot, kind: 'dropped', id: s.cardId, text: 'Requirement cannot be satisfied' }] };
    return !impossible;
  });
  next = expireDiagnosticCases({ ...next, scheduled }, content);
  const insightId = checkInsight(next, content);
  if (insightId) {
    const insight = content.insights.find(i => i.id === insightId)!;
    next = applyEffects(next, insight.effects);
    next = { ...next, appliedInsights: [...next.appliedInsights, insightId], pendingInsight: insightId,
      journal: [...next.journal, { day: state.day, kind: 'insight', id: insightId }],
      observations: [...next.observations, { day: state.day, slot: state.slot, kind: 'insight', id: insightId }] };
  }
  next = reconcileCrisisQueue(next, content);
  // Observation first, then development. A stage that appears tonight cannot also be promoted tonight.
  const hadStage = !!state.development.developmentCurrent;
  next = updateProfileAtEvening(next, content);
  next = hadStage ? advanceDevelopmentAtEvening(next, content) : establishInitialDevelopmentCurrent(next, content);
  const dayText = content.dayTexts.find(t => t.day === state.day && t.part === 'evening');
  const variant = dayText?.textVariants?.find(v => evaluateCondition(v.when, next, content));
  if (variant) next = { ...next, observations: [...next.observations, { day: state.day, slot: state.slot, kind: 'variant', id: variant.id, text: variant.text }] };
  const callback = next.history.find(h => h.day === state.day && content.cards.find(c => c.id === h.cardId)?.type === 'chain');
  const lastTrace = [...next.observations].reverse().find(o => o.day === state.day && o.kind === 'trace');
  const fair = next.observations.find(o => o.day === state.day && o.id === 'fair_result');
  const primary = fair?.id ?? variant?.id ?? (callback ? `${callback.cardId}/${callback.choiceId}` : insightId ?? lastTrace?.id ?? dayText?.id);
  next = { ...next, preparedEveningDay: state.day, ...(primary ? { eveningPrimaryId: primary } : {}) };
  const today = next.history.filter(h => h.day === state.day);
  const note = today.some(h => h.decisionKinds?.includes('experiment'))
    ? 'Сегодня герой попробовал другой способ. Что из этого он захочет сохранить в следующем деле?'
    : today.some(h => h.decisionKinds?.includes('cost'))
      ? 'Герой принял конкретную цену решения. Остаётся ли его цель той же?' : undefined;
  // Projection only: written once, here, and never read back by the engine.
  const summary = buildDaySummary(next, content);
  return { ...next, nights: [...next.nights.filter(n => n.day !== state.day),
    { day: state.day, primary: eveningText(next, content), ...(note ? { note } : {}), resources: { ...next.resources }, summary }] };

}
/** Appended to the evening text when an insight opened on a day whose main text is something else. */
export const INSIGHT_NOTE = 'В привычных разговорах теперь замечаются новые детали; запись осталась в дневнике.';
export function eveningText(state: GameState, content: GameContent): string {
  const id = state.eveningPrimaryId;
  const observed = [...state.observations].reverse().find(o => o.id === id && o.text);
  const insight = content.insights.find(i => i.id === id);
  const base = observed?.text ?? insight?.text ?? content.dayTexts.find(t => t.id === id)?.text ?? '';
  const activated = state.observations.find(o => o.kind === 'insight' && o.day === state.day);
  const transition = state.development.transitions.find(t => t.day === state.day);
  const promotion = transition ? content.development.arcs.find(a => a.id === transition.arcId)?.promotionText : undefined;
  return (promotion ? base + ' ' + promotion : base) + (activated && activated.id !== id ? ' ' + INSIGHT_NOTE : '');
}
export function prepareMorning(state: GameState, content: GameContent): GameState {
  const base = content.dayTexts.find(t => t.part === 'morning' && t.day === state.day);
  const variant = base?.textVariants?.find(v => evaluateCondition(v.when, state, content));
  const quality = topQuality(state, content);
  const last = state.lastMorningVariant;
  const useQuality = state.qualities[quality] >= 3 && (!last || (last.quality !== quality && state.day - last.day >= 3));
  const qText = useQuality ? content.dayTexts.find(t => t.part === 'morning' && t.quality === quality)?.text : undefined;
  return { ...state, morningText: [variant?.text ?? base?.text ?? '', qText].filter(Boolean).join(' '),
    ...(qText ? { lastMorningVariant: { day: state.day, quality } } : {}) };
}
export function leaveEvening(state: GameState, content: GameContent): GameState {
  if (state.phase !== 'evening') return state;
  const next = { ...prepareEvening(state, content), pendingWisdoms: [] };
  delete next.current;
  if (state.day >= content.episode.days) return { ...next, phase: 'boundary' };
  if (content.episode.chapters.some(ch => ch.through === state.day)) return { ...next, phase: 'chapter' };
  return prepareMorning({ ...next, day: state.day + 1, slot: 0, phase: 'morning' }, content);
}
export function nextChapter(state: GameState, content: GameContent): GameState {
  if (state.phase !== 'chapter') return state;
  return prepareMorning({ ...state, chapter: state.chapter + 1, day: state.day + 1, slot: 0, phase: 'morning' }, content);
}
export function openInsight(state: GameState, id: string): GameState {
  if (!state.appliedInsights.includes(id)) return state;
  return { ...state, pendingInsight: id, resumePhase: state.phase, phase: 'insight' };
}
export function resolveInsight(state: GameState, _content: GameContent): GameState {
  if (state.phase !== 'insight') return state;
  const next = { ...state, phase: state.resumePhase ?? 'evening' };
  delete next.pendingInsight; delete next.resumePhase;
  return next;
}
export function queueEndingReflection(state: GameState, content: GameContent): GameState {
  if (state.phase !== 'ending' || !state.summaryCommitted || !content.reflections[0]) return state;
  return { ...state, phase: 'reflection', resumePhase: 'ending', pendingReflection: content.reflections[0].id };
}
export function resolveReflection(state: GameState, _content: GameContent, note?: string): GameState {
  if (state.phase !== 'reflection') return state;
  const next = { ...state, phase: state.resumePhase ?? 'ending' };
  if (note?.trim() && state.pendingReflection) next.journal = [...next.journal, { day: state.day, kind: 'reflection', id: state.pendingReflection, note: note.trim() }];
  delete next.pendingReflection; delete next.resumePhase;
  return next;
}
