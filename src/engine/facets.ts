import { choiceById } from './variants';
import type { GameContent, GameState, LifeFacet } from './types';
export const FACETS: LifeFacet[] = ['work', 'relationships', 'body', 'inner'];
export function facetPattern(state: GameState, content: GameContent): Record<LifeFacet, number> {
  const counts = { work: 0, relationships: 0, body: 0, inner: 0 };
  for (const h of state.history) {
    const card = content.cards.find(c => c.id === h.cardId);
    const choice = card && choiceById(card, h.choiceId);
    for (const facet of new Set(choice?.servesFacets ?? [])) counts[facet]++;
  }
  return counts;
}
export function dominantFacet(state: GameState, content: GameContent): LifeFacet | undefined {
  const counts = facetPattern(state, content);
  const ordered = [...FACETS].sort((a, b) => counts[b] - counts[a]);
  const first = ordered[0]!;
  return counts[first] >= 3 && counts[first] - counts[ordered[1]!] >= 2 ? first : undefined;
}
export function intentionPortrait(state: GameState, content: GameContent): string {
  const dominant = dominantFacet(state, content);
  if (!dominant || !state.declaredIntention) return '';
  const direction = { work: 'мастерской', relationships: 'людям рядом', body: 'восстановлению сил', inner: 'тишине и ясности' };
  const intention = content.episode.intentionOptions.find(i => i.facet === state.declaredIntention)!;
  return `К ярмарке он хотел «${intention.label.toLocaleLowerCase('ru')}». В прожитых днях чаще отдавал время ${direction[dominant]}.`;
}
