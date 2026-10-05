import { createInitialGameState } from './initialState';
import { pickEnding } from './endings';
import { prepareMorning } from './day';
import type { EpisodeContract, GameContent, GameState, WorldProfile } from './types';
export function emptyWorld(): WorldProfile { return { schemaVersion: 1, archive: [], selectedRunByEpisode: {} }; }
export function inheritedFacts(world: WorldProfile, episodeId: string, target: EpisodeContract) {
  const selected = world.archive.find(s => s.episodeId === episodeId && s.runId === world.selectedRunByEpisode[episodeId]);
  return Object.fromEntries(target.inheritedFactKeys.flatMap(k => selected && k in selected.facts ? [[k, selected.facts[k]!]] : []));
}
export function startEpisode(content: GameContent, seed: number, runId: string, inherited: GameState['facts'] = {}): GameState {
  return prepareMorning(createInitialGameState(seed, { runId, episodeId: content.episode.id,
    facts: { ...content.episode.initialFacts, ...inherited }, inheritedFacts: inherited }), content);
}
export function finalizeEpisode(state: GameState, world: WorldProfile, content: GameContent, completedAt: string) {
  if (state.phase !== 'ending' && state.phase !== 'boundary') throw new Error('Only a completed episode can be archived');
  const ending = pickEnding(state, content);
  const exists = world.archive.some(s => s.episodeId === state.episodeId && s.runId === state.runId);
  const summary = { schemaVersion: 1, episodeId: state.episodeId, runId: state.runId, endingId: ending.id,
    facts: { ...state.facts }, completedAt, ...(state.declaredIntention ? { declaredIntention: state.declaredIntention } : {}) };
  return { active: { ...state, summaryCommitted: true }, world: { ...world,
    archive: exists ? world.archive : [...world.archive, summary],
    selectedRunByEpisode: world.selectedRunByEpisode[state.episodeId] ? world.selectedRunByEpisode : { ...world.selectedRunByEpisode, [state.episodeId]: state.runId } } };
}
export function selectRun(world: WorldProfile, episodeId: string, runId: string): WorldProfile {
  if (!world.archive.some(s => s.episodeId === episodeId && s.runId === runId)) throw new Error('Unknown archived run');
  return { ...world, selectedRunByEpisode: { ...world.selectedRunByEpisode, [episodeId]: runId } };
}
