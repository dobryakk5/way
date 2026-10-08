import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { RECENT_LINE_WINDOW, deriveStoryContext, isOpenStoryThread } from './storyContext';
import { makeContent, makeState } from './testUtils';
import type { GameState, StoryLine, ThreadDefinition } from './types';

const step = (line: StoryLine, i: number): GameState['evidence'][number] => ({ day: 1 + Math.floor(i / 4), slot: i % 4, cardId: `c${i}`, choiceId: 'a', line, step: 's' });
const thread = (id: string) => content.threads.find(t => t.id === id)!;
const factThread = thread('timon_coins') as Extract<ThreadDefinition, { kind: 'fact' }>;
const chainThread = content.threads.find(t => t.kind === 'chain')!;
const opportunityThread = content.threads.find(t => t.kind === 'opportunity')!;

describe('deriveStoryContext', () => {
  it('reads the goal, the declared intention, the day and the chapter', () => {
    const ctx = deriveStoryContext(makeState({ goal: { id: 'alexey', wording: 'x' }, declaredIntention: 'body', day: 7, chapter: 2 }), content);
    expect(ctx).toMatchObject({ goalId: 'alexey', intention: 'body', day: 7, chapter: 2, recentLines: [], openThreadIds: expect.any(Array) });
  });
  it('has no goal and no intention before they are chosen', () => {
    const { goal: _goal, declaredIntention: _intention, ...bare } = makeState(); void _goal; void _intention;
    const ctx = deriveStoryContext(bare as GameState, content);
    expect('goalId' in ctx).toBe(false); expect('intention' in ctx).toBe(false);
  });
  it('recentLines: distinct lines of the last 8 steps only, newest first', () => {
    const old: StoryLine[] = ['apprentice', 'commitments', 'apprentice', 'commitments'];
    const lines: StoryLine[] = [...old, ...Array<StoryLine>(8).fill('pace')];
    // The four older steps are outside the window of 8.
    expect(RECENT_LINE_WINDOW).toBe(8);
    expect(deriveStoryContext(makeState({ evidence: lines.map(step) }), content).recentLines).toEqual(['pace']);
    const fresh = makeState({ evidence: [...lines.slice(0, 11), 'apprentice' as const].map(step) });
    expect(deriveStoryContext(fresh, content).recentLines).toEqual(['apprentice', 'pace']);
    const inside = makeState({ evidence: [...lines.slice(0, 6), 'commitments' as const, ...Array<StoryLine>(5).fill('pace')].map(step) });
    expect(deriveStoryContext(inside, content).recentLines).toEqual(['pace', 'commitments']);
  });
  it('does not mutate the state', () => {
    const state = makeState({ evidence: ['pace', 'apprentice'].map((l, i) => step(l as StoryLine, i)) });
    const before = JSON.stringify(state); deriveStoryContext(state, content); expect(JSON.stringify(state)).toBe(before);
  });
  it('lists exactly the open threads', () => {
    const open = deriveStoryContext(makeState({ facts: { ...makeState().facts, 'timon.trust': 'open' } }), content).openThreadIds;
    expect(open).toContain('timon_coins');
    const closed = deriveStoryContext(makeState({ facts: { ...makeState().facts, 'timon.trust': 'unknown' } }), content).openThreadIds;
    expect(closed).not.toContain('timon_coins');
  });
});

describe('isOpenStoryThread', () => {
  it('fact: open only when the current value maps to an open stage; unknown or absent values are not confirmed', () => {
    const at = (value: string | undefined) => { const facts = { ...makeState().facts }; delete facts[factThread.fact]; if (value !== undefined) facts[factThread.fact] = value; return makeState({ facts }); };
    expect(isOpenStoryThread(factThread, at('open'), content)).toBe(true);
    expect(isOpenStoryThread(factThread, at('guarded'), content)).toBe(true);
    expect(isOpenStoryThread(factThread, at('unknown'), content)).toBe(false);
    expect(isOpenStoryThread(factThread, at(undefined), content)).toBe(false);
    expect(isOpenStoryThread(factThread, at('not-a-stage'), content)).toBe(false);
  });
  it('opportunity: open AND actually shown to the hero', () => {
    if (opportunityThread.kind !== 'opportunity') throw new Error('fixture');
    const id = opportunityThread.opportunityId;
    const state = (s: 'open' | 'taken' | 'expired' | undefined, exposed: boolean) => makeState({
      opportunityState: s ? { [id]: s } : {}, opportunityExposure: exposed ? { [id]: { day: 3, via: 'card' } } : {} });
    expect(isOpenStoryThread(opportunityThread, state('open', true), content)).toBe(true);
    expect(isOpenStoryThread(opportunityThread, state('open', false), content)).toBe(false);
    expect(isOpenStoryThread(opportunityThread, state('taken', true), content)).toBe(false);
    expect(isOpenStoryThread(opportunityThread, state('expired', true), content)).toBe(false);
    expect(isOpenStoryThread(opportunityThread, state(undefined, true), content)).toBe(false);
  });
  it('chain: the follow-up is scheduled and its latest day has not passed; the mere text of the thread is not enough', () => {
    if (chainThread.kind !== 'chain') throw new Error('fixture');
    const cardId = chainThread.followUp.cardId;
    const at = (scheduled: GameState['scheduled'], day = 5) => makeState({ scheduled, day });
    expect(isOpenStoryThread(chainThread, at([{ cardId, day: 6 }]), content)).toBe(true);
    expect(isOpenStoryThread(chainThread, at([{ cardId, day: 6, latestDay: 8 }]), content)).toBe(true);
    expect(isOpenStoryThread(chainThread, at([{ cardId, day: 3, latestDay: 5 }], 5), content)).toBe(true);
    expect(isOpenStoryThread(chainThread, at([{ cardId, day: 3, latestDay: 4 }], 5), content)).toBe(false);
    expect(isOpenStoryThread(chainThread, at([]), content)).toBe(false);
    expect(isOpenStoryThread(chainThread, at([{ cardId: 'something_else', day: 6 }]), content)).toBe(false);
  });
  it('an unknown follow-up card or opportunity is not confirmed', () => {
    const bare = makeContent({ cards: [], episode: { ...content.episode, opportunities: [] } });
    if (chainThread.kind === 'chain') expect(isOpenStoryThread(chainThread, makeState({ scheduled: [{ cardId: chainThread.followUp.cardId, day: 6 }] }), bare)).toBe(false);
    if (opportunityThread.kind === 'opportunity') expect(isOpenStoryThread(opportunityThread, makeState({
      opportunityState: { [opportunityThread.opportunityId]: 'open' }, opportunityExposure: { [opportunityThread.opportunityId]: { day: 1, via: 'card' } } }), bare)).toBe(false);
  });
});

describe('the story context does not look at the diagnostic or development profile (section 4, 8)', () => {
  const noComments = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  const FORBIDDEN = /heroDevelopmentProfile|state\.development|\.development\b|\.diagnostic\b|selectionOrigin|probeScenes|developmentCardEligible|independenceStats|naturalSelectionOrigin|confidence/;
  it.each(['./storyContext.ts', './focusedEncounters.ts'])('%s does not mention profile, development, diagnostic markup or selection origins', file => {
    expect(noComments(file).match(FORBIDDEN)).toBeNull();
  });
  it('the context is identical whatever the profile and the development state say', () => {
    const base = makeState({ goal: { id: 'workshop', wording: 'x' }, declaredIntention: 'work', evidence: [step('apprentice', 0)] });
    const altered: GameState = { ...base, development: { ...base.development, developmentCurrent: 'expert', available: ['expert', 'achiever'] },
      heroDevelopmentProfile: { ...base.heroDevelopmentProfile, status: 'stable', observedPrimary: 'strategist', confidence: .99, coverage: 1 } };
    expect(deriveStoryContext(altered, content)).toEqual(deriveStoryContext(base, content));
  });
});
