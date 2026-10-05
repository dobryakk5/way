import { evaluateCondition } from './conditions';
import type { GameContent, GameState } from './types';
export function openOpportunities(state: GameState, content: GameContent): GameState {
  const opportunityState = { ...state.opportunityState };
  for (const o of content.episode.opportunities) {
    if (!opportunityState[o.id] && state.day <= o.throughDay && evaluateCondition(o.opensWhen, state, content)) opportunityState[o.id] = 'open';
  }
  return { ...state, opportunityState };
}
export function exposeOpportunity(state: GameState, content: GameContent, via: 'route' | 'card', cardId?: string): GameState {
  const next = openOpportunities(state, content);
  const opportunityExposure = { ...next.opportunityExposure };
  for (const o of content.episode.opportunities) {
    const exposed = via === 'route' ? o.offeredAt.day === state.day && o.offeredAt.slot === state.slot : o.cardIds.includes(cardId ?? '');
    if (exposed && next.opportunityState[o.id] === 'open' && state.day <= o.throughDay) opportunityExposure[o.id] = { day: state.day, via };
  }
  return { ...next, opportunityExposure };
}
export function resolveTakenOpportunities(state: GameState, content: GameContent): GameState {
  const opportunityState = { ...state.opportunityState };
  for (const o of content.episode.opportunities) {
    if (state.facts[o.resolvedFact] !== o.takenValue) continue;
    if (opportunityState[o.id] === 'taken') continue;
    if (opportunityState[o.id] !== 'open' || !state.opportunityExposure[o.id] || state.day > o.throughDay)
      throw new Error(`Opportunity taken outside its exposed window: ${o.id}`);
    opportunityState[o.id] = 'taken';
  }
  return { ...state, opportunityState };
}
export function expireOpportunities(state: GameState, content: GameContent): GameState {
  const next = { ...state, facts: { ...state.facts }, opportunityState: { ...state.opportunityState }, observations: [...state.observations] };
  for (const o of content.episode.opportunities) {
    if (next.opportunityState[o.id] !== 'open' || state.day < o.throughDay || !state.opportunityExposure[o.id]) continue;
    next.opportunityState[o.id] = 'expired'; next.facts[o.resolvedFact] = o.expiredValue;
    next.observations.push({ day: state.day, slot: state.slot, kind: 'opportunity', id: o.id });
  }
  return next;
}
