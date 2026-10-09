// FOCUSED-ENCOUNTERS v1.1: OFF vs ON on the REAL (marked) content, same seeds, same policies, goals rotating over the runs.
//   FOCUSED_SIM_RUNS=1000 FOCUSED_SIM_OUT=reports/_focused-sim-raw.md npm run focused:simulate
// ON = the shipped content with only `rollout.focusedEncounters` switched on (days 1-10, the configured range). Nothing else differs.
// Acceptance rules are fixed here BEFORE any result is looked at (section 12.4 of the brief): zero tolerance for the structural
// checks; a diagnostic mean (N, W, K, coverage, confidence) that moves by more than 3 standard errors, or a status/stage share that moves by more than
// 3 standard errors, is flagged "needs analysis" and blocks the rollout until it is explained.
// ONE accepted exception (owner's decision of 2026-10-08): fewer dice rolls per run. It is accepted only while it is explained by the recollection
// scenes the hero meets more often (the `scheduled` source grows by at least 80% of what the dice lose) and stays within 0.3 rolls per run;
// otherwise the flag fires as for every other measure. The remaining criteria are unchanged.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { content } from '../src/content';
import { FocusPoolEmptyError, freePool, isFacetWeightedDrawCandidate, prepareEncounter, rankFocusedStory } from '../src/engine';
import type { GameContent, GameState, GoalId } from '../src/engine';
import { runMetrics, type RunMetrics } from './focused-metrics';
import { play, POLICIES, type PolicyName } from './play';

const GOALS: GoalId[] = ['order', 'workshop', 'alexey'];
// FOCUSED_THROUGH=30 is a what-if for the coverage of the whole episode (the shipped range stays 1-10): it changes this process only.
const RANGE = { ...content.profile.focusedEncounters, ...(process.env.FOCUSED_THROUGH ? { throughDay: Number(process.env.FOCUSED_THROUGH) } : {}) };
const on: GameContent = { ...content, profile: { ...content.profile, rollout: { ...content.profile.rollout, focusedEncounters: true }, focusedEncounters: RANGE } };
const off: GameContent = { ...content, profile: { ...content.profile, rollout: { ...content.profile.rollout, focusedEncounters: false } } };
const cardOf = new Map(content.cards.map(c => [c.id, c]));
const isOrdinary = (id: string) => isFacetWeightedDrawCandidate(cardOf.get(id)!);
const bump = (t: Record<string, number>, k: string | number, n = 1) => { t[String(k)] = (t[String(k)] ?? 0) + n; };

export interface WorkerResult {
  policy: PolicyName; runs: number;
  mode: Record<'on' | 'off', {
    metrics: RunMetrics[]; seeds: number[]; failures: Record<string, number>; atMisses: number; unfinishedRequired: number;
    /** Ordinary story scenes shown on days inside the range, by path ('dice' = landed, 'direct'), with the tier they have in the context they were shown in ('none' = no relevance). */
    shown: Record<'dice' | 'direct', Record<string, number>>;
    offered: Record<string, number>;        // tiers of the story candidates among the six faces
    distinct: number[];                     // per run: distinct ordinary scenes met inside the range
    lines: number[];                        // per run: distinct story lines among them
    cards: Record<string, number>;          // how often each ordinary scene was shown inside the range
    cardsByPath: Record<'dice' | 'direct', Record<string, number>>;
    /** Story-line steps written on the days of the range (what the hero's decisions advanced), summed over runs. */
    lineSteps: Record<string, number>;
    /** Per run and path: distinct ordinary scenes met through that path. */
    distinctByPath: Record<'dice' | 'direct', number[]>;
    goalMatch: { matched: number; total: number };
  }>;
  checks: { compared: number; protectedMismatch: number; deficit: number; offeredUnjustified: number; directUnjustified: number; diceOnly: number };
}

function blank(): WorkerResult['mode']['on'] {
  return { metrics: [], seeds: [], failures: {}, atMisses: 0, unfinishedRequired: 0, shown: { dice: {}, direct: {} }, offered: {}, distinct: [], lines: [], cards: {}, cardsByPath: { dice: {}, direct: {} }, lineSteps: {}, distinctByPath: { dice: [], direct: [] }, goalMatch: { matched: 0, total: 0 } };
}

function runOne(policy: PolicyName, seed: number, c: GameContent, mode: 'on' | 'off', out: WorkerResult): void {
  const m = out.mode[mode];
  const goal = GOALS[seed % 3]!;
  const goalAt = seed % 2 === 0 ? { 11: GOALS[(seed + 1) % 3]!, 21: GOALS[(seed + 2) % 3]! } : undefined;
  const tiersOfDay = new Map<number, Record<string, number>>();
  const prepPending = new Set<number>();
  const record = (s: GameState): void => {
    // Called with the state at which a dice set was just prepared (phase 'dice', not yet rolled).
    if (s.phase !== 'dice' || s.current || s.day < RANGE.fromDay || s.day > RANGE.throughDay || prepPending.has(s.day)) return;
    prepPending.add(s.day);
    const ranked = rankFocusedStory(s, c, freePool(s, c));
    const tiers = Object.fromEntries(ranked.map(r => [r.card.id, r.tier]));
    tiersOfDay.set(s.day, tiers);
    for (const id of s.diceHistory.at(-1)!.candidates) if (isOrdinary(id)) {
      bump(m.offered, tiers[id] ?? 'none');
      if (mode === 'on' && tiers[id] === undefined) out.checks.offeredUnjustified++;
    }
  };
  const seen: { day: number; id: string; via: 'dice' | 'direct'; tier: number | 'none' }[] = [];
  let result: ReturnType<typeof play> | undefined;
  try {
    result = play(seed, { policy, content: c, goal, ...(goalAt ? { goalAt } : {}),
      beforeStep: s => {
        record(s);
        // The protected candidates of the very state ON and OFF would both prepare: they must be the same.
        if (mode === 'on' && s.phase === 'slot' && !s.current && s.day >= RANGE.fromDay && s.day <= RANGE.throughDay && !s.diceHistory.some(d => d.day === s.day)) {
          let a: GameState | undefined, b: GameState | undefined;
          try { a = prepareEncounter(s, on); b = prepareEncounter(s, off); } catch (e) { if (!(e instanceof FocusPoolEmptyError)) throw e; }
          if (a && b && a.phase === 'dice' && b.phase === 'dice') {
            out.checks.compared++;
            const prot = (st: GameState) => { const d = st.diceHistory.at(-1)!; return d.candidates.map((id, k) => [id, d.candidateOrigins?.[k]] as const).filter(([id]) => !isOrdinary(id)).map(([id, o]) => `${id}:${o}`).sort().join(','); };
            if (prot(a) !== prot(b)) out.checks.protectedMismatch++;
          } else if (a && b && a.phase !== 'dice' && b.phase === 'dice') out.checks.deficit++;
        }
        return s;
      },
      onDraw: (s, draw) => {
        if (draw.source !== 'pool' || s.day < RANGE.fromDay || s.day > RANGE.throughDay || !isOrdinary(draw.card.id)) return;
        const tier = rankFocusedStory(s, c, freePool(s, c)).find(r => r.card.id === draw.card.id)?.tier;
        seen.push({ day: s.day, id: draw.card.id, via: 'direct', tier: tier ?? 'none' });
        if (mode === 'on' && tier === undefined) out.checks.directUnjustified++;
      } });
  } catch (e) {
    const key = e instanceof FocusPoolEmptyError ? 'FOCUS_POOL_EMPTY' : `error: ${(e as Error).message.slice(0, 80)}`;
    bump(m.failures, key); return;
  }
  const { state, draws } = result;
  for (const d of state.diceHistory) if (d.cardId && d.day >= RANGE.fromDay && d.day <= RANGE.throughDay && isOrdinary(d.cardId))
    seen.push({ day: d.day, id: d.cardId, via: 'dice', tier: tiersOfDay.get(d.day)?.[d.cardId] ?? 'none' });
  for (const s of seen) { bump(m.shown[s.via], s.tier); bump(m.cards, s.id); bump(m.cardsByPath[s.via], s.id); }
  for (const via of ['dice', 'direct'] as const) m.distinctByPath[via].push(new Set(seen.filter(x => x.via === via).map(x => x.id)).size);
  if (mode === 'on') out.checks.diceOnly += state.diceHistory.length;
  const ids = [...new Set(seen.map(s => s.id))];
  m.distinct.push(ids.length);
  m.lines.push(new Set(ids.flatMap(id => cardOf.get(id)!.story?.lines ?? [])).size);
  for (const s of seen) { m.goalMatch.total++; if (cardOf.get(s.id)!.story?.goalIds?.includes(goalAtDay(goal, goalAt, s.day))) m.goalMatch.matched++; }
  for (const e of state.evidence) if (e.day >= RANGE.fromDay && e.day <= RANGE.throughDay) bump(m.lineSteps, e.line);
  if (state.history.length !== 120) bump(m.failures, 'not 120 decisions');
  for (const card of content.cards.filter(x => x.at)) if (!draws.some(d => d.cardId === card.id && d.day === card.at!.day && d.slot === card.at!.slot)) m.atMisses++;
  if (state.scheduled.some(sc => content.cards.find(x => x.id === sc.cardId)?.required)) m.unfinishedRequired++;
  m.seeds.push(seed);
  m.metrics.push(runMetrics(state, draws, c));
}
function goalAtDay(goal: GoalId, goalAt: Record<number, GoalId> | undefined, day: number): GoalId { return goalAt && day >= 21 ? goalAt[21]! : goalAt && day >= 11 ? goalAt[11]! : goal; }

function worker(policy: PolicyName, runs: number, file: string): void {
  const out: WorkerResult = { policy, runs, mode: { on: blank(), off: blank() }, checks: { compared: 0, protectedMismatch: 0, deficit: 0, offeredUnjustified: 0, directUnjustified: 0, diceOnly: 0 } };
  for (let seed = 1; seed <= runs; seed++) { runOne(policy, seed, off, 'off', out); runOne(policy, seed, on, 'on', out); }
  writeFileSync(file, JSON.stringify(out));
}

// ---------------------------------------------------------------------------------------------
const mean = (l: number[]) => l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0;
const sd = (l: number[]) => { const m = mean(l); return Math.sqrt(l.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(l.length - 1, 1)); };
const f = (n: number, d = 2) => n.toFixed(d);
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const merge = (list: Record<string, number>[]) => { const t: Record<string, number> = {}; for (const r of list) for (const [k, v] of Object.entries(r)) bump(t, k, v); return t; };
const shareRow = (r: Record<string, number>) => { const n = sum(r) || 1; return ['1', '2', '3', '4', '5', 'none'].map(k => `${f(100 * (r[k] ?? 0) / n, 1)}%`).join(' | '); };

/** Same policy + seed is a paired trial. Do not treat matched runs as independent. */
export interface PairedTrial<T> { policy: string; seed: number; off: T; on: T }
export function collectPaired(rows: WorkerResult[]): PairedTrial<RunMetrics>[] {
  return rows.flatMap(row => {
    const off = new Map(row.mode.off.seeds.map((seed, i) => [seed, row.mode.off.metrics[i]!]));
    return row.mode.on.seeds.flatMap((seed, i) => {
      const baseline = off.get(seed);
      return baseline ? [{ policy: row.policy, seed, off: baseline, on: row.mode.on.metrics[i]! }] : [];
    });
  });
}
export function pairedStatistic<T>(rows: PairedTrial<T>[], pick: (m: T) => number) {
  const a = rows.map(r => pick(r.off)), b = rows.map(r => pick(r.on));
  const diffs = rows.map((_, i) => b[i]! - a[i]!);
  const delta = mean(diffs), se = sd(diffs) / Math.sqrt(diffs.length || 1);
  return { off: mean(a), on: mean(b), delta, se,
    z: se === 0 ? (delta === 0 ? 0 : Math.sign(delta) * Infinity) : delta / se,
    n: diffs.length, changed: diffs.filter(d => d !== 0).length };
}

function report(results: WorkerResult[]): string {
  const L: string[] = [];
  const all2 = (k: 'on' | 'off') => results.flatMap(r => r.mode[k].metrics);
  const total = (k: 'on' | 'off', pick: (m: WorkerResult['mode']['on']) => number[]) => results.flatMap(r => pick(r.mode[k]));
  const runs = results.reduce((a, r) => a + r.runs, 0);
  const paired = collectPaired(results);
  L.push(`Прогонов: ${runs} на режим (${results.length} политик × ${results[0]!.runs}); цели вращаются по seed (order/workshop/alexey), чётные seeds меняют цель в дни 11 и 21. Диапазон фокуса: дни ${RANGE.fromDay}–${RANGE.throughDay}.`, '');
  L.push('### 1. Структурные проверки (допуск ноль)', '', '| Политика | Падений ON | Падений OFF | FOCUS_POOL_EMPTY | Не 120 решений ON | Пропущено `at` ON | required не исполнено ON | Сравнений наборов | Расхождений protected | Необоснованных (кубик / прямой) | Дефицитов (ON без набора, OFF с набором) |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|');
  for (const r of results) {
    const fails = (k: 'on' | 'off') => sum(r.mode[k].failures);
    L.push(`| ${r.policy} | ${fails('on')} | ${fails('off')} | ${r.mode.on.failures.FOCUS_POOL_EMPTY ?? 0} | ${r.mode.on.failures['not 120 decisions'] ?? 0} | ${r.mode.on.atMisses} | ${r.mode.on.unfinishedRequired} | ${r.checks.compared} | ${r.checks.protectedMismatch} | ${r.checks.offeredUnjustified} / ${r.checks.directUnjustified} | ${r.checks.deficit} |`);
  }
  const bad = results.some(r => sum(r.mode.on.failures) || r.mode.on.atMisses || r.mode.on.unfinishedRequired || r.checks.protectedMismatch || r.checks.offeredUnjustified || r.checks.directUnjustified);
  L.push('', `Итог по структурным проверкам: **${bad ? 'ЕСТЬ НАРУШЕНИЯ' : 'нарушений нет'}**.`, '');
  L.push('### 2. Кубик и прямой отбор: какие уровни релевантности реально показываются', '', 'Колонки: P1 | P2 | P3 | P4 | P5 | без релевантности. Только обычные сюжетные сцены, показанные на днях диапазона. «OFF» — тот же контекст, посчитанный постфактум: так видно, как часто легаси показывает нерелевантное.', '');
  L.push('| Режим / путь | Показов | P1 | P2 | P3 | P4 | P5 | без |', '|---|---:|---|---|---|---|---|---|');
  const row = (name: string, rec: Record<string, number>) => L.push(`| ${name} | ${sum(rec)} | ${shareRow(rec)} |`);
  for (const k of ['off', 'on'] as const) {
    row(`${k.toUpperCase()}: предложено на 6 гранях`, merge(results.map(r => r.mode[k].offered)));
    row(`${k.toUpperCase()}: выпало на кубике`, merge(results.map(r => r.mode[k].shown.dice)));
    row(`${k.toUpperCase()}: прямой отбор`, merge(results.map(r => r.mode[k].shown.direct)));
  }
  L.push('', '### 3. Разнообразие и соответствие цели (на прогон, дни диапазона)', '', '| Режим | Различных обычных сцен | Различных линий | Доля показов, где сцена размечена на текущую цель |', '|---|---:|---:|---:|');
  for (const k of ['off', 'on'] as const) {
    const gm = results.reduce((a, r) => ({ matched: a.matched + r.mode[k].goalMatch.matched, total: a.total + r.mode[k].goalMatch.total }), { matched: 0, total: 0 });
    L.push(`| ${k.toUpperCase()} | ${f(mean(total(k, m => m.distinct)))} (σ ${f(sd(total(k, m => m.distinct)))}) | ${f(mean(total(k, m => m.lines)))} | ${f(100 * gm.matched / Math.max(gm.total, 1), 1)}% |`);
  }
  const cardsOn = merge(results.map(r => r.mode.on.cards)), cardsOff = merge(results.map(r => r.mode.off.cards));
  L.push('', 'Показы каждой размеченной обычной сцены на днях диапазона (всех прогонов), OFF → ON:', '', '| Сцена | OFF | ON |', '|---|---:|---:|');
  for (const id of [...new Set([...Object.keys(cardsOn), ...Object.keys(cardsOff)])].sort()) L.push(`| ${id} | ${cardsOff[id] ?? 0} | ${cardsOn[id] ?? 0} |`);
  L.push('', 'Сюжетные линии, продвинутые решениями героя в днях диапазона (шагов за прогон, доля):', '', '| Режим | pace | apprentice | commitments |', '|---|---:|---:|---:|');
  for (const k of ['off', 'on'] as const) {
    const t = merge(results.map(r => r.mode[k].lineSteps)), n = results.reduce((a, r) => a + r.mode[k].metrics.length, 0) || 1, all = sum(t) || 1;
    L.push(`| ${k.toUpperCase()} | ${['pace', 'apprentice', 'commitments'].map(l => `${f((t[l] ?? 0) / n)} (${f(100 * (t[l] ?? 0) / all, 1)}%)`).join(' | ')} |`);
  }
  {
    const share = (k: 'on' | 'off') => { const m = all2(k); return 100 * mean(m.map(x => x.directPoolDraws)) / Math.max(mean(m.map(x => x.directPoolDraws + x.diceDays)), 1); };
    L.push('', `Доля прямых показов среди свободных (кубик + прямой): OFF ${f(share('off'), 1)}%, ON ${f(share('on'), 1)}%.`);
  }
  L.push('', '### 3b. Кубик и прямой отбор рядом', '', 'Прямой отбор берёт уровень с весами 8:5:3:1:0,5 среди непустых; кубик заполняет места по порядку P1→P5 с резервом под другую линию. Ниже видно, чем они различаются на реальной разметке.', '');
  L.push('| Режим / путь | Показов за прогон | Различных сцен за прогон | Доля P1 | Доля P1+P2 | Доля P4+P5 |', '|---|---:|---:|---:|---:|---:|');
  for (const k of ['off', 'on'] as const) for (const via of ['dice', 'direct'] as const) {
    const rec = merge(results.map(r => r.mode[k].shown[via])), n = sum(rec) || 1, runsK = results.reduce((a, r) => a + r.mode[k].metrics.length, 0) || 1;
    L.push(`| ${k.toUpperCase()} / ${via === 'dice' ? 'кубик (выпало)' : 'прямой'} | ${f(sum(rec) / runsK)} | ${f(mean(total(k, m => m.distinctByPath[via])))} | ${f(100 * (rec['1'] ?? 0) / n, 1)}% | ${f(100 * ((rec['1'] ?? 0) + (rec['2'] ?? 0)) / n, 1)}% | ${f(100 * ((rec['4'] ?? 0) + (rec['5'] ?? 0)) / n, 1)}% |`);
  }
  const byPathOn = results.map(r => r.mode.on.cardsByPath), diceOn = merge(byPathOn.map(x => x.dice)), directOn = merge(byPathOn.map(x => x.direct));
  L.push('', 'Показы по сценам в режиме ON: кубик / прямой (доля кубика):', '', '| Сцена | Кубик | Прямой | Доля кубика |', '|---|---:|---:|---:|');
  for (const id of [...new Set([...Object.keys(diceOn), ...Object.keys(directOn)])].sort()) L.push(`| ${id} | ${diceOn[id] ?? 0} | ${directOn[id] ?? 0} | ${f(100 * (diceOn[id] ?? 0) / Math.max((diceOn[id] ?? 0) + (directOn[id] ?? 0), 1), 0)}% |`);
  L.push('', '### 4. Диагностика: OFF → ON на тех же seeds', '', 'Парная стандартная ошибка: sd(ON − OFF) / sqrt(n), пара = политика + seed. Порог >3 SE требует анализа.', '', '| Показатель | OFF | ON | Δ | Δ / SE | Флаг |', '|---|---:|---:|---:|---:|---|');
  const metric = (name: string, pick: (r: RunMetrics) => number) => {
    const v = pairedStatistic(paired, pick);
    L.push(`| ${name} | ${f(v.off, 3)} | ${f(v.on, 3)} | ${f(v.delta, 3)} | ${f(v.z, 1)} | ${Math.abs(v.z) > 3 ? '**нужен анализ**' : 'ок'} |`);
  };
  metric('N (независимых действий)', r => r.profile.N); metric('W', r => r.profile.W); metric('K', r => r.profile.K);
  metric('coverage', r => r.profile.coverage); metric('confidence', r => r.profile.confidence);
  metric('показано neutral', r => r.neutralShown); metric('показано probe', r => r.probeShown);
  const all = (k: 'on' | 'off') => results.flatMap(r => r.mode[k].metrics);
  const src = (k: 'on' | 'off', name: string) => mean(all(k).map(x => x.sources[name] ?? 0));
  const dDice = mean(all('on').map(x => x.diceDays)) - mean(all('off').map(x => x.diceDays)), dSched = src('on', 'scheduled') - src('off', 'scheduled');
  const diceAccepted = dDice >= -0.3 && (dDice >= 0 || dSched >= 0.8 * -dDice);
  {
    const v = pairedStatistic(paired, x => x.diceDays);
    L.push(`| кубиков за прогон | ${f(v.off, 3)} | ${f(v.on, 3)} | ${f(v.delta, 3)} | ${f(v.z, 1)} | ${Math.abs(v.z) <= 3 ? 'ок' : diceAccepted ? '**принято владельцем**: объяснено ростом scheduled на ' + f(dSched, 3) : '**нужен анализ**'} |`);
  }
  metric('прямых pool-показов за прогон', r => r.directPoolDraws);
  for (const st of ['stable', 'provisional']) metric(`доля статуса ${st}`, r => r.profile.status === st ? 1 : 0);
  const stages = [...new Set(results.flatMap(r => [...r.mode.off.metrics, ...r.mode.on.metrics].map(x => x.profile.stage ?? '-')))].sort();
  for (const st of stages) metric(`доля стадии развития ${st}`, r => (r.profile.stage ?? '-') === st ? 1 : 0);
  L.push('', 'Источники показов (среднее за прогон), OFF → ON:', '', '| Источник | OFF | ON | Δ |', '|---|---:|---:|---:|');
  for (const k of ['current', 'pool', 'scheduled', 'crisis', 'development', 'route', 'mustShowBy', 'at']) L.push(`| ${k === 'current' ? 'кубик (current)' : k} | ${f(src('off', k), 3)} | ${f(src('on', k), 3)} | ${f(src('on', k) - src('off', k), 3)} |`);
  L.push('', '### 4b. Источники neutral по каждому дню (парные прогоны)',
    'Учтены реально показанные сцены; подготовительные вызовы drawCard не считаются. Данные позволяют отличить изменения внутри дней 1–10 от последствий в днях 11–30.',
    '', '| День | Neutral OFF | Neutral ON | Δ | Δ dice | Δ pool | Δ scheduled | Δ other | Δ кубиков всего | Δ pool всего | Δ scheduled всего |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const cell = (r: RunMetrics, day: number, source: string, field: 'neutral' | 'total'): number =>
    source === '*' ? Object.values(r.dailyKinds[day] ?? {}).reduce((n, row) => n + row[field], 0)
      : r.dailyKinds[day]?.[source]?.[field] ?? 0;
  for (let day = 1; day <= content.episode.days; day++) {
    const diff = (source: string, field: 'neutral' | 'total') => pairedStatistic(paired, r => cell(r, day, source, field));
    const total = diff('*', 'neutral'), dice = diff('dice', 'neutral'), pool = diff('pool', 'neutral'), scheduled = diff('scheduled', 'neutral');
    L.push(`| ${day} | ${f(total.off, 3)} | ${f(total.on, 3)} | ${f(total.delta, 3)} | ${f(dice.delta, 3)} | ${f(pool.delta, 3)} | ${f(scheduled.delta, 3)} | ${f(total.delta - dice.delta - pool.delta - scheduled.delta, 3)} | ${f(diff('dice','total').delta, 3)} | ${f(diff('pool','total').delta, 3)} | ${f(diff('scheduled','total').delta, 3)} |`);
  }
  L.push('', '### 4c. Источники за весь эпизод', '', '| Источник | OFF | ON | Δ | Δ / парная SE |', '|---|---:|---:|---:|---:|');
  for (const source of ['dice','pool','scheduled','crisis','development','route','mustShowBy','at','capacity','unknown']) {
    const v = pairedStatistic(paired, r => Object.values(r.dailyKinds).reduce((n, day) => n + (day[source]?.total ?? 0), 0));
    L.push(`| ${source} | ${f(v.off, 3)} | ${f(v.on, 3)} | ${f(v.delta, 3)} | ${f(v.z, 1)} |`);
  }
  L.push('', `Полных пар (политика + seed): ${paired.length} из ${runs}. Пар с изменённым количеством neutral: ${pairedStatistic(paired, x => x.neutralShown).changed}.`);
  if (paired.length !== runs) L.push('**BLOCKED:** некоторые прогоны не имеют пары — нельзя интерпретировать статистику без разбора ошибок.');
  L.push('', '### 5. По политикам: диагностика', '', '| Политика | Режим | N | W | K | coverage | confidence | stable | neutral показано | probe показано | кубиков | прямых |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of results) for (const k of ['off', 'on'] as const) {
    const ms = r.mode[k].metrics, a = (p: (x: RunMetrics) => number) => f(mean(ms.map(p)), 2);
    L.push(`| ${r.policy} | ${k.toUpperCase()} | ${a(x => x.profile.N)} | ${a(x => x.profile.W)} | ${a(x => x.profile.K)} | ${a(x => x.profile.coverage)} | ${a(x => x.profile.confidence)} | ${a(x => x.profile.status === 'stable' ? 1 : 0)} | ${a(x => x.neutralShown)} | ${a(x => x.probeShown)} | ${a(x => x.diceDays)} | ${a(x => x.directPoolDraws)} |`);
  }
  return L.join('\n');
}

if (process.argv[1]?.endsWith('simulate-focused.ts')) {
  const wi = process.argv.indexOf('--worker');
  if (wi >= 0) worker(process.argv[wi + 1] as PolicyName, Number(process.argv[wi + 2]), process.argv[wi + 3]!);
  else {
    const runs = Number(process.env.FOCUSED_SIM_RUNS ?? 1000), conc = Number(process.env.FOCUSED_SIM_JOBS ?? 4);
    const dir = mkdtempSync(join(tmpdir(), 'focused-sim-'));
    const queue = [...POLICIES]; let running = 0; const files: string[] = [];
    const next = (): void => {
      while (running < conc && queue.length) {
        const policy = queue.shift()!, file = join(dir, `${policy}.json`); files.push(file); running++;
        const child = spawn(process.execPath, ['--import', 'tsx', process.argv[1]!, '--worker', policy, String(runs), file], { stdio: 'inherit' });
        child.on('exit', code => { running--; if (code) { console.error(`worker ${policy} failed`); process.exitCode = 1; } next(); if (!running && !queue.length) finish(); });
      }
    };
    const finish = (): void => {
      const results = files.map(file => JSON.parse(readFileSync(file, 'utf8')) as WorkerResult).sort((a, b) => POLICIES.indexOf(a.policy) - POLICIES.indexOf(b.policy));
      const md = report(results);
      console.log(md);
      if (process.env.FOCUSED_SIM_OUT) writeFileSync(process.env.FOCUSED_SIM_OUT, md + '\n');
    };
    next();
  }
}
