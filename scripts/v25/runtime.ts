import type { Card, Choice, Condition, DecisionKind, DevelopmentBeat, DevelopmentContent, Effects, LifeFacet, Trace } from '../../src/engine/types';
import type { ParsedPackage, SourceChoice } from './parse-package';

// The mechanical half of the v2.5 build: package structure (ids, order, vectors, roles, events, requires) × a world "skin" (text, labels, effects, responses)
// → runtime cards. The skin never touches a vector, an id or an event, so rewriting the world cannot change the diagnostic mathematics.
export interface ChoiceSkin { label: string; response: string; effects?: Effects; servesFacets?: LifeFacet[]; decisionKinds?: DecisionKind[] }
export interface SceneSkin { text: string; character?: string; choices: Record<string, ChoiceSkin>; motive?: { text: string; options: Record<string, { label: string }> } }
export interface DevSkin { text: string; character?: string; choices: Record<string, ChoiceSkin>; dayGte?: number }
export interface ArcSkin { ability: string; question: string; promotionText: string; spacing?: Partial<Record<DevelopmentBeat, [decisions: number, evenings: number]>> }
export interface Skin {
  neutral: Record<string, SceneSkin>; behaviors: Record<string, SceneSkin>; probes: Record<string, SceneSkin>;
  development: Record<string, DevSkin>; arcs: Record<string, ArcSkin>;
}
export interface RuntimeContent { neutral: Card[]; probes: Card[]; development: Card[]; traces: Trace[]; arcs: DevelopmentContent['arcs'] }

/** Ordinary decisions OR completed evenings between a beat and the next one. A retry always waits for 2 decisions or 1 evening (handoff §12.3). */
export const DEFAULT_SPACING: Record<DevelopmentBeat, [number, number]> = { trial: [0, 0], consequence: [1, 1], review: [1, 1], transfer: [2, 1], pressure: [2, 1] };
export const RETRY_COOLDOWN: [number, number] = [2, 1];
export const BEAT_ORDER: readonly DevelopmentBeat[] = ['trial', 'consequence', 'review', 'transfer', 'pressure'];
/** Days between an owner scene and its behavior continuation; must stay inside the case window (3 days by default). */
/** Draw weight of a neutral scene in the free pool (an ordinary situation weighs 3): how much of the early days diagnostics may take from the story. */
export const NEUTRAL_WEIGHT = Number(process.env.V25_NEUTRAL_WEIGHT ?? 3);
export const BEHAVIOR_DELAY_DAYS = 2;
/** The last day an owner of a behavior continuation can be shown: its follow-up must still fit in the calendar. */
export const lastOwnerDay = (episodeDays: number) => episodeDays - BEHAVIOR_DELAY_DAYS;
/**
 * Neutral scenes wait for day 2: measured on the real calendar, letting them fill day 1 as well pushes the chapter-1 story scenes below half of the plays
 * (the "ordinary scenes" rule of `npm run simulate`) while the first center stays at median day 10 (P90 13). Calendar only, never the profile.
 */
export const NEUTRAL_FROM_DAY = 2;
export function neutralRequires(hasContinuation: boolean, episodeDays: number): Condition {
  return hasContinuation ? { all: [{ dayGte: NEUTRAL_FROM_DAY }, { dayLte: lastOwnerDay(episodeDays) }] } : { dayGte: NEUTRAL_FROM_DAY };
}

const beatIs = (arc: string, beat: DevelopmentBeat, is: 'done' | 'open' | 'withdrawn'): Condition => ({ developmentBeat: { arc, beat, is } });
const since = (arc: string, beat: DevelopmentBeat, of: 'done' | 'withdrawal', [decisions, evenings]: [number, number]): Condition => ({ developmentSince: { arc, beat, of, decisions, evenings } });
export function developmentRequires(arc: string, beat: DevelopmentBeat, retry: boolean, spacing: Record<DevelopmentBeat, [number, number]>, dayGte?: number): Condition {
  const prev = BEAT_ORDER[BEAT_ORDER.indexOf(beat) - 1];
  const all: Condition[] = retry ? [beatIs(arc, beat, 'withdrawn'), since(arc, beat, 'withdrawal', RETRY_COOLDOWN)]
    : [...(prev ? [beatIs(arc, prev, 'done')] : []), beatIs(arc, beat, 'open'), ...(prev ? [since(arc, prev, 'done', spacing[beat])] : []), ...(dayGte ? [{ dayGte } as Condition] : [])];
  return { all };
}

const need = <T>(map: Record<string, T>, id: string, what: string): T => { const v = map[id]; if (!v) throw new Error(`skin is missing ${what} ${id}`); return v; };
const signal = (c: SourceChoice) => ({ vector: { ...c.vector }, rationale: { ...c.rationale }, scoringVersion: '1' as const, rubricVersion: '1' as const });
function choiceOf(src: SourceChoice, skin: ChoiceSkin, facets: LifeFacet[], extra: Partial<Choice>): Choice {
  return { id: src.slug ?? src.id, label: skin.label, effects: { ...(skin.effects ?? {}) }, servesFacets: skin.servesFacets ?? facets, ...(skin.decisionKinds ? { decisionKinds: skin.decisionKinds } : {}), ...extra };
}

export type Section = 'neutral' | 'probes' | 'development';
export const ALL_SECTIONS: readonly Section[] = ['neutral', 'probes', 'development'];
/** `sections` lets the content be merged in batches: each batch is built, checked for parity and shipped on its own. */
export function buildRuntime(src: ParsedPackage, skin: Skin, episodeDays = 30, sections: readonly Section[] = ALL_SECTIONS): RuntimeContent {
  const traces: Trace[] = [];
  const trace = (cardId: string, choiceId: string, response: string) =>
    traces.push({ source: { cardId, choiceId }, readers: [{ kind: 'text', id: `choice:${cardId}/${choiceId}` }], response });
  const neutral: Card[] = [];
  for (const s of sections.includes('neutral') ? src.neutral : []) {
    const sk = need(skin.neutral, s.id, 'neutral scene'); const facets = s.facets as LifeFacet[];
    const motive = src.motives.find(m => m.situationId === s.id); const follow = src.behaviors.find(b => b.continuesSituationId === s.situationId);
    neutral.push({ id: s.id, chapter: 'any', type: 'situation', facets, ...(NEUTRAL_WEIGHT !== 3 ? { weight: NEUTRAL_WEIGHT } : {}), ...(sk.character ? { character: sk.character } : {}), text: sk.text,
      // Calendar only, never the hero's profile: not on the very first day, and an owner is shown early enough for its continuation to arrive.
      requires: neutralRequires(!!follow, episodeDays),
      choices: s.choices.map(c => {
        const cs = need(sk.choices, c.id, `choice ${s.id}/`);
        trace(s.id, c.id, cs.response);
        return choiceOf(c, cs, facets, { diagnosticAction: signal(c),
          ...(follow ? { effects: { ...(cs.effects ?? {}), schedule: [{ cardId: follow.id, inDays: BEHAVIOR_DELAY_DAYS }] } } : {}),
          ...(motive && sk.motive ? { diagnosticMotive: { promptId: `${s.id}.motive`, text: sk.motive.text, optional: true as const,
            options: motive.options.map(o => ({ id: o.id, label: need(sk.motive!.options, o.id, `motive option ${s.id}/`).label, signal: signal(o) })) } } : {}) });
      }),
      diagnostic: { situationId: s.situationId, contextId: s.contextId, facets, developmentWeight: s.developmentWeight, ...(s.pressure ? { pressure: true } : {}) } });
  }
  for (const b of sections.includes('neutral') ? src.behaviors : []) {
    const sk = need(skin.behaviors, b.id, 'behavior scene'); const facets = b.facets as LifeFacet[];
    neutral.push({ id: b.id, chapter: 'any', type: 'chain', facets, ...(sk.character ? { character: sk.character } : {}), text: sk.text,
      choices: b.choices.map(c => { const cs = need(sk.choices, c.id, `choice ${b.id}/`); trace(b.id, c.id, cs.response);
        return choiceOf(c, cs, facets, { diagnosticBehavior: { continuesSituationId: b.continuesSituationId, signal: signal(c) } }); }) });
  }
  const probes: Card[] = (sections.includes('probes') ? src.probes : []).map(p => {
    const sk = need(skin.probes, p.id, 'probe'); const facets = p.facets as LifeFacet[];
    return { id: p.id, chapter: 'any', type: 'situation', facets, ...(sk.character ? { character: sk.character } : {}), text: sk.text, tags: ['probe-only'],
      choices: p.choices.map(c => { const cs = need(sk.choices, c.slug!, `choice ${p.id}/`); trace(p.id, c.slug!, cs.response); return choiceOf(c, cs, facets, { diagnosticAction: signal(c) }); }),
      diagnostic: { situationId: p.id, contextId: p.contextId, facets, developmentWeight: p.developmentWeight, distinguishes: [...p.distinguishes] } };
  });
  const devSource = sections.includes('development') ? src.development : [];
  const arcIds = [...new Set(devSource.map(c => c.arcId))];
  const arcs: DevelopmentContent['arcs'] = arcIds.map(id => {
    const first = devSource.find(c => c.arcId === id)!; const a = need(skin.arcs, id, 'arc');
    return { id, from: first.from, to: first.to, model: 'beats', ability: a.ability, question: a.question, cycles: [], minContexts: 2, promotionText: a.promotionText };
  });
  const development: Card[] = devSource.map(d => {
    const sk = need(skin.development, d.id, 'development card'); const arc = skin.arcs[d.arcId]!;
    const spacing = { ...DEFAULT_SPACING, ...(arc.spacing ?? {}) } as Record<DevelopmentBeat, [number, number]>;
    return { id: d.id, chapter: 'any', type: 'situation', facets: [d.facet as LifeFacet], ...(sk.character ? { character: sk.character } : {}), text: sk.text,
      ...(d.retry ? { once: false } : {}), requires: developmentRequires(d.arcId, d.beat as DevelopmentBeat, d.retry, spacing, d.beat === 'trial' && !d.retry ? sk.dayGte : undefined),
      development: { stages: [d.from], arcId: d.arcId },
      choices: d.choices.map(c => { const cs = need(sk.choices, c.id, `choice ${d.id}/`); trace(d.id, c.id, cs.response);
        return { id: c.id, label: cs.label, effects: { ...(cs.effects ?? {}) }, servesFacets: cs.servesFacets ?? [d.facet as LifeFacet], ...(cs.decisionKinds ? { decisionKinds: cs.decisionKinds } : {}),
          ...(c.event ? { developmentEvents: [{ eventId: `${d.id}:${c.id}`, arcId: d.arcId, contextId: d.contextId, kind: c.event === 'withdrawal' ? 'withdrawal' as const : d.beat as DevelopmentBeat, ...(c.event === 'withdrawal' ? { beat: d.beat as DevelopmentBeat } : {}) }] } : {}) } as Choice; }) };
  });
  return { neutral, probes, development, traces, arcs };
}

/** Test and tooling stand-in: structure-complete runtime content with placeholder world text. Never shipped. */
export function placeholderSkin(src: ParsedPackage): Skin {
  const choices = (cs: { id: string; slug?: string }[], tag: string): Record<string, ChoiceSkin> =>
    Object.fromEntries(cs.map(c => [c.slug ?? c.id, { label: `${tag}/${c.slug ?? c.id}`, response: `Отклик ${tag}/${c.slug ?? c.id}` }]));
  const scene = (id: string, cs: { id: string; slug?: string }[]): SceneSkin => ({ text: `Сцена ${id}`, choices: choices(cs, id) });
  return {
    neutral: Object.fromEntries(src.neutral.map(s => {
      const motive = src.motives.find(m => m.situationId === s.id);
      return [s.id, { ...scene(s.id, s.choices), ...(motive ? { motive: { text: `Вопрос ${s.id}`, options: Object.fromEntries(motive.options.map(o => [o.id, { label: `${s.id}/${o.id}` }])) } } : {}) }];
    })),
    behaviors: Object.fromEntries(src.behaviors.map(b => [b.id, scene(b.id, b.choices)])),
    probes: Object.fromEntries(src.probes.map(p => [p.id, scene(p.id, p.choices)])),
    development: Object.fromEntries(src.development.map(d => [d.id, scene(d.id, d.choices)])),
    arcs: Object.fromEntries([...new Set(src.development.map(d => d.arcId))].map(id => [id, { ability: `Способность ${id}`, question: `Вопрос ${id}`, promotionText: `Итог ${id}` }]))
  };
}
