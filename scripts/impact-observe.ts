import { content } from '../src/content';
import { evaluateCondition } from '../src/engine';
import { observeEveningTexts, observeScene } from '../src/engine/impact';
import type { GameContent, ObservableImpactEvent } from '../src/engine';
import { play, type PlayOptions } from './play';

/**
 * A run of the real game that records what the hero was actually shown of her own earlier decisions (WORLD-IMPACT v1, section 20):
 * every presented scene (its text variant, offered choice variant, drawn image variant, scheduled arrival, trace reader)
 * and every evening text. A reader that exists in the content but never appeared produces nothing.
 */
export function playObserved(seed: number, options: PlayOptions & { throughDay?: number } = {}) {
  const c: GameContent = options.content ?? content;
  const events: ObservableImpactEvent[] = [];
  const { throughDay, ...rest } = options;
  const result = play(seed, {
    ...rest,
    ...(throughDay !== undefined ? { stopWhen: s => s.day > throughDay } : {}),
    onDraw: (state, draw) => {
      events.push(...observeScene(c, state.history, { card: draw.card, day: state.day, choices: draw.choices, facts: state.facts,
        ...(draw.variantId ? { variantId: draw.variantId } : {}), ...(draw.visual?.variantId ? { visualVariantId: draw.visual.variantId } : {}) },
      cond => evaluateCondition(cond, state, c)));
      options.onDraw?.(state, draw);
    }
  });
  events.push(...observeEveningTexts(c, result.state));
  events.sort((a, b) => a.day - b.day);
  return { ...result, events };
}

/** An impact of a decision (not of an opportunity that ran out on its own). */
export const isDecisionImpact = (e: ObservableImpactEvent) => !e.sourceCardId.startsWith('opportunity:');

/** The acceptance rule for the opening days (section 22): content criterion, measured from what was shown. */
export function openingCriteria(events: ObservableImpactEvent[]) {
  const decisions = events.filter(isDecisionImpact);
  const day1 = decisions.some(e => e.day <= 1);
  const upTo3 = decisions.filter(e => e.day <= 3);
  const sources = new Set(upTo3.map(e => `${e.sourceCardId}/${e.sourceChoiceId}`));
  const strong = upTo3.some(e => e.kinds.some(k => k === 'delayed' || k === 'cross-character' || k === 'choice' || k === 'visual'));
  return { day1, day3: sources.size >= 2 && strong, sources: sources.size, strong };
}
