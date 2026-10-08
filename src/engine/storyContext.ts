// FOCUSED-ENCOUNTERS v1.1, sections 3.3 and 4: the story the hero is in, derived from state and never stored.
// This module must not read the diagnostic or development profile (nor `Card.diagnostic`): it only reads the goal, the declared
// intention, the story-line journal and the open threads. The isolation is checked by a test (storyContext.test.ts).
import type { GameContent, GameState, GoalId, LifeFacet, StoryLine, ThreadDefinition } from './types';

/** How many of the latest `state.evidence` entries (story-line steps) say which lines are fresh. */
export const RECENT_LINE_WINDOW = 8;

export interface StoryContext {
  goalId?: GoalId;
  intention?: LifeFacet;
  /** Distinct story lines of the latest `RECENT_LINE_WINDOW` line steps, newest first. A fresh line, not a finished one. */
  recentLines: StoryLine[];
  /** Ids of `threads.json` records that are open now. */
  openThreadIds: string[];
  day: number;
  chapter: number;
}

/**
 * Whether a thread of `threads.json` is open for the hero right now. Anything missing or unrecognised counts as NOT confirmed:
 * - fact: the fact holds a value whose stage is `open`;
 * - opportunity: the opportunity is still `open` AND it was actually shown to the hero (`opportunityExposure`);
 * - chain: the follow-up card is still scheduled and its latest day (if it has one) has not passed.
 */
export function isOpenStoryThread(thread: ThreadDefinition, state: GameState, content: GameContent): boolean {
  switch (thread.kind) {
    case 'fact': {
      const value = state.facts[thread.fact];
      return value !== undefined && thread.stages[String(value)] === 'open';
    }
    case 'opportunity':
      return content.episode.opportunities.some(o => o.id === thread.opportunityId) &&
        state.opportunityState[thread.opportunityId] === 'open' && state.opportunityExposure[thread.opportunityId] !== undefined;
    case 'chain':
      return content.cards.some(c => c.id === thread.followUp.cardId) &&
        state.scheduled.some(s => s.cardId === thread.followUp.cardId && (s.latestDay === undefined || s.latestDay >= state.day));
    default:
      return false;
  }
}

/** Computed before the candidates of a slot are prepared; never recomputed for a candidate set that is already saved. */
export function deriveStoryContext(state: GameState, content: GameContent): StoryContext {
  const recentLines: StoryLine[] = [];
  for (const entry of [...state.evidence].slice(-RECENT_LINE_WINDOW).reverse()) if (!recentLines.includes(entry.line)) recentLines.push(entry.line);
  return {
    ...(state.goal ? { goalId: state.goal.id } : {}),
    ...(state.declaredIntention ? { intention: state.declaredIntention } : {}),
    recentLines,
    openThreadIds: content.threads.filter(t => isOpenStoryThread(t, state, content)).map(t => t.id),
    day: state.day,
    chapter: state.chapter
  };
}
