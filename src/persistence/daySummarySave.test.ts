import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { play } from '../../scripts/play';
import { content } from '../content';
import { COMPATIBLE_CONTENT_VERSIONS, CONTENT_VERSION } from '../content/version';
import { prepareEvening } from '../engine/day';
import type { GameState } from '../engine/types';
import { loadSave, migrateSave, validateSave, type SaveRecord } from './save';

const OLD = COMPATIBLE_CONTENT_VERSIONS[0]!;
const record = (game: GameState): SaveRecord => ({ schema: 1, started: true, game });
function eveningOf(seed: number, day: number): GameState {
  let found: GameState | undefined;
  play(seed, { beforeStep: s => { if (!found && s.phase === 'evening' && s.day === day) found = prepareEvening(s, content); return s; } });
  return found!;
}
/** What a save written by the previous release looked like: no summaries, the previous content version everywhere. */
function previousRelease(s: GameState): SaveRecord {
  const g = structuredClone(s);
  g.contentVersion = OLD;
  g.nights = g.nights.map(({ summary: _s, ...n }) => n);
  g.heroDevelopmentProfile.evidence = g.heroDevelopmentProfile.evidence.map(e => ({ ...e, contentVersion: OLD }));
  return record(g);
}

describe('saves with day summaries', () => {
  const state = eveningOf(8, 6);
  it('a save with summaries is valid as written', () => {
    expect(state.nights.every(n => n.summary)).toBe(true);
    expect(validateSave(record(state))).toBeDefined();
  });
  it('a save without summaries (older days) is still valid', () => {
    const g = structuredClone(state);
    g.nights = g.nights.map(({ summary: _s, ...n }) => n);
    expect(validateSave(record(g))).toBeDefined();
  });
  it('a save of the previous content version is brought up, with its profile evidence untouched', () => {
    const raw = previousRelease(state);
    expect(raw.game.heroDevelopmentProfile.evidence.length).toBeGreaterThan(0);
    expect(validateSave(raw)).toBeUndefined();
    const migrated = migrateSave(raw)!;
    expect(migrated).toBeDefined();
    expect(migrated.game.contentVersion).toBe(CONTENT_VERSION);
    expect(migrated.game.heroDevelopmentProfile.evidence.every(e => e.contentVersion === OLD)).toBe(true);
    const { contentVersion: _a, ...before } = raw.game;
    const { contentVersion: _b, ...after } = migrated.game;
    expect(after).toEqual(before);
    expect(validateSave(migrated)).toBeDefined();
  });
  it('the loader archives the original of a migrated save and writes the upgraded one', async () => {
    const raw = previousRelease(state);
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('put-local-profile', 1); r.onupgradeneeded = () => r.result.createObjectStore('saves'); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => { const t = db.transaction('saves', 'readwrite'); t.objectStore('saves').put(raw, 'active'); t.oncomplete = () => resolve(); });
    const loaded = await loadSave();
    expect(loaded.damaged).toBe(false);
    expect(loaded.record!.game.contentVersion).toBe(CONTENT_VERSION);
    const keys = await new Promise<IDBValidKey[]>(resolve => { const r = db.transaction('saves', 'readonly').objectStore('saves').getAllKeys(); r.onsuccess = () => resolve(r.result); });
    expect(keys.some(k => String(k).startsWith('legacy-v5-active-'))).toBe(true);
  });
  it('a forged summary is rejected', () => {
    const forge = (change: (g: GameState) => void) => { const r = record(structuredClone(state)); change(r.game); return validateSave(r); };
    const last = (g: GameState) => g.nights.at(-1)!.summary!;
    expect(forge(g => { last(g).profileAlgorithmVersion = '999'; })).toBeUndefined();
    expect(forge(g => { last(g).day = 1; })).toBeUndefined();
    expect(forge(g => { last(g).reflection.status = last(g).reflection.status === 'stable' ? 'insufficient' : 'stable'; })).toBeUndefined();
    expect(forge(g => { last(g).reflection.coverage += 0.5; })).toBeUndefined();
    expect(forge(g => { last(g).worldChanges.push({ source: { kind: 'choice', day: g.nights.at(-1)!.day, slot: 0, cardId: 'c1_extra_change', choiceId: 'keep' }, templateId: 'x', text: 'Выдумка.' }); })).toBeUndefined();
    expect(forge(g => { last(g).unfinished.push({ threadId: 'x', source: { kind: 'exposure', day: g.nights.at(-1)!.day, opportunityId: 'market_place' }, promise: 'soft', templateId: 'x', text: 'Выдумка.' }); })).toBeUndefined();
  });
  it('a day echo is accepted only when its sources are that day\'s own decisions', () => {
    const withEcho = (change?: (e: NonNullable<GameState['nights'][number]['summary']>['reflection']['echo'] & object) => void) => {
      const g = structuredClone(state);
      const night = g.nights.at(-1)!;
      const today = g.history.filter(h => h.day === night.day).slice(0, 2).map(h => ({ kind: 'choice' as const, day: h.day, slot: h.slot, cardId: h.cardId, choiceId: h.choiceId }));
      night.summary!.reflection.case = 'forming';
      night.summary!.reflection.echo = { kind: 'varied', sources: today, templateId: 'echo.varied', text: 'Сегодня твои решения были разными.' };
      change?.(night.summary!.reflection.echo);
      return validateSave(record(g));
    };
    expect(withEcho()).toBeDefined();
    expect(withEcho(e => { e.sources[0]!.choiceId = 'invented'; })).toBeUndefined();
    expect(withEcho(e => { e.sources[1] = { ...e.sources[0]! }; })).toBeUndefined();
    expect(withEcho(e => { e.sources[0]!.day = 1; })).toBeUndefined();
    expect(withEcho(e => { e.kind = 'repeat'; })).toBeUndefined();
    expect(withEcho(e => { e.sources.pop(); })).toBeUndefined();
  });
});
