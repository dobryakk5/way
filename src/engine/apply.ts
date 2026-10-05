import { recordDevelopmentChoice } from './development';
import { reconcileCrisisQueue, resolveCrisisCard } from './crises';
import { applyEffects } from './effects';
import { fairOutcome } from './endings';
import { advanceAfterResolvedChoice } from './navigation';
import { diagnosticCaseId, openDiagnosticCase, pendingMotiveFor, recordDiagnosticBehavior } from './heroDevelopmentProfile';
import { openOpportunities, resolveTakenOpportunities } from './opportunities';
import { choiceById } from './variants';
import type { GameContent, GameState } from './types';
export function applyChoice(state: GameState, content: GameContent, cardId: string, choiceId: string): GameState {
  // Stale UI events are harmless. A transition always consumes a persisted draw.
  if (state.phase !== 'slot' || state.current?.cardId !== cardId) return state;
  if (!state.current.choiceIds.includes(choiceId)) throw new Error('Choice is outside the presented choices');
  const card = content.cards.find(c => c.id === cardId);
  const choice = state.current.choices?.find(c => c.id === choiceId) ?? (card && choiceById(card, choiceId));
  if (!card || !choice) throw new Error('Unknown current card/choice');
  let next = applyEffects(state, choice.effects);
  for (const [key, value] of Object.entries(choice.effects.setFacts ?? {})) {
    if (!content.factsSchema[key]?.values.includes(value)) throw new Error(`Invalid fact ${key}`);
  }
  const schedule = [...next.scheduled];
  if (card.type === 'chain') {
    const i = schedule.findIndex(s => s.cardId === card.id && s.day <= state.day);
    if (i >= 0) schedule.splice(i, 1);
  }
  const trace = content.traces.find(t => t.source.cardId === cardId && t.source.choiceId === choiceId);
  const response = choice.response ?? trace?.response;
  next = { ...next, shown: { ...next.shown, [cardId]: [...(next.shown[cardId] ?? []), state.day] },
    scheduled: schedule, history: [...next.history, { day: state.day, slot: state.slot, cardId, choiceId, text: state.current.text, label: choice.label, facets: [...(choice.servesFacets ?? [])], decisionKinds: (choice.decisionKinds ?? []).filter(k=>k!=='pursue'||!!state.goal&&!!choice.pursuesGoals?.includes(state.goal.id)), ...(state.goal ? { goalId: state.goal.id } : {}), ...(response ? { response } : {}) }],
    observations: trace ? [...next.observations, { day: state.day, slot: state.slot, kind: 'trace', id: `${cardId}/${choiceId}`, text: trace.response }] : next.observations };
  if (choice.lineStep) next = { ...next, evidence: [...next.evidence,
    { day: state.day, slot: state.slot, cardId, choiceId, ...choice.lineStep }] };
  if (choice.response && !trace) next = { ...next, observations: [...next.observations,
    { day: state.day, slot: state.slot, kind: 'trace', id: `${cardId}/${choiceId}`, text: choice.response }] };
  if (card.type === 'crisis') next = resolveCrisisCard(next, card);
  next = resolveTakenOpportunities(openOpportunities(next, content), content);
  next = reconcileCrisisQueue(next, content);
  const milestone = content.episode.milestones.find(m => m.day === state.day && m.slot === state.slot);
  if (milestone && !next.milestones[milestone.id]) {
    const text = fairOutcome(next, content);
    next = { ...next, milestones: { ...next.milestones, [milestone.id]: { day: state.day, facts: { ...next.facts }, text } },
      observations: [...next.observations, { day: state.day, slot: state.slot, kind: 'trace', id: 'fair_result', text }] };
  }
  next = recordDevelopmentChoice(next, content, card, choice);
  // Diagnostics: a follow-up decision belongs to an old case; any other diagnostic choice opens a new one.
  const origin = state.current.selectionOrigin ?? 'neutral';
  if (choice.diagnosticBehavior) next = recordDiagnosticBehavior(next, content, card, choice, origin);
  else if (card.diagnostic && choice.diagnosticAction) next = openDiagnosticCase(next, content, card, choice, origin);
  delete next.current;
  delete next.activeRoute;
  const caseId = card.diagnostic ? diagnosticCaseId(next.runId, state.day, state.slot, card.id, choice.id, card.diagnostic.situationId) : undefined;
  const pending = caseId ? pendingMotiveFor(next, caseId, choice, state.slot === content.episode.slotsPerDay - 1 ? 'evening' : 'next-slot') : undefined;
  // The optional motive question is a pause before the slot moves on, never a second advance.
  if (pending) return { ...next, pendingMotive: pending, phase: 'motive' };
  return advanceAfterResolvedChoice(next, content);
}
