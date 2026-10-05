import type { Effects, GameState, Quality, Resource } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyEffects(state: GameState, effects: Effects): GameState {
  const resources = { ...state.resources };
  for (const [resource, delta] of Object.entries(effects.resources ?? {}) as Array<
    [Resource, number]
  >) {
    resources[resource] = clamp(resources[resource] + delta, 0, 100);
  }

  const qualities = { ...state.qualities };
  for (const [quality, delta] of Object.entries(effects.qualities ?? {}) as Array<
    [Quality, number]
  >) {
    qualities[quality] = clamp(qualities[quality] + delta, -20, 20);
  }

  const flags = new Set(state.flags);
  for (const flag of effects.clearFlags ?? []) flags.delete(flag);
  for (const flag of effects.setFlags ?? []) flags.add(flag);

  const scheduled = [
    ...state.scheduled,
    ...(effects.schedule ?? []).map((item) => ({
      cardId: item.cardId,
      day: state.day + item.inDays,
      ...(item.latestDay !== undefined ? { latestDay: item.latestDay } : {})
    }))
  ];

  const pendingWisdoms = effects.wisdomId
    ? [...state.pendingWisdoms, effects.wisdomId]
    : [...state.pendingWisdoms];

  return {
    ...state,
    facts: { ...state.facts, ...effects.setFacts },
    journal: effects.wisdomId && !state.journal.some(e => e.kind === 'wisdom' && e.id === effects.wisdomId)
      ? [...state.journal, { day: state.day, kind: 'wisdom', id: effects.wisdomId }] : state.journal,
    resources,
    qualities,
    flags: [...flags],
    scheduled,
    pendingWisdoms
  };
}
