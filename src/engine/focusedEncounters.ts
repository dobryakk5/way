// FOCUSED-ENCOUNTERS v1.1: which ordinary free story scenes the hero may meet, given the story they are in.
// One filter serves both ways a free scene is chosen: the six dice faces (`journey.prepareEncounter`) and the direct draw (`draw.drawCard`).
// Dice and direct draw only change WHICH ordinary story scenes can be offered. Neutral, probe, development, route-only, fixed and
// obligatory scenes never pass through here, and nothing here reads the diagnostic or development profile (see storyContext.ts).
import { deterministicRandom } from './rng';
import { baseCardWeight, cardFacetMultiplier, declaredIntentionPrior, facetAttention, facetAttentionOn, facetTargetDistribution, isFacetWeightedDrawCandidate } from './facets';
import { deriveStoryContext, type StoryContext } from './storyContext';
import type { Card, GameContent, GameState } from './types';

export type FocusTier = 1 | 2 | 3 | 4 | 5;
/** Why a card is relevant: G goal, L fresh line, T open thread, I declared intention, W specially approved world fallback. */
export interface FocusBasis { G: boolean; L: boolean; T: boolean; I: boolean; W: boolean }
export interface RankedStory { card: Card; tier: FocusTier; basis: FocusBasis; /** Matched fresh lines (`line:x`) and open threads (`thread:x`). */ links: string[] }

/** The data error of section 6.3 / 7: an activated slot with no relevant story scene and nothing protected to show. */
export class FocusPoolEmptyError extends Error {
  readonly code = 'FOCUS_POOL_EMPTY';
  constructor(day: number, slot: number) { super(`FOCUS_POOL_EMPTY: no relevant story scene and no protected scene at ${day}/${slot}`); }
}

/** `rollout.focusedEncounters` and the day inside the covered range. Outside it every selector is exactly the legacy one. */
export function focusedEncountersOn(state: GameState, content: GameContent): boolean {
  const range = content.profile.focusedEncounters;
  return content.profile.rollout.focusedEncounters === true && !!range && range.fromDay <= state.day && state.day <= range.throughDay;
}

/** The G/L/T/I/W signs of one card against the context. A card without a `story` block has no basis at all. */
export function focusBasis(card: Card, ctx: StoryContext): { basis: FocusBasis; links: string[] } | undefined {
  const story = card.story;
  if (!story) return undefined;
  const lines = (story.lines ?? []).filter(l => ctx.recentLines.includes(l));
  const threads = (story.threadIds ?? []).filter(t => ctx.openThreadIds.includes(t));
  return {
    basis: { G: ctx.goalId !== undefined && !!story.goalIds?.includes(ctx.goalId), L: lines.length > 0, T: threads.length > 0,
      I: ctx.intention !== undefined && !!card.facets?.includes(ctx.intention), W: story.worldFallback === true && story.role === 'ambient' },
    links: [...lines.map(l => `line:${l}`), ...threads.map(t => `thread:${t}`)]
  };
}
/** P1 G∧(L∨T) · P2 L∨T · P3 G · P4 I · P5 W · otherwise not relevant. The first match decides. */
export function focusTier(b: FocusBasis): FocusTier | undefined {
  if (b.G && (b.L || b.T)) return 1;
  if (b.L || b.T) return 2;
  if (b.G) return 3;
  if (b.I) return 4;
  if (b.W) return 5;
  return undefined;
}

/** The relevant ordinary free story scenes of `cards`, best tier first (ties by id). No randomness. */
export function rankFocusedStory(state: GameState, content: GameContent, cards: Card[], ctx: StoryContext = deriveStoryContext(state, content)): RankedStory[] {
  const ranked: RankedStory[] = [];
  for (const card of cards) {
    if (!isFacetWeightedDrawCandidate(card)) continue;
    const found = focusBasis(card, ctx);
    const tier = found && focusTier(found.basis);
    if (found && tier) ranked.push({ card, tier, basis: found.basis, links: found.links });
  }
  return ranked.sort((a, b) => a.tier - b.tier || a.card.id.localeCompare(b.card.id));
}

/** The single list both selectors work from (section 7): relevant story scenes of the free pool and the tier of each. */
export function selectFocusedStoryCandidates(state: GameState, content: GameContent, freePool: Card[]): { cards: Card[]; tiers: Record<string, FocusTier> } {
  const ranked = rankFocusedStory(state, content, freePool);
  return { cards: ranked.map(r => r.card), tiers: Object.fromEntries(ranked.map(r => [r.card.id, r.tier])) };
}

/**
 * Card weight inside a tier, used once. The authored weight times:
 * - with facet attention off: the declared-intention bonus (`facetAttention.declaredIntentionMultiplier`, 1.15) for a scene of the intention's sphere;
 * - with facet attention on: only its own multiplier, which already carries the same bonus while the hero's own decisions are too few
 *   (`declaredIntentionPrior`), so the bonus is never applied twice.
 */
function weightOf(state: GameState, content: GameContent): (card: Card) => number {
  const config = content.profile.facetAttention;
  if (!facetAttentionOn(content)) {
    const intention = state.declaredIntention;
    return card => baseCardWeight(card) * (intention && card.facets?.includes(intention) ? config.declaredIntentionMultiplier : 1);
  }
  const attention = facetAttention(state, content, config);
  const target = facetTargetDistribution(attention, config);
  return card => baseCardWeight(card) * cardFacetMultiplier(card, target, config, declaredIntentionPrior(card, state, attention, config));
}

/**
 * Direct draw only: how likely each non-empty tier is to be the one drawn from (P1 … P5). 8:5:3:1:0.5 by the owner's decision of 2026-10-08
 * (it was 8:5:3:2:1: P4/P5 are tiers without a tie to the story, and at 2:1 they made a third of the direct shows). Not to be lowered further without a new decision.
 */
export const DIRECT_TIER_WEIGHTS: Record<FocusTier, number> = { 1: 8, 2: 5, 3: 3, 4: 1, 5: 0.5 };

/**
 * Takes up to `count` scenes, tier by tier (P1 → P5, no card twice). Inside a tier: deterministic weighted sampling without replacement
 * (key = ln(u) / weight, u from the same rng family as the candidates). With two or more places one is kept for variety: a scene of
 * another fresh line or open thread than the first pick, else a scene of the declared intention in another sphere; without such an
 * alternative the places are simply filled by priority.
 */
export function pickFocusedStory(state: GameState, content: GameContent, ranked: RankedStory[], count: number): { picked: RankedStory[]; variety?: string } {
  if (count < 1 || !ranked.length) return { picked: [] };
  const weight = weightOf(state, content);
  // A card of weight 0 is never preferred (as in the legacy draw): it sorts after every card that has weight, and only fills a place if nothing else is left.
  const key = new Map(ranked.map(r => { const w = weight(r.card); return [r.card.id, w > 0 ? Math.log(Math.max(deterministicRandom(state.seed, state.day, state.slot, `focus:${r.card.id}`, state.episodeId), 1e-12)) / w : -Infinity]; }));
  const byKey = (a: RankedStory, b: RankedStory) => { const ka = key.get(a.card.id)!, kb = key.get(b.card.id)!; return ka === kb ? 0 : kb > ka ? 1 : -1; };
  const order = [...ranked].sort((a, b) => a.tier - b.tier || byKey(a, b) || a.card.id.localeCompare(b.card.id));
  const picked = order.slice(0, 1);
  let variety: string | undefined;
  if (count >= 2 && order.length > 1) {
    const main = order[0]!, rest = order.slice(1);
    const other = rest.find(r => r.links.length && r.links.every(l => !main.links.includes(l))) ??
      rest.find(r => r.basis.I && !(r.card.facets ?? []).some(f => main.card.facets?.includes(f)));
    if (other) { picked.push(other); variety = other.card.id; }
  }
  for (const r of order) { if (picked.length >= count) break; if (!picked.includes(r)) picked.push(r); }
  return { picked: picked.slice(0, count), ...(variety ? { variety } : {}) };
}

/**
 * The direct draw's single story pick: first a tier among the NON-EMPTY ones with weights 8:5:3:1:0.5 (one deterministic roll), then a card
 * inside that tier by the same weighted key as the dice. Better tiers are likelier, not certain, so the direct path keeps variety.
 */
export function pickDirectFocusedStory(state: GameState, content: GameContent, ranked: RankedStory[]): RankedStory | undefined {
  const tiers = ([1, 2, 3, 4, 5] as FocusTier[]).filter(t => ranked.some(r => r.tier === t));
  if (!tiers.length) return undefined;
  const total = tiers.reduce((a, t) => a + DIRECT_TIER_WEIGHTS[t], 0);
  let n = deterministicRandom(state.seed, state.day, state.slot, 'focus-tier', state.episodeId) * total;
  const tier = tiers.find(t => (n -= DIRECT_TIER_WEIGHTS[t]) < 0) ?? tiers.at(-1)!;
  return pickFocusedStory(state, content, ranked.filter(r => r.tier === tier), 1).picked[0];
}

/**
 * The story places of a dice set. `slice` is the legacy first `count` of the shuffled pool (`ordered`): every place held by a scene that is
 * not an ordinary story scene stays exactly as shuffled (neutral, probe and everything protected is untouched, FACET-2), and the story
 * places are refilled with relevant scenes. If there are fewer relevant scenes than places the result is short and the caller makes
 * no dice set for this slot (a direct draw follows).
 */
export function focusedStoryPositions(state: GameState, content: GameContent, ordered: Card[], slice: Card[]): Card[] {
  const kept = slice.filter(c => !isFacetWeightedDrawCandidate(c));
  const places = slice.length - kept.length;
  if (!places) return kept;
  const ranked = rankFocusedStory(state, content, ordered);
  const { picked, variety } = pickFocusedStory(state, content, ranked, places);
  traceFocused(() => ({ kind: 'dice', day: state.day, slot: state.slot, places, relevant: ranked.length, picks: picked.map(p => ({ id: p.card.id, tier: p.tier, basis: p.basis })),
    ...(variety ? { variety } : {}), ...(picked.length < places ? { deficit: true } : {}) }));
  return [...kept, ...picked.map(p => p.card)];
}

// ---------------------------------------------------------------------------------------------
// Debug trace: tiers and reasons for tests and reports. Never saved, never part of a dice record or a server event.
// ---------------------------------------------------------------------------------------------
export interface FocusedTraceEvent {
  kind: 'dice' | 'direct' | 'direct-protected' | 'empty'; day: number; slot: number;
  places?: number; relevant?: number; picks?: { id: string; tier: FocusTier; basis: FocusBasis }[]; variety?: string; deficit?: boolean;
}
let traceSink: ((event: FocusedTraceEvent) => void) | undefined;
export function setFocusedTrace(sink?: (event: FocusedTraceEvent) => void): void { traceSink = sink; }
/** The event is built only when somebody listens: the trace costs nothing in the game. */
export function traceFocused(make: () => FocusedTraceEvent): void { if (traceSink) traceSink(make()); }
