import { allChoices } from './variants';
import type { Card, Choice, Condition, GameContent, GameState, ObservableImpactEvent, ObservableImpactKind } from './types';

// WORLD-IMPACT v1. Nothing here changes the game: the graph and the observer only read content and history.
// A consequence is real only when the hero can see it, so the static graph says what COULD be seen and the observer
// says what WAS shown. Both are built from the same authored data: facts, flags, schedule, Trace.readers and the variants.

export type ChoiceKey = string;
export const choiceKey = (cardId: string, choiceId: string): ChoiceKey => `${cardId}/${choiceId}`;

/** A single thing in a condition that an earlier decision can have caused. Conditions about resources, days, etc. are not decisions. */
export type DecisionAtom = { fact: string; equals: string | boolean } | { flag: string } | { chose: { card: string; choice: string } };

/** Atoms of a condition that a decision could satisfy. `not` is skipped: absence is not something a decision visibly produces. */
export function decisionAtoms(condition: Condition | undefined): DecisionAtom[] {
  if (!condition) return [];
  if ('all' in condition) return condition.all.flatMap(decisionAtoms);
  if ('any' in condition) return condition.any.flatMap(decisionAtoms);
  if ('not' in condition) return [];
  if ('fact' in condition) return [{ fact: condition.fact, equals: condition.equals }];
  if ('flag' in condition) return [{ flag: condition.flag }];
  if ('chose' in condition) return [{ chose: condition.chose }];
  return [];
}

/** Atoms that actually hold in `state` for a condition that holds as a whole (an `any` contributes only its true branches). */
export function trueDecisionAtoms(condition: Condition | undefined, holds: (c: Condition) => boolean): DecisionAtom[] {
  if (!condition) return [];
  if ('all' in condition) return condition.all.flatMap(c => trueDecisionAtoms(c, holds));
  if ('any' in condition) return condition.any.filter(holds).flatMap(c => trueDecisionAtoms(c, holds));
  if ('not' in condition) return [];
  return decisionAtoms(condition);
}

const choicesOf = (content: GameContent, cardId: string): Choice[] => {
  const card = content.cards.find(c => c.id === cardId);
  return card ? allChoices(card) : [];
};
/**
 * An opportunity that runs out writes its `expiredValue` by itself. The decisions that let it run out are the ones made on its own
 * scenes that do not take it: the world's answer to them is that expiry.
 */
function decliners(content: GameContent, atom: DecisionAtom): { cardId: string; choiceId: string }[] {
  if (!('fact' in atom)) return [];
  return content.episode.opportunities.filter(o => o.resolvedFact === atom.fact && o.expiredValue === atom.equals)
    .flatMap(o => o.cardIds.flatMap(cardId => choicesOf(content, cardId).filter(ch => ch.effects.setFacts?.[o.resolvedFact] !== o.takenValue).map(ch => ({ cardId, choiceId: ch.id }))));
}
const writes = (choice: Choice, atom: DecisionAtom): boolean =>
  'fact' in atom ? choice.effects.setFacts?.[atom.fact] === atom.equals
    : 'flag' in atom ? !!choice.effects.setFlags?.includes(atom.flag) : false;

export type ImpactVia = 'text' | 'choices' | 'visual' | 'requires' | 'schedule' | 'trace' | 'daytext';
export interface ImpactReader {
  /** Card that shows the trace; a day text is `daytext:<id>`. */
  readerId: string;
  /** What the hero sees there, summed over every way the card reads the decision. */
  kinds: Set<ObservableImpactKind>;
  via: Set<ImpactVia>;
}
export interface ImpactGraph {
  /** All consequences of every decision, one entry per reading card. */
  byChoice: Map<ChoiceKey, ImpactReader[]>;
}

/**
 * The static influence graph, derived only from existing content: what each choice writes, schedules or traces, and which
 * variants (text, choices, visual), conditions and evening texts read it. No list of consequences is authored anywhere.
 */
export function buildImpactGraph(content: GameContent): ImpactGraph {
  const byChoice = new Map<ChoiceKey, Map<string, ImpactReader>>();
  const character = (id: string) => content.cards.find(c => c.id === id)?.character;
  const add = (sourceCardId: string, sourceChoiceId: string, readerId: string, readerCharacter: string | undefined,
    via: ImpactVia, kinds: ObservableImpactKind[]) => {
    const key = choiceKey(sourceCardId, sourceChoiceId);
    const readers = byChoice.get(key) ?? new Map<string, ImpactReader>();
    byChoice.set(key, readers);
    const reader = readers.get(readerId) ?? { readerId, kinds: new Set<ObservableImpactKind>(), via: new Set() };
    readers.set(readerId, reader);
    reader.via.add(via);
    for (const k of kinds) reader.kinds.add(k);
    const src = character(sourceCardId);
    if (src && readerCharacter && src !== readerCharacter) reader.kinds.add('cross-character');
  };
  // Every (card, choice) that satisfies an atom, so a reading condition can be tied to the decisions behind it.
  const writersOf = (atom: DecisionAtom): { cardId: string; choiceId: string }[] => {
    if ('chose' in atom) return choicesOf(content, atom.chose.card).some(ch => ch.id === atom.chose.choice) ? [{ cardId: atom.chose.card, choiceId: atom.chose.choice }] : [];
    return [...content.cards.flatMap(card => allChoices(card).filter(ch => writes(ch, atom)).map(ch => ({ cardId: card.id, choiceId: ch.id }))),
      ...decliners(content, atom)];
  };
  const reads = (condition: Condition | undefined, readerId: string, readerCharacter: string | undefined, via: 'text' | 'choices' | 'visual' | 'requires' | 'daytext', kind: ObservableImpactKind) => {
    for (const atom of decisionAtoms(condition)) for (const w of writersOf(atom)) add(w.cardId, w.choiceId, readerId, readerCharacter, via, [kind]);
  };
  for (const card of content.cards) {
    for (const v of card.textVariants ?? []) reads(v.when, card.id, card.character, 'text', 'callback');
    for (const v of card.choiceVariants ?? []) reads(v.when, card.id, card.character, 'choices', 'choice');
    for (const v of card.visualVariants ?? []) reads(v.when, card.id, card.character, 'visual', 'visual');
    // A scene that exists only after a decision is a delayed result of it.
    reads(card.requires, card.id, card.character, 'requires', 'delayed');
    for (const ch of allChoices(card)) for (const s of ch.effects.schedule ?? []) {
      const target = content.cards.find(c => c.id === s.cardId);
      if (target) add(card.id, ch.id, target.id, target.character, 'schedule', ['delayed']);
    }
  }
  for (const text of content.dayTexts) for (const v of text.textVariants ?? []) if (text.part === 'evening') reads(v.when, `daytext:${text.id}`, undefined, 'daytext', 'callback');
  for (const t of content.traces) for (const r of t.readers) if (r.kind === 'card') {
    const target = content.cards.find(c => c.id === r.id);
    if (target) add(t.source.cardId, t.source.choiceId, target.id, target.character, 'trace', ['callback']);
  }
  return { byChoice: new Map([...byChoice].map(([k, readers]) => [k, [...readers.values()]])) };
}

export interface ImpactSummary { count: number; kinds: Set<ObservableImpactKind>; readers: ImpactReader[] }
export function impactOf(graph: ImpactGraph, cardId: string, choiceId: string): ImpactSummary {
  const readers = graph.byChoice.get(choiceKey(cardId, choiceId)) ?? [];
  return { count: readers.length, kinds: new Set(readers.flatMap(r => [...r.kinds])), readers };
}

/**
 * Can the condition ever hold? Value-level: `fact = v` needs the initial value or a choice (or an opportunity outcome) writing it.
 * Anything that is not a decision (days, resources, qualities) is assumed reachable; `not` is assumed reachable too.
 */
export function conditionReachable(content: GameContent, condition: Condition | undefined): boolean {
  if (!condition) return true;
  if ('all' in condition) return condition.all.every(c => conditionReachable(content, c));
  if ('any' in condition) return condition.any.some(c => conditionReachable(content, c));
  if ('fact' in condition) {
    const def = content.factsSchema[condition.fact];
    if (!def) return false;
    if (def.initial === condition.equals) return true;
    if (content.episode.opportunities.some(o => o.resolvedFact === condition.fact && (o.takenValue === condition.equals || o.expiredValue === condition.equals))) return true;
    return content.cards.some(card => allChoices(card).some(ch => ch.effects.setFacts?.[condition.fact] === condition.equals));
  }
  if ('flag' in condition) {
    return content.cards.some(card => allChoices(card).some(ch => ch.effects.setFlags?.includes(condition.flag))) ||
      content.insights.some(i => i.effects.setFlags?.includes(condition.flag)) || /^observed_shadow_/.test(condition.flag);
  }
  if ('chose' in condition) return choicesOf(content, condition.chose.card).some(ch => ch.id === condition.chose.choice);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Runtime observation: what was actually put in front of the hero.
// ---------------------------------------------------------------------------------------------
type HistoryItem = GameState['history'][number];

/**
 * The decision in `history` behind an atom: the exact choice for `chose`, the latest choice that set the fact (to that value)
 * or the flag. Opportunity outcomes that nobody chose have no decision and are reported separately.
 */
export function sourceOfAtom(content: GameContent, history: HistoryItem[], atom: DecisionAtom, facts?: GameState['facts']): HistoryItem | undefined {
  if ('chose' in atom) return history.find(h => h.cardId === atom.chose.card && h.choiceId === atom.chose.choice);
  if ('fact' in atom && !content.cards.some(card => allChoices(card).some(ch => ch.effects.setFacts?.[atom.fact] === atom.equals))) {
    // Only an expired opportunity can give this value: the latest decision that let it run out is its source, when the fact really holds it.
    if (facts?.[atom.fact] !== atom.equals) return undefined;
    const declined = new Set(decliners(content, atom).map(d => choiceKey(d.cardId, d.choiceId)));
    return [...history].reverse().find(h => declined.has(choiceKey(h.cardId, h.choiceId)));
  }
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]!;
    const ch = choicesOf(content, h.cardId).find(c => c.id === h.choiceId);
    if (!ch) continue;
    if ('fact' in atom) {
      const value = ch.effects.setFacts?.[atom.fact];
      if (value !== undefined) return value === atom.equals ? h : undefined;
    } else {
      if (ch.effects.setFlags?.includes(atom.flag)) return h;
      if (ch.effects.clearFlags?.includes(atom.flag)) return undefined;
    }
  }
  return undefined;
}

export interface ShownScene {
  card: Card; day: number; variantId?: string; choices: Choice[]; visualVariantId?: string;
  /** The facts at the moment of the presentation (needed to attribute an opportunity that ran out). */
  facts?: GameState['facts'];
}
/** A variant of the card the hero was shown, if it was the choice variant (the pair differs from the base pair). */
function shownChoiceVariant(card: Card, choices: Choice[]) {
  const ids = choices.map(c => c.id).join('|');
  if (ids === card.choices.map(c => c.id).join('|')) return undefined;
  return card.choiceVariants?.find(v => v.choices.map(c => c.id).join('|') === ids);
}

/**
 * Observable impacts of one presented scene, derived from the history before it. Only what was shown counts: the text variant
 * that was chosen, the choice variant that was offered, the image variant that was drawn, a scheduled follow-up that arrived,
 * a card a Trace says reads the decision, a scene that exists only because of a decision.
 */
export function observeScene(content: GameContent, history: HistoryItem[], scene: ShownScene, holds: (c: Condition) => boolean): ObservableImpactEvent[] {
  const { card } = scene;
  const found = new Map<string, { source: HistoryItem; kinds: Set<ObservableImpactKind> }>();
  const note = (source: HistoryItem | undefined, kind: ObservableImpactKind) => {
    if (!source) return;
    const key = choiceKey(source.cardId, source.choiceId);
    const entry = found.get(key) ?? { source, kinds: new Set<ObservableImpactKind>() };
    found.set(key, entry);
    entry.kinds.add(kind);
  };
  const through = (condition: Condition | undefined, kind: ObservableImpactKind) => {
    for (const atom of trueDecisionAtoms(condition, holds)) note(sourceOfAtom(content, history, atom, scene.facts), kind);
  };
  const variant = scene.variantId ? card.textVariants?.find(v => v.id === scene.variantId) : undefined;
  if (variant) through(variant.when, 'callback');
  const cv = shownChoiceVariant(card, scene.choices);
  if (cv) through(cv.when, 'choice');
  const visual = scene.visualVariantId ? card.visualVariants?.find(v => v.id === scene.visualVariantId) : undefined;
  if (visual) through(visual.when, 'visual');
  through(card.requires, 'delayed');
  // A scheduled follow-up: the latest decision that scheduled this card since it was last shown.
  const lastShown = history.reduce((d, h) => h.cardId === card.id ? Math.max(d, h.day) : d, 0);
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]!;
    if (h.day < lastShown) break;
    const ch = choicesOf(content, h.cardId).find(c => c.id === h.choiceId);
    const s = ch?.effects.schedule?.find(x => x.cardId === card.id && h.day + x.inDays <= scene.day);
    if (s) { note(h, 'delayed'); break; }
  }
  for (const t of content.traces) {
    if (!t.readers.some(r => r.kind === 'card' && r.id === card.id)) continue;
    note(history.find(h => h.cardId === t.source.cardId && h.choiceId === t.source.choiceId), 'callback');
  }
  return [...found.values()].map(({ source, kinds }) => {
    const sourceCharacter = content.cards.find(c => c.id === source.cardId)?.character;
    const cross = !!sourceCharacter && !!card.character && sourceCharacter !== card.character;
    return { sourceCardId: source.cardId, sourceChoiceId: source.choiceId, day: scene.day, visibleCardId: card.id,
      kinds: [...kinds, ...(cross ? ['cross-character' as const] : [])], sourceDay: source.day,
      ...(sourceCharacter ? { sourceCharacter } : {}), ...(card.character ? { visibleCharacter: card.character } : {}) };
  });
}

/**
 * Evening texts that were shown (observations of kind 'variant' naming a day text variant) and the decisions behind them.
 * The state of that evening is gone, so a branch of an `any` counts when a decision stands behind it. An opportunity that ran
 * out unanswered has no decision: it is reported with the pseudo source `opportunity:<id>`.
 */
export function observeEveningTexts(content: GameContent, state: GameState): ObservableImpactEvent[] {
  const events: ObservableImpactEvent[] = [];
  for (const o of state.observations) {
    if (o.kind !== 'variant') continue;
    const text = content.dayTexts.find(t => t.part === 'evening' && t.day === o.day && t.textVariants?.some(v => v.id === o.id));
    const variant = text?.textVariants?.find(v => v.id === o.id);
    if (!text || !variant) continue;
    const history = state.history.filter(h => h.day <= o.day);
    const backed = (c: Condition) => { const atoms = decisionAtoms(c); return atoms.length > 0 && atoms.every(a => !!sourceOfAtom(content, history, a, state.facts)); };
    const found = new Map<string, HistoryItem>();
    for (const atom of trueDecisionAtoms(variant.when, backed)) {
      const source = sourceOfAtom(content, history, atom, state.facts);
      if (source) found.set(choiceKey(source.cardId, source.choiceId), source);
      else if ('fact' in atom) {
        const opportunity = content.episode.opportunities.find(x => x.resolvedFact === atom.fact && x.expiredValue === atom.equals);
        if (opportunity && state.opportunityState[opportunity.id] === 'expired')
          events.push({ sourceCardId: `opportunity:${opportunity.id}`, sourceChoiceId: 'expired', day: o.day, visibleCardId: `daytext:${text.id}`, kinds: ['delayed'], sourceDay: opportunity.throughDay });
      }
    }
    for (const source of found.values()) {
      const sourceCharacter = content.cards.find(c => c.id === source.cardId)?.character;
      events.push({ sourceCardId: source.cardId, sourceChoiceId: source.choiceId, day: o.day, visibleCardId: `daytext:${text.id}`,
        kinds: ['callback'], sourceDay: source.day, ...(sourceCharacter ? { sourceCharacter } : {}) });
    }
  }
  return events;
}
