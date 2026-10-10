// FOCUSED-ENCOUNTERS v1.1, stage 3.1 review: where do the shows of ON and OFF differ, by range of days and by true display source?
// Reads the per-policy worker files that `npm run focused:simulate` leaves in the temp directory (or a copy of them).
//   STAGE31_DIR=/path/to/focused-sim-xxxx STAGE31_OUT=file.md node --import tsx scripts/stage31-sources.ts
// Same paired statistic as the simulator (difference inside policy+seed, clustered by seed). Read-only; changes nothing in the game.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectPaired, pairedStatistic, type WorkerResult } from './simulate-focused';
import type { RunMetrics } from './focused-metrics';

const dir = process.env.STAGE31_DIR; if (!dir) throw new Error('STAGE31_DIR is required');
const results = readdirSync(dir).filter(n => n.endsWith('.json')).map(n => JSON.parse(readFileSync(join(dir, n), 'utf8')) as WorkerResult);
const paired = collectPaired(results);
const f = (x: number, d = 3) => x.toFixed(d), z = (x: number) => Number.isFinite(x) ? x.toFixed(1) : '∞';
const RANGES: [string, number, number][] = [['1–10', 1, 10], ['11–30', 11, 30], ['1–30', 1, 30]];
const SOURCES = ['dice', 'pool', 'scheduled', 'crisis', 'development', 'route', 'mustShowBy', 'at'];
const sumRange = (r: RunMetrics, a: number, b: number, sources: string[] | 'all', field: 'total' | 'neutral' | 'probe') => {
  let n = 0; for (let d = a; d <= b; d++) for (const [s, cell] of Object.entries(r.dailyKinds[d] ?? {})) if (sources === 'all' || sources.includes(s)) n += cell[field]; return n;
};
const L: string[] = [];
L.push(`Прогонов в парах: ${paired.length}; независимых seed-кластеров: ${pairedStatistic(paired, x => x.neutralShown).seeds}; политик: ${results.length}; прогонов на политику: ${results[0]!.runs}.`, '');

L.push('### A. Neutral: ON − OFF по диапазонам дней и истинным источникам показа', '', 'Δ — среднее за прогон; z — Δ / парная кластерная SE.', '',
  '| Диапазон | Источник | Neutral OFF | Neutral ON | Δ neutral | z | Δ всех показов | z |', '|---|---|---:|---:|---:|---:|---:|---:|');
for (const [name, a, b] of RANGES) {
  const rows: [string, string[] | 'all'][] = [['**все**', 'all'], ...SOURCES.slice(0, 3).map(s => [s, [s]] as [string, string[]]), ['прочие', SOURCES.slice(3)]];
  for (const [label, src] of rows) {
    const n = pairedStatistic(paired, r => sumRange(r, a, b, src, 'neutral')), t = pairedStatistic(paired, r => sumRange(r, a, b, src, 'total'));
    L.push(`| ${name} | ${label === 'dice' ? 'кубик' : label === 'pool' ? 'прямой отбор (pool)' : label === 'scheduled' ? 'запланированные' : label} | ${f(n.off)} | ${f(n.on)} | ${f(n.delta)} | ${z(n.z)} | ${f(t.delta)} | ${z(t.z)} |`);
  }
}

L.push('', '### B. Доля neutral среди показов по источнику (OFF → ON)', '', '| Диапазон | Источник | OFF | ON |', '|---|---|---:|---:|');
for (const [name, a, b] of RANGES.slice(0, 2)) for (const s of ['dice', 'pool', 'scheduled']) {
  const share = (mode: 'off' | 'on') => { const rows = paired.map(p => p[mode]); const t = rows.reduce((n, r) => n + sumRange(r, a, b, [s], 'total'), 0), k = rows.reduce((n, r) => n + sumRange(r, a, b, [s], 'neutral'), 0); return t ? `${f(100 * k / t, 1)}% (${k}/${t})` : '—'; };
  L.push(`| ${name} | ${s === 'dice' ? 'кубик' : s === 'pool' ? 'прямой' : 'запланированные'} | ${share('off')} | ${share('on')} |`);
}

L.push('', '### C. Сумма по дням: сколько neutral теряется внутри дней 1–10 и из них на самом заметном дне', '');
const perDay = Array.from({ length: 30 }, (_, i) => ({ day: i + 1, n: pairedStatistic(paired, r => sumRange(r, i + 1, i + 1, 'all', 'neutral')), dice: pairedStatistic(paired, r => sumRange(r, i + 1, i + 1, ['dice'], 'total')), sch: pairedStatistic(paired, r => sumRange(r, i + 1, i + 1, ['scheduled'], 'total')) }));
L.push('| День | Δ neutral | z | Δ кубик (всего) | z | Δ запланированных (всего) | z |', '|---|---:|---:|---:|---:|---:|---:|');
for (const d of perDay.filter(d => Math.abs(d.n.z) >= 2 || Math.abs(d.dice.z) >= 3 || Math.abs(d.sch.z) >= 3)) L.push(`| ${d.day} | ${f(d.n.delta)} | ${z(d.n.z)} | ${f(d.dice.delta)} | ${z(d.dice.z)} | ${f(d.sch.delta)} | ${z(d.sch.z)} |`);

L.push('', '### D. По политикам: Δ neutral, дни 1–10 и 11–30', '', '| Политика | Δ neutral 1–10 | z | Δ neutral 11–30 | z | Δ кубик 1–10 | Δ запланированных 1–10 |', '|---|---:|---:|---:|---:|---:|---:|');
for (const res of results) {
  const rows = paired.filter(p => p.policy === res.policy), A = pairedStatistic(rows, r => sumRange(r, 1, 10, 'all', 'neutral')), B = pairedStatistic(rows, r => sumRange(r, 11, 30, 'all', 'neutral'));
  const dice = pairedStatistic(rows, r => sumRange(r, 1, 10, ['dice'], 'total')), sch = pairedStatistic(rows, r => sumRange(r, 1, 10, ['scheduled'], 'total'));
  L.push(`| ${res.policy} | ${f(A.delta)} | ${z(A.z)} | ${f(B.delta)} | ${z(B.z)} | ${f(dice.delta)} | ${f(sch.delta)} |`);
}

L.push('', '### E. Кубик, кризисы и development: Δ показов по диапазонам', '', '| Диапазон | Источник | OFF | ON | Δ | z |', '|---|---|---:|---:|---:|---:|');
for (const [name, a, b] of [['1–10', 1, 10], ['11–20', 11, 20], ['21–30', 21, 30], ['1–30', 1, 30]] as [string, number, number][]) for (const s of ['dice', 'pool', 'scheduled', 'crisis', 'development']) {
  const t = pairedStatistic(paired, r => sumRange(r, a, b, [s], 'total'));
  L.push(`| ${name} | ${s} | ${f(t.off)} | ${f(t.on)} | ${f(t.delta)} | ${z(t.z)} |`);
}
const out = L.join('\n') + '\n';
console.log(out);
if (process.env.STAGE31_OUT) writeFileSync(process.env.STAGE31_OUT, out);
