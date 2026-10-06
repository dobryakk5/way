import { writeFileSync } from 'node:fs';
import { content } from '../src/content';
import { ACTION_LOGICS, evaluateEvening, probeAllowed, zeroVector } from '../src/engine';
import type { ActionLogic, DevelopmentProfileEveningSnapshot, HeroDevelopmentProfileEvidence, LogicVector } from '../src/engine';
import { playLeaning, profileSummary } from './profile-scenarios';
type Ev = HeroDevelopmentProfileEvidence;
const config = content.profile.algorithms[content.profile.currentAlgorithmVersion]!;
const runs = Number(process.env.SIM_RUNS ?? 20);
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const adjacent = (a: ActionLogic, b: ActionLogic) => Math.abs(ACTION_LOGICS.indexOf(a) - ACTION_LOGICS.indexOf(b)) === 1;
/** A stylised decision: the logic at 0.55, a neighbour at 0.25 and a random third at 0.20. */
function vector(top: ActionLogic, r: () => number): LogicVector {
  const v = zeroVector(); const i = ACTION_LOGICS.indexOf(top);
  const near = ACTION_LOGICS[Math.max(0, Math.min(7, i + (r() < .5 ? -1 : 1)))]!;
  const other = ACTION_LOGICS[Math.floor(r() * 8)]!;
  v[top] += .55; v[near === top ? ACTION_LOGICS[(i + 1) % 8]! : near] += .25; v[other === top ? ACTION_LOGICS[(i + 2) % 8]! : other] += .20;
  const sum = ACTION_LOGICS.reduce((s, l) => s + v[l], 0); for (const l of ACTION_LOGICS) v[l] /= sum;
  return v;
}
interface Spec { name: string; seed: number; days?: number; perDay?: number; contexts?: number; origin?: (n: number, r: () => number) => Ev['selectionOrigin'];
  logicAt: (day: number, r: () => number) => ActionLogic; motiveLogic?: (day: number, r: () => number) => ActionLogic; noise?: number; pause?: (day: number) => boolean }
function trajectory(spec: Spec) {
  const r = rng(spec.seed); const evidence: Ev[] = []; const snaps: DevelopmentProfileEveningSnapshot[] = []; let n = 0; let probes = 0; let independent = 0; let maxProbeShare = 0;
  const days = spec.days ?? 30; const per = spec.perDay ?? 4; const ctxs = ['craft', 'money', 'neighbors', 'apprentice', 'rest', 'old-debt'].slice(0, spec.contexts ?? 5);
  for (let day = 1; day <= days; day++) {
    if (!spec.pause?.(day)) for (let slot = 0; slot < per; slot++) {
      const noisy = r() < (spec.noise ?? .15); const top = noisy ? ACTION_LOGICS[Math.floor(r() * 8)]! : spec.logicAt(day, r);
      let origin: Ev['selectionOrigin'] = spec.origin?.(n, r) ?? 'neutral';
      if (origin === 'probe' && !probeAllowed({ independentCases: independent, probeCases: probes }, config)) origin = 'neutral';
      const id = `s${spec.seed}-${n++}`; const ctx = ctxs[Math.floor(r() * ctxs.length)]!; const vec = vector(top, r);
      const base = { caseId: id, situationId: id, day, slot, cardId: id, choiceId: 'a', contextId: ctx, facets: [(['work', 'relationships', 'body', 'inner'] as const)[Math.floor(r() * 4)]!] as Ev['facets'], pressure: false, selectionOrigin: origin, developmentWeight: .6 + .4 * r(),
        algorithmVersion: '1', scoringVersion: '1', rubricVersion: '1', contentVersion: 'sim' };
      evidence.push({ ...base, id: id + '#action', source: 'action', vector: vec });
      if (origin !== 'adaptive') { independent++; if (origin === 'probe') probes++; if (independent >= 3) maxProbeShare = Math.max(maxProbeShare, probes / independent); }
      if (slot === 0 && r() < .3) evidence.push({ ...base, id: id + '#motive', source: 'motive', vector: vector(spec.motiveLogic ? spec.motiveLogic(day, r) : (r() < .8 ? top : ACTION_LOGICS[Math.floor(r() * 8)]!), r) });
      if (r() < .2) evidence.push({ ...base, id: id + '#behavior', source: 'behavior', day: Math.min(days, day + 1), vector: vector(top, r) });
    }
    evidence.sort((a, b) => a.day * 4 + a.slot - (b.day * 4 + b.slot));
    snaps.push(evaluateEvening(snaps.at(-1), evidence, day, undefined, config));
  }
  const last = snaps.at(-1)!; const first = snaps.find(s => s.status === 'stable');
  return { snaps, final: last, firstStableDay: first?.day, firstStableAs: first?.observedPrimary, maxProbeShare, evidence };
}
const rate = (n: number, d: number) => d ? +(n / d * 100).toFixed(1) : 0;
const report: Record<string, unknown> = {}; const failures: string[] = [];
// 1. Eight targets.
const confusion: Record<string, Record<string, number>> = {}; const targetRows = ACTION_LOGICS.map(target => {
  let hit = 0, wrongFar = 0; const days: number[] = []; const newAtConfirm: number[] = []; confusion[target] = {};
  for (let k = 1; k <= runs; k++) {
    const t = trajectory({ name: target, seed: k * 101 + ACTION_LOGICS.indexOf(target), logicAt: () => target });
    const as = t.final.status === 'stable' ? t.final.observedPrimary : undefined; const key = as ?? 'none'; confusion[target]![key] = (confusion[target]![key] ?? 0) + 1;
    if (as === target) hit++; else if (as && !adjacent(as, target)) wrongFar++;
    if (t.firstStableDay) { days.push(t.firstStableDay); const cand = t.snaps.find(s => s.candidatePrimary); if (cand) newAtConfirm.push(t.evidence.filter(e => e.source === 'action' && e.day <= t.firstStableDay! && e.selectionOrigin !== 'adaptive').length - (cand.candidateSinceIndependentActionCount ?? 0)); }
  }
  days.sort((a, b) => a - b);
  return { target, stableHitRate: rate(hit, runs), nonAdjacentWrongRate: rate(wrongFar, runs), firstStableDay: { min: days[0], median: days[days.length >> 1], max: days.at(-1) }, newIndependentActionsBetweenCandidateAndStable: newAtConfirm.length ? Math.min(...newAtConfirm) : undefined };
});
for (const r of targetRows) { if (r.stableHitRate < 95) failures.push(`${r.target}: hit-rate ${r.stableHitRate}% < 95%`); if (r.nonAdjacentWrongRate > 2) failures.push(`${r.target}: non-adjacent wrong center ${r.nonAdjacentWrongRate}% > 2%`); }
report.targets = targetRows; report.confusion = confusion;
// 2. Negative trajectories.
const falseStable = (_name: string, spec: (k: number) => Spec) => { let n = 0; for (let k = 1; k <= runs; k++) if (trajectory(spec(k)).final.status === 'stable') n++; return rate(n, runs); };
const mixed = falseStable('mixed', k => ({ name: 'mixed', seed: 900 + k, logicAt: (_d, r) => ACTION_LOGICS[Math.floor(r() * 8)]!, noise: 0 }));
const insufficientFew = falseStable('few', k => ({ name: 'few', seed: 1000 + k, days: 3, perDay: 1, logicAt: () => 'expert' }));
const insufficientContext = falseStable('one-context', k => ({ name: 'ctx', seed: 1100 + k, contexts: 1, logicAt: () => 'expert' }));
const adaptiveOnly = falseStable('adaptive', k => ({ name: 'adaptive', seed: 1200 + k, logicAt: () => 'expert', origin: () => 'adaptive' }));
if (mixed > 10) failures.push(`mixed false-stable ${mixed}% > 10%`);
if (insufficientFew || insufficientContext) failures.push(`insufficient false-stable ${insufficientFew}/${insufficientContext}% != 0`);
if (adaptiveOnly) failures.push(`adaptive-only false-stable ${adaptiveOnly}% != 0`);
report.falseStable = { mixed, insufficientTooFewCases: insufficientFew, insufficientOneContext: insufficientContext, adaptiveOnly };
// 3. Dynamics.
const shift = trajectory({ name: 'shift', seed: 7, logicAt: d => d <= 14 ? 'expert' : 'strategist' });
const diverge = trajectory({ name: 'diverge', seed: 8, logicAt: () => 'expert', motiveLogic: () => 'diplomat' });
const probeHeavy = trajectory({ name: 'probe', seed: 9, logicAt: () => 'expert', origin: () => 'probe' });
const adaptiveHeavy = trajectory({ name: 'adaptive-heavy', seed: 10, logicAt: () => 'expert', origin: (_n, r) => r() < .7 ? 'adaptive' : 'neutral' });
const repeat = trajectory({ name: 'repeat', seed: 11, logicAt: () => 'expert', pause: d => d > 3 });
report.dynamics = {
  shiftOverTime: { firstStableAs: shift.firstStableAs, firstStableDay: shift.firstStableDay, final: shift.final.observedPrimary, finalStatus: shift.final.status, finalCurrentDistribution: Object.fromEntries(ACTION_LOGICS.map(l => [l, +shift.final.current.distribution![l].toFixed(3)])) },
  motiveDivergesFromBehavior: { final: diverge.final.observedPrimary, status: diverge.final.status },
  adaptiveHeavy: { final: adaptiveHeavy.final.observedPrimary, status: adaptiveHeavy.final.status, independentCasesInWindow: adaptiveHeavy.final.current.N },
  probeHeavy: { maxProbeShareOfIndependent: +probeHeavy.maxProbeShare.toFixed(3), limit: +config.probe.maxShareOfIndependentWindow.toFixed(3) },
  noNewActionsNeverConfirms: !repeat.snaps.some(s => s.day > 3 && s.status === 'stable' && s.asOfEvidenceCount === repeat.snaps[2]!.asOfEvidenceCount)
};
if (probeHeavy.maxProbeShare > config.probe.maxShareOfIndependentWindow + 1e-9) failures.push('probe share exceeds 1/3');
if (!(report.dynamics as { noNewActionsNeverConfirms: boolean }).noNewActionsNeverConfirms) failures.push('stable set without new independent actions');
// 4. Real content with a consistent hero (informational: content calibration, not formula correctness).
const contentRuns = Math.min(runs, 20);
const contentRows = ACTION_LOGICS.map(target => {
  const centers: Record<string, number> = {}; const days: number[] = []; let stableAtEnd = 0, everCenter = 0;
  for (let seed = 1; seed <= contentRuns; seed++) {
    const s = profileSummary(playLeaning(seed, target, .1).state);
    const key = `${s.status}/${s.observedPrimary ?? '-'}`; centers[key] = (centers[key] ?? 0) + 1;
    if (s.observedPrimary === target) everCenter++; if (s.status === 'stable' && s.observedPrimary === target) stableAtEnd++; if (s.firstStableDay && s.firstStableAs === target) days.push(s.firstStableDay);
  }
  days.sort((a, b) => a - b);
  return { target, reachedAsCenterPct: rate(everCenter, contentRuns), stableAtDay30Pct: rate(stableAtEnd, contentRuns), firstStableDay: { min: days[0], median: days[days.length >> 1], p90: days[Math.min(days.length - 1, Math.floor(days.length * .9))] }, endStates: centers };
});
report.realContentConsistentHero = contentRows;
report.contentGate = { allEightReachable: contentRows.every(r => r.reachedAsCenterPct >= 95), reachableLogics: contentRows.filter(r => r.reachedAsCenterPct >= 95).map(r => r.target), unreachableLogics: contentRows.filter(r => r.reachedAsCenterPct < 95).map(r => r.target) };
const out = { contentVersion: content.profile.currentAlgorithmVersion, algorithmVersion: content.profile.currentAlgorithmVersion, runsPerTarget: runs, ...report, failures };
if (process.argv.includes('--write')) writeFileSync('reports/profile-simulation.v2.4.json', JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ targets: targetRows.map(r => [r.target, r.stableHitRate, r.nonAdjacentWrongRate, r.firstStableDay.median]), falseStable: report.falseStable, dynamics: report.dynamics,
  realContent: contentRows.map(r => [r.target, r.reachedAsCenterPct, r.stableAtDay30Pct]), contentGate: report.contentGate, failures }, null, 1));
if (failures.length) process.exitCode = 1; else console.log('ARITHMETIC SIMULATION TARGETS OK (content gate reported separately)');
