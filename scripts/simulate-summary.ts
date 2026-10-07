import { writeFileSync } from 'node:fs';
import { content } from '../src/content';
import { ACTION_LOGICS } from '../src/engine';
import type { ActionLogic, GameState, ReflectionCase } from '../src/engine';
import { POLICIES, play, type PlayOptions } from './play';
import { leaning } from './profile-scenarios';
import { PERSONAL_TRAIT_PATTERN } from './check-content';

// Day Reflection acceptance simulation (REQs/DAY-REFLECTION-v1.md, section 14, items 7 and 11).
// Full runs of the real game: which status each evening reads, when the player first sees a cautious observation,
// whether every firm promise is kept, and which templates and threads never occur.
const RUNS = Number(process.env.SIM_RUNS ?? 20);
const DAYS = content.episode.days;
type Hero = { name: string; options: (seed: number) => PlayOptions };
const heroes: Hero[] = [
  ...ACTION_LOGICS.map((l: ActionLogic): Hero => ({ name: `leans:${l}`, options: () => leaning(l, 0.1) })),
  ...POLICIES.map((p): Hero => ({ name: `policy:${p}`, options: () => ({ policy: p }) }))
];
const failures: string[] = [];
const pct = (n: number, d: number) => d ? Math.round(1000 * n / d) / 10 : 0;
const percentile = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : undefined; };

const statusByDay: Record<number, Record<string, number>> = {};
const cases: Record<string, number> = {};
const used = { templates: new Set<string>(), threads: new Set<string>(), reflection: new Set<string>() };
const firstSeen: Record<'provisional' | 'stable' | 'refining' | 'downgrade', number[]> = { provisional: [], stable: [], refining: [], downgrade: [] };
const perHero: Record<string, { runs: number; sawProvisional: number; sawStable: number; sawDowngrade: number; sawRefining: number }> = {};
const echoByDay: Record<number, { repeat: number; varied: number; none: number }> = {};
const echoFirst: number[] = []; const personalFirst: number[] = [];
let echoRuns = 0, echoBad = 0;
let runs = 0, firm = 0, firmBroken = 0, firmTomorrowWrong = 0, missing = 0, emptyNights = 0;
let withChanges = 0, withUnfinished = 0, nightsTotal = 0;

for (const hero of heroes) {
  const row = perHero[hero.name] = { runs: 0, sawProvisional: 0, sawStable: 0, sawDowngrade: 0, sawRefining: 0 };
  for (let k = 1; k <= RUNS; k++) {
    const seed = 100 + k;
    const state: GameState = play(seed, hero.options(seed)).state;
    runs++; row.runs++;
    const first: Partial<Record<ReflectionCase, number>> = {};
    let echoDay: number | undefined, personalDay: number | undefined;
    for (const n of state.nights) {
      nightsTotal++;
      const s = n.summary;
      if (!s) { missing++; continue; }
      statusByDay[n.day] ??= {};
      statusByDay[n.day]![s.reflection.status] = (statusByDay[n.day]![s.reflection.status] ?? 0) + 1;
      cases[s.reflection.case] = (cases[s.reflection.case] ?? 0) + 1;
      first[s.reflection.case] ??= n.day;
      used.reflection.add(s.reflection.templateId);
      const row = echoByDay[n.day] ??= { repeat: 0, varied: 0, none: 0 };
      const e = s.reflection.echo;
      row[e ? e.kind : 'none']++;
      if (e && PERSONAL_TRAIT_PATTERN.test(e.text)) echoBad++;
      if (e?.kind === 'repeat') echoDay ??= n.day;
      if (e?.kind === 'repeat' || s.reflection.case === 'provisional' || s.reflection.case === 'stable') personalDay ??= n.day;
      if (!s.worldChanges.length && !s.unfinished.length) emptyNights++;
      if (s.worldChanges.length) withChanges++;
      if (s.unfinished.length) withUnfinished++;
      for (const w of s.worldChanges) used.templates.add(w.templateId);
      for (const u of s.unfinished) {
        used.threads.add(u.threadId);
        if (u.promise !== 'firm' || u.source.kind !== 'scheduled') continue;
        firm++;
        const src = u.source;
        // The promised card must really be shown, no later than its latest day.
        if (!state.history.some(h => h.cardId === src.cardId && h.day > n.day && h.day <= (src.latestDay ?? DAYS))) firmBroken++;
        if (/завтра/i.test(u.text) && src.day !== n.day + 1) firmTomorrowWrong++;
      }
    }
    if (echoDay !== undefined) { echoRuns++; echoFirst.push(echoDay); }
    if (personalDay !== undefined) personalFirst.push(personalDay);
    for (const key of ['provisional', 'stable', 'refining', 'downgrade'] as const) if (first[key] !== undefined) {
      firstSeen[key].push(first[key]!);
      row[key === 'provisional' ? 'sawProvisional' : key === 'stable' ? 'sawStable' : key === 'refining' ? 'sawRefining' : 'sawDowngrade']++;
    }
  }
}

const everyReflection = [
  ...['just_started', 'forming', 'refining', 'downgrade', 'unsettled'].map(x => `reflection.${x}`),
  ...ACTION_LOGICS.flatMap(l => [`reflection.provisional.${l}`, `reflection.stable.${l}`])
];
const unusedTemplates = content.summaryTemplates.changes.map(t => t.id).filter(id => !used.templates.has(id));
const unusedThreads = content.threads.map(t => t.id).filter(id => !used.threads.has(id) && !(content.threads.find(t => t.id === id)?.kind === 'opportunity' && used.templates.has(`thread.${id}.resolved`)));
const unusedReflection = everyReflection.filter(id => !used.reflection.has(id));

if (missing) failures.push(`${missing} evenings without a summary`);
if (firmBroken) failures.push(`${firmBroken} firm promises were not kept`);
if (firmTomorrowWrong) failures.push(`${firmTomorrowWrong} promises said tomorrow when it was not tomorrow`);
if (!firstSeen.provisional.length) failures.push('no run ever showed a cautious observation');
if (echoBad) failures.push(`${echoBad} echo texts state a lasting property`);
if (!echoFirst.length) failures.push('no run ever showed a behavioural echo');

const byDay = Object.fromEntries(Array.from({ length: DAYS }, (_, i) => i + 1).map(d => {
  const r = statusByDay[d] ?? {}; const total = Object.values(r).reduce((a, b) => a + b, 0);
  return [d, { insufficient: pct(r.insufficient ?? 0, total), provisional: pct(r.provisional ?? 0, total), stable: pct(r.stable ?? 0, total) }];
}));
const first = (xs: number[]) => ({ runs: xs.length, share: pct(xs.length, runs), min: xs.length ? Math.min(...xs) : undefined, median: percentile(xs, 0.5), p90: percentile(xs, 0.9) });
const report = {
  contentVersion: content.summaryTemplates.rulesVersion, algorithm: content.profile.currentAlgorithmVersion, runs, runsPerHero: RUNS, days: DAYS,
  statusPctByDay: byDay, cases, firstSeen: Object.fromEntries(Object.entries(firstSeen).map(([k, v]) => [k, first(v)])),
  echoPctByDay: Object.fromEntries(Array.from({ length: DAYS }, (_, i) => i + 1).map(d => { const r = echoByDay[d] ?? { repeat: 0, varied: 0, none: 0 }; const t = r.repeat + r.varied + r.none; return [d, { repeat: pct(r.repeat, t), varied: pct(r.varied, t), none: pct(r.none, t) }]; })),
  firstEcho: first(echoFirst), firstPersonalReading: first(personalFirst),
  perHero, promises: { firm, kept: firm - firmBroken, wrongTomorrow: firmTomorrowWrong },
  coverage: { nights: nightsTotal, withChangesPct: pct(withChanges, nightsTotal), withUnfinishedPct: pct(withUnfinished, nightsTotal), emptyPct: pct(emptyNights, nightsTotal) },
  unreachable: { changeTemplates: unusedTemplates, threads: unusedThreads, reflectionTemplates: unusedReflection }, failures
};
writeFileSync('reports/day-reflection-simulation.v1.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ runs, firstSeen: report.firstSeen, firstEcho: report.firstEcho, firstPersonalReading: report.firstPersonalReading, echoDays1to8: Object.fromEntries(Object.entries(report.echoPctByDay).slice(0, 8)), promises: report.promises, coverage: report.coverage, unreachable: report.unreachable, failures }, null, 1));
if (failures.length) process.exitCode = 1;
