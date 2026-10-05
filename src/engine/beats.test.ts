import { describe, expect, it } from 'vitest';
import { play } from '../../scripts/play';
import { content } from '../content';
import { deriveBeatState } from './beats';
import { legacyAuthoredDevelopment, validateDevelopmentEvidence } from './development';
import { makeCard, makeContent } from './testUtils';
import type { Card, Choice, Condition, DevelopmentBeat, DevelopmentEvidence, DevelopmentEvent, GameContent, GameState } from './types';

// A synthetic beats arc: expert → achiever with one primary scene per beat and the retry scenes that the package prescribes.
const ARC = 'test-arc';
const beat = (arc: string, b: DevelopmentBeat, is: 'done' | 'open' | 'withdrawn'): Condition => ({ developmentBeat: { arc, beat: b, is } });
const since = (b: DevelopmentBeat, of: 'done' | 'withdrawal', decisions: number, evenings: number): Condition => ({ developmentSince: { arc: ARC, beat: b, of, decisions, evenings } });
const event = (eventId: string, kind: DevelopmentEvent['kind'], ctx: string, b?: DevelopmentBeat): DevelopmentEvent => ({ eventId, arcId: ARC, contextId: ctx, kind, ...(b ? { beat: b } : {}) });
const ch = (id: string, ev?: DevelopmentEvent): Choice => ({ id, label: id, effects: {}, servesFacets: ['work'], ...(ev ? { developmentEvents: [ev] } : {}) });
function devCard(id: string, requires: Condition[], ctx: string, target: DevelopmentEvent, withdrawsAt?: DevelopmentBeat, repeat = false): Card {
  return { ...makeCard({ id, type: 'situation', chapter: 'any', facets: ['work'] }), requires: { all: requires }, ...(repeat ? { once: false } : {}),
    development: { stages: ['expert'], arcId: ARC },
    choices: [ch('ok', target), ch('back', withdrawsAt ? event(`${id}:withdraw`, 'withdrawal', ctx, withdrawsAt) : undefined), ch('old')] };
}
const cards = (): Card[] => [
  devCard('d.trial', [beat(ARC, 'trial', 'open')], 'kiln', event('t', 'trial', 'kiln'), 'trial'),
  devCard('d.retry-trial', [beat(ARC, 'trial', 'withdrawn'), since('trial', 'withdrawal', 2, 1)], 'kiln', event('rt', 'trial', 'kiln'), 'trial', true),
  devCard('d.cons', [beat(ARC, 'trial', 'done'), beat(ARC, 'consequence', 'open'), since('trial', 'done', 1, 1)], 'kiln', event('c', 'consequence', 'kiln')),
  devCard('d.review', [beat(ARC, 'consequence', 'done'), beat(ARC, 'review', 'open')], 'inner', event('r', 'review', 'inner')),
  devCard('d.transfer', [beat(ARC, 'review', 'done'), beat(ARC, 'transfer', 'open'), since('review', 'done', 2, 1)], 'market', event('x', 'transfer', 'market'), 'transfer'),
  devCard('d.retry-transfer', [beat(ARC, 'transfer', 'withdrawn'), since('transfer', 'withdrawal', 2, 1)], 'market', event('rx', 'transfer', 'market'), 'transfer', true),
  devCard('d.pressure', [beat(ARC, 'transfer', 'done'), beat(ARC, 'pressure', 'open'), since('transfer', 'done', 1, 1)], 'deadline', event('p', 'pressure', 'deadline'), 'pressure'),
  devCard('d.retry-pressure', [beat(ARC, 'pressure', 'withdrawn'), since('pressure', 'withdrawal', 2, 1)], 'deadline', event('rp', 'pressure', 'deadline'), 'pressure', true)
];
const fillers = (): Card[] => Array.from({ length: 24 }, (_, i) => ({ ...makeCard({ id: `life${i}`, type: 'routine', chapter: 'any', facets: ['work'] }), once: false, cooldownDays: 3 }));
function fixture(developmentArcs = true): GameContent {
  return makeContent({ cards: [...cards(), ...fillers()],
    development: { stages: content.development.stages, arcs: [{ id: ARC, from: 'expert', to: 'achiever', model: 'beats', ability: 'a', question: 'q', cycles: [], minContexts: 2, promotionText: 'p' }] },
    profile: { ...content.profile, rollout: { ...content.profile.rollout, developmentArcs } } });
}

type Plan = Partial<Record<string, ('ok' | 'back' | 'old')[]>>;
function run(plan: Plan, c: GameContent = fixture(), roundtrip = false) {
  const used: Record<string, number> = {}; const decided = new Map<string, string>(); const shown: { id: string; day: number; slot: number; choice: string }[] = []; const pendingAtEvening: boolean[] = [];
  const result = play(5, { content: c, start: s => ({ ...s, development: legacyAuthoredDevelopment(c, 'expert', ['expert']) }),
    beforeStep: s => { if (s.phase === 'evening') pendingAtEvening.push(!!s.development.pendingPromotion && s.development.developmentCurrent === 'expert'); return roundtrip ? JSON.parse(JSON.stringify(s)) as GameState : s; },
    // `play` may ask for the pick once per candidate choice, so the answer is memoised per presented slot.
    pick: (s, d) => { const key = `${s.day}/${s.slot}`; const known = decided.get(key); if (known) return known;
      const n = used[d.card.id] = (used[d.card.id] ?? -1) + 1; const choice = plan[d.card.id]?.[n] ?? (d.card.id.startsWith('d.') ? 'ok' : d.choices[0]!.id);
      decided.set(key, choice); shown.push({ id: d.card.id, day: s.day, slot: s.slot, choice }); return choice; } });
  return { ...result, shown, pendingAtEvening, c };
}
const devShown = (r: ReturnType<typeof run>) => r.shown.filter(s => s.id.startsWith('d.'));
const between = (r: ReturnType<typeof run>, a: string, b: string) => {
  const i = r.shown.findIndex(s => s.id === a), j = r.shown.findIndex(s => s.id === b); return { gap: r.shown.slice(i + 1, j).length, days: r.shown[j]!.day - r.shown[i]!.day };
};
const evidenceKinds = (g: GameState) => g.development.evidence.map(e => `${e.kind}${e.beat ? '@' + e.beat : ''}`);

describe('beats arcs: derived state', () => {
  const e = (eventId: string, kind: DevelopmentEvidence['kind'], b?: DevelopmentBeat): DevelopmentEvidence => ({ eventId, arcId: 'a', contextId: 'c', kind, day: 1, slot: 0, cardId: 'x', ...(b ? { beat: b } : {}) });
  it('keeps earlier beats done through a withdrawal, which only marks its own beat', () => {
    const s = deriveBeatState([e('1', 'trial'), e('2', 'consequence'), e('3', 'review'), e('4', 'withdrawal', 'transfer')], 'a');
    expect(['trial', 'consequence', 'review'].map(b => s[b as DevelopmentBeat].status)).toEqual(['done', 'done', 'done']);
    expect(s.transfer.status).toBe('withdrawn'); expect(s.pressure.status).toBe('open');
  });
  it('a retry closes only its beat; later beats stay locked until the earlier ones are done', () => {
    const s = deriveBeatState([e('1', 'withdrawal', 'trial'), e('2', 'trial'), e('3', 'pressure')], 'a');
    expect(s.trial.status).toBe('done'); expect(s.consequence.status).toBe('open'); expect(s.pressure.status).toBe('open');
  });
  it('ignores other arcs and a withdrawal that belongs to a different beat', () => {
    const s = deriveBeatState([{ ...e('1', 'trial'), arcId: 'other' }, e('2', 'withdrawal', 'review')], 'a');
    expect(s.trial.status).toBe('open'); expect(s.review.status).toBe('open');
  });
});

describe('beats arcs: scenarios on a synthetic arc', () => {
  it('control: the old way at the first beat never advances the arc or the hero', () => {
    const r = run({ 'd.trial': ['old'] });
    expect(devShown(r).map(s => s.id)).toEqual(['d.trial']);
    expect(r.state.development.evidence).toEqual([]); expect(r.state.development.transitions).toEqual([]);
    expect(r.state.development.developmentCurrent).toBe('expert'); expect(r.state.development.pendingPromotion).toBeUndefined();
  });

  it('fast mastery: five beats in order with ordinary life between them, one pending promotion, promoted only at the evening', () => {
    const r = run({});
    expect(devShown(r).map(s => s.id)).toEqual(['d.trial', 'd.cons', 'd.review', 'd.transfer', 'd.pressure']);
    expect(between(r, 'd.trial', 'd.cons').gap >= 1 || between(r, 'd.trial', 'd.cons').days >= 1).toBe(true);
    const gap = between(r, 'd.review', 'd.transfer'); expect(gap.gap >= 2 || gap.days >= 1).toBe(true);
    expect(r.pendingAtEvening.filter(Boolean)).toHaveLength(1);
    expect(r.state.development.transitions).toHaveLength(1);
    expect(r.state.development.transitions[0]).toMatchObject({ arcId: ARC, from: 'expert', to: 'achiever' });
    expect(r.state.development.transitions[0]!.day).toBe(r.shown.filter(s => s.id === 'd.pressure')[0]!.day);
    expect(r.state.development.developmentCurrent).toBe('achiever'); expect(r.state.development.available).toEqual(['expert', 'achiever']);
    expect(validateDevelopmentEvidence(r.state, r.c)).toBe(true);
  });

  it('withdrawal at the trial: no immediate retry, then the retry of that beat — not the trial again and not a later beat', () => {
    const r = run({ 'd.trial': ['back'] });
    const order = devShown(r).map(s => s.id);
    expect(order).toEqual(['d.trial', 'd.retry-trial', 'd.cons', 'd.review', 'd.transfer', 'd.pressure']);
    const g = between(r, 'd.trial', 'd.retry-trial'); expect(g.gap >= 2 || g.days >= 1).toBe(true);
    expect(evidenceKinds(r.state)).toEqual(['withdrawal@trial', 'trial', 'consequence', 'review', 'transfer', 'pressure']);
    expect(r.state.development.transitions).toHaveLength(1);
    expect(validateDevelopmentEvidence(r.state, r.c)).toBe(true);
  });

  it('withdrawal at the transfer routes only to retry-transfer; earlier evidence is kept and pressure waits', () => {
    const r = run({ 'd.transfer': ['back'] });
    const order = devShown(r).map(s => s.id);
    expect(order).toEqual(['d.trial', 'd.cons', 'd.review', 'd.transfer', 'd.retry-transfer', 'd.pressure']);
    expect(order).not.toContain('d.retry-pressure');
    expect(r.state.development.transitions).toHaveLength(1);
  });

  it('withdrawal at the pressure routes to the pressure retry, and a promotion happens exactly once', () => {
    const r = run({ 'd.pressure': ['back'] });
    expect(devShown(r).map(s => s.id)).toEqual(['d.trial', 'd.cons', 'd.review', 'd.transfer', 'd.pressure', 'd.retry-pressure']);
    expect(r.state.development.transitions).toHaveLength(1);
    expect(r.pendingAtEvening.filter(Boolean)).toHaveLength(1);
  });

  it('a withdrawal on a retry opens that retry again after another cooldown, and nothing is lost on the way', () => {
    const r = run({ 'd.trial': ['back'], 'd.retry-trial': ['back', 'ok'] });
    expect(devShown(r).map(s => s.id)).toEqual(['d.trial', 'd.retry-trial', 'd.retry-trial', 'd.cons', 'd.review', 'd.transfer', 'd.pressure']);
    expect(evidenceKinds(r.state).slice(0, 3)).toEqual(['withdrawal@trial', 'withdrawal@trial', 'trial']);
    expect(r.state.development.transitions).toHaveLength(1);
  });

  it('a declined retry is still an attempt: the next offer waits out the cooldown again, instead of reappearing in the very next slot', () => {
    const r = run({ 'd.trial': ['back'], 'd.retry-trial': ['old', 'old', 'ok'] });
    const retries = r.shown.filter(s => s.id === 'd.retry-trial');
    expect(retries.map(s => s.choice)).toEqual(['old', 'old', 'ok']);
    retries.slice(1).forEach((a, i) => {
      const prev = retries[i]!;
      const ordinary = r.shown.filter(s => !s.id.startsWith('d.') && (s.day > prev.day || s.day === prev.day && s.slot > prev.slot) && (s.day < a.day || s.day === a.day && s.slot < a.slot)).length;
      expect(ordinary >= 2 || a.day > prev.day).toBe(true);
    });
    expect(r.state.development.transitions).toHaveLength(1);
  });

  it('reloading from JSON before every step changes nothing', () => {
    const plain = run({ 'd.trial': ['back'], 'd.transfer': ['back'] });
    const reloaded = run({ 'd.trial': ['back'], 'd.transfer': ['back'] }, fixture(), true);
    expect(reloaded.state).toEqual(plain.state);
    expect(reloaded.shown).toEqual(plain.shown);
  });

  it('with the arcs switched off the beat scenes do not exist for the hero', () => {
    const r = run({}, fixture(false));
    expect(devShown(r)).toEqual([]);
    expect(r.state.development.evidence).toEqual([]); expect(r.state.development.transitions).toEqual([]);
  });
});
