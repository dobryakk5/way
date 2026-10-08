import { choiceById } from './variants';
import type { Card, FacetAttentionConfig, GameContent, GameState, LifeFacet } from './types';
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

// ---------------------------------------------------------------------------------------------
// Facet attention: where the hero's free story choices have gone recently. Derived from `history`, never stored.
// It changes only how often ordinary free story scenes appear; it never feeds scoring, probes or development.
// ---------------------------------------------------------------------------------------------
export type FacetDistribution = Record<LifeFacet, number>;
export interface FacetAttention { distribution: FacetDistribution; /** Evidence decisions inside the window. */ evidence: number }
const uniformFacets = (): FacetDistribution => ({ work: .25, relationships: .25, body: .25, inner: .25 });
/** The authored weight of a free scene in a draw: situations count three times a routine unless the card says otherwise. */
export const baseCardWeight = (card: Card): number => card.weight ?? (card.type === 'situation' ? 3 : 1);
export const facetAttentionOn = (content: GameContent): boolean => content.profile.rollout.facetAttention;
/** The choice made on this card reflects where the player voluntarily put attention (a route-only scene is a decision the player made too). */
export function isFacetAttentionEvidenceSource(card: Card): boolean {
  return ['situation', 'routine'].includes(card.type) && !card.at && !card.key && !card.required && card.mustShowBy === undefined &&
    !card.diagnostic && !card.development && !card.tags?.includes('probe-only');
}
/** The ordinary free draw may change how often this card appears. */
export const isFacetWeightedDrawCandidate = (card: Card): boolean => isFacetAttentionEvidenceSource(card) && !card.tags?.includes('route-only');
function entryFacets(entry: GameState['history'][number], card: Card): LifeFacet[] {
  const facets = entry.facets?.length ? entry.facets : choiceById(card, entry.choiceId)?.servesFacets ?? [];
  return [...new Set(facets)];
}
/** Evidence decisions only, oldest first, each with its unique facets. */
function evidenceDecisions(state: GameState, content: GameContent): LifeFacet[][] {
  const cards = new Map(content.cards.map(c => [c.id, c]));
  const out: LifeFacet[][] = [];
  for (const entry of state.history) {
    const card = cards.get(entry.cardId);
    if (!card || !isFacetAttentionEvidenceSource(card)) continue;
    const facets = entryFacets(entry, card);
    if (facets.length) out.push(facets);
  }
  return out;
}
export function facetAttention(state: GameState, content: GameContent, config: FacetAttentionConfig = content.profile.facetAttention): FacetAttention {
  const window = evidenceDecisions(state, content).slice(-config.windowSize);
  const sums: FacetDistribution = { work: 0, relationships: 0, body: 0, inner: 0 };
  for (const facets of window) for (const f of facets) sums[f] += 1 / facets.length;
  if (!window.length) return { distribution: uniformFacets(), evidence: 0 };
  return { distribution: Object.fromEntries(FACETS.map(f => [f, sums[f] / window.length])) as FacetDistribution, evidence: window.length };
}
/** Half base, half the player's attention; with too little evidence the base alone. No sphere ever disappears. */
export function facetTargetDistribution(attention: FacetAttention, config: FacetAttentionConfig): FacetDistribution {
  if (attention.evidence < config.minEvidence) return uniformFacets();
  const uniform = uniformFacets();
  return Object.fromEntries(FACETS.map(f => [f, (1 - config.playerWeight) * uniform[f] + config.playerWeight * attention.distribution[f]])) as FacetDistribution;
}
/** A weak starting prior from the declared intention, only until the player's own decisions can speak. */
export function declaredIntentionPrior(card: Card, state: GameState, attention: FacetAttention, config: FacetAttentionConfig): number {
  return attention.evidence < config.minEvidence && state.declaredIntention && card.facets?.includes(state.declaredIntention) ? config.declaredIntentionMultiplier : 1;
}
/** Mean (never max) of the card's spheres against a uniform share, times the prior, clamped. A card without facets stays at 1. */
export function cardFacetMultiplier(card: Card, target: FacetDistribution, config: FacetAttentionConfig, prior = 1): number {
  const facets = [...new Set(card.facets ?? [])];
  if (!facets.length) return 1;
  const mean = facets.reduce((a, f) => a + target[f], 0) / facets.length;
  return Math.min(config.maxMultiplier, Math.max(config.minMultiplier, mean / (1 / FACETS.length) * prior));
}
