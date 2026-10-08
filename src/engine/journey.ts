import { developmentCardEligible } from './development';
import { deterministicRandom } from './rng';
import { eligible } from './schedule';
import { adaptiveSelectionOn, drawCard, encounterSlice, freePool, independentPool, persistDraw, probeScenes } from './draw';
import { naturalSelectionOrigin } from './heroDevelopmentProfile';
import { enterSlot } from './navigation';
import { choiceById } from './variants';
import { FACETS } from './facets';
import type { Card, DecisionKind, GameContent, GameState, GoalId } from './types';

export function chooseGoal(state: GameState, content: GameContent, id: GoalId, action: 'select' | 'keep' | 'clarify' | 'change', wording?: string): GameState {
  if (!['morning', 'goal'].includes(state.phase)) return state;
  const option = content.episode.goals.find(g => g.id === id);
  if (!option) throw new Error('Unknown goal');
  if (action === 'keep' || action === 'clarify') {
    if (!state.goal || id !== state.goal.id) throw new Error('Goal must remain the same');
  }
  const label = wording?.trim() || (action === 'keep' ? state.goal?.wording : undefined) || option.label;
  const next: GameState = { ...state, goal: { id, wording: label }, goalHistory: [
    ...state.goalHistory.filter(g => g.day !== state.day), { day: state.day, id, wording: label, action }] };
  return state.phase === 'goal' ? enterSlot(next, content) : next;
}

// Candidate set is fixed before asking for randomness. Forced scenes never use the die.
export function prepareEncounter(state: GameState, content: GameContent): GameState {
  if (state.phase !== 'slot' || state.current || state.diceHistory.some(d => d.day === state.day)) return state;
  const draw = drawCard(state, content);
  if (draw?.source !== 'pool') return state;
  const order = (a: Card, b: Card) => deterministicRandom(state.seed,state.day,state.slot,`candidate:${a.id}`,state.episodeId)-deterministicRandom(state.seed,state.day,state.slot,`candidate:${b.id}`,state.episodeId);
  const adaptive = adaptiveSelectionOn(content);
  const pool = freePool(state, content);
  const base = (adaptive ? independentPool(state, content, pool) : pool).sort(order);
  const slice = (count: number) => encounterSlice(state, content, base, count);
  // A probe takes one of the six places; its origin is frozen with the candidate set, like the cards themselves.
  const probe = adaptive ? probeScenes(state, content).sort(order)[0] : undefined;
  const chosen = (probe ? [...slice(5), probe] : slice(6)).sort(order);
  if (chosen.length !== 6) return state;
  const candidates = chosen.map(c => c.id);
  const candidateOrigins = chosen.map(c => c === probe ? 'probe' as const : naturalSelectionOrigin(c));
  return { ...state, phase: 'dice', diceHistory: [...state.diceHistory, { day: state.day, slot: state.slot, candidates, candidateOrigins }] };
}
export function rollEncounter(state: GameState, content: GameContent, face: number): GameState {
  if (state.phase !== 'dice') return state;
  const dice = state.diceHistory.at(-1);
  if (!dice || dice.face !== undefined) return state;
  if (!Number.isInteger(face) || face < 1 || face > 6) throw new Error('Invalid die face');
  const cardId = dice.candidates[face - 1]!;
  const card = content.cards.find(c => c.id === cardId);
  if (!card || !developmentCardEligible(state, card) || !eligible(state, card, content)) {
    // The set was prepared before a content update that made one of its scenes unavailable (a save from an older build). The hero never saw the
    // candidates, only the die, so the set is prepared again from the current content BEFORE the roll and the same face is rolled on it. Without this the
    // roll would fail and the hero would be stuck on the dice screen.
    const fresh = prepareEncounter({ ...state, phase: 'slot', diceHistory: state.diceHistory.slice(0, -1) }, content);
    if (fresh.phase === 'dice') return rollEncounter(fresh, content, face);
    return { ...state, phase: 'slot', diceHistory: state.diceHistory.slice(0, -1) };   // no set can be made any more: the slot is drawn directly
  }
  // Use the normal text/side resolver against this exact card, without modifying content effects.
  const draw = drawCard({ ...state, phase: 'slot' }, { ...content, cards: [{ ...card, at: { day: state.day, slot: state.slot } }] });
  if (!draw) throw new Error('Missing encounter');
  // The origin frozen with the candidates stands, unless the scene itself turns out to be development-gated.
  const frozen = dice.candidateOrigins?.[face - 1];
  const origin = draw.selectionOrigin === 'adaptive' || !frozen ? draw.selectionOrigin : frozen;
  const shown = persistDraw({ ...state, phase: 'slot' }, { ...draw, ...(origin ? { selectionOrigin: origin } : {}) }, content);
  return { ...shown, phase: 'dice', diceHistory: [...state.diceHistory.slice(0, -1), { ...dice, face, cardId }] };
}
export function openEncounter(state: GameState): GameState {
  return state.phase === 'dice' && state.current && state.diceHistory.at(-1)?.face ? { ...state, phase: 'slot' } : state;
}
export function fairDieFace(randomUint32: () => number): number {
  // Rejection sampling avoids modulo bias.
  const limit = 4294967292;
  let value: number;
  do { value = randomUint32(); } while (value >= limit);
  return value % 6 + 1;
}
export const DECISIONS: Record<DecisionKind, string> = {
  pursue: 'Продолжение выбранной цели', cost: 'Учёт цены решения', perspective: 'Другая перспектива',
  experiment: 'Проба альтернативы', reconsider: 'Пересмотр цели'
};
export function journeyPeriod(state: GameState, content: GameContent, period: 1 | 7 | 30) {
  const through = state.nights.at(-1)?.day ?? 0;
  const from = Math.max(1, through - period + 1);
  const history = state.history.filter(h => h.day >= from && h.day <= through);
  const facets = FACETS.map(facet => ({ facet, evidence: history.filter(h => {
    const card = content.cards.find(c => c.id === h.cardId);
    return (h.facets ?? (card && choiceById(card, h.choiceId)?.servesFacets) ?? []).includes(facet);
  }) }));
  const goals = state.goalHistory.filter(g => g.day >= from && g.day <= through);
  const decisions = Object.entries(DECISIONS).map(([kind, label]) => {
    const evidence = history.filter(h => h.decisionKinds?.includes(kind as DecisionKind));
    return { kind, label, evidence, reviews: kind==='reconsider'?goals.filter(g=>g.action!=='select'):[], recurring: evidence.length >= 3 && new Set(evidence.map(h => h.cardId)).size >= 2 };
  });
  return { from, through, available: through ? through - from + 1 : 0, facets, decisions, goals };
}
