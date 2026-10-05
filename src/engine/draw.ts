import { developmentCardEligible, recordDevelopmentPresentation } from './development';
import { independenceStats, naturalSelectionOrigin, probeAllowed, probePair, profileConfig } from './heroDevelopmentProfile';
import { evaluateCondition } from './conditions';
import { reconcileCrisisQueue } from './crises';
import { deterministicRandom } from './rng';
import { eligible, fitsSchedule, obligations, routeAt } from './schedule';
import { choiceById, resolveChoices } from './variants';
import { exposeOpportunity } from './opportunities';
import type { Card, Choice, DiagnosticSelectionOrigin, GameContent, GameState } from './types';
export type DrawSource = 'current' | 'at' | 'route' | 'capacity' | 'crisis' | 'mustShowBy' | 'scheduled' | 'pool' | 'development';
export interface DrawResult {
  card: Card; choices: Choice[]; /** Sides exist only for a two-choice card; 3..4 choices are shown in authored order. */ leftChoiceId?: string; rightChoiceId?: string;
  text: string; source: DrawSource; variantId?: string;
  // How this scene reached the hero; fixed when it is first shown and carried by the saved `current`.
  selectionOrigin?: DiagnosticSelectionOrigin;
}
export function resolveCardText(state: GameState, card: Card, content: GameContent): string {
  return card.textVariants?.find(v => evaluateCondition(v.when, state, content))?.text ?? card.text;
}
function result(state: GameState, card: Card, content: GameContent, source: DrawSource, origin?: DiagnosticSelectionOrigin): DrawResult {
  const choices = state.current?.cardId === card.id
    ? state.current.choices ?? state.current.choiceIds.map(id => choiceById(card, id)) as Choice[]
    : resolveChoices(state, card, content);
  if (choices.some(c => !c)) throw new Error('Saved choice pair requires an explicit content migration');
  const two = choices.length === 2;
  const swapped = two && !card.fixedSides && deterministicRandom(state.seed, state.day, state.slot, `sides:${card.id}`, state.episodeId) >= .5;
  const leftChoiceId = two ? state.current?.leftChoiceId ?? choices[swapped ? 1 : 0]!.id : undefined;
  if (two && !choices.some(c => c.id === leftChoiceId)) throw new Error('Invalid saved side');
  if (!two && state.current?.leftChoiceId) throw new Error('Sides exist only for a two-choice card');
  const variant = card.textVariants?.find(v => evaluateCondition(v.when, state, content));
  const variantId = state.current?.variantId ?? variant?.id;
  const shown = state.current?.cardId === card.id;
  const selectionOrigin = shown ? state.current!.selectionOrigin : origin ?? naturalSelectionOrigin(card, variantId, choices);
  return { card, choices, ...(leftChoiceId ? { leftChoiceId, rightChoiceId: choices.find(c => c.id !== leftChoiceId)!.id } : {}),
    text: state.current?.text ?? variant?.text ?? card.text, source, ...(variantId ? { variantId } : {}), ...(selectionOrigin ? { selectionOrigin } : {}) };
}
function weighted(state: GameState, cards: Card[]): Card | undefined {
  const weights = cards.map(c => (c.weight ?? (c.type === 'situation' ? 3 : 1)) *
    (state.declaredIntention && c.facets?.includes(state.declaredIntention) ? 1.2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return cards[0];
  let n = deterministicRandom(state.seed, state.day, state.slot, 'draw', state.episodeId) * total;
  for (let i = 0; i < cards.length; i++) { n -= weights[i]!; if (n < 0) return cards[i]; }
  return cards.at(-1);
}
/** Free scenes a hero may meet now. Probe scenes are chosen only by the selector, never by the ordinary pool. */
export function freePool(state: GameState, content: GameContent): Card[] {
  return content.cards.filter(c => developmentCardEligible(state, c) && !c.at && !c.tags?.includes('route-only') && !c.tags?.includes('probe-only') &&
    ['situation', 'routine'].includes(c.type) && eligible(state, c, content) &&
    !content.episode.routeMoments.some(r => (r.day > state.day || r.day === state.day && r.slot > state.slot) && r.day - state.day < (c.cooldownDays ?? 0) &&
      r.options.some(o => content.episode.routePools[o.routePool]?.includes(c.id))));
}
export function adaptiveSelectionOn(content: GameContent): boolean { return content.profile.rollout.adaptiveSelection; }
/**
 * Probe scenes that separate the two leading logics of the *independent* window. Only meaningful when the leaders are
 * unsettled and the probe share of that window is still within its limit; never right after an adaptive scene.
 */
export function probeScenes(state: GameState, content: GameContent): Card[] {
  const stats = independenceStats(state, content);
  const pair = probePair(state);
  if (!pair || stats.lastFreeOrigin === 'adaptive' || !probeAllowed(stats, profileConfig(state, content))) return [];
  const p = state.heroDevelopmentProfile; const d = p.currentDistribution!;
  const settled = !!p.candidatePrimary && d[pair[0]] - d[pair[1]] >= profileConfig(state, content).confidence.deltaTarget;
  if (settled) return [];
  return content.cards.filter(c => c.tags?.includes('probe-only') && c.type === 'situation' && !c.at && c.diagnostic?.distinguishes?.includes(pair[0]) &&
    c.diagnostic.distinguishes.includes(pair[1]) && eligible(state, c, content));
}
/** After an adaptive scene the next free scene must be independent, when the content has one. */
export function independentPool(state: GameState, content: GameContent, pool: Card[]): Card[] {
  if (independenceStats(state, content).lastFreeOrigin !== 'adaptive') return pool;
  const independent = pool.filter(c => naturalSelectionOrigin(c) !== 'adaptive');
  return independent.length ? independent : pool;
}
export function drawCard(state: GameState, content: GameContent): DrawResult | undefined {
  if (state.phase !== 'slot') return undefined;
  if (state.current) {
    const c = content.cards.find(c => c.id === state.current!.cardId);
    if (!c) throw new Error('Saved card requires an explicit content migration');
    return result(state, c, content, 'current');
  }
  const at = content.cards.find(c => c.at?.day === state.day && c.at.slot === state.slot);
  if (at) {
    if (!eligible(state, at, content) || (at.type === 'chain' && !state.scheduled.some(s => s.cardId === at.id && s.day <= state.day)))
      throw new Error(`Unavailable fixed scene ${at.id} at ${state.day}/${state.slot}`);
    return result(state, at, content, 'at');
  }
  const route = routeAt(state, content);
  if (route) {
    const selected = state.activeRoute;
    const option = selected?.day === state.day && selected.slot === state.slot && route.options.find(o => o.id === selected.optionId);
    if (!option) throw new Error('Route must be selected before drawing its slot');
    const ids = content.episode.routePools[option.routePool] ?? [];
    const pool = content.cards.filter(c => ids.includes(c.id) && ['situation', 'routine'].includes(c.type) && eligible(state, c, content));
    const card = weighted(state, pool);
    if (!card) throw new Error(`Empty route pool: ${option.routePool}`);
    return result(state, card, content, 'route');
  }
  const required = obligations(state, content);
  if (!fitsSchedule(state, content, required)) throw new Error('Required events exceed free deadline capacity');
  if (!fitsSchedule(state, content, required, true)) {
    const due = required.find(o => o.from <= state.day && eligible(state, o.card, content) &&
      fitsSchedule(state, content, required.filter(x => x !== o), true));
    if (!due) throw new Error('Required event cannot satisfy its deadline');
    return result(state, due.card, content, 'capacity');
  }
  const crises = reconcileCrisisQueue(state, content).pendingCrises;
  const crisis = content.cards.find(c => c.id === crises[0]);
  if (crisis) return result(state, crisis, content, 'crisis');
  const deadlines = content.cards.filter(c => !c.at && c.mustShowBy !== undefined && c.mustShowBy <= state.day && eligible(state, c, content))
    .map(card => ({ card, deadline: card.mustShowBy! }));
  for (const s of state.scheduled) {
    const card = content.cards.find(c => c.id === s.cardId);
    if (card && !card.at && s.day <= state.day && s.latestDay !== undefined && eligible(state, card, content)) deadlines.push({ card, deadline: s.latestDay });
  }
  deadlines.sort((a, b) => a.deadline - b.deadline || a.card.id.localeCompare(b.card.id));
  if (deadlines[0]) return result(state, deadlines[0].card, content, 'mustShowBy');
  for (const s of [...state.scheduled].sort((a, b) => a.day - b.day)) {
    const card = content.cards.find(c => c.id === s.cardId);
    if (card && !card.at && s.day <= state.day && eligible(state, card, content)) return result(state, card, content, 'scheduled');
  }
  const adaptive = adaptiveSelectionOn(content);
  const afterAdaptive = adaptive && independenceStats(state, content).lastFreeOrigin === 'adaptive';
  const developmentCard = content.cards.find(c => c.development?.stages && developmentCardEligible(state,c) && !c.at && !c.required && !c.mustShowBy && !c.tags?.includes('route-only') && ['situation','routine'].includes(c.type) && eligible(state,c,content));
  if(developmentCard && !afterAdaptive) return result(state,developmentCard,content,'development','adaptive');
  const probe = adaptive ? weighted(state, probeScenes(state, content)) : undefined;
  if (probe) return result(state, probe, content, 'pool', 'probe');
  const pool = freePool(state, content);
  const card = weighted(state, adaptive ? independentPool(state, content, pool) : pool);
  return card ? result(state,card,content,'pool') : undefined;
}
export function persistDraw(state: GameState, draw: DrawResult, content?: GameContent): GameState {
  if (state.current) return state;
  let next: GameState = { ...state, current: { cardId: draw.card.id, ...(draw.leftChoiceId ? { leftChoiceId: draw.leftChoiceId } : {}),
    choiceIds: draw.choices.map(c => c.id), choices: structuredClone(draw.choices), text: draw.text,
    ...(draw.variantId ? { variantId: draw.variantId } : {}), ...(draw.selectionOrigin ? { selectionOrigin: draw.selectionOrigin } : {}) } };
  if (draw.variantId) next = { ...next, observations: [...next.observations, { day: state.day, slot: state.slot, kind: 'variant', id: draw.variantId }] };
  if (draw.variantId && draw.card.textVariants?.some(v => v.id === draw.variantId && v.kind === 'shadow') && draw.card.shadow)
    next = { ...next, flags: [...new Set([...next.flags, `observed_shadow_${draw.card.shadow.quality}`])] };
  if (content) next = recordDevelopmentPresentation(exposeOpportunity(next, content, 'card', draw.card.id), content, draw);
  return next;
}
