import { describe, expect, it } from 'vitest';
import { impactErrors } from '../../scripts/check-content';
import { drawCard, persistDraw, resolveCardVisual } from './draw';
import { buildImpactGraph, decisionAtoms, impactOf, observeScene } from './impact';
import { evaluateCondition } from './conditions';
import { makeCard, makeContent, makeState } from './testUtils';
import type { Card, Choice, Condition, GameContent, GameState } from './types';

const facts = { 'f.a': { values: ['no', 'yes'], initial: 'no' }, 'f.b': { values: ['no', 'yes'], initial: 'no' } };
const choice = (id: string, effects: Choice['effects'] = {}, rest: Partial<Choice> = {}): Choice => ({ id, label: id, servesFacets: ['work'], ...rest, effects });
const world = (cards: Card[], extra: Partial<GameContent> = {}) => makeContent({ cards, factsSchema: facts, ...extra });
const exists = () => true;
const history = (...items: [string, string, number?][]): GameState['history'] =>
  items.map(([cardId, choiceId, day], i) => ({ day: day ?? 1, slot: i, cardId, choiceId }));
const holdsIn = (content: GameContent, state: GameState) => (c: Condition) => evaluateCondition(c, state, content);

describe('resolveCardVisual', () => {
  const yes: Condition = { fact: 'f.a', equals: 'yes' };
  const card = makeCard({ id: 'scene', type: 'situation', image: 'art/scenes/base.webp',
    visualVariants: [{ id: 'one', when: yes, image: 'art/scenes/one.webp', alt: 'one' }, { id: 'two', when: { all: [yes, { fact: 'f.b', equals: 'yes' }] }, image: 'art/scenes/two.webp' }] });
  const content = world([card]);

  it('falls back to the base image, and to nothing when the card has none', () => {
    expect(resolveCardVisual(makeState(), content, card)).toEqual({ image: 'art/scenes/base.webp' });
    expect(resolveCardVisual(makeState(), content, makeCard({ id: 'plain', type: 'situation' }))).toBeUndefined();
  });
  it('a matching variant replaces the base image and keeps the variant id and alt', () => {
    expect(resolveCardVisual(makeState({ facts: { 'f.a': 'yes' } }), content, card)).toEqual({ variantId: 'one', image: 'art/scenes/one.webp', alt: 'one' });
  });
  it('takes the first variant in authored order, not the most specific one', () => {
    expect(resolveCardVisual(makeState({ facts: { 'f.a': 'yes', 'f.b': 'yes' } }), content, card)?.variantId).toBe('one');
  });
  it('is deterministic for the same state', () => {
    const state = makeState({ facts: { 'f.a': 'yes' } });
    expect(resolveCardVisual(state, content, card)).toEqual(resolveCardVisual(structuredClone(state), content, card));
  });
  it('freezes the image at presentation: reload and later fact changes keep what was shown', () => {
    const state = makeState({ facts: { 'f.a': 'yes' } });
    const shown = persistDraw(state, drawCard(state, content)!, content);
    expect(shown.current?.visual?.variantId).toBe('one');
    const reloaded = JSON.parse(JSON.stringify(shown)) as GameState;
    const changed = { ...reloaded, facts: { 'f.a': 'no', 'f.b': 'yes' } };
    expect(drawCard(reloaded, content)?.visual).toEqual(shown.current?.visual);
    expect(drawCard(changed, content)?.visual).toEqual(shown.current?.visual);
  });
  it('a scene shown before visuals existed stays without one', () => {
    const state = makeState({ facts: { 'f.a': 'yes' } });
    const shown = persistDraw(state, drawCard(state, content)!, content);
    const { visual: _visual, ...bare } = shown.current!;
    const legacy: GameState = { ...shown, current: bare };
    expect(drawCard(legacy, content)?.visual).toBeUndefined();
  });
  it('never stores audit metadata in the frozen pair', () => {
    const marked = makeCard({ id: 'marked', type: 'situation', choices: [choice('a', {}, { impact: { level: 'minor' } }), choice('b')] });
    const state = makeState();
    const c = world([marked]);
    const draw = drawCard(state, c)!;
    expect(draw.choices.every(x => !('impact' in x))).toBe(true);
    expect(persistDraw(state, draw, c).current!.choices!.every(x => !('impact' in x))).toBe(true);
    expect(marked.choices[0]!.impact).toEqual({ level: 'minor' });
  });
});

describe('impact validation', () => {
  const write = (extra: Partial<Choice> = {}) => {
    const { effects, ...rest } = extra;
    return makeCard({ id: 'src', type: 'situation', character: 'alexey', chapter: 1,
      choices: [choice('go', { setFacts: { 'f.a': 'yes' }, ...(effects ?? {}) }, rest), choice('stay')] });
  };
  const reader = (rest: Partial<Card> = {}) => makeCard({ id: 'later', type: 'situation', character: 'alexey', ...rest });

  it('catches an unreachable visual variant (nothing writes what it reads)', () => {
    const content = world([write(), reader({ visualVariants: [{ id: 'v', when: { fact: 'f.b', equals: 'yes' }, image: 'a.webp' }] })]);
    expect(impactErrors(content, exists).join('\n')).toMatch(/later\/v can never hold/);
  });
  it('catches an unknown fact in a visual variant', () => {
    const content = world([write(), reader({ visualVariants: [{ id: 'v', when: { fact: 'f.nope', equals: 'yes' }, image: 'a.webp' }] })]);
    expect(impactErrors(content, exists).join('\n')).toMatch(/can never hold/);
  });
  it('catches a missing image file, a duplicate variant and a shadowed one', () => {
    const when: Condition = { fact: 'f.a', equals: 'yes' };
    const content = world([write(), reader({ visualVariants: [{ id: 'v', when, image: 'a.webp' }, { id: 'v', when, image: 'b.webp' }] })]);
    const errors = impactErrors(content, i => i === 'a.webp').join('\n');
    expect(errors).toMatch(/Duplicate visualVariant ids/);
    expect(errors).toMatch(/image b.webp does not exist/);
    expect(errors).toMatch(/shadowed by v/);
  });
  it('rejects a meaningful choice that nobody reads', () => {
    const content = world([write({ impact: { level: 'meaningful' } }), reader()]);
    expect(impactErrors(content, exists).join('\n')).toMatch(/meaningful choice src\/go has 0/);
  });
  it('accepts a meaningful choice with one real reader', () => {
    const content = world([write({ impact: { level: 'meaningful' } }), reader({ textVariants: [{ id: 't', kind: 'consequence', when: { fact: 'f.a', equals: 'yes' }, text: 'x' }] })]);
    expect(impactErrors(content, exists)).toEqual([]);
  });
  it('rejects a major choice with a single consequence', () => {
    const content = world([write({ impact: { level: 'major' } }), reader({ textVariants: [{ id: 't', kind: 'consequence', when: { fact: 'f.a', equals: 'yes' }, text: 'x' }] })]);
    expect(impactErrors(content, exists).join('\n')).toMatch(/major choice src\/go has 1/);
  });
  it('rejects a major choice whose two consequences are both immediate, and one that demands delayed without having it', () => {
    const t = (id: string, who: string) => makeCard({ id, type: 'situation', character: 'alexey', textVariants: [{ id: `${id}_t`, kind: 'consequence', when: { fact: 'f.a', equals: 'yes' }, text: who }] });
    const content = world([write({ impact: { level: 'major' } }), t('r1', 'one'), t('r2', 'two')]);
    expect(impactErrors(content, exists).join('\n')).toMatch(/only immediate consequences/);
    const strict = world([write({ impact: { level: 'meaningful', require: { delayed: true } } }), t('r1', 'one')]);
    expect(impactErrors(strict, exists).join('\n')).toMatch(/requires a delayed consequence/);
  });
  it('accepts a major choice with a delayed follow-up and a cross-character callback', () => {
    const chain = makeCard({ id: 'chain', type: 'chain', character: 'alexey' });
    const other = makeCard({ id: 'other', type: 'situation', character: 'marta', textVariants: [{ id: 'o', kind: 'consequence', when: { fact: 'f.a', equals: 'yes' }, text: 'x' }] });
    const content = world([write({ impact: { level: 'major', require: { delayed: true, crossCharacter: true } }, effects: { schedule: [{ cardId: 'chain', inDays: 1 }] } }), chain, other]);
    expect(impactErrors(content, exists)).toEqual([]);
  });
  it('counts a choice variant as a future-choice consequence', () => {
    const src = write({ impact: { level: 'meaningful' } });
    const later = reader({ choiceVariants: [{ when: { chose: { card: 'src', choice: 'go' } }, choices: [choice('x'), choice('y'), choice('z')] }] });
    const graph = buildImpactGraph(world([src, later]));
    expect([...impactOf(graph, 'src', 'go').kinds]).toContain('choice');
  });
  it('rejects a choice variant that offers the base pair and a variant nobody can reach', () => {
    const same = reader({ choices: [choice('x'), choice('y')], choiceVariants: [{ when: { fact: 'f.a', equals: 'yes' }, choices: [choice('x'), choice('y')] }] });
    expect(impactErrors(world([write(), same]), exists).join('\n')).toMatch(/same choices as the base pair/);
    const dead = reader({ choiceVariants: [{ when: { fact: 'f.b', equals: 'yes' }, choices: [choice('p'), choice('q'), choice('r')] }] });
    expect(impactErrors(world([write(), dead]), exists).join('\n')).toMatch(/Choice variant #0 of later can never hold/);
  });
  it('lists only decisions as atoms and ignores what the hero did not choose (not)', () => {
    expect(decisionAtoms({ all: [{ fact: 'f.a', equals: 'yes' }, { quality: 'honesty', gte: 1 }, { not: { flag: 'x' } }, { shown: 'c' }] })).toEqual([{ fact: 'f.a', equals: 'yes' }]);
  });
});

describe('observable impact at runtime', () => {
  const src = makeCard({ id: 'src', type: 'situation', character: 'alexey',
    choices: [choice('go', { setFacts: { 'f.a': 'yes' }, schedule: [{ cardId: 'chain', inDays: 1 }] }), choice('stay')] });
  const chain = makeCard({ id: 'chain', type: 'chain', character: 'marta', textVariants: [{ id: 'cb', kind: 'consequence', when: { fact: 'f.a', equals: 'yes' }, text: 'x' }],
    choiceVariants: [{ when: { fact: 'f.a', equals: 'yes' }, choices: [choice('p'), choice('q'), choice('r')] }] });
  const content = world([src, chain]);
  const played = history(['src', 'go']);
  const state = makeState({ day: 2, facts: { 'f.a': 'yes' }, history: played });

  it('a shown text variant and a delayed follow-up are impacts, and the character change makes it cross-character', () => {
    const events = observeScene(content, played, { card: chain, day: 2, variantId: 'cb', choices: chain.choices }, holdsIn(content, state));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ sourceCardId: 'src', sourceChoiceId: 'go', visibleCardId: 'chain', sourceDay: 1, day: 2 });
    expect(new Set(events[0]!.kinds)).toEqual(new Set(['callback', 'delayed', 'cross-character']));
  });
  it('a choice variant counts only when its pair was really shown', () => {
    const base = observeScene(content, played, { card: chain, day: 2, choices: chain.choices }, holdsIn(content, state));
    expect(base[0]!.kinds).not.toContain('choice');
    const shown = observeScene(content, played, { card: chain, day: 2, choices: chain.choiceVariants![0]!.choices }, holdsIn(content, state));
    expect(shown[0]!.kinds).toContain('choice');
  });
  it('a reader that was not shown, or a scene before the decision, produces nothing', () => {
    expect(observeScene(content, [], { card: chain, day: 2, choices: chain.choices }, holdsIn(content, makeState({ day: 2 })))).toEqual([]);
  });
  it('cross-character needs two different characters', () => {
    const same = makeCard({ id: 'chain', type: 'chain', character: 'alexey' });
    const events = observeScene(world([src, same]), played, { card: same, day: 2, choices: same.choices }, holdsIn(content, state));
    expect(events[0]!.kinds).toEqual(['delayed']);
    const narrator = makeCard({ id: 'chain', type: 'chain' });
    expect(observeScene(world([src, narrator]), played, { card: narrator, day: 2, choices: narrator.choices }, holdsIn(content, state))[0]!.kinds).toEqual(['delayed']);
  });
  it('a text variant that reads no decision (only quality or shown) is not an impact', () => {
    const plain = makeCard({ id: 'plain', type: 'situation', textVariants: [{ id: 'p', kind: 'perception', when: { quality: 'attention', gte: 1 }, text: 'x' }] });
    expect(observeScene(world([src, plain]), played, { card: plain, day: 2, variantId: 'p', choices: plain.choices }, () => true)).toEqual([]);
  });
});
