import { RESOURCE_ORDER } from './constants';
import type { Card, GameContent, GameState, Resource } from './types';

function isAtCrisisEdge(state: GameState, card: Card): boolean {
  if (!card.crisis) return false;
  return state.resources[card.crisis.resource] === card.crisis.edge;
}

function orderedCrisisCards(content: GameContent): Card[] {
  return [...content.cards]
    .filter((card) => card.type === 'crisis' && card.crisis)
    .sort((left, right) => {
      const leftResource = left.crisis?.resource ?? 'wealth';
      const rightResource = right.crisis?.resource ?? 'wealth';
      const resourceDifference =
        RESOURCE_ORDER.indexOf(leftResource) - RESOURCE_ORDER.indexOf(rightResource);
      if (resourceDifference !== 0) return resourceDifference;

      const leftEdge = left.crisis?.edge ?? 0;
      const rightEdge = right.crisis?.edge ?? 0;
      return leftEdge - rightEdge;
    });
}

export function reconcileCrisisQueue(
  state: GameState,
  content: GameContent
): GameState {
  const byId = new Map(content.cards.map((card) => [card.id, card]));
  const pendingCrises = [...new Set(state.pendingCrises)].filter((id) => {
    const card = byId.get(id);
    return Boolean(card?.type === 'crisis' && isAtCrisisEdge(state, card));
  });

  for (const crisis of orderedCrisisCards(content)) {
    if (isAtCrisisEdge(state, crisis) && !pendingCrises.includes(crisis.id)) {
      pendingCrises.push(crisis.id);
    }
  }

  return { ...state, pendingCrises };
}

export function resolveCrisisCard(
  state: GameState,
  crisisCard: Card
): GameState {
  if (!crisisCard.crisis) return state;

  const { resource, edge } = crisisCard.crisis;
  const resources = { ...state.resources };
  const current = resources[resource];
  resources[resource] = edge === 100 ? Math.min(current, 60) : Math.max(current, 40);

  return {
    ...state,
    resources,
    pendingCrises: [...new Set(state.pendingCrises)].filter((id) => id !== crisisCard.id)
  };
}

export function findCrisisCard(
  content: GameContent,
  resource: Resource,
  edge: 0 | 100
): Card | undefined {
  return content.cards.find(
    (card) =>
      card.type === 'crisis' &&
      card.crisis?.resource === resource &&
      card.crisis.edge === edge
  );
}
