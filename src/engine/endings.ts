import { evaluateCondition } from './conditions';
import { intentionPortrait } from './facets';
import type { GameContent, GameState } from './types';
export function pickEnding(state: GameState, content: GameContent) {
  for (const key of content.episode.finalFacts) {
    if (!content.factsSchema[key]?.finalValues?.includes(state.facts[key]!)) throw new Error(`Unresolved final fact: ${key}`);
  }
  const matches = content.endings.filter(e => evaluateCondition(e.requires, state, content));
  if (matches.length !== 1) throw new Error('Ending conditions must cover the outcome exactly once');
  return matches[0]!;
}
export function fairOutcome(state: GameState, content: GameContent): string {
  return content.portraitFragments.filter(f => ['order', 'alexey', 'market'].includes(f.group) && evaluateCondition(f.requires, state, content)).map(f => f.text).join(' ');
}
export function portrait(state: GameState, content: GameContent): string {
  const ending = pickEnding(state, content);
  const fragments = content.portraitFragments.filter(f => evaluateCondition(f.requires, state, content));
  const main = fragments.filter(f => ['order', 'alexey', 'market'].includes(f.group));
  const detail = fragments.filter(f => f.group === 'relationship' || f.group === 'shadow').slice(0, 1);
  const crisis = state.pendingCrises.length ? ' После ярмарки ему ещё предстоит восстановить силы и разобраться с накопившимися заботами.' : '';
  return [ending.text, ...main.map(f => f.text), ...detail.map(f => f.text), intentionPortrait(state, content)].filter(Boolean).join(' ') + crisis;
}
