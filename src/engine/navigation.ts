import { exposeOpportunity } from './opportunities';
import { recordDiagnosticMotive, skipDiagnosticMotive } from './heroDevelopmentProfile';
import { routeAt } from './schedule';
import type { GameContent, GameState, LifeFacet } from './types';
export function enterSlot(state: GameState, content: GameContent): GameState {
  const next = { ...state, phase: 'slot' as const };
  delete next.current;
  if (state.slot === 0 && content.episode.goalReviewDays.includes(state.day) && !state.goalHistory.some(g => g.day === state.day))
    return { ...next, phase: 'goal' };
  if ((state.day === 1 && state.slot === 1 && state.intentionHistory.length === 0) ||
      (state.day === 6 && state.slot === 0 && !state.intentionHistory.some(i => i.day === 6)))
    return { ...next, phase: 'intention', resumePhase: 'slot' };
  if (routeAt(state, content) && !state.activeRoute) return { ...next, phase: 'route' };
  return next;
}
export function chooseIntention(state: GameState, content: GameContent, facet: LifeFacet): GameState {
  if (state.phase !== 'intention' || !content.episode.intentionOptions.some(o => o.facet === facet)) return state;
  const next = { ...state, declaredIntention: facet, intentionHistory: [...state.intentionHistory, { day: state.day, facet }], phase: 'slot' as const };
  delete next.resumePhase;
  return enterSlot(next, content);
}
export function chooseRoute(state: GameState, content: GameContent, optionId: string): GameState {
  if (state.phase !== 'route') return state;
  const route = routeAt(state, content);
  const option = route?.options.find(o => o.id === optionId);
  if (!option) throw new Error('Unknown route option');
  const next = exposeOpportunity(state, content, 'route');
  return { ...next, phase: 'slot', activeRoute: { day: state.day, slot: state.slot, optionId, facets: [...option.facets] },
    routeHistory: [...state.routeHistory, { day: state.day, slot: state.slot, optionId }] };
}

/** Shared by an ordinary choice and by the end of a motive question: the slot moves on exactly once. */
export function advanceAfterResolvedChoice(state: GameState, content: GameContent): GameState {
  const next = { ...state };
  delete next.current; delete next.activeRoute;
  if (state.slot === content.episode.slotsPerDay - 1) return { ...next, phase: 'evening' };
  return enterSlot({ ...next, slot: state.slot + 1 }, content);
}
function finishMotive(state: GameState, content: GameContent): GameState {
  const next = { ...state }; delete next.pendingMotive;
  return advanceAfterResolvedChoice(next, content);
}
export function answerMotive(state: GameState, content: GameContent, optionId: string): GameState {
  const pending = state.pendingMotive;
  if (state.phase !== 'motive' || !pending) return state;
  if (!pending.options.some(o => o.id === optionId)) throw new Error('Motive option was not offered');
  return finishMotive(recordDiagnosticMotive(state, content, pending.caseId, pending.promptId, optionId), content);
}
export function skipMotive(state: GameState, content: GameContent): GameState {
  const pending = state.pendingMotive;
  if (state.phase !== 'motive' || !pending) return state;
  return finishMotive(skipDiagnosticMotive(state, content, pending.caseId), content);
}
