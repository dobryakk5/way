import { writeFileSync } from 'node:fs';
import { content } from '../src/content';
import { CONTENT_VERSION } from '../src/content/version';
import { allChoices } from '../src/engine';
import { buildImpactGraph, choiceKey, impactOf } from '../src/engine/impact';
import type { ObservableImpactEvent, ObservableImpactKind } from '../src/engine';
import type { PolicyName } from './play';
import { isDecisionImpact, openingCriteria, playObserved } from './impact-observe';

// WORLD-IMPACT v1 acceptance simulation (REQs/WORLD-IMPACT-v1.md, sections 19, 21-23, 32).
// Only what was shown to the hero counts. Scripted policies must meet the opening criterion in 100% of runs, random ones in 95%.
const RUNS = Number(process.env.SIM_RUNS ?? 300);
// The opening criteria need only the first days, but a decision's later consequences (the fair on day 10, chains in chapter 2) are part of the audit.
const THROUGH = Number(process.env.SIM_THROUGH ?? content.episode.days);
const REPORT_DAYS = [1, 2, 3, 7];
const SCRIPTED: PolicyName[] = ['always-first', 'always-second', 'always-costly', 'greedy-resources', 'greedy-qualities'];
const STOCHASTIC: PolicyName[] = ['random', 'mixed'];
const KINDS: ObservableImpactKind[] = ['callback', 'choice', 'visual', 'delayed', 'cross-character'];
const pct = (n: number, d: number) => d ? Math.round(1000 * n / d) / 10 : 0;
const failures: string[] = [];

type Run = { policy: PolicyName; seed: number; events: ObservableImpactEvent[]; chosen: { key: string; day: number }[]; drawn: { cardId: string; day: number }[] };
const runs: Run[] = [];
for (const policy of [...SCRIPTED, ...STOCHASTIC]) for (let seed = 1; seed <= RUNS; seed++) {
  const r = playObserved(seed, { policy, throughDay: THROUGH });
  runs.push({ policy, seed, events: r.events, chosen: r.state.history.filter(h => h.day <= THROUGH).map(h => ({ key: choiceKey(h.cardId, h.choiceId), day: h.day })), drawn: r.draws.map(d => ({ cardId: d.cardId, day: d.day })) });
}

function summarize(group: Run[]) {
  const byDay: Record<number, { count: number; kinds: Record<string, number> }> = {};
  for (const d of REPORT_DAYS) byDay[d] = { count: 0, kinds: Object.fromEntries(KINDS.map(k => [k, 0])) };
  const first = { day1: 0, byDay2: 0, byDay3: 0, later: 0, never: 0 };
  let day1 = 0, day3 = 0, distinctSources = 0, delayed = 0, cross = 0, choiceChanging = 0, visual = 0, firstDays: number[] = [];
  for (const run of group) {
    const decisions = run.events.filter(isDecisionImpact);
    const crit = openingCriteria(run.events);
    if (crit.day1) day1++;
    if (crit.day3) day3++;
    const firstDay = decisions.length ? Math.min(...decisions.map(e => e.day)) : undefined;
    if (firstDay === undefined) first.never++; else { firstDays.push(firstDay); if (firstDay <= 1) first.day1++; else if (firstDay <= 2) first.byDay2++; else if (firstDay <= 3) first.byDay3++; else first.later++; }
    distinctSources += new Set(decisions.filter(e => e.day <= 3).map(e => `${e.sourceCardId}/${e.sourceChoiceId}`)).size;
    for (const e of run.events) {
      if (e.kinds.includes('delayed')) delayed++; if (e.kinds.includes('cross-character')) cross++;
      if (e.kinds.includes('choice')) choiceChanging++; if (e.kinds.includes('visual')) visual++;
      for (const d of REPORT_DAYS) if (e.day === d) { byDay[d]!.count++; for (const k of e.kinds) byDay[d]!.kinds[k]!++; }
    }
  }
  const n = group.length;
  return {
    runs: n,
    observableImpactPerRunByDay: Object.fromEntries(REPORT_DAYS.map(d => [d, Math.round(100 * byDay[d]!.count / n) / 100])),
    kindsPerRunByDay: Object.fromEntries(REPORT_DAYS.map(d => [d, Object.fromEntries(KINDS.map(k => [k, Math.round(100 * byDay[d]!.kinds[k]! / n) / 100]))])),
    firstObservableImpact: { day1Pct: pct(first.day1, n), byEndOfDay2Pct: pct(first.day1 + first.byDay2, n), byEndOfDay3Pct: pct(first.day1 + first.byDay2 + first.byDay3, n), laterPct: pct(first.later, n), neverPct: pct(first.never, n),
      medianDay: firstDays.length ? [...firstDays].sort((a, b) => a - b)[Math.floor(firstDays.length / 2)] : undefined },
    distinctSourceChoicesSeenByDay3: Math.round(100 * distinctSources / n) / 100,
    perRun: { delayed: Math.round(100 * delayed / n) / 100, crossCharacter: Math.round(100 * cross / n) / 100, choiceChanging: Math.round(100 * choiceChanging / n) / 100, visual: Math.round(100 * visual / n) / 100 },
    openingCriterion: { day1Pct: pct(day1, n), day3Pct: pct(day3, n) }
  };
}

const policies = Object.fromEntries([...SCRIPTED, ...STOCHASTIC].map(p => [p, summarize(runs.filter(r => r.policy === p))]));
const scriptedAll = summarize(runs.filter(r => SCRIPTED.includes(r.policy)));
const stochasticAll = summarize(runs.filter(r => STOCHASTIC.includes(r.policy)));
for (const p of SCRIPTED) {
  const c = policies[p]!.openingCriterion;
  if (c.day1Pct < 100) failures.push(`${p}: day 1 criterion met in ${c.day1Pct}% of runs, scripted policies need 100%`);
  if (c.day3Pct < 100) failures.push(`${p}: day 3 criterion met in ${c.day3Pct}% of runs, scripted policies need 100%`);
}
const stoch = { day1: Math.min(...STOCHASTIC.map(p => policies[p]!.openingCriterion.day1Pct)), day3: Math.min(...STOCHASTIC.map(p => policies[p]!.openingCriterion.day3Pct)) };
if (stoch.day1 < 95) failures.push(`stochastic: day 1 criterion met in ${stoch.day1}% (needs 95%)`);
if (stoch.day3 < 95) failures.push(`stochastic: day 3 criterion met in ${stoch.day3}% (needs 95%)`);

// Content audit of the decisions the hero actually faced in the first three days (section 32).
const graph = buildImpactGraph(content);
const seenCards = new Set(runs.flatMap(r => r.drawn.filter(d => d.day <= 3).map(d => d.cardId)));
const audit = content.cards.filter(c => seenCards.has(c.id)).flatMap(card => allChoices(card).map(ch => {
  const key = choiceKey(card.id, ch.id);
  const taken = runs.filter(r => r.chosen.some(c => c.key === key && c.day <= 3));
  const seen = taken.map(r => r.events.filter(e => `${e.sourceCardId}/${e.sourceChoiceId}` === key));
  const withImpact = seen.filter(e => e.length);
  const kinds = new Set(seen.flatMap(es => es.flatMap(e => e.kinds)));
  const days = withImpact.map(es => Math.min(...es.map(e => e.day)));
  const staticImpact = impactOf(graph, card.id, ch.id);
  return {
    card: card.id, choice: ch.id, day: card.at?.day, level: ch.impact?.level ?? 'unmarked',
    writes: { facts: ch.effects.setFacts ?? {}, flags: ch.effects.setFlags ?? [] },
    readers: staticImpact.readers.map(r => ({ reader: r.readerId, kinds: [...r.kinds], via: [...r.via] })),
    chosenInRuns: taken.length, consequenceSeenPct: pct(withImpact.length, taken.length),
    firstVisibleDay: days.length ? Math.min(...days) : null, shownKinds: [...kinds],
    crossCharacter: kinds.has('cross-character'), delayed: kinds.has('delayed'), visual: kinds.has('visual'), futureChoice: kinds.has('choice')
  };
})).filter(a => a.chosenInRuns > 0);
// The audit lists the authored story decisions of the opening days; the diagnostic/neutral pool and routine scenes are counted, not listed.
const authored = (id: string) => { const card = content.cards.find(c => c.id === id)!; return !card.diagnostic && !card.tags?.some(t => t === 'probe-only') && card.type !== 'routine' && card.type !== 'crisis' && !/^(neutral|probe|dev)[._]/.test(id); };
const listed = audit.filter(a => authored(a.card));
const deadMajor = listed.filter(a => a.level === 'major' && a.consequenceSeenPct === 0);
for (const a of deadMajor) failures.push(`major choice without observable consequence: ${a.card}/${a.choice}`);

const report = { contentVersion: CONTENT_VERSION, runsPerPolicy: RUNS, throughDay: THROUGH, reportDays: REPORT_DAYS, policies, scripted: scriptedAll, stochastic: stochasticAll, audit: listed, poolChoicesNotListed: audit.length - listed.length, majorWithoutObservableConsequence: deadMajor.map(a => `${a.card}/${a.choice}`), failures };
if (process.argv.includes('--write')) {
  writeFileSync('reports/world-impact-simulation.v1.json', JSON.stringify(report, null, 1) + '\n');
  writeFileSync('reports/WORLD-IMPACT-v1-SIMULATION.md', markdown());
}
function markdown(): string {
  const row = (cells: (string | number | undefined)[]) => `| ${cells.map(c => c ?? '').join(' | ')} |`;
  const table = (head: string[], rows: (string | number | undefined)[][]) => [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');
  const days = REPORT_DAYS.map(String);
  const byDay = (g: ReturnType<typeof summarize>) => days.map(d => g.observableImpactPerRunByDay[Number(d)]);
  const kindRows = (g: ReturnType<typeof summarize>) => KINDS.map(k => [k, ...REPORT_DAYS.map(d => g.kindsPerRunByDay[d]![k])]);
  const f = (g: ReturnType<typeof summarize>) => g.firstObservableImpact;
  return [
    `# WORLD-IMPACT v1: simulation report`, '',
    `Generated by \`npm run simulate:impact -- --write\`. Content ${CONTENT_VERSION}; ${RUNS} runs per policy, ${Object.keys(policies).length} policies, played through day ${THROUGH}.`,
    `Only what was shown to the hero counts: a reader that exists in the content but never appeared is not an impact.`, '',
    `## Opening criterion (sections 22-23)`, '',
    `Day 1: at least one recognisable reaction to her own decision. Day 3: at least two consequences of different decisions, one of them delayed, cross-character, future-choice or visual.`, '',
    table(['policy', 'kind', 'day 1', 'day 3'], Object.entries(policies).map(([name, v]) => [name, SCRIPTED.includes(name as PolicyName) ? 'scripted (needs 100%)' : 'stochastic (needs 95%)', `${v.openingCriterion.day1Pct}%`, `${v.openingCriterion.day3Pct}%`])), '',
    `## When the first observable impact appears`, '',
    table(['group', 'day 1', 'by end of day 2', 'by end of day 3', 'later', 'never', 'median day'],
      [['scripted', scriptedAll], ['stochastic', stochasticAll]].map(([n, g]) => [n as string, `${f(g as never).day1Pct}%`, `${f(g as never).byEndOfDay2Pct}%`, `${f(g as never).byEndOfDay3Pct}%`, `${f(g as never).laterPct}%`, `${f(g as never).neverPct}%`, f(g as never).medianDay])), '',
    `## Observable impacts per run, by day`, '',
    table(['group', ...days.map(d => `day ${d}`)], [['scripted', ...byDay(scriptedAll)], ['stochastic', ...byDay(stochasticAll)]]), '',
    `Kinds per run, scripted policies:`, '', table(['kind', ...days.map(d => `day ${d}`)], kindRows(scriptedAll)), '',
    table(['group', 'distinct source choices seen by day 3', 'delayed', 'cross-character', 'choice-changing', 'visual'],
      [['scripted', scriptedAll], ['stochastic', stochasticAll]].map(([n, g]) => { const x = g as ReturnType<typeof summarize>; return [n as string, x.distinctSourceChoicesSeenByDay3, x.perRun.delayed, x.perRun.crossCharacter, x.perRun.choiceChanging, x.perRun.visual]; })), '',
    `## Audit of the story decisions of days 1-3`, '',
    `Level is the authored \`impact\` mark. "Seen" is the share of runs where the hero took the choice and then actually met a consequence of it (anywhere in the episode). Pool choices of the diagnostic/neutral/probe/routine scenes are not listed (${audit.length - listed.length} choices).`, '',
    table(['card/choice', 'level', 'writes', 'static readers', 'taken in', 'seen', 'first seen (day)', 'kinds shown'],
      listed.map(a => [`${a.card}/${a.choice}`, a.level, [...Object.entries(a.writes.facts).map(([k, v]) => `${k}=${v}`), ...a.writes.flags].join(', ') || '-', a.readers.map(r => r.reader).join(', ') || '-', a.chosenInRuns, `${a.consequenceSeenPct}%`, a.firstVisibleDay ?? 'never', a.shownKinds.join(', ') || '-'])), '',
    `Major choices without an observable consequence: ${report.majorWithoutObservableConsequence.length ? report.majorWithoutObservableConsequence.join(', ') : 'none'}.`, '',
    failures.length ? `## Failures\n\n${failures.map(x => `- ${x}`).join('\n')}` : `Result: all opening criteria are met.`, ''
  ].join('\n');
}
console.log(JSON.stringify({ scripted: scriptedAll, stochastic: stochasticAll, policies: Object.fromEntries(Object.entries(policies).map(([k, v]) => [k, v.openingCriterion])), majorWithoutObservableConsequence: report.majorWithoutObservableConsequence, failures }, null, 1));
if (failures.length) process.exitCode = 1; else console.log('WORLD-IMPACT v1 OPENING CRITERIA OK');
