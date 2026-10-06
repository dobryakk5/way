import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureRemoteCharacter } from './character';
import { flushChoiceEvents } from './eventSync';
import { syncGamePersistence } from './gamePersistenceSync';

vi.mock('./character', () => ({ ensureRemoteCharacter: vi.fn(async () => ({ status: 'ok' })) }));
vi.mock('./sceneInstanceSync', () => ({ recoverAndFlushSceneInstances: vi.fn(async () => ({ status: 'idle' })) }));
vi.mock('./eventSync', () => ({ flushChoiceEvents: vi.fn(async () => ({ status: 'idle' })) }));
vi.mock('./motiveSync', () => ({ flushMotiveResolutions: vi.fn(async () => ({ status: 'idle' })) }));

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('navigator', {}); });
afterEach(() => vi.unstubAllGlobals());

describe('day completion synchronization', () => {
  it('waits for an active background sync and drains again before completing the day', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(ensureRemoteCharacter).mockImplementationOnce(async () => { await gate; return { status: 'ok' }; });
    const options = { characterId: 'wait-test', apiBaseUrl: '/game' };
    const background = syncGamePersistence(options);
    const completion = syncGamePersistence({ ...options, waitForActive: true });
    expect(ensureRemoteCharacter).toHaveBeenCalledTimes(1);
    release();
    expect(await background).toEqual({ status: 'done' });
    expect(await completion).toEqual({ status: 'done' });
    expect(flushChoiceEvents).toHaveBeenCalledTimes(2);
  });
  it('keeps ordinary background sync non-blocking', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(ensureRemoteCharacter).mockImplementationOnce(async () => { await gate; return { status: 'ok' }; });
    const options = { characterId: 'skip-test', apiBaseUrl: '/game' };
    const background = syncGamePersistence(options);
    expect(await syncGamePersistence(options)).toEqual({ status: 'locked' });
    release();
    await background;
  });
  it('requests a waiting Web Lock for completion instead of reporting a busy profile', async () => {
    const request = vi.fn(async (_name, options, callback) => {
      expect(options.ifAvailable).toBe(false);
      await callback({});
    });
    vi.stubGlobal('navigator', { locks: { request } });
    expect(await syncGamePersistence({ characterId: 'lock-test', apiBaseUrl: '/game', waitForActive: true })).toEqual({ status: 'done' });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
