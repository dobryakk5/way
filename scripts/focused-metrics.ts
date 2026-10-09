// FOCUSED-ENCOUNTERS v1.1: slot / candidate / diagnostic metrics of whole runs, comparable between builds and between the flag OFF and ON.
//   npm run focused:metrics                      -> prints a summary for the shipped content
//   FOCUSED_SEEDS=300 FOCUSED_OUT=file.md npm run focused:metrics   -> seeds per policy, and where to write the tables
// Every run is a real 30-day play with the policy's own choices; the same seeds and policies are used for every comparison.
import { writeFileSync } from 'node:fs';
import { content } from '../src/content';
import { CONTENT_VERSION } from '../src/content/version';
import { FocusPoolEmptyError, isFacetWeightedDrawCandidate, setFocusedTrace } from '../src/engine';
import type { Card, FocusedStoryMeta, GameContent, GameState } from '../src/engine';
import { kindOf } from './focused-baseline';
import { play, POLICIES, type PolicyName } from './play';

export interface RunMetrics {
  slots: number; sources: Record<string, number>; diceDays: number; directPoolDraws: number;
  /** Kinds of the six candidates, summed over all dice of the run. */
  candidateKinds: Record<string, number>; probesPerDice: number[]; landedKinds: Record<string, number>; faces: number[];
  uniqueCandidates: boolean; unfinishedRequired: number;
  profile: { status: string; N: number; W: number; K: number; coverage: number; confidence: number; observed?: string; stage?: string };
  neutralShown: number; probeShown: number; storyShown: number; storySeen: string[];
  /** Shown from the free pool by a direct draw (not via the die), split by kind. */
  directStory: number; directProtected: number;
  /** Per day and true display source: how many slots, neutral cards and probes were actually shown. */
  dailyKinds: Record<number, Record<string, { total: number; neutral: number; probe: number }>>;
}
export function runMetrics(state: GameState, draws: { source: string; cardId: string }[], c: GameContent): RunMetrics {
  const kind = (id: string) => kindOf(c.cards.find(x => x.id === id) as Card);
  const sources: Record<string, number> = {}; for (const d of draws) sources[d.source] = (sources[d.source] ?? 0) + 1;
  const candidateKinds: Record<string, number> = {}, landedKinds: Record<string, number> = {};
  for (const d of state.diceHistory) {
    for (const id of d.candidates) candidateKinds[kind(id)] = (candidateKinds[kind(id)] ?? 0) + 1;
    if (d.cardId) landedKinds[kind(d.cardId)] = (landedKinds[kind(d.cardId)] ?? 0) + 1;
  }
  const last = state.heroDevelopmentProfile.eveningSnapshots.at(-1)?.current;
  const shownKinds = state.history.map(h => kind(h.cardId));
  const diceSlots = new Set(state.diceHistory.filter(d => d.cardId).map(d => `${d.day}/${d.slot}`));
  const sourceBySlot = new Map(draws.map(d => [`${d.day}/${d.slot}`, d.source]));
  const dailyKinds: RunMetrics['dailyKinds'] = {};
  for (const h of state.history) {
    const src = diceSlots.has(`${h.day}/${h.slot}`) ? 'dice' : sourceBySlot.get(`${h.day}/${h.slot}`) ?? 'unknown';
    const row = (dailyKinds[h.day] ??= {});
    const cell = (row[src] ??= { total: 0, neutral: 0, probe: 0 });
    cell.total++;
    if (kind(h.cardId) === 'neutral') cell.neutral++;
    if (kind(h.cardId) === 'probe') cell.probe++;
  }
  return {
    slots: state.history.length, sources, diceDays: state.diceHistory.length, directPoolDraws: sources.pool ?? 0, dailyKinds,
    candidateKinds, landedKinds, faces: state.diceHistory.map(d => d.face ?? 0),
    probesPerDice: state.diceHistory.map(d => d.candidateOrigins?.filter(o => o === 'probe').length ?? 0),
    uniqueCandidates: state.diceHistory.every(d => new Set(d.candidates).size === 6 && d.candidates.length === 6),
    unfinishedRequired: state.scheduled.filter(s => c.cards.find(x => x.id === s.cardId)?.required).length,
    profile: { status: state.heroDevelopmentProfile.status, N: last?.N ?? 0, W: last?.W ?? 0, K: last?.K ?? 0, coverage: state.heroDevelopmentProfile.coverage,
      confidence: state.heroDevelopmentProfile.confidence, ...(state.heroDevelopmentProfile.observedPrimary ? { observed: state.heroDevelopmentProfile.observedPrimary } : {}),
      ...(state.development.developmentCurrent ? { stage: state.development.developmentCurrent } : {}) },
    neutralShown: shownKinds.filter(k => k === 'neutral').length, probeShown: shownKinds.filter(k => k === 'probe').length,
    directStory: draws.filter(d => d.source === 'pool' && kind(d.cardId) === 'ordinary-story').length, directProtected: draws.filter(d => d.source === 'pool' && kind(d.cardId) !== 'ordinary-story').length,
    storyShown: shownKinds.filter(k => k === 'ordinary-story').length, storySeen: [...new Set(state.history.filter(h => kind(h.cardId) === 'ordinary-story').map(h => h.cardId))]
  };
}
const avg = (l: number[]) => l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0;
const f = (n: number, d = 2) => n.toFixed(d);
export interface FocusCounters { dice: number; deficit: number; empty: number; failedRuns: number }
export interface PolicyAggregate { policy: PolicyName; runs: number; rows: RunMetrics[]; focus: FocusCounters }
export function collect(policy: PolicyName, seeds: number, c: GameContent = content): PolicyAggregate {
  const rows: RunMetrics[] = [];
  const focus: FocusCounters = { dice: 0, deficit: 0, empty: 0, failedRuns: 0 };
  setFocusedTrace(e => {
    if (e.kind === 'dice') { focus.dice++; if (e.deficit) focus.deficit++; }
    else if (e.kind === 'empty') focus.empty++;
  });
  try {
    for (let seed = 1; seed <= seeds; seed++) {
      try { const { state, draws } = play(seed, { policy, content: c }); rows.push(runMetrics(state, draws, c)); }
      catch (e) { if (e instanceof FocusPoolEmptyError) focus.failedRuns++; else throw e; }
    }
  } finally { setFocusedTrace(undefined); }
  return { policy, runs: seeds, rows, focus };
}
export function summarize(a: PolicyAggregate) {
  const r = a.rows; const sum = (k: keyof RunMetrics['candidateKinds'] & string) => avg(r.map(x => x.candidateKinds[k] ?? 0));
  const status: Record<string, number> = {}; for (const x of r) status[x.profile.status] = (status[x.profile.status] ?? 0) + 1;
  const stage: Record<string, number> = {}; for (const x of r) stage[x.profile.stage ?? '-'] = (stage[x.profile.stage ?? '-'] ?? 0) + 1;
  return {
    policy: a.policy, runs: a.runs, slotsOk: r.every(x => x.slots === 120), diceDaysAvg: avg(r.map(x => x.diceDays)), directPoolAvg: avg(r.map(x => x.directPoolDraws)),
    candidates: { story: sum('ordinary-story'), neutral: sum('neutral'), probe: sum('probe'), development: sum('development'), other: sum('other-free'), routeOnly: sum('route-only') },
    landed: { story: avg(r.map(x => x.landedKinds['ordinary-story'] ?? 0)), neutral: avg(r.map(x => x.landedKinds.neutral ?? 0)), probe: avg(r.map(x => x.landedKinds.probe ?? 0)), development: avg(r.map(x => x.landedKinds.development ?? 0)) },
    maxProbesInOneDice: Math.max(0, ...r.flatMap(x => x.probesPerDice)), uniqueCandidates: r.every(x => x.uniqueCandidates), unfinishedRequired: r.reduce((s, x) => s + x.unfinishedRequired, 0),
    shown: { neutral: avg(r.map(x => x.neutralShown)), probe: avg(r.map(x => x.probeShown)), story: avg(r.map(x => x.storyShown)) },
    diag: { N: avg(r.map(x => x.profile.N)), W: avg(r.map(x => x.profile.W)), K: avg(r.map(x => x.profile.K)), coverage: avg(r.map(x => x.profile.coverage)), confidence: avg(r.map(x => x.profile.confidence)), status, stage },
    storyDistinct: new Set(r.flatMap(x => x.storySeen)).size, sources: Object.fromEntries(Object.keys({ ...Object.assign({}, ...r.map(x => x.sources)) }).map(k => [k, avg(r.map(x => x.sources[k] ?? 0))]))
  };
}
export function baselineTables(seeds: number, c: GameContent = content): string {
  const out: string[] = [];
  out.push('### Метрики 30-дневных прогонов (среднее за прогон)', '', `Прогонов на политику: ${seeds} (seeds 1…${seeds}); контент ${CONTENT_VERSION}, флаг фокуса отсутствует.`, '');
  out.push('| Политика | 120 слотов | Бросков/прогон | Прямых pool/прогон | Кандидаты story / neutral / probe / dev (из 6 × бросков) | Выпало story / neutral / probe / dev | Макс. probe в наборе | Показано neutral / probe / story | N / W / K (вечер 30) | Coverage | Confidence |', '|---|---|---:|---:|---|---|---:|---|---|---:|---:|');
  const sums = POLICIES.map(p => summarize(collect(p, seeds, c)));
  for (const s of sums) out.push(`| ${s.policy} | ${s.slotsOk ? 'да' : '**НЕТ**'} | ${f(s.diceDaysAvg)} | ${f(s.directPoolAvg)} | ${f(s.candidates.story)} / ${f(s.candidates.neutral)} / ${f(s.candidates.probe)} / ${f(s.candidates.development)} | ${f(s.landed.story)} / ${f(s.landed.neutral)} / ${f(s.landed.probe)} / ${f(s.landed.development)} | ${s.maxProbesInOneDice} | ${f(s.shown.neutral, 1)} / ${f(s.shown.probe, 1)} / ${f(s.shown.story, 1)} | ${f(s.diag.N, 1)} / ${f(s.diag.W, 1)} / ${f(s.diag.K, 1)} | ${f(s.diag.coverage)} | ${f(s.diag.confidence)} |`);
  out.push('', '### Статус профиля и стадия развития на 30-й день (число прогонов)', '', '| Политика | Статус профиля | Стадия развития |', '|---|---|---|');
  for (const s of sums) out.push(`| ${s.policy} | ${Object.entries(s.diag.status).map(([k, v]) => `${k}: ${v}`).join(', ')} | ${Object.entries(s.diag.stage).map(([k, v]) => `${k}: ${v}`).join(', ')} |`);
  out.push('', '### Источники показов (среднее за прогон)', '', '| Политика | ' + 'Источники |', '|---|---|');
  for (const s of sums) out.push(`| ${s.policy} | ${Object.entries(s.sources).map(([k, v]) => `${k}: ${f(v)}`).join(', ')} |`);
  out.push('', `Различных обычных story-карточек, показанных хотя бы раз: ${sums.map(s => `${s.policy} ${s.storyDistinct}`).join(', ')}.`);
  out.push('', `Проверки: у всех прогонов 120 решений — ${sums.every(s => s.slotsOk) ? 'да' : 'НЕТ'}; шесть уникальных кандидатов в каждом наборе — ${sums.every(s => s.uniqueCandidates) ? 'да' : 'НЕТ'}; максимум probe в одном наборе — ${Math.max(...sums.map(s => s.maxProbesInOneDice))}; неисполненных required-продолжений — ${sums.reduce((a, s) => a + s.unfinishedRequired, 0)}.`);
  return out.join('\n');
}
/** MECHANICS ONLY: every ordinary scene is marked "goal-relevant" and the flag is on for days 1–10. Not a content test. */
export const syntheticOn = (c: GameContent = content): GameContent => ({ ...c,
  cards: c.cards.map(card => isFacetWeightedDrawCandidate(card) ? { ...card, story: { goalIds: ['order', 'workshop', 'alexey'], role: 'ambient' } as FocusedStoryMeta } : card),
  profile: { ...c.profile, rollout: { ...c.profile.rollout, focusedEncounters: true }, focusedEncounters: { fromDay: 1, throughDay: 10 } } });
export function focusTable(seeds: number, c: GameContent): string {
  const out = ['| Политика | Прогонов | Упало с FOCUS_POOL_EMPTY | Наборов с story-позициями | Дефицит → прямой отбор | Прямых показов story | Прямых показов protected | Пустых (FOCUS_POOL_EMPTY) | 120 слотов | Макс. probe | Уникальные 6 | required не исполнено |', '|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|---:|'];
  for (const p of POLICIES) {
    const a = collect(p, seeds, c), s = summarize(a);
    out.push(`| ${p} | ${a.rows.length} | ${a.focus.failedRuns} | ${a.focus.dice} | ${a.focus.deficit} | ${a.rows.reduce((n, r) => n + r.directStory, 0)} | ${a.rows.reduce((n, r) => n + r.directProtected, 0)} | ${a.focus.empty} | ${s.slotsOk ? 'да' : '**НЕТ**'} | ${s.maxProbesInOneDice} | ${s.uniqueCandidates ? 'да' : '**НЕТ**'} | ${s.unfinishedRequired} |`);
  }
  return out.join('\n');
}
if (process.argv[1]?.endsWith('focused-metrics.ts')) {
  const seeds = Number(process.env.FOCUSED_SEEDS ?? 100);
  const mode = process.env.FOCUSED_MODE;
  const tables = mode === 'on-synthetic' ? focusTable(seeds, syntheticOn()) : mode === 'compare-synthetic' ? baselineTables(seeds, syntheticOn()) : baselineTables(seeds);
  console.log(tables);
  if (process.env.FOCUSED_OUT) writeFileSync(process.env.FOCUSED_OUT, tables + '\n');
}
