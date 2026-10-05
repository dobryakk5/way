import type { DevelopmentBeat, DevelopmentEvidence, GameContent, GameState } from './types';

// Beat model of a development arc (v2.5): trial → consequence → review → transfer → pressure, one required piece of evidence each.
// Nothing here is stored: the state of every beat is derived from the evidence journal, so a reload cannot disagree with it.
export const BEATS: readonly DevelopmentBeat[] = ['trial', 'consequence', 'review', 'transfer', 'pressure'];
export type BeatStatus = 'done' | 'open' | 'withdrawn';
export interface BeatInfo { status: BeatStatus; /** The evidence that completed the beat. */ done?: DevelopmentEvidence; /** The latest withdrawal at this beat that is still unanswered or was answered later. */ lastWithdrawal?: DevelopmentEvidence }

/**
 * `done`: the beat has its evidence, found after the previous beat's evidence (a beat cannot be skipped).
 * `withdrawn`: not done, and the latest attempt at this very beat was a withdrawal. `open`: not done, no attempt, or locked behind an earlier beat.
 * A withdrawal never erases anything: earlier beats stay done and the retry closes only the beat it belongs to.
 */
export function deriveBeatState(evidence: readonly DevelopmentEvidence[], arcId: string): Record<DevelopmentBeat, BeatInfo> {
  const events = evidence.filter(e => e.arcId === arcId);
  const out = {} as Record<DevelopmentBeat, BeatInfo>;
  let cursor = -1; let locked = false;
  for (const beat of BEATS) {
    if (locked) { out[beat] = { status: 'open' }; continue; }
    const doneAt = events.findIndex((e, i) => i > cursor && e.kind === beat);
    const withdrawals = events.filter((e, i) => i > cursor && e.kind === 'withdrawal' && e.beat === beat && (doneAt < 0 || i < doneAt));
    const lastWithdrawal = withdrawals.at(-1);
    if (doneAt >= 0) { out[beat] = { status: 'done', done: events[doneAt]!, ...(lastWithdrawal ? { lastWithdrawal } : {}) }; cursor = doneAt; }
    else { out[beat] = { status: lastWithdrawal ? 'withdrawn' : 'open', ...(lastWithdrawal ? { lastWithdrawal } : {}) }; locked = true; }
  }
  return out;
}

const arcOfCard = new WeakMap<GameContent['cards'], Map<string, string | undefined>>();
function cardArc(content: GameContent, cardId: string): string | undefined {
  let map = arcOfCard.get(content.cards);
  if (!map) { map = new Map(content.cards.map(c => [c.id, c.development?.arcId])); arcOfCard.set(content.cards, map); }
  return map.get(cardId);
}
/**
 * The latest scene of this arc the hero answered, whether or not it produced evidence. A declined retry leaves no withdrawal behind, but it is still an attempt:
 * the next offer must wait out a cooldown from it, not from the older withdrawal.
 */
export function lastArcDecision(state: GameState, content: GameContent, arcId: string): { day: number; slot: number } | undefined {
  for (let i = state.history.length - 1; i >= 0; i--) { const h = state.history[i]!; if (cardArc(content, h.cardId) === arcId) return { day: h.day, slot: h.slot }; }
  return undefined;
}
/** Resolved decisions after `at` that are not scenes of this arc: the "ordinary life" between two beats. */
export function ordinaryDecisionsSince(state: GameState, content: GameContent, arcId: string, at: { day: number; slot: number }): number {
  return state.history.filter(h => (h.day > at.day || h.day === at.day && h.slot > at.slot) && cardArc(content, h.cardId) !== arcId).length;
}
/** Spacing and cooldown share one rule: enough ordinary decisions, OR a completed evening (the day has moved on) since the reference attempt. */
export function enoughTimeSince(state: GameState, content: GameContent, arcId: string, at: { day: number; slot: number }, decisions: number, evenings: number): boolean {
  return ordinaryDecisionsSince(state, content, arcId, at) >= decisions || state.day - at.day >= evenings;
}
