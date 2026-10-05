import { readFileSync, writeFileSync } from 'node:fs';
import { content } from '../src/content';
import { ACTION_LOGICS, FACETS, allChoices, dependsOnDevelopment } from '../src/engine';
import type { ActionLogic, Card } from '../src/engine';
import { leaning, profileSummary } from './profile-scenarios';
import { DEVELOPMENT_SCENARIOS } from './development-scenarios';
import { play } from './play';
const PAIRS: [ActionLogic, ActionLogic][] = ACTION_LOGICS.slice(0, 7).map((l, i) => [l, ACTION_LOGICS[i + 1]!]);
const top = (v: Record<ActionLogic, number>) => [...ACTION_LOGICS].sort((a, b) => v[b] - v[a]);
const diagnostic = content.cards.filter(c => c.diagnostic);
const neutral = diagnostic.filter(c => !c.tags?.includes('probe-only') && !dependsOnDevelopment(c));
const probes = diagnostic.filter(c => c.tags?.includes('probe-only'));
const choicesOf = (c: Card) => allChoices(c);
const key = (c: Card, id: string) => `${c.id}/${id}`;

/** §21.3: minimum amount of independent diagnostic content. */
export function coverage() {
  const situations = new Set(neutral.map(c => c.diagnostic!.situationId));
  const contexts = new Set(neutral.map(c => c.diagnostic!.contextId));
  const perFacet = Object.fromEntries(FACETS.map(f => [f, new Set(neutral.filter(c => c.diagnostic!.facets.includes(f)).map(c => c.diagnostic!.situationId)).size]));
  const perPair = PAIRS.map(([a, b]) => ({ pair: `${a}↔${b}`, probes: probes.filter(c => c.diagnostic!.distinguishes!.includes(a) && c.diagnostic!.distinguishes!.includes(b)).length }));
  const checks = { neutralSituations: [situations.size, 32], contexts: [contexts.size, 4], ...Object.fromEntries(FACETS.map(f => [`facet:${f}`, [perFacet[f], 6]])), probesTotal: [probes.length, 21], ...Object.fromEntries(perPair.map(p => [`probes:${p.pair}`, [p.probes, 3]])) } as Record<string, [number, number]>;
  return { ok: Object.values(checks).every(([n, min]) => n >= min), checks };
}
/** Share of options per logic: a systemic tilt of content shows up here. */
export function balance() {
  const topCount = Object.fromEntries(ACTION_LOGICS.map(l => [l, 0])) as Record<ActionLogic, number>; const mean = { ...topCount }; let n = 0;
  for (const c of neutral) for (const ch of choicesOf(c)) { const v = ch.diagnosticAction!.vector; topCount[top(v)[0]!]++; n++; for (const l of ACTION_LOGICS) mean[l] += v[l]; }
  for (const l of ACTION_LOGICS) mean[l] = +(mean[l] / n).toFixed(3);
  const sceneBound = 2; // each scene offers two options whose vectors sum to 1: Σ over logics of the best share ≤ 2
  return { options: n, topCount, meanComponent: mean, maxMeanComponentRatio: +(Math.max(...Object.values(mean)) / Math.min(...Object.values(mean))).toFixed(2), sceneBound };
}
/** Editors get the text and rubric, never the vectors. */
export function reviewTemplate() {
  return { rubric: content.profile.algorithms['1']!.rubric, logics: ACTION_LOGICS, instruction: 'For each item give "top1" (the dominant logic of the choice) and "top2" (an acceptable second logic). Do not look at the card files.',
    items: [...neutral, ...probes].flatMap(c => choicesOf(c).map(ch => ({ key: key(c, ch.id), situation: c.text, choice: ch.label, top1: null as ActionLogic | null, top2: null as ActionLogic | null }))) };
}
/** Cohen's kappa over top-1 and agreement of the authored top-1 with the editor's top-1 or top-2. */
export function agreement(review: { key: string; top1: ActionLogic; top2: ActionLogic }[]) {
  const authored = new Map<string, ActionLogic>();
  for (const c of [...neutral, ...probes]) for (const ch of choicesOf(c)) authored.set(key(c, ch.id), top(ch.diagnosticAction!.vector)[0]!);
  const pairs = review.filter(r => authored.has(r.key)).map(r => [authored.get(r.key)!, r.top1, r.top2] as const);
  const n = pairs.length; const po = pairs.filter(p => p[0] === p[1]).length / n;
  const pe = ACTION_LOGICS.reduce((s, l) => s + pairs.filter(p => p[0] === l).length / n * pairs.filter(p => p[1] === l).length / n, 0);
  const kappa = (po - pe) / (1 - pe); const inTop2 = pairs.filter(p => p[0] === p[1] || p[0] === p[2]).length / n;
  return { n, kappa: +kappa.toFixed(3), top2Agreement: +inTop2.toFixed(3), pass: kappa >= .7 && inTop2 >= .9 };
}
/** Expert timing: when the center appears and whether the real arc can still be completed afterwards. */
export function expertTiming(seeds = 40) {
  const arcChoices = DEVELOPMENT_SCENARIOS.grow!.choices!; const rows: { day?: number; promoted: boolean }[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const { state } = play(seed, { ...leaning('expert', .1), choices: arcChoices });
    const s = profileSummary(state); rows.push({ ...(s.firstStableAs === 'expert' && s.firstStableDay ? { day: s.firstStableDay } : {}), promoted: state.development.transitions.length > 0 });
  }
  const days = rows.flatMap(r => r.day ? [r.day] : []).sort((a, b) => a - b); const q = (p: number) => days[Math.min(days.length - 1, Math.floor(days.length * p))];
  const byDay = (lo: number, hi: number) => { const g = rows.filter(r => r.day !== undefined && r.day >= lo && r.day <= hi); return { runs: g.length, promotedPct: g.length ? +(g.filter(r => r.promoted).length / g.length * 100).toFixed(0) : null }; };
  return { runs: seeds, withExpertCenter: days.length, earliest: days[0], median: q(.5), p90: q(.9), promotion: { centerByDay16: byDay(1, 16), centerAfterDay16: byDay(17, 30) },
    note: 'The first trial is on day 17: a center set later misses the first cycle and has to finish the arc through the repeat scenes.' };
}
if (process.argv[1]?.endsWith('profile-calibration.ts')) {
  const a = process.argv.indexOf('--agreement');
  if (a > 0) console.log(JSON.stringify(agreement(JSON.parse(readFileSync(process.argv[a + 1]!, 'utf8')).items ?? JSON.parse(readFileSync(process.argv[a + 1]!, 'utf8'))), null, 1));
  else {
    const out = { coverage: coverage(), balance: balance(), expertTiming: expertTiming(), editorReview: { status: 'pending', note: 'Blind second-editor review has not been done. Export reports/profile-editor-review.json, give it to an editor, then run with --agreement <file>.' } };
    if (process.argv.includes('--write')) { writeFileSync('reports/profile-calibration.v2.4.json', JSON.stringify(out, null, 2) + '\n'); writeFileSync('reports/profile-editor-review.json', JSON.stringify(reviewTemplate(), null, 2) + '\n'); }
    console.log(JSON.stringify(out, null, 1));
  }
}
