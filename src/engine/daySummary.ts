import { hashSeed } from './rng';
import { choiceById } from './variants';
import type {
  ActionLogic, Choice, DayEcho, DaySummary, DevelopmentProfileEveningSnapshot, GameContent, GameState, ReflectionCase, SummarySource, ThreadFollowUp
} from './types';

/**
 * Day Reflection (REQs/DAY-REFLECTION-v1.md). A deterministic projection of what the day already proved:
 * choices, observations, opportunities, the schedule and the evening profile snapshot. It decides nothing about the hero,
 * and nothing in the engine reads the result back.
 */
export const MAX_WORLD_CHANGES = 3;
export const MAX_UNFINISHED = 2;

interface Entry { day: number; slot: number; cardId: string; choiceId: string; choice?: Choice }
type ChangeCandidate = { source: SummarySource; templateId: string; texts: string[]; priority: number; slot: number; group: string };
type UnfinishedCandidate = { threadId: string; source: SummarySource; promise: 'firm' | 'soft'; templateId: string; texts: string[]; group: string };

function todaysEntries(state: GameState, content: GameContent): Entry[] {
  return state.history.filter(h => h.day === state.day).map(h => {
    const card = content.cards.find(c => c.id === h.cardId);
    const choice = card && choiceById(card, h.choiceId);
    return { day: h.day, slot: h.slot, cardId: h.cardId, choiceId: h.choiceId, ...(choice ? { choice } : {}) };
  });
}
const choiceSource = (e: Entry): SummarySource => ({ kind: 'choice', day: e.day, slot: e.slot, cardId: e.cardId, choiceId: e.choiceId });

/** A promise is firm only if the card is already scheduled, required and has a latest day: the engine then refuses to skip it. */
function firmEntry(state: GameState, content: GameContent, follow: ThreadFollowUp) {
  const entry = state.scheduled.find(s => s.cardId === follow.cardId);
  const card = content.cards.find(c => c.id === follow.cardId);
  return entry && card?.required && entry.latestDay !== undefined ? entry : undefined;
}

function pick(state: GameState, content: GameContent, group: string, texts: string[]): string {
  const rules = content.summaryTemplates.rulesVersion;
  return texts[hashSeed(state.seed, state.runId, state.day, group, rules) % texts.length]!;
}

function worldChangeCandidates(state: GameState, content: GameContent, entries: Entry[]): ChangeCandidate[] {
  const out: ChangeCandidate[] = [];
  const covered = new Set<string>();
  for (const t of content.summaryTemplates.changes) {
    if ('observation' in t.source) {
      const want = t.source.observation;
      const o = state.observations.find(x => x.day === state.day && x.kind === want.kind && x.id === want.id);
      if (o) out.push({ source: { kind: 'observation', day: o.day, slot: o.slot, observationKind: o.kind as 'trace' | 'opportunity' | 'variant', id: o.id }, templateId: t.id, texts: t.texts, priority: t.priority, slot: o.slot, group: t.id });
    } else if ('insight' in t.source) {
      const id = t.source.insight;
      if (state.journal.some(j => j.day === state.day && j.kind === 'insight' && j.id === id))
        out.push({ source: { kind: 'insight', day: state.day, id }, templateId: t.id, texts: t.texts, priority: t.priority, slot: state.slot, group: t.id });
    } else {
      const { cardId, choiceId, fact } = t.source;
      const e = entries.find(x => x.cardId === cardId && x.choiceId === choiceId);
      // A fact overwritten later the same day is no longer what the world looks like tonight; the choice the evening text already tells is not told twice.
      if (!e || (fact && state.facts[fact.key] !== fact.value) || `${cardId}/${choiceId}` === state.eveningPrimaryId) continue;
      covered.add(`${e.cardId}/${e.choiceId}`);
      out.push({ source: choiceSource(e), templateId: t.id, texts: t.texts, priority: t.priority, slot: e.slot, group: t.id });
    }
  }
  for (const thread of content.threads) {
    if (thread.kind !== 'opportunity') continue;
    const o = content.episode.opportunities.find(x => x.id === thread.opportunityId);
    if (!o) continue;
    const expired = state.observations.find(x => x.day === state.day && x.kind === 'opportunity' && x.id === o.id);
    if (expired)
      out.push({ source: { kind: 'observation', day: expired.day, slot: expired.slot, observationKind: 'opportunity', id: o.id }, templateId: `thread.${thread.id}.abandoned`, texts: thread.texts.abandoned, priority: 5, slot: expired.slot, group: thread.id });
    else if (state.opportunityState[o.id] === 'taken') {
      const e = entries.find(x => x.choice?.effects.setFacts?.[o.resolvedFact] === o.takenValue);
      if (e) out.push({ source: choiceSource(e), templateId: `thread.${thread.id}.resolved`, texts: thread.texts.resolved, priority: 5, slot: e.slot, group: thread.id });
    }
  }
  // The authored response of a choice is already a proven consequence; it fills what the templates leave free.
  for (const o of state.observations) {
    if (o.day !== state.day || o.kind !== 'trace' || !o.text || o.id === state.eveningPrimaryId || covered.has(o.id)) continue;
    out.push({ source: { kind: 'observation', day: o.day, slot: o.slot, observationKind: 'trace', id: o.id }, templateId: 'observation.trace', texts: [o.text], priority: 0, slot: o.slot, group: `trace:${o.id}` });
  }
  return out;
}

function unfinishedCandidates(state: GameState, content: GameContent, entries: Entry[]): UnfinishedCandidate[] {
  const out: UnfinishedCandidate[] = [];
  const day = state.day;
  const follow = (threadId: string, f: ThreadFollowUp, soft: string[], openedBy: Entry | undefined) => {
    const firm = firmEntry(state, content, f);
    if (firm && (openedBy || firm.day === day + 1)) {
      const tomorrow = firm.day === day + 1 && f.tomorrowTexts?.length ? f.tomorrowTexts : f.firmTexts;
      if (tomorrow.length)
        out.push({ threadId, source: { kind: 'scheduled', cardId: f.cardId, day: firm.day, ...(firm.latestDay !== undefined ? { latestDay: firm.latestDay } : {}) }, promise: 'firm',
          templateId: `thread.${threadId}.${tomorrow === f.tomorrowTexts ? 'tomorrow' : 'firm'}`, texts: tomorrow, group: threadId });
    } else if (openedBy && soft.length)
      out.push({ threadId, source: choiceSource(openedBy), promise: 'soft', templateId: `thread.${threadId}.soft`, texts: soft, group: threadId });
  };
  for (const thread of content.threads) {
    if (thread.kind === 'fact') {
      const value = state.facts[thread.fact];
      if (value === undefined || thread.stages[String(value)] !== 'open') continue;
      const openedBy = [...entries].reverse().find(e => e.choice?.effects.setFacts?.[thread.fact] === value);
      if (thread.followUp) follow(thread.id, thread.followUp, thread.texts.open, openedBy);
      else if (openedBy && thread.texts.open.length)
        out.push({ threadId: thread.id, source: choiceSource(openedBy), promise: 'soft', templateId: `thread.${thread.id}.soft`, texts: thread.texts.open, group: thread.id });
    } else if (thread.kind === 'chain') {
      if (!state.scheduled.some(s => s.cardId === thread.followUp.cardId)) continue;
      const openedBy = [...entries].reverse().find(e => e.choice?.effects.schedule?.some(s => s.cardId === thread.followUp.cardId));
      follow(thread.id, thread.followUp, thread.texts, openedBy);
    } else {
      const exposure = state.opportunityExposure[thread.opportunityId];
      if (state.opportunityState[thread.opportunityId] === 'open' && exposure?.day === day && thread.texts.open.length)
        out.push({ threadId: thread.id, source: { kind: 'exposure', day, opportunityId: thread.opportunityId }, promise: 'soft', templateId: `thread.${thread.id}.open`, texts: thread.texts.open, group: thread.id });
    }
  }
  return out;
}

/**
 * A literal reading of today's actions from authored labels: two or more decisions carrying the same observation id are "several situations";
 * decisions that all differ are "different". Needs at least two labelled decisions, otherwise it stays silent.
 */
export function echoOf(state: GameState, content: GameContent, entries: Entry[]): DayEcho | undefined {
  const t = content.summaryTemplates;
  const tagged = entries.flatMap(e => { const id = t.observed[`${e.cardId}/${e.choiceId}`]; return id ? [{ e, id }] : []; });
  if (tagged.length < 2) return undefined;
  const groups = new Map<string, Entry[]>();
  for (const x of tagged) groups.set(x.id, [...(groups.get(x.id) ?? []), x.e]);
  // The most repeated action wins; on a tie the later one, then the id, so the choice never depends on iteration order.
  const best = [...groups.entries()].filter(([, list]) => list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || b[1].at(-1)!.slot - a[1].at(-1)!.slot || a[0].localeCompare(b[0]))[0];
  const toSource = (e: Entry) => choiceSource(e) as Extract<SummarySource, { kind: 'choice' }>;
  if (best) {
    const obs = t.observations.find(o => o.id === best[0]);
    if (obs) return { kind: 'repeat', observationId: obs.id, sources: best[1].map(toSource), templateId: 'echo.repeat',
      text: pick(state, content, `echo.repeat.${obs.id}`, t.echo.repeat).replace('{action}', obs.text) };
  }
  return { kind: 'varied', sources: tagged.map(x => toSource(x.e)), templateId: 'echo.varied', text: pick(state, content, 'echo.varied', t.echo.varied) };
}

function reflectionOf(state: GameState, content: GameContent, snapshot: DevelopmentProfileEveningSnapshot, entries: Entry[]): DaySummary['reflection'] {
  const t = content.summaryTemplates.reflection;
  const previous = state.heroDevelopmentProfile.eveningSnapshots.find(s => s.day === state.day - 1);
  const lastDay = state.day >= content.episode.days;
  const status = snapshot.status;
  const candidate = snapshot.candidatePrimary;
  let kase: ReflectionCase; let templateId: string; let texts: string[];
  const logicText = (group: 'provisional' | 'stable', logic: ActionLogic) => { kase = group; templateId = `reflection.${group}.${logic}`; texts = t[group][logic]; };
  // The order is the rule: the first case that holds wins (REQs/DAY-REFLECTION-v1.md, 6.1).
  if (previous?.status === 'stable' && status !== 'stable') { kase = 'downgrade'; templateId = 'reflection.downgrade'; texts = t.downgrade; }
  else if (status === 'provisional' && previous?.candidatePrimary && previous.candidatePrimary !== candidate) { kase = 'refining'; templateId = 'reflection.refining'; texts = t.refining; }
  else if (lastDay && status !== 'stable') { kase = 'unsettled'; templateId = 'reflection.unsettled'; texts = t.unsettled; }
  else if (status === 'provisional' && candidate) logicText('provisional', candidate);
  else if (status === 'provisional') { kase = 'forming'; templateId = 'reflection.forming'; texts = t.forming; }
  else if (status === 'insufficient') { kase = 'just_started'; templateId = 'reflection.just_started'; texts = t.just_started; }
  else if (snapshot.observedPrimary) logicText('stable', snapshot.observedPrimary);
  else { kase = 'forming'; templateId = 'reflection.forming'; texts = t.forming; }
  // Only where the profile has nothing content-ful to say; with a candidate or a stable reading it speaks for itself.
  const echo = kase! === 'provisional' || kase! === 'stable' ? undefined : echoOf(state, content, entries);
  const transition = state.development.transitions.find(x => x.day === state.day);
  const promotion = transition ? content.development.arcs.find(a => a.id === transition.arcId)?.promotionText : undefined;
  return {
    status, ...(previous ? { previousStatus: previous.status } : {}), ...(previous?.candidatePrimary ? { previousCandidate: previous.candidatePrimary } : {}),
    coverage: snapshot.current.coverage, ...(candidate ? { candidate } : {}), ...(status === 'stable' && snapshot.observedPrimary ? { observed: snapshot.observedPrimary } : {}),
    case: kase!, templateId: templateId!, text: pick(state, content, templateId!, texts!), ...(echo ? { echo } : {}),
    ...(transition && promotion ? { transition: { arcId: transition.arcId, text: promotion } } : {})
  };
}

/** Call at the end of the evening preparation, after the profile has taken tonight's snapshot. */
export function buildDaySummary(state: GameState, content: GameContent): DaySummary {
  const snapshot = state.heroDevelopmentProfile.eveningSnapshots.find(s => s.day === state.day);
  if (!snapshot) throw new Error(`No evening profile snapshot for day ${state.day}`);
  const entries = todaysEntries(state, content);

  const seen = new Set<string>();
  const worldChanges = worldChangeCandidates(state, content, entries)
    .sort((a, b) => b.priority - a.priority || b.slot - a.slot)
    .filter(c => !seen.has(c.group) && !!seen.add(c.group))
    .slice(0, MAX_WORLD_CHANGES)
    .sort((a, b) => a.slot - b.slot || b.priority - a.priority)
    .map(c => ({ source: c.source, templateId: c.templateId, text: pick(state, content, c.group, c.texts) }));

  const unfinished = unfinishedCandidates(state, content, entries)
    .sort((a, b) => Number(b.promise === 'firm') - Number(a.promise === 'firm'))
    .slice(0, MAX_UNFINISHED)
    .map(c => ({ threadId: c.threadId, source: c.source, promise: c.promise, templateId: c.templateId, text: pick(state, content, c.group, c.texts) }));

  return {
    schema: 1, day: state.day, contentVersion: state.contentVersion, rulesVersion: content.summaryTemplates.rulesVersion,
    profileAlgorithmVersion: state.heroDevelopmentProfile.algorithmVersion,
    worldChanges, unfinished, reflection: reflectionOf(state, content, snapshot, entries)
  };
}
