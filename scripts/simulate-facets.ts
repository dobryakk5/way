// FACET-ATTENTION simulation on the real content: for synthetic attention histories, how often do the six dice candidates
// (and the scene the die lands on) come from each sphere, with the mechanism on and off. Writes reports/FACET-ATTENTION-SIMULATION-v1.md.
import { writeFileSync } from 'node:fs';
import { content } from '../src/content';
import { cardFacetMultiplier, declaredIntentionPrior, deterministicRandom, drawCard, facetAttention, facetTargetDistribution, FACETS, freePool, isFacetAttentionEvidenceSource, isFacetWeightedDrawCandidate, prepareEncounter } from '../src/engine';
import type { Card, GameContent, GameState, LifeFacet } from '../src/engine';
import { play } from './play';

const DRAWS = Number(process.env.FACET_DRAWS ?? 1500);
const BASE_DAYS = [8, 14, 24];
const on: GameContent = { ...content, profile: { ...content.profile, rollout: { ...content.profile.rollout, facetAttention: true } } };
const off: GameContent = { ...content, profile: { ...content.profile, rollout: { ...content.profile.rollout, facetAttention: false } } };
const config = content.profile.facetAttention;

// A real mid-run state at the start of the first free (pool) slot of each base day.
function baseState(day: number): GameState {
  let found: GameState | undefined;
  play(1, { policy: 'mixed', beforeStep: s => {
    if (!found && s.day === day && s.phase === 'slot' && !s.current) { try { if (drawCard(s, content)?.source === 'pool') found = s; } catch { /* forced scene */ } }
    return s;
  } });
  if (!found) throw new Error(`No free slot on day ${day}`);
  return found;
}
const evidenceCards = (f: LifeFacet) => content.cards.filter(c => isFacetAttentionEvidenceSource(c) && c.facets?.[0] === f);
const history = (decisions: LifeFacet[]): GameState['history'] => decisions.map((f, i) => ({ day: 1, slot: i % 4, cardId: evidenceCards(f)[0]!.id, choiceId: 'x', facets: [f] }));
const rep = (f: LifeFacet, n: number) => Array<LifeFacet>(n).fill(f);
const mix = (...parts: [LifeFacet, number][]) => parts.flatMap(([f, n]) => rep(f, n));
const SCENARIOS: [string, LifeFacet[]][] = [
  ['uniform', mix(['work', 4], ['relationships', 4], ['body', 4], ['inner', 4])],
  ['work-heavy', mix(['work', 12], ['relationships', 2], ['body', 1], ['inner', 1])],
  ['relationships-heavy', mix(['relationships', 12], ['work', 2], ['body', 1], ['inner', 1])],
  ['body-heavy', mix(['body', 12], ['work', 2], ['relationships', 1], ['inner', 1])],
  ['inner-heavy', mix(['inner', 12], ['work', 2], ['relationships', 1], ['body', 1])],
  ['switch work → relationships, after 8 new', mix(['work', 16], ['relationships', 8])],
  ['switch work → relationships, after 16 new (old left the window)', mix(['work', 16], ['relationships', 16])],
  ['switch relationships → body, after 8 new', mix(['relationships', 16], ['body', 8])],
  ['switch relationships → body, after 16 new (old left the window)', mix(['relationships', 16], ['body', 16])]
];
const pct = (n: number) => (100 * n).toFixed(1).padStart(5) + '%';
const row = (d: Record<LifeFacet, number>) => FACETS.map(f => pct(d[f])).join(' | ');
const share = (d: Record<LifeFacet, number>): Record<LifeFacet, number> => { const t = FACETS.reduce((a, f) => a + d[f], 0) || 1; return Object.fromEntries(FACETS.map(f => [f, d[f] / t])) as Record<LifeFacet, number>; };
const spread = (card: Card, into: Record<LifeFacet, number>) => { const fs = [...new Set(card.facets ?? [])]; for (const f of fs) into[f] += 1 / fs.length; };

/** One draw of the dice flow: the six candidates, then a fair die. */
function drawOnce(base: GameState, hist: GameState['history'], i: number, c: GameContent): { candidates: Card[]; landed: Card } | undefined {
  const state: GameState = { ...base, seed: 5000 + i, history: hist, diceHistory: base.diceHistory.filter(d => d.day !== base.day) };
  const next = prepareEncounter(state, c);
  const ids = next.diceHistory.at(-1)?.candidates;
  if (next.phase !== 'dice' || !ids || ids.length !== 6) return undefined;
  const candidates = ids.map(id => c.cards.find(x => x.id === id)!);
  const face = Math.floor(deterministicRandom(state.seed, state.day, state.slot, 'die', state.episodeId) * 6);
  return { candidates, landed: candidates[face]! };
}
function observe(base: GameState, hist: GameState['history'], c: GameContent) {
  const landed = { work: 0, relationships: 0, body: 0, inner: 0 }, offered = { work: 0, relationships: 0, body: 0, inner: 0 };
  let neutral = 0, offeredSlots = 0, ok = 0; const neutralSets: string[] = [];
  for (let i = 0; i < DRAWS; i++) {
    const r = drawOnce(base, hist, i, c); if (!r) continue; ok++;
    if (r.landed.diagnostic) neutral++; else if (isFacetWeightedDrawCandidate(r.landed)) spread(r.landed, landed);
    neutralSets.push(r.candidates.filter(x => x.diagnostic).map(x => x.id).sort().join(','));
    for (const card of r.candidates) { if (card.diagnostic) continue; if (isFacetWeightedDrawCandidate(card)) { spread(card, offered); offeredSlots++; } }
  }
  return { landed: share(landed), offered: share(offered), neutral: neutral / Math.max(ok, 1), storyOffered: offeredSlots / Math.max(ok, 1), draws: ok, neutralSets };
}
/** First-order expectation for the story scenes of the real pool: card weight = facet multiplier (every card has one slot per draw). */
function expected(base: GameState, hist: GameState['history']) {
  const s: GameState = { ...base, history: hist };
  const att = facetAttention(s, on, config), target = facetTargetDistribution(att, config);
  const cards = freePool(s, on).filter(isFacetWeightedDrawCandidate);
  const dist = { work: 0, relationships: 0, body: 0, inner: 0 }; let total = 0;
  for (const card of cards) { const w = cardFacetMultiplier(card, target, config, declaredIntentionPrior(card, s, att, config)); total += w; const fs = [...new Set(card.facets ?? [])]; for (const f of fs) dist[f] += w / fs.length; }
  const flat = { work: 0, relationships: 0, body: 0, inner: 0 }; for (const card of cards) spread(card, flat);
  return { att, target, expected: share(dist), poolMix: share(flat), poolSize: cards.length, total };
}

const lines: string[] = [];
const out = (s = '') => { lines.push(s); console.log(s); };
out('# FACET-ATTENTION-SIMULATION v1');
out();
out(`Real content (${content.cards.length} cards), dice flow (\`prepareEncounter\`: six candidates, fair die). Base states: first free slot of days ${BASE_DAYS.join(', ')} of a real run (seed 1, policy mixed). ${DRAWS} draws per scenario and base state, each with a different seed; the attention history is synthetic (16 decisions, see scenarios).`);
out();
out('Columns are always Дело | Отношения | Тело | Внутреннее. A multi-sphere scene gives 1/N to each of its spheres in every column.');
out('- **pool**: the sphere mix of the eligible story pool, weights equal (what you get with the mechanism off, on average).');
out('- **expected**: first-order expectation for the real pool, each story scene weighted by its facet multiplier (an approximation: it ignores sampling without replacement among the six).');
out('- **offered on / off**: observed mix of story scenes among the six candidates. **landed on / off**: observed mix of the scene the die landed on.');
out('- **neutral on / off**: share of draws where the die landed on a neutral scene (differs by die noise only: the neutral scenes among the six are checked to be identical draw by draw, FACET-2).');
out();
const checks: string[] = [];
for (const day of BASE_DAYS) {
  const base = baseState(day);
  out(`## Day ${day} (chapter ${base.chapter})`);
  out();
  for (const [name, decisions] of SCENARIOS) {
    const hist = history(decisions);
    const e = expected(base, hist), a = observe(base, hist, on), b = observe(base, hist, off);
    out(`### ${name}`);
    out();
    out('| | Дело | Отношения | Тело | Внутреннее |');
    out('|---|---|---|---|---|');
    out(`| input attention (${e.att.evidence} decisions) | ${row(e.att.distribution)} |`);
    out(`| target | ${row(e.target)} |`);
    out(`| pool (${e.poolSize} story scenes) | ${row(e.poolMix)} |`);
    out(`| expected | ${row(e.expected)} |`);
    out(`| offered on | ${row(a.offered)} |`);
    out(`| offered off | ${row(b.offered)} |`);
    out(`| landed on | ${row(a.landed)} |`);
    out(`| landed off | ${row(b.landed)} |`);
    out();
    out(`neutral on / off: ${pct(a.neutral)} / ${pct(b.neutral)}; story scenes among the six on / off: ${a.storyOffered.toFixed(2)} / ${b.storyOffered.toFixed(2)}; draws ${a.draws}.`);
    out();
    if (a.draws < DRAWS * .9) checks.push(`${name}@${day}: only ${a.draws}/${DRAWS} draws had a full dice set`);
    if (FACETS.some(f => a.offered[f] <= 0 && e.poolMix[f] > 0)) checks.push(`${name}@${day}: a sphere vanished from the offered scenes`);
    if (a.neutralSets.join('|') !== b.neutralSets.join('|')) checks.push(`${name}@${day}: the neutral candidates differ between on and off`);
  }
}
out('## Checks');
out();
out(checks.length ? checks.map(c => `- FAIL ${c}`).join('\n') : '- all spheres present in every scenario, the neutral candidates identical draw by draw on and off, every sampled slot had a full dice set');
writeFileSync(new URL('../reports/FACET-ATTENTION-SIMULATION-v1.md', import.meta.url), lines.join('\n') + '\n');
if (checks.length) process.exitCode = 1;
