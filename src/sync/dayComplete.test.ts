import { describe, expect, it, vi } from 'vitest';
import { completeCharacterDay } from './dayComplete';

const CHARACTER = '33333333-3333-4333-8333-333333333333';

describe('day complete client', () => {
  it('parses a completed result', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      status: 'completed',
      gameDay: 1,
      lastSeq: 4,
      profileStatus: 'insufficient_data',
      centerScores: { expert: 0.4, achiever: 0.6 },
      currentCenter: null,
      currentCenterConfidence: null,
      emergingCenter: null,
      emergingCenterConfidence: null,
      dailyEvidence: { expert: 0.4, achiever: 0.6 },
      algorithmState: { totalWeight: 1 },
      evidenceCount: 1,
      taxonomyVersion: 'development-centers-v1',
      evidenceModelVersion: 'evidence-v1',
      calculationVersion: 'development-v1'
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await completeCharacterDay({
      characterId: CHARACTER,
      gameDay: 1,
      lastSeq: 4,
      apiBaseUrl: 'https://example.test/',
      fetchImpl: fetchImpl as typeof fetch
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.result.centerScores.achiever).toBe(0.6);
    }
  });

  it('returns missing seq from an incomplete day', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      code: 'DAY_EVENTS_INCOMPLETE',
      missingSeq: [3]
    }), { status: 409, headers: { 'content-type': 'application/json' } }));

    const result = await completeCharacterDay({
      characterId: CHARACTER,
      gameDay: 1,
      lastSeq: 4,
      apiBaseUrl: 'https://example.test',
      fetchImpl: fetchImpl as typeof fetch
    });

    expect(result).toEqual({ status: 'incomplete', missingSeq: [3] });
  });

  it('treats 401 as an auth pause', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }));
    const result = await completeCharacterDay({
      characterId: CHARACTER,
      gameDay: 1,
      lastSeq: 0,
      apiBaseUrl: 'https://example.test',
      fetchImpl: fetchImpl as typeof fetch
    });
    expect(result).toEqual({ status: 'paused-auth' });
  });
});
