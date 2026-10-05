import { writeFileSync, mkdirSync } from 'node:fs';
import { content } from '../../src/content';
import { drawCard, evaluateEvening, freePool, leaders, liveProfile, probeAllowed } from '../../src/engine';
import type { ActionLogic, DevelopmentProfileEveningSnapshot, HeroDevelopmentProfileEvidence, LifeFacet } from '../../src/engine';
import { play } from '../play';
import { LOGICS, parsePackage, type Logic, type SourceChoice, type SourceProbe, type SourceScene } from './parse-package';

// Phase 0 gate: can the package's own vectors produce the profile the spec requires on the REAL calendar?
// The arithmetic is the production evaluateEvening(); the calendar is measured from real plays of the current game
// (free-pool size and weight at every free slot), the 32 neutral scenes and 21 probes are added to that pool as stubs.
// Mode A = neutral only (rollout/calibration). Mode B = neutral + profile-conditioned probes <= 1/3 (production).
type Ev = HeroDevelopmentProfileEvidence;
const baseConfig = content.profile.algorithms[content.profile.currentAlgorithmVersion]!;
// Offline threshold experiment only (never written to content): SIM_SHARE / SIM_DELTA / SIM_CONF override the stableCandidate gates.
const config = process.env.SIM_SHARE ? { ...baseConfig, stableCandidate: { ...baseConfig.stableCandidate, minLeaderShare: Number(process.env.SIM_SHARE),
  minDelta: Number(process.env.SIM_DELTA ?? baseConfig.stableCandidate.minDelta), minConfidence: Number(process.env.SIM_CONF ?? baseConfig.stableCandidate.minConfidence) } } : baseConfig;
const RUNS = Number(process.env.SIM_RUNS ?? 100);
const BASELINES = Number(process.env.SIM_BASELINES ?? 40);
const SCORING = (process.env.SIM_SCORING ?? 'full') as 'full' | 'contrast'; // 'contrast' is an OFFLINE experiment only: chosen minus mean of rejected
const NEUTRAL_WEIGHT = 3; // 'situation' default in draw.ts weighted()
const parsed = parsePackage();
const adjacent = (a: Logic, b: Logic) => Math.abs(LOGICS.indexOf(a) - LOGICS.indexOf(b)) === 1;

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---- Calendar baseline --------------------------------------------------------------------------------------------------
interface PoolSlot { day: number; slot: number; stories: number; weight: number; dice: boolean }
function baseline(seed: number): PoolSlot[] {
  const slots: PoolSlot[] = [];
  play(seed, { beforeStep: s => {
    if (s.phase === 'slot' && !s.current) {
      const d = drawCard(s, content);
      if (d?.source === 'pool') {
        const pool = freePool(s, content);
        slots.push({ day: s.day, slot: s.slot, stories: pool.length, weight: pool.reduce((a, c) => a + (c.weight ?? (c.type === 'situation' ? 3 : 1)), 0),
          dice: !s.diceHistory.some(x => x.day === s.day) && pool.length >= 6 });
      }
    }
    return s;
  } });
  return slots;
}

// ---- Hero ---------------------------------------------------------------------------------------------------------------
type Policy = { kind: 'target'; target: Logic } | { kind: 'random' } | { kind: 'position'; index: number } | { kind: 'shift'; from: Logic; to: Logic; day: number };
function pick(policy: Policy, choices: SourceChoice[], day: number, noise: number, r: () => number): SourceChoice {
  if (policy.kind === 'random' || r() < noise) return choices[Math.floor(r() * choices.length)]!;
  if (policy.kind === 'position') return choices[Math.min(policy.index, choices.length - 1)]!;
  const t = policy.kind === 'target' ? policy.target : day < policy.day ? policy.from : policy.to;
  return choices.reduce((best, c) => c.vector[t] > best.vector[t] ? c : best, choices[0]!);
}
interface Result { snaps: DevelopmentProfileEveningSnapshot[]; neutralSeen: number; probeSeen: number; maxProbeShare: number; neutralExhaustedOnDay?: number; evidence: Ev[] }
function hero(policy: Policy, mode: 'A' | 'B', base: PoolSlot[], seed: number, noise = 0.1, onlyDays?: number): Result {
  const r = rng(seed);
  const neutral: SourceScene[] = [...parsed.neutral]; const probes: SourceProbe[] = [...parsed.probes];
  const evidence: Ev[] = []; const snaps: DevelopmentProfileEveningSnapshot[] = [];
  const origins: ('neutral' | 'probe')[] = []; let maxProbeShare = 0; let exhausted: number | undefined;
  const add = (scene: { id: string; contextId: string; facets: string[]; developmentWeight: number; pressure?: boolean; choices: SourceChoice[] }, choice: SourceChoice, day: number, slot: number, origin: 'neutral' | 'probe') => {
    let vector: Record<Logic, number> = choice.vector;
    if (SCORING === 'contrast') {
      const others = scene.choices.filter(c => c !== choice);
      const diff = Object.fromEntries(LOGICS.map(l => [l, Math.max(0, choice.vector[l] - others.reduce((a, o) => a + o.vector[l], 0) / others.length)])) as Record<Logic, number>;
      const sum = LOGICS.reduce((a, l) => a + diff[l], 0);
      if (sum > 1e-9) vector = Object.fromEntries(LOGICS.map(l => [l, diff[l] / sum])) as Record<Logic, number>;
    }
    evidence.push({ id: `${scene.id}#action`, caseId: scene.id, situationId: scene.id, source: 'action', day, slot, cardId: scene.id, choiceId: choice.id, contextId: scene.contextId,
      facets: scene.facets as LifeFacet[], pressure: scene.pressure ?? false, selectionOrigin: origin, developmentWeight: scene.developmentWeight,
      vector: vector as unknown as Ev['vector'], algorithmVersion: '1', scoringVersion: '1', rubricVersion: '1', contentVersion: 'sim' });
    origins.push(origin);
    const w = origins.slice(-config.windowCases); const p = w.filter(o => o === 'probe').length;
    if (w.length >= 3) maxProbeShare = Math.max(maxProbeShare, p / w.length);
  };
  const days = onlyDays ?? content.episode.days;
  for (let day = 1; day <= days; day++) {
    for (const s of base.filter(b => b.day === day)) {
      const window = origins.slice(-config.windowCases);
      let probe: SourceProbe | undefined;
      if (mode === 'B' && probes.length) {
        const live = liveProfile([...evidence], config).currentDistribution as Record<ActionLogic, number> | undefined;
        if (live) {
          const [a, b] = leaders(live as never); const last = snaps.at(-1);
          const settled = !!last?.candidatePrimary && a && b && live[a] - live[b] >= config.confidence.deltaTarget;
          if (a && b && live[a] !== live[b] && !settled && probeAllowed({ independentCases: window.length, probeCases: window.filter(o => o === 'probe').length }, config)) {
            const candidates = probes.filter(p => p.distinguishes.includes(a as Logic) && p.distinguishes.includes(b as Logic));
            if (candidates.length) probe = candidates[Math.floor(r() * candidates.length)];
          }
        }
      }
      // A probe takes the die's sixth place (1/6) on the day's first draw and is always shown on the other slots.
      const probeShown = !!probe && (!s.dice || r() < 1 / 6);
      if (probeShown && probe) { probes.splice(probes.indexOf(probe), 1); add(probe, pick(policy, probe.choices, day, noise, r), day, s.slot, 'probe'); continue; }
      if (!neutral.length) { exhausted ??= day; continue; }
      const pNeutral = s.dice ? neutral.length / (s.stories + neutral.length) : NEUTRAL_WEIGHT * neutral.length / (s.weight + NEUTRAL_WEIGHT * neutral.length);
      if (r() < pNeutral) { const scene = neutral.splice(Math.floor(r() * neutral.length), 1)[0]!; add(scene, pick(policy, scene.choices, day, noise, r), day, s.slot, 'neutral'); }
    }
    snaps.push(evaluateEvening(snaps.at(-1), [...evidence], day, undefined, config));
  }
  return { snaps, neutralSeen: origins.filter(o => o === 'neutral').length, probeSeen: origins.filter(o => o === 'probe').length, maxProbeShare, ...(exhausted ? { neutralExhaustedOnDay: exhausted } : {}), evidence };
}

// ---- Report ---------------------------------------------------------------------------------------------------------------
const q = (xs: number[], p: number) => xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : undefined;
const pct = (n: number, d: number) => d ? +(100 * n / d).toFixed(1) : 0;
// The engine creates developmentCurrent at the FIRST stable evening (establishInitialDevelopmentCurrent), so that is the gate metric.
const firstStable = (r: Result) => r.snaps.find(s => s.status === 'stable');
const finalCenter = (r: Result) => firstStable(r)?.observedPrimary;
const heldAtEnd = (r: Result) => r.snaps.at(-1)!.status === 'stable';
const baselines = Array.from({ length: BASELINES }, (_, i) => baseline(i + 1));
const freeSlots = baselines.map(b => b.length);
console.log(`calendar: ${BASELINES} baseline plays, free pool slots per run min/median/max = ${Math.min(...freeSlots)}/${q(freeSlots, .5)}/${Math.max(...freeSlots)}; story pool at day 1/10/20/30 (median) =`,
  [1, 10, 20, 30].map(d => q(baselines.flatMap(b => b.filter(s => s.day === d).map(s => s.stories)), .5)).join('/'));

const failures: string[] = []; const report: Record<string, unknown> = { runs: RUNS, baselines: BASELINES, freeSlots: { min: Math.min(...freeSlots), median: q(freeSlots, .5), max: Math.max(...freeSlots) } };
for (const mode of ['A', 'B'] as const) {
  const rows = LOGICS.map((target, ti) => {
    let hit = 0, far = 0, none = 0, held = 0, probeSum = 0, neutralSum = 0, exhaust = 0, maxShare = 0; const days: number[] = []; const wrong: Record<string, number> = {};
    for (let k = 0; k < RUNS; k++) {
      const res = hero({ kind: 'target', target }, mode, baselines[k % BASELINES]!, 1000 * ti + k + 1);
      const c = finalCenter(res); const fs = firstStable(res);
      if (c === target) hit++; else if (c) { wrong[c] = (wrong[c] ?? 0) + 1; if (!adjacent(c as Logic, target)) far++; } else none++;
      if (fs) { days.push(fs.day); if (heldAtEnd(res)) held++; }
      probeSum += res.probeSeen; neutralSum += res.neutralSeen; if (res.neutralExhaustedOnDay) exhaust++; maxShare = Math.max(maxShare, res.maxProbeShare);
    }
    return { target, hitRate: pct(hit, RUNS), nonAdjacentWrong: pct(far, RUNS), neverStable: pct(none, RUNS), stableHeldAtDay30Pct: pct(held, RUNS), wrongCenters: wrong,
      firstStableDay: { min: Math.min(...days), median: q(days, .5), p90: q(days, .9) }, avgNeutral: +(neutralSum / RUNS).toFixed(1), avgProbe: +(probeSum / RUNS).toFixed(1),
      exhaustedPct: pct(exhaust, RUNS), maxProbeShare: +maxShare.toFixed(3) };
  });
  const mixedRuns = Array.from({ length: RUNS }, (_, k) => hero({ kind: 'random' }, mode, baselines[k % BASELINES]!, 50000 + k, 0));
  const mixed = pct(mixedRuns.filter(r => finalCenter(r)).length, RUNS);
  const positions = [0, 1, 2, 3].map(i => {
    const rs = Array.from({ length: RUNS }, (_, k) => hero({ kind: 'position', index: i }, mode, baselines[k % BASELINES]!, 60000 + 1000 * i + k, 0));
    const centers: Record<string, number> = {}; for (const r of rs) { const c = finalCenter(r); if (c) centers[c] = (centers[c] ?? 0) + 1; }
    return { position: 'ABCD'[i], stablePct: pct(rs.filter(r => finalCenter(r)).length, RUNS), centers };
  });
  const shifted = Array.from({ length: RUNS }, (_, k) => hero({ kind: 'shift', from: 'expert', to: 'strategist', day: 14 }, mode, baselines[k % BASELINES]!, 70000 + k));
  const shiftOutcome: Record<string, number> = {}; for (const r of shifted) { const c = finalCenter(r) ?? 'none'; shiftOutcome[c] = (shiftOutcome[c] ?? 0) + 1; }
  const few = Array.from({ length: RUNS }, (_, k) => hero({ kind: 'target', target: 'expert' }, mode, baselines[k % BASELINES]!, 80000 + k, 0.1, 4));
  const insufficient = pct(few.filter(r => finalCenter(r)).length, RUNS);
  const medianAll = q(rows.flatMap(r => r.firstStableDay.median ? [r.firstStableDay.median] : []), .5);
  const p90All = Math.max(...rows.map(r => r.firstStableDay.p90 ?? 99));
  for (const r of rows) {
    if (r.hitRate < 95) failures.push(`[${mode}] ${r.target}: hit-rate ${r.hitRate}% < 95%`);
    if (r.nonAdjacentWrong > 2) failures.push(`[${mode}] ${r.target}: non-adjacent wrong center ${r.nonAdjacentWrong}% > 2%`);
  }
  if (mixed > 10) failures.push(`[${mode}] mixed false-stable ${mixed}% > 10%`);
  if (insufficient > 0) failures.push(`[${mode}] insufficient (4 days) false-stable ${insufficient}% != 0`);
  if (mode === 'B') { const m = Math.max(...rows.map(r => r.maxProbeShare)); if (m > 1 / 3 + 1e-9) failures.push(`[B] probe share ${m} > 1/3`); }
  if (mode === 'B' && rows.some(r => (r.firstStableDay.median ?? 99) > 10)) failures.push(`[B] median first stable day > 10 for ${rows.filter(r => (r.firstStableDay.median ?? 99) > 10).map(r => r.target).join(',')}`);
  if (mode === 'B' && rows.some(r => (r.firstStableDay.p90 ?? 99) > 16)) failures.push(`[B] P90 first stable day > 16 for ${rows.filter(r => (r.firstStableDay.p90 ?? 99) > 16).map(r => r.target).join(',')}`);
  report[`mode${mode}`] = { targets: rows, mixedFalseStablePct: mixed, insufficientFalseStablePct: insufficient, positionStrategies: positions, shiftExpertToStrategist: shiftOutcome, medianOfMedians: medianAll, worstP90: p90All };
  console.log(`\n=== MODE ${mode} (${mode === 'A' ? 'neutral only' : 'neutral + probes <= 1/3'}) ===`);
  console.table(rows.map(r => ({ target: r.target, hit: r.hitRate, farWrong: r.nonAdjacentWrong, never: r.neverStable, held30: r.stableHeldAtDay30Pct, 'day min/med/p90': `${r.firstStableDay.min}/${r.firstStableDay.median}/${r.firstStableDay.p90}`,
    neutral: r.avgNeutral, probe: r.avgProbe, exhausted: r.exhaustedPct, probeShareMax: r.maxProbeShare, wrong: JSON.stringify(r.wrongCenters) })));
  console.log(`mixed false-stable ${mixed}% | 4-day insufficient false-stable ${insufficient}% | shift expert→strategist final: ${JSON.stringify(shiftOutcome)}`);
  console.log('position strategies:', JSON.stringify(positions));
}
report.failures = failures;
mkdirSync('reports', { recursive: true });
writeFileSync(`reports/v25-phase0-simulation.${SCORING}.json`, JSON.stringify({ scoring: SCORING, ...report }, null, 2) + '\n');
console.log(failures.length ? `\nGATE FAILURES (${failures.length}):\n${failures.join('\n')}` : '\nPHASE 0 GATE OK');
if (failures.length) process.exitCode = 1;
