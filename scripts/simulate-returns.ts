// FOCUSED-ENCOUNTERS v1.1: do the consequences of the hero's decisions come back, and how soon? Real 30-day runs, only what was shown counts.
//   SIM_RUNS=300 RETURNS_OUT=file.md npm run focused:returns
// For every decision of days 1-10 that the content gives a designed consequence (a reader in the static influence graph) we count how often it was made,
// how often a consequence was actually put in front of the hero afterwards, and after how many days. Both modes (focus OFF/ON) run on the same seeds.
import { writeFileSync } from 'node:fs';
import { content } from '../src/content';
import { allChoices } from '../src/engine';
import { buildImpactGraph, choiceKey, impactOf } from '../src/engine/impact';
import type { GameContent, GoalId } from '../src/engine';
import { isDecisionImpact, playObserved } from './impact-observe';
import { POLICIES } from './play';

const RUNS = Number(process.env.SIM_RUNS ?? 300);
const GOALS: GoalId[] = ['order', 'workshop', 'alexey'];
const RANGE = content.profile.focusedEncounters;
const on: GameContent = { ...content, profile: { ...content.profile, rollout: { ...content.profile.rollout, focusedEncounters: true } } };
const graph = buildImpactGraph(content);
const labelOf = new Map(content.cards.flatMap(c => allChoices(c).map(ch => [choiceKey(c.id, ch.id), `${c.id} → «${ch.label}»`] as const)));
const median = (l: number[]) => l.length ? [...l].sort((a, b) => a - b)[l.length >> 1]! : undefined;
const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(0)}%` : '—';

interface Tally { made: number; returned: number; returnedBy10: number; delays: number[]; kinds: Record<string, number>; scenes: Record<string, number> }
const blank = (): Tally => ({ made: 0, returned: 0, returnedBy10: 0, delays: [], kinds: {}, scenes: {} });

function measure(c: GameContent) {
  const tally = new Map<string, Tally>();
  const perRun: { designed: number; returned: number; returnedBy10: number; events: number }[] = [];
  for (const policy of POLICIES) for (let seed = 1; seed <= RUNS; seed++) {
    const goal = GOALS[seed % 3]!;
    const { state, events } = playObserved(seed, { policy, content: c, goal });
    const decisions = events.filter(isDecisionImpact);
    let designed = 0, returned = 0, returnedBy10 = 0;
    for (const h of state.history) {
      if (h.day > RANGE.throughDay) break;
      const key = choiceKey(h.cardId, h.choiceId);
      if (!impactOf(graph, h.cardId, h.choiceId).count) continue;
      const t = tally.get(key) ?? blank(); tally.set(key, t);
      t.made++; designed++;
      const back = decisions.filter(e => `${e.sourceCardId}/${e.sourceChoiceId}` === key && e.sourceDay === h.day && e.day >= h.day && e.visibleCardId !== h.cardId);
      if (back.length) {
        t.returned++; returned++;
        const first = Math.min(...back.map(e => e.day));
        t.delays.push(first - h.day);
        if (first <= RANGE.throughDay) { t.returnedBy10++; returnedBy10++; }
        for (const e of back) { for (const k of e.kinds) t.kinds[k] = (t.kinds[k] ?? 0) + 1; t.scenes[e.visibleCardId] = (t.scenes[e.visibleCardId] ?? 0) + 1; }
      }
    }
    perRun.push({ designed, returned, returnedBy10, events: decisions.length });
  }
  return { tally, perRun };
}

function report(): string {
  const L: string[] = [];
  const off = measure(content), onM = measure(on);
  const sumRuns = (m: ReturnType<typeof measure>, k: 'designed' | 'returned' | 'returnedBy10' | 'events') => m.perRun.reduce((a, r) => a + r[k], 0);
  L.push(`Прогонов: ${RUNS} на политику × ${POLICIES.length} политик = ${RUNS * POLICIES.length} в каждом режиме; цели вращаются по seed. «Решение с задуманным последствием» — выбор дней 1–${RANGE.throughDay}, у которого в статическом графе влияния есть читатель (textVariant, choiceVariant, запланированная сцена, сцена, существующая только после него, запись trace-читателя). «Вернулось» — игрок реально увидел такое последствие позже в том же прохождении.`, '');
  L.push('### 1. Общее', '', '| Режим | Решений с задуманным последствием за прогон | Вернулось (по всему прохождению) | Вернулось к дню 10 | Видимых откликов на прошлые решения за прогон |', '|---|---:|---:|---:|---:|');
  for (const [name, m] of [['OFF', off], ['ON', onM]] as const) {
    const n = m.perRun.length;
    L.push(`| ${name} | ${(sumRuns(m, 'designed') / n).toFixed(2)} | ${pct(sumRuns(m, 'returned'), sumRuns(m, 'designed'))} | ${pct(sumRuns(m, 'returnedBy10'), sumRuns(m, 'designed'))} | ${(sumRuns(m, 'events') / n).toFixed(2)} |`);
  }
  L.push('', '### 2. По решениям (ON; в скобках OFF)', '', '| Решение | Принято (ON) | Вернулось | К дню 10 | Медиана задержки, дней | Типы возврата | Где вернулось (сцены) |', '|---|---:|---:|---:|---:|---|---|');
  const keys = [...new Set([...onM.tally.keys(), ...off.tally.keys()])].sort();
  for (const key of keys) {
    const a = onM.tally.get(key) ?? blank(), b = off.tally.get(key) ?? blank();
    const top = Object.entries(a.scenes).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ');
    L.push(`| ${labelOf.get(key) ?? key} | ${a.made} | ${pct(a.returned, a.made)} (${pct(b.returned, b.made)}) | ${pct(a.returnedBy10, a.made)} (${pct(b.returnedBy10, b.made)}) | ${median(a.delays) ?? '—'} | ${Object.entries(a.kinds).map(([k, v]) => `${k} ${v}`).join(', ') || '—'} | ${top || '—'} |`);
  }
  return L.join('\n');
}

if (process.argv[1]?.endsWith('simulate-returns.ts')) {
  const md = report();
  console.log(md);
  if (process.env.RETURNS_OUT) writeFileSync(process.env.RETURNS_OUT, md + '\n');
}
