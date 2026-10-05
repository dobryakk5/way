import { evaluateCondition } from './conditions';
import type { Card, GameContent, GameState } from './types';
export const position = (day: number, slot: number, slots = 4) => (day - 1) * slots + slot;
export function routeAt(state: Pick<GameState, 'day' | 'slot'>, content: GameContent) {
  return content.episode.routeMoments.find(r => r.day === state.day && r.slot === state.slot);
}
export function isReserved(day: number, slot: number, content: GameContent): boolean {
  return content.cards.some(c => c.at?.day === day && c.at.slot === slot) ||
    content.episode.routeMoments.some(r => r.day === day && r.slot === slot);
}
/** Scenes of a `beats` arc exist for the hero only once the arcs are switched on; the older cycles arc is unaffected. */
export function developmentArcEnabled(card: Card, content: GameContent): boolean {
  const arcId = card.development?.arcId;
  if (!arcId) return true;
  return content.development.arcs.find(a => a.id === arcId)?.model !== 'beats' || content.profile.rollout.developmentArcs;
}
export function eligible(state: GameState, card: Card, content: GameContent): boolean {
  if (!developmentArcEnabled(card, content)) return false;
  if (card.chapter !== 'any' && card.chapter !== state.chapter) return false;
  const shown = state.shown[card.id] ?? [];
  if ((card.once ?? !['routine', 'crisis'].includes(card.type)) && shown.length) return false;
  if (card.cooldownDays && shown.length && state.day - shown[shown.length - 1]! < card.cooldownDays) return false;
  return evaluateCondition(card.requires, state, content);
}
export interface Obligation { card: Card; from: number; through: number }
export function obligations(state: GameState, content: GameContent): Obligation[] {
  const pending: Obligation[] = [];
  for (const c of content.cards) {
    if (c.at || state.shown[c.id]?.length) continue;
    if (c.mustShowBy !== undefined) pending.push({ card: c, from: content.episode.chapters.find(ch => ch.id === c.chapter)?.from ?? 1, through: c.mustShowBy });
  }
  for (const s of state.scheduled) {
    const card = content.cards.find(c => c.id === s.cardId);
    if (card?.required && !card.at) {
      if (s.latestDay === undefined) throw new Error(`Required chain has no deadline: ${card.id}`);
      pending.push({ card, from: s.day, through: s.latestDay });
    }
  }
  return pending.sort((a, b) => a.through - b.through || a.from - b.from || a.card.id.localeCompare(b.card.id));
}
// Matching obligations to remaining free slots, with release days and all reserved slots.
export function fitsSchedule(state: GameState, content: GameContent, items = obligations(state, content), skipCurrent = false): boolean {
  const todo = [...items];
  const slots = content.episode.slotsPerDay;
  const start = position(state.day, state.slot, slots) + Number(skipCurrent);
  for (let p = start; p < content.episode.days * slots; p++) {
    const day = Math.floor(p / slots) + 1; const slot = p % slots;
    if (todo.some(o => o.through < day)) return false;
    if (isReserved(day, slot, content)) continue;
    const index = todo.findIndex(o => o.from <= day);
    if (index >= 0) todo.splice(index, 1);
  }
  return todo.length === 0;
}
