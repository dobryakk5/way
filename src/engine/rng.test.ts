import { describe, expect, it } from 'vitest';
import { deterministicRandom, hashSeed, mulberry32 } from './rng';

describe('rng', () => {
  it('is deterministic for the same seed and salt', () => {
    expect(deterministicRandom(42, 2, 1, 'draw')).toBe(
      deterministicRandom(42, 2, 1, 'draw')
    );
  });

  it('changes when slot or salt changes', () => {
    expect(deterministicRandom(42, 2, 1, 'draw')).not.toBe(
      deterministicRandom(42, 2, 2, 'draw')
    );
    expect(deterministicRandom(42, 2, 1, 'draw')).not.toBe(
      deterministicRandom(42, 2, 1, 'sides')
    );
  });

  it('returns values in [0, 1)', () => {
    const random = mulberry32(hashSeed(7, 'test'));
    for (let index = 0; index < 100; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
