import { pathToFileURL } from 'node:url';
import { LOGICS, loadSourceJson, parsePackage, type Logic, type ParsedPackage, type SourceChoice, type Vector } from './parse-package';

// Structural checks on the package itself (handoff §16). They run on the mechanical source, before any world text exists,
// and are re-used later against the generated runtime cards (check-source-runtime-parity).
const EPS = 1e-9;
export const top1 = (v: Vector): Logic => LOGICS.reduce((best, l) => v[l] > v[best] ? l : best, LOGICS[0]);
const PAIRS: [Logic, Logic][] = LOGICS.slice(0, 7).map((l, i) => [l, LOGICS[i + 1]!]);
const BEATS = ['trial', 'consequence', 'review', 'transfer', 'pressure'] as const;
const FACETS = ['work', 'relationships', 'body', 'inner'] as const;

export function vectorErrors(v: Vector, where: string, max: number): string[] {
  const out: string[] = [];
  const values = LOGICS.map(l => v[l]);
  if (values.some(x => !Number.isFinite(x) || x < 0)) out.push(`${where}: non-finite or negative component`);
  if (Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 1e-6) out.push(`${where}: sum ${values.reduce((a, b) => a + b, 0)} != 1`);
  if (values.filter(x => x > EPS).length < 2) out.push(`${where}: fewer than two non-zero components`);
  if (Math.max(...values) > max + EPS) out.push(`${where}: max component ${Math.max(...values)} > ${max}`);
  return out;
}
const unique = (xs: string[]) => new Set(xs).size === xs.length;

export interface AggregateBias {
  choices: number; top1: Record<Logic, number>; sum: Record<Logic, number>; mean: Record<Logic, number>; maxMinusMin: number;
  top1ByPosition: Record<Logic, number[]>; top1ByFacet: Record<string, Record<Logic, number>>;
}
export function aggregateBias(scenes: { facets: string[]; choices: SourceChoice[] }[]): AggregateBias {
  const zero = () => Object.fromEntries(LOGICS.map(l => [l, 0])) as Record<Logic, number>;
  const top = zero(), sum = zero(); const pos = Object.fromEntries(LOGICS.map(l => [l, [0, 0, 0, 0]])) as Record<Logic, number[]>;
  const byFacet: Record<string, Record<Logic, number>> = {};
  let n = 0;
  for (const s of scenes) for (const c of s.choices) {
    n++; const t = top1(c.vector); top[t]++; pos[t]![c.position]!++;
    (byFacet[s.facets[0]!] ??= zero())[t]++;
    for (const l of LOGICS) sum[l] += c.vector[l];
  }
  const mean = zero(); for (const l of LOGICS) mean[l] = n ? sum[l] / n : 0;
  const vals = LOGICS.map(l => sum[l]);
  return { choices: n, top1: top, sum, mean, maxMinusMin: Math.max(...vals) - Math.min(...vals), top1ByPosition: pos, top1ByFacet: byFacet };
}

export function checkSource(p: ParsedPackage): { errors: string[]; bias: Record<string, AggregateBias> } {
  const errors: string[] = []; const fail = (s: string) => errors.push(s);

  // --- Package counts (§16.7) ---------------------------------------------------------------------------------------
  if (p.neutral.length !== 32) fail(`neutral main = ${p.neutral.length}, expected 32`);
  for (const f of FACETS) if (p.neutral.filter(s => s.facets[0] === f && s.facets.length === 1).length !== 8) fail(`neutral facet ${f} != 8`);
  if (!unique(p.neutral.map(s => s.contextId))) fail('neutral contextId not unique');
  if (!unique(p.neutral.map(s => s.id))) fail('neutral id not unique');
  if (p.neutral.filter(s => s.pressure).length !== 8) fail('neutral pressure != 8');
  for (const f of FACETS) if (p.neutral.filter(s => s.pressure && s.facets[0] === f).length !== 2) fail(`neutral pressure facet ${f} != 2`);
  if (p.neutral.reduce((a, s) => a + s.choices.length, 0) !== 128) fail('neutral choices != 128');
  for (const s of p.neutral) { if (s.choices.length !== 4) fail(`${s.id}: ${s.choices.length} choices`); if (s.developmentWeight !== 1) fail(`${s.id}: weight ${s.developmentWeight}`); }
  if (p.motives.length !== 8) fail(`motive prompts = ${p.motives.length}`);
  for (const m of p.motives) {
    const owner = p.neutral.find(s => s.id === m.situationId);
    if (!owner?.hasMotive) fail(`motive ${m.situationId}: owner scene missing or not flagged diagnosticMotive`);
  }
  if (p.neutral.filter(s => s.hasMotive).length !== 8) fail('scenes flagged diagnosticMotive != 8');
  for (const f of FACETS) if (p.motives.filter(m => p.neutral.find(s => s.id === m.situationId)?.facets[0] === f).length !== 2) fail(`motive facet ${f} != 2`);
  if (p.behaviors.length !== 4) fail(`behaviors = ${p.behaviors.length}`);
  for (const b of p.behaviors) if (!p.neutral.some(s => s.id === b.continuesSituationId)) fail(`behavior ${b.id}: unknown continuesSituationId`);
  for (const f of FACETS) if (p.behaviors.filter(b => b.facets[0] === f).length !== 1) fail(`behavior facet ${f} != 1`);
  if (p.probes.length !== 21) fail(`probes = ${p.probes.length}`);
  if (!unique(p.probes.map(s => s.id))) fail('probe id not unique');
  if (p.development.length !== 50) fail(`development cards = ${p.development.length}`);
  if (!unique(p.development.map(c => c.id))) fail('development cardId not unique');

  // --- Vectors --------------------------------------------------------------------------------------------------------
  for (const s of p.neutral) for (const c of s.choices) errors.push(...vectorErrors(c.vector, `${s.id}/${c.id}`, 0.6));
  for (const m of p.motives) for (const c of m.options) errors.push(...vectorErrors(c.vector, `${m.situationId}/${c.id}`, 0.6));
  for (const b of p.behaviors) for (const c of b.choices) errors.push(...vectorErrors(c.vector, `${b.id}/${c.id}`, 0.6));
  for (const s of p.probes) for (const c of s.choices) errors.push(...vectorErrors(c.vector, `${s.id}/${c.id}`, 0.65));

  // --- Position balance: neutral (§16.2) ------------------------------------------------------------------------------
  const nb = aggregateBias(p.neutral);
  for (const l of LOGICS) {
    if (nb.top1[l] !== 16) fail(`neutral top-1 ${l} = ${nb.top1[l]}, expected 16`);
    if (nb.top1ByPosition[l]!.some(x => x !== 4)) fail(`neutral top-1 ${l} by position A/B/C/D = ${nb.top1ByPosition[l]!.join('/')}, expected 4/4/4/4`);
  }

  // --- Probes: pairs, per-pair count, role rotation by vector (never by letter) ----------------------------------------
  const roleOf = (s: ParsedPackage['probes'][number], c: SourceChoice) => { const t = top1(c.vector); return t === s.distinguishes[0] ? 'left' : t === s.distinguishes[1] ? 'right' : 'control'; };
  const ROTATION = [['left', 'right', 'control'], ['right', 'control', 'left'], ['control', 'left', 'right']];
  PAIRS.forEach(([l, r]) => {
    const scenes = p.probes.filter(s => s.distinguishes[0] === l && s.distinguishes[1] === r).sort((a, b) => a.id.localeCompare(b.id));
    if (scenes.length !== 3) fail(`pair ${l}/${r}: ${scenes.length} scenes`);
    scenes.forEach((s, i) => {
      if (s.choices.length !== 3) fail(`${s.id}: ${s.choices.length} choices`);
      const roles = s.choices.map(c => roleOf(s, c));
      if (JSON.stringify(roles) !== JSON.stringify(ROTATION[i])) fail(`${s.id}: roles ${roles.join(',')} != rotation ${ROTATION[i]!.join(',')}`);
      const ctrl = s.choices.find(c => roleOf(s, c) === 'control');
      if (ctrl) { const t = top1(ctrl.vector); if (t === l || t === r) fail(`${s.id}: control leads inside the pair`); }
    });
  });
  const pb = aggregateBias(p.probes.map(s => ({ facets: s.facets, choices: s.choices })));

  // --- Development: positions, beats, retry graph (§16.2, 16.4, 16.5, 16.8) ----------------------------------------------
  const target = (c: ParsedPackage['development'][number]['choices'][number]) => !!c.event && c.event !== 'withdrawal';
  const positions = [0, 0, 0];
  for (const c of p.development) {
    const targets = c.choices.filter(target);
    if (c.choices.length !== 3) fail(`${c.id}: ${c.choices.length} choices`);
    if (targets.length !== 1) { fail(`${c.id}: ${targets.length} target choices`); continue; }
    positions[targets[0]!.position]!++;
    if (targets[0]!.event !== c.beat) fail(`${c.id}: target event ${targets[0]!.event} != beat ${c.beat}`);
  }
  if (Math.max(...positions) - Math.min(...positions) > 1) fail(`development target positions ${positions.join('/')}, spread > 1`);
  const arcs = [...new Set(p.development.map(c => c.arcId))];
  if (arcs.length !== 6) fail(`arcs = ${arcs.length}`);
  for (const arc of arcs) {
    const cards = p.development.filter(c => c.arcId === arc);
    const primary = (b: string) => cards.filter(c => !c.retry && c.beat === b);
    const retries = (b: string) => cards.filter(c => c.retry && c.beat === b);
    for (const b of BEATS) if (primary(b).length !== 1) fail(`${arc}: ${primary(b).length} primary cards for beat ${b}`);
    const trialCtx = primary('trial')[0]?.contextId, transferCtx = primary('transfer')[0]?.contextId;
    if (trialCtx && trialCtx === transferCtx) fail(`${arc}: transfer.contextId equals trial.contextId`);
    for (const b of BEATS) {
      const withdraws = cards.some(c => c.beat === b && !c.retry && c.choices.some(ch => ch.event === 'withdrawal'));
      const hasRetry = retries(b).length > 0;
      if (withdraws && !hasRetry) fail(`${arc}: withdrawal@${b} reachable but no retry-${b}`);
      if (!withdraws && hasRetry) fail(`${arc}: retry-${b} exists but no withdrawal@${b}`);
      if (retries(b).length > 1) fail(`${arc}: more than one retry for ${b}`);
    }
    // retry.01 is pressure only; transfer withdrawal never routes into it (RECONCILIATION-v2 §4)
    for (const c of cards.filter(x => x.retry)) {
      const mentioned = [...c.requires.matchAll(/withdrawal@(\w+)/g)].map(m => m[1]);
      if (mentioned.length !== 1 || mentioned[0] !== c.beat) fail(`${c.id}: requires "${c.requires}" does not route exactly withdrawal@${c.beat}`);
      if (c.fn === 'retry' && !c.id.endsWith('.retry.01')) fail(`${c.id}: fn retry on unexpected id`);
    }
    // every arc must reach: control (no event), trial-withdrawal, fast mastery (all targets), mastery-after-retry
    if (!primary('trial')[0]?.choices.some(ch => ch.event === 'withdrawal')) fail(`${arc}: trial-withdrawal path unreachable`);
    if (!retries('trial').length) fail(`${arc}: mastery-after-retry path needs retry-trial`);
    if (!primary('trial')[0]?.choices.some(ch => !ch.event)) fail(`${arc}: control path (no-evidence choice) missing on trial`);
  }
  return { errors, bias: { neutral: nb, probes: pb } };
}

const pct = (x: number, total: number) => `${(100 * x / total).toFixed(2)}%`;
export function formatBias(name: string, b: AggregateBias): string {
  const total = LOGICS.reduce((a, l) => a + b.sum[l], 0);
  const rows = LOGICS.map(l => `  ${l.padEnd(14)} top1=${String(b.top1[l]).padStart(2)}  sum=${b.sum[l].toFixed(2).padStart(6)} (${pct(b.sum[l], total).padStart(6)})  mean=${b.mean[l].toFixed(3)}  pos=${b.top1ByPosition[l]!.join('/')}`);
  return `${name}: ${b.choices} choices, max-min of sums = ${b.maxMinusMin.toFixed(2)}\n${rows.join('\n')}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const parsed = process.argv.includes('--markdown') ? parsePackage() : loadSourceJson();
  const { errors, bias } = checkSource(parsed);
  console.log(formatBias('neutral', bias.neutral!)); console.log(formatBias('probes', bias.probes!));
  if (errors.length) { console.error(`\n${errors.length} source problem(s):\n${errors.join('\n')}`); process.exitCode = 1; }
  else console.log('\nSOURCE OK');
}
