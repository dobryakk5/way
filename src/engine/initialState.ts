import profileData from '../content/data/development-profile.json';
import { initialDevelopment } from './development';
import { createEmptyHeroDevelopmentProfile } from './heroDevelopmentProfile';
import type { GameState, ProfileConfigRegistry } from './types';
import { CONTENT_VERSION } from '../content/version';

export const GAME_STATE_VERSION = 5;

export function createInitialGameState(seed: number, options: { runId?: string; episodeId?: string; facts?: GameState['facts']; inheritedFacts?: GameState['facts'] } = {}): GameState {
  return {
    version: GAME_STATE_VERSION,
    contentVersion: CONTENT_VERSION,
    seed,
    // A new hero starts without a stage and without observations; both appear only from real decisions.
    development: initialDevelopment(),
    heroDevelopmentProfile: createEmptyHeroDevelopmentProfile(profileData as unknown as ProfileConfigRegistry),
    episodeId: options.episodeId ?? 'fair',
    runId: options.runId ?? `run-${seed}`,
    facts: { ...options.facts },
    inheritedFacts: { ...options.inheritedFacts },
    intentionHistory: [], routeHistory: [], opportunityState: {}, opportunityExposure: {},
    appliedInsights: [], observations: [], summaryCommitted: false,
    chapter: 1,
    day: 1,
    slot: 0,
    phase: 'morning',
    resources: {
      wealth: 50,
      strength: 50,
      peace: 50,
      bonds: 50
    },
    qualities: {
      attention: 0,
      honesty: 0,
      compassion: 0,
      letgo: 0,
      courage: 0
    },
    flags: [],
    shown: {},
    scheduled: [],
    pendingCrises: [],
    pendingWisdoms: [],
    journal: [],
    goalHistory: [], evidence: [], diceHistory: [], nights: [], milestones: {},
    history: []
  };
}
