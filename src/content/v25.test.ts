import { describe, expect, it } from 'vitest';
import { validateContent } from '../../scripts/check-content';
import { play } from '../../scripts/play';
import { loadSourceJson, type SourceDevCard } from '../../scripts/v25/parse-package';
import { checkParity } from '../../scripts/v25/parity';
import { buildRuntime, placeholderSkin } from '../../scripts/v25/runtime';
import { checkSource } from '../../scripts/v25/source-checks';
import { legacyAuthoredDevelopment, validateDevelopmentEvidence } from '../engine/development';
import type { Card, GameContent, GameState } from '../engine/types';
import { content } from '.';

// The v2.5 package, structurally complete with placeholder world text: proves the machine guards before a single sentence is rewritten.
const src = loadSourceJson();
// Sections already merged into the game are checked as they are; the rest are filled with placeholder text so the machine guards see the whole package.
const merged = (prefix: string) => content.cards.some(c => c.id.startsWith(prefix));
const missing = (['neutral', 'probes', 'development'] as const).filter(s => !merged({ neutral: 'neutral.', probes: 'probe.', development: 'dev.' }[s]));
const rt = buildRuntime(src, placeholderSkin(src), 30, missing);
const full = {
  ...content, cards: [...content.cards, ...rt.neutral, ...rt.probes, ...rt.development], traces: [...content.traces, ...rt.traces],
  development: { ...content.development, arcs: [...content.development.arcs, ...rt.arcs] },
  profile: { ...content.profile, rollout: { ...content.profile.rollout, developmentArcs: true } }
} as GameContent;
const clone = () => structuredClone(full);
const card = (c: GameContent, id: string) => c.cards.find(x => x.id === id)!;

describe('v2.5 package extraction', () => {
  it('passes every structural check of the handoff (counts, balance, rotation, routing, reachability of the retry graph)', () => {
    expect(checkSource(src).errors).toEqual([]);
    expect([src.neutral.length, src.motives.length, src.behaviors.length, src.probes.length, src.development.length]).toEqual([32, 8, 4, 21, 50]);
  });

  it('builds runtime cards that are in exact parity with the source, and the whole content passes every rule', () => {
    expect(checkParity(src, full)).toEqual([]);
    expect(validateContent(full)).toEqual([]);
  });
});

describe('source ↔ runtime parity catches what counts cannot', () => {
  const caught = (mutate: (c: GameContent) => void, pattern: RegExp) => {
    const c = clone(); mutate(c);
    const errors = checkParity(src, c);
    expect(errors.some(e => pattern.test(e)), `${pattern}: ${errors.slice(0, 3).join(' | ')}`).toBe(true);
  };
  it('a LogicVector that moved to another choiceId', () => caught(c => {
    const [a, b] = card(c, 'neutral.work.01').choices; const v = a!.diagnosticAction!.vector; a!.diagnosticAction!.vector = b!.diagnosticAction!.vector; b!.diagnosticAction!.vector = v;
  }, /LogicVector differs/));
  it('a changed order of the choices', () => caught(c => { card(c, 'neutral.work.02').choices.reverse(); }, /choice ids\/order/));
  it('a choice without its trace', () => caught(c => { c.traces = c.traces.filter(t => !(t.source.cardId === 'probe.od.01')); }, /exactly one trace/));
  it('a neutral scene whose text depends on the hero (stage-invariant text only)', () => caught(c => {
    card(c, 'neutral.body.02').textVariants = [{ id: 'v', kind: 'perception', when: { heroStage: 'expert' }, text: 'x' }];
  }, /one text and one choice set/));
  it('a neutral scene gated by the profile or the stage', () => caught(c => { card(c, 'neutral.inner.02').requires = { heroStage: 'expert' }; }, /gated by nothing but the calendar/));
  it('a structural id that the source does not know', () => caught(c => { c.cards.push({ ...card(c, 'neutral.work.01'), id: 'neutral.invented' }); }, /unknown structural id/));
  it('a missing development card', () => caught(c => { c.cards = c.cards.filter(x => x.id !== 'dev.od.retry.01'); }, /dev\.od\.retry\.01: missing/));
  it('a changed development event', () => caught(c => { card(c, 'dev.de.trial.01').choices.find(x => x.developmentEvents?.[0]?.kind === 'trial')!.developmentEvents![0]!.kind = 'review'; }, /development event differs/));
  it('a retry cooldown that is shorter than the contract', () => caught(c => {
    const a = (card(c, 'dev.is.retry-trial.01').requires as { all: { developmentSince?: { decisions: number } }[] }).all.find(x => x.developmentSince)!.developmentSince!; a.decisions = 1;
  }, /retry cooldown/));
  it('withdrawal at the transfer routed into the pressure retry', () => caught(c => {
    (card(c, 'dev.ai.retry-transfer.01').requires as { all: { developmentBeat?: { beat: string } }[] }).all[0]!.developmentBeat!.beat = 'pressure';
  }, /requires differ from the beat contract/));
  it('a primary beat card that forgot to require its own beat to be open', () => caught(c => {
    (card(c, 'dev.sa.review.01').requires as { all: unknown[] }).all = (card(c, 'dev.sa.review.01').requires as { all: unknown[] }).all.slice(0, 1);
  }, /requires differ from the beat contract/));
  it('swapped sides of a probe pair', () => caught(c => { const d = card(c, 'probe.ea.02').diagnostic!; d.distinguishes = [d.distinguishes![1]!, d.distinguishes![0]!]; }, /diagnostic block differs/));
  it('a behavior continuation that an owner choice does not schedule', () => caught(c => { delete card(c, 'neutral.work.01').choices[2]!.effects.schedule; }, /scheduled by every choice/));
  it('a missing arc', () => caught(c => { c.development.arcs = c.development.arcs.filter(a => a.id !== 'strategist-alchemist'); }, /strategist-alchemist: arc missing/));
});

// ---- Development scenarios on every new arc (the handoff's four, on the real beat contract) --------------------------
const arcIds = [...new Set(src.development.map(d => d.arcId))];
type Pick = 'target' | 'back' | 'old';
const slug = (d: SourceDevCard, pick: Pick) => d.choices.find(ch => pick === 'target' ? ch.event && ch.event !== 'withdrawal' : pick === 'back' ? ch.event === 'withdrawal' : ch.event === null)!.id;
function runArc(arcId: string, plan: Record<string, Pick[]>, base: Pick = 'target') {
  const cards = src.development.filter(d => d.arcId === arcId); const from = cards[0]!.from;
  const used: Record<string, number> = {}; const decided = new Map<string, string>(); const shown: { id: string; day: number; slot: number; pick: Pick }[] = []; const pending: boolean[] = [];
  const r = play(11, { content: full, start: s => ({ ...s, development: legacyAuthoredDevelopment(full, from, [from]) }),
    beforeStep: s => { if (s.phase === 'evening') pending.push(!!s.development.pendingPromotion && s.development.developmentCurrent === from); return s; },
    pick: (s, d) => {
      const key = `${s.day}/${s.slot}`; const known = decided.get(key); if (known) return known;
      const dev = cards.find(x => x.id === d.card.id); if (!dev) return undefined;
      const n = used[dev.id] = (used[dev.id] ?? -1) + 1; const pick = plan[dev.id]?.[n] ?? base;
      const id = slug(dev, pick); decided.set(key, id); shown.push({ id: dev.id, day: s.day, slot: s.slot, pick }); return id;
    } });
  return { ...r, shown, pending, cards, from, to: cards[0]!.to };
}
const gapOk = (state: GameState, a: { day: number; slot: number }, b: { day: number; slot: number }, arcCardIds: Set<string>) =>
  b.day > a.day || state.history.filter(h => (h.day > a.day || h.day === a.day && h.slot > a.slot) && (h.day < b.day || h.day === b.day && h.slot < b.slot) && !arcCardIds.has(h.cardId)).length >= 2;

describe.each(arcIds)('arc %s on the real contract', arcId => {
  const cards = src.development.filter(d => d.arcId === arcId);
  const primary = (b: string) => cards.find(d => !d.retry && d.beat === b)!;
  const retryOf = (b: string) => cards.find(d => d.retry && d.beat === b);

  it('control: the old way at the first beat changes nothing', () => {
    const r = runArc(arcId, { [primary('trial').id]: ['old'] });
    expect(r.shown.map(s => s.id)).toEqual([primary('trial').id]);
    expect(r.state.development.evidence).toEqual([]); expect(r.state.development.transitions).toEqual([]);
    expect(r.state.development.developmentCurrent).toBe(r.from);
  });

  it('a withdrawal keeps earlier evidence, blocks the retry for the cooldown, and a refused retry gives no promotion', () => {
    const wb = (['transfer', 'pressure', 'trial'] as const).find(b => retryOf(b) && primary(b).choices.some(x => x.event === 'withdrawal'))!;
    const refuse = retryOf(wb)!;
    // A retry that is declined stays on offer (the beat is still withdrawn) and is again separated from the last attempt by the cooldown.
    const r = runArc(arcId, { [primary(wb).id]: ['back'], [refuse.id]: Array<Pick>(40).fill('old') });
    const withdrawal = r.shown.find(s => s.id === primary(wb).id)!; const retry = r.shown.find(s => s.id === refuse.id);
    expect(retry, 'the retry of the withdrawn beat is offered').toBeDefined();
    expect(gapOk(r.state, withdrawal, retry!, new Set(cards.map(c => c.id)))).toBe(true);
    expect(r.shown.filter(s => s.id === primary(wb).id)).toHaveLength(1);
    const attempts = r.shown.filter(s => s.id === primary(wb).id || s.id === refuse.id);
    attempts.slice(1).forEach((a, i) => expect(gapOk(r.state, attempts[i]!, a, new Set(cards.map(c => c.id))), `cooldown before attempt ${i + 2}`).toBe(true));
    expect(r.state.development.evidence.some(e => e.kind === 'withdrawal' && e.beat === wb)).toBe(true);
    expect(r.state.development.transitions).toEqual([]); expect(r.state.development.pendingPromotion).toBeUndefined();
    const doneBefore = ['trial', 'consequence', 'review', 'transfer', 'pressure'].slice(0, ['trial', 'consequence', 'review', 'transfer', 'pressure'].indexOf(wb));
    for (const b of doneBefore) expect(r.state.development.evidence.some(e => e.kind === b), `${b} stays`).toBe(true);
  });

  it('fast mastery: five beats, one pending promotion, promoted only at the evening, exactly once', () => {
    const r = runArc(arcId, {});
    expect(r.shown.map(s => s.id)).toEqual(['trial', 'consequence', 'review', 'transfer', 'pressure'].map(b => primary(b).id));
    expect(r.pending.filter(Boolean)).toHaveLength(1);
    // The next arc may start and even finish inside the same thirty days; this arc is promoted exactly once.
    const own = r.state.development.transitions.filter(t => t.arcId === arcId);
    expect(own).toHaveLength(1);
    expect(r.state.development.available).toContain(r.to);
    expect(own[0]!.day).toBe(r.shown.at(-1)!.day);
    expect(validateDevelopmentEvidence(r.state, full)).toBe(true);
  });

  it('mastery after retry: every beat that can be withdrawn from is withdrawn once and answered by its own retry, with a single promotion', () => {
    const withdrawable = ['trial', 'consequence', 'review', 'transfer', 'pressure'].filter(b => retryOf(b));
    const plan: Record<string, Pick[]> = {};
    for (const b of withdrawable) plan[primary(b).id] = ['back'];
    const r = runArc(arcId, plan);
    const order = r.shown.map(s => s.id);
    for (const b of withdrawable) {
      const i = order.indexOf(primary(b).id), j = order.indexOf(retryOf(b)!.id);
      expect(i, primary(b).id).toBeGreaterThanOrEqual(0); expect(j, retryOf(b)!.id).toBeGreaterThan(i);
      expect(order.slice(i + 1, j).every(id => !cards.some(c => c.id === id) || id === retryOf(b)!.id)).toBe(true);
      expect(gapOk(r.state, r.shown[i]!, r.shown[j]!, new Set(cards.map(c => c.id)))).toBe(true);
    }
    expect(r.state.development.transitions.filter(t => t.arcId === arcId)).toHaveLength(1);
    expect(r.state.development.available).toContain(r.to);
    expect(validateDevelopmentEvidence(r.state, full)).toBe(true);
    // The same run reloaded from JSON at every step is the same run.
    const again = play(11, { content: full, start: s => ({ ...s, development: legacyAuthoredDevelopment(full, r.from, [r.from]) }), beforeStep: s => JSON.parse(JSON.stringify(s)) as GameState,
      pick: (s, d) => { const dev = cards.find(x => x.id === d.card.id); if (!dev) return undefined; const seen = r.shown.find(x => x.id === dev.id && x.day === s.day && x.slot === s.slot); return seen ? slug(dev, seen.pick) : undefined; } });
    expect(again.state.development).toEqual(r.state.development);
  });
});

// Keep the type import used by tooling that scans this file for card helpers.
export type { Card };
