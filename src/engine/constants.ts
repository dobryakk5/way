import type { ActionLogic, Quality, Resource } from './types';

export const RESOURCE_ORDER: readonly Resource[] = [
  'wealth',
  'strength',
  'peace',
  'bonds'
];

// Последний tie-break из ТЗ: порядок типа Quality.
export const QUALITY_ORDER: readonly Quality[] = [
  'attention',
  'honesty',
  'compassion',
  'letgo',
  'courage'
];

// Order matters: it is the sequence of the model, the tie-break for rounding, and the meaning of "earlier"/"next".
export const ACTION_LOGICS: readonly ActionLogic[] = [
  'opportunist', 'diplomat', 'expert', 'achiever', 'individualist', 'strategist', 'alchemist', 'ironic'
];
