import { describe, expect, it } from 'vitest';
import { content } from '../src/content';
import { runMetrics, type RunMetrics } from './focused-metrics';
import { collectPaired, pairedStatistic, type WorkerResult } from './simulate-focused';
import { play } from './play';

describe('Stage 3.1 independent analysis', () => {
  it('uses differences within matching policy/seed pairs, not the independent two-sample SE', () => {
    const pairs = [
      { policy: 'a', seed: 1, off: { n: 10 }, on: { n: 10 } },
      { policy: 'a', seed: 2, off: { n: 20 }, on: { n: 22 } },
      { policy: 'a', seed: 3, off: { n: 30 }, on: { n: 34 } }
    ];
    const result = pairedStatistic(pairs, x => x.n);
    expect(result.n).toBe(3);
    expect(result.changed).toBe(2);
    expect(result.delta).toBeCloseTo(2);
    expect(result.se).toBeCloseTo(2 / Math.sqrt(3));
    expect(result.z).toBeCloseTo(Math.sqrt(3));
    expect(result.off).toBe(20);
    expect(result.on).toBe(22);
  });

  it('clusters uncertainty across policies that reuse the same seed', () => {
    const onePolicy = [
      { policy: 'random', seed: 1, off: { n: 10 }, on: { n: 10 } },
      { policy: 'random', seed: 2, off: { n: 20 }, on: { n: 22 } },
      { policy: 'random', seed: 3, off: { n: 30 }, on: { n: 34 } }
    ];
    const twoPolicies = [...onePolicy, ...onePolicy.map(p => ({ ...p, policy: 'mixed' }))];
    const first = pairedStatistic(onePolicy, x => x.n);
    const second = pairedStatistic(twoPolicies, x => x.n);
    expect(second.n).toBe(6);
    expect(second.seeds).toBe(3);
    expect(second.delta).toBeCloseTo(first.delta);
    expect(second.se).toBeCloseTo(first.se);
    expect(second.z).toBeCloseTo(first.z);
  });
  it('pairs by seed rather than array position, omitting unmatched runs', () => {
    const m = (n: number) => ({ neutralShown: n }) as RunMetrics;
    const rows = [{
      policy: 'mixed', runs: 4, checks: {} as WorkerResult['checks'],
      mode: {
        off: { seeds: [1, 2, 3], metrics: [m(10), m(20), m(30)] },
        on: { seeds: [3, 1, 4], metrics: [m(31), m(11), m(40)] }
      }
    }] as unknown as WorkerResult[];
    const pairs = collectPaired(rows);
    expect(pairs.map(p => p.seed)).toEqual([3, 1]);
    expect(pairedStatistic(pairs, x => x.neutralShown).delta).toBe(1);
  });

  it('does not lose counts: all 120 displayed slots are partitioned by day and source', () => {
    const { state, draws } = play(17, { policy: 'mixed' });
    const metrics = runMetrics(state, draws, content);
    const cells = Object.values(metrics.dailyKinds).flatMap(day => Object.values(day));
    expect(cells.reduce((n, cell) => n + cell.total, 0)).toBe(120);
    expect(cells.reduce((n, cell) => n + cell.neutral, 0)).toBe(metrics.neutralShown);
    expect(cells.reduce((n, cell) => n + cell.probe, 0)).toBe(metrics.probeShown);
    expect(cells.every(cell => cell.neutral + cell.probe <= cell.total)).toBe(true);
    expect(Object.keys(metrics.dailyKinds)).toHaveLength(30);
  });
});
