import { evaluateCondition } from './conditions';
import type { Card, Choice, GameContent, GameState } from './types';
export function allChoices(card: Card): Choice[] {
  return [...card.choices, ...(card.choiceVariants ?? []).flatMap(v => v.choices)];
}
export function resolveChoices(state: GameState, card: Card, content: GameContent): Choice[] {
  return card.choiceVariants?.find(v => evaluateCondition(v.when, state, content))?.choices ?? card.choices;
}
export function choiceById(card: Card, id: string): Choice | undefined {
  return allChoices(card).find(c => c.id === id);
}
