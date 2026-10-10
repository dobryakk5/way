// FOCUSED-ENCOUNTERS v1.1, stage 3.1 review: how well do the two gates of `npm run simulate` (>= 25 eligible runs, >= 35% shown among eligible runs)
// describe the conditional follow-up scenes? Read-only measurement: it changes nothing in the game.
//   STAGE31_RUNS=1000 STAGE31_OTHER=300 STAGE31_OUT=file.md node --import tsx scripts/stage31-followups.ts
// "Eligible" is exactly the definition of scripts/simulate.ts: at a slot with nothing on the screen the scene is eligible AND in the free pool.
// On top of that the number of such slots (the exposure the scene had) and the day it became eligible are recorded.
import { writeFileSync } from 'node:fs';
import { content } from '../src/content';
import { eligible, freePool } from '../src/engine';
import { play, POLICIES } from './play';

const RUNS = Number(process.env.STAGE31_RUNS ?? 1000), OTHER = Number(process.env.STAGE31_OTHER ?? 300);
const cards = content.cards.filter(c => /^x[34]_/.test(c.id));
const tagged = new Set(content.cards.filter(c => c.tags?.includes('follow-up')).map(c => c.id));

interface Run { slots: number; firstDay: number; lastDay: number; shown: boolean; shownDay?: number; via?: 'dice' | 'direct' | 'other' }
type Sample = Record<string, Run[]>;   // card -> one entry per ELIGIBLE run

function sample(policy: (typeof POLICIES)[number], runs: number): Sample {
  const out: Sample = Object.fromEntries(cards.map(c => [c.id, []]));
  for (let seed = 1; seed <= runs; seed++) {
    const seen: Record<string, { slots: number; first: number; last: number }> = {};
    const { state, draws } = play(seed, { policy, beforeStep: s => {
      if (s.phase === 'slot' && !s.current) {
        const now = cards.filter(c => eligible(s, c, content));
        if (now.length) { const pool = new Set(freePool(s, content).map(c => c.id)); for (const c of now) if (pool.has(c.id)) { const r = (seen[c.id] ??= { slots: 0, first: s.day, last: s.day }); r.slots++; r.last = s.day; } }
      }
      return s;
    } });
    const dice = new Set(state.diceHistory.filter(d => d.cardId).map(d => `${d.day}/${d.slot}/${d.cardId}`));
    for (const c of cards) {
      const e = seen[c.id]; const d = draws.find(x => x.cardId === c.id);
      if (!e) { if (d) out[c.id]!.push({ slots: 0, firstDay: d.day, lastDay: d.day, shown: true, shownDay: d.day, via: 'other' }); continue; }   // shown although never recorded eligible
      out[c.id]!.push({ slots: e.slots, firstDay: e.first, lastDay: e.last, shown: !!d, ...(d ? { shownDay: d.day, via: dice.has(`${d.day}/${d.slot}/${c.id}`) ? 'dice' as const : 'direct' as const } : {}) });
    }
  }
  return out;
}

const f = (x: number, d = 1) => x.toFixed(d);
const wilson = (k: number, n: number): [number, number] => { if (!n) return [0, 1]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; };
const median = (l: number[]) => l.length ? [...l].sort((a, b) => a - b)[l.length >> 1]! : 0;
// exact binomial P(X >= k)
function tail(n: number, p: number, k: number): number { if (k <= 0) return 1; let logC = 0, s = 0; const lp = Math.log(p), lq = Math.log(1 - p); for (let i = 0; i <= n; i++) { if (i > 0) logC += Math.log(n - i + 1) - Math.log(i); if (i >= k) s += Math.exp(logC + i * lp + (n - i) * lq); } return Math.min(1, s); }
// P(gate passes | true conditional rate p, `runs` complete runs of which a fraction `q` are eligible): eligible count ~ Bin(runs, q), then shown ~ Bin(m, p)
function passProbability(runs: number, q: number, p: number, minEligible = 25, minRate = 0.35): number {
  let total = 0, logC = 0;
  for (let m = 0; m <= runs; m++) {
    if (m > 0) logC += Math.log(runs - m + 1) - Math.log(m);
    const pm = Math.exp(logC + m * Math.log(q) + (runs - m) * Math.log(1 - q)); if (pm < 1e-12 || m < minEligible) continue;
    total += pm * tail(m, p, Math.ceil(minRate * m - 1e-9));
  }
  return total;
}

const L: string[] = [];
const mixed = sample('mixed', RUNS);
L.push(`Прогонов: mixed ${RUNS} (seed 1…${RUNS}); остальные 6 политик по ${OTHER}. «Доступна» — определение \`scripts/simulate.ts\`: на слоте без открытой сцены карточка проходит \`eligible\` и входит в свободный пул.`, '');
L.push('### 1. Условная доля показа, mixed', '', '| Сцена | Тег `follow-up` | Доступна (прогонов) | Показана | Условная доля | 95% ДИ (Уилсон) | Слотов доступности в среднем / медиана | Доступна ≤ 2 слотов | Через кубик / прямой | Порог 25 / 35% |', '|---|---|---:|---:|---:|---|---:|---:|---|---|');
for (const c of cards) {
  const r = mixed[c.id]!, n = r.length, k = r.filter(x => x.shown).length, [lo, hi] = wilson(k, n);
  const slots = r.map(x => x.slots), via = (v: string) => r.filter(x => x.via === v).length;
  const gate = !tagged.has(c.id) ? 'нет проверки' : n < 25 ? 'FAIL (мало доступных)' : k / n < 0.35 ? 'FAIL (доля)' : 'ok';
  L.push(`| ${c.id} | ${tagged.has(c.id) ? 'да' : '**нет**'} | ${n} | ${k} | ${n ? f(100 * k / n) : '—'}% | ${f(100 * lo, 0)}–${f(100 * hi, 0)}% | ${n ? f(slots.reduce((a, b) => a + b, 0) / n, 1) : '—'} / ${median(slots)} | ${n ? f(100 * slots.filter(s => s <= 2).length / n, 0) : '—'}% | ${via('dice')} / ${via('direct')} | ${gate} |`);
}

L.push('', '### 2. Условная доля в зависимости от числа слотов, в которых сцена была доступна (mixed)', '', 'Если доля сильно растёт с экспозицией, то «35% среди доступных» измеряет не качество сцены, а то, насколько рано она открылась.', '', '| Сцена | 1–2 слота | 3–5 | 6–10 | 11+ |', '|---|---|---|---|---|');
for (const c of cards.filter(c => tagged.has(c.id))) {
  const r = mixed[c.id]!;
  const cell = (a: number, b: number) => { const g = r.filter(x => x.slots >= a && x.slots <= b), k = g.filter(x => x.shown).length; return g.length ? `${k}/${g.length} (${f(100 * k / g.length, 0)}%)` : '—'; };
  L.push(`| ${c.id} | ${cell(1, 2)} | ${cell(3, 5)} | ${cell(6, 10)} | ${cell(11, 99)} |`);
}

L.push('', '### 3. Все политики (условная доля показа среди доступных; в скобках число доступных прогонов)', '', `| Сцена | ${POLICIES.join(' | ')} |`, `|---|${POLICIES.map(() => '---:').join('|')}|`);
const others = Object.fromEntries(POLICIES.map(p => [p, p === 'mixed' ? mixed : sample(p, OTHER)])) as Record<string, Sample>;
for (const c of cards) L.push(`| ${c.id} | ${POLICIES.map(p => { const r = others[p]![c.id]!, k = r.filter(x => x.shown).length; return r.length ? `${f(100 * k / r.length, 0)}% (${r.length})` : '—'; }).join(' | ')} |`);

L.push('', '### 4. Как ведут себя пороги 25 доступных прогонов и 35% (mixed)', '', 'Таблица: вероятность, что ворота пропустят сцену, если её истинная условная доля показа равна p, а симулятор запущен с `SIM_RUNS` прогонами. Доля доступных прогонов q берётся из наблюдённого (доступна / ' + RUNS + ').', '');
for (const c of cards.filter(c => tagged.has(c.id))) {
  const q = mixed[c.id]!.length / RUNS;
  L.push(`**${c.id}**: q = ${f(100 * q)}% прогонов; ожидаемое число доступных при SIM_RUNS 100 / 300 / 1000 — ${f(100 * q, 0)} / ${f(300 * q, 0)} / ${f(1000 * q, 0)} (порог 25).`, '');
  L.push('| SIM_RUNS | p = 15% | 25% | 35% | 45% | 55% | 70% |', '|---|---:|---:|---:|---:|---:|---:|');
  for (const runs of [100, 300, 500, 1000]) L.push(`| ${runs} | ${[.15, .25, .35, .45, .55, .70].map(p => f(100 * passProbability(runs, q, p), 0) + '%').join(' | ')} |`);
  L.push('');
}
const out = L.join('\n') + '\n';
console.log(out);
if (process.env.STAGE31_OUT) writeFileSync(process.env.STAGE31_OUT, out);
