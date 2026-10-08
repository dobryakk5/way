// FOCUSED-ENCOUNTERS v1.1, stage 0: a fingerprint of the legacy selectors (AC-1: OFF must equal baseline).
//   npm run focused:baseline            -> prints the fingerprint and compares it with reports/focused-encounters-baseline.json
//   npm run focused:baseline -- --write -> (re)writes that file; do it ONLY on a build whose selectors are the reference.
// The fingerprint covers whole runs (every draw with its source, the six dice candidates with origins and face, the decisions made)
// for every policy and a range of seeds, plus a hash of the protected cards (neutral, probe, development) without any `story` block.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { content } from '../src/content';
import { CONTENT_VERSION } from '../src/content/version';
import { isFacetWeightedDrawCandidate } from '../src/engine';
import type { Card } from '../src/engine';
import { play, POLICIES } from './play';

const FILE = new URL('../reports/focused-encounters-baseline.json', import.meta.url);
const SEEDS = Number(process.env.FOCUSED_BASELINE_SEEDS ?? 40);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => JSON.stringify(k) + ':' + canonical(x)).join(',') + '}';
  return JSON.stringify(v);
}
export const kindOf = (c: Card): string =>
  c.at ? 'fixed' : !['situation', 'routine'].includes(c.type) ? c.type : c.development ? 'development' : c.tags?.includes('route-only') ? 'route-only'
    : c.diagnostic || c.tags?.includes('probe-only') ? (c.tags?.includes('probe-only') ? 'probe' : 'neutral') : isFacetWeightedDrawCandidate(c) ? 'ordinary-story' : 'other-free';

export function protectedCardsHash(): string {
  const protectedCards = content.cards.filter(c => ['neutral', 'probe', 'development'].includes(kindOf(c))).map(c => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'story')))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return sha(canonical(protectedCards));
}
export function runFingerprint(policy: (typeof POLICIES)[number], seed: number): string {
  const { state, draws } = play(seed, { policy });
  return sha(canonical({ draws, dice: state.diceHistory, history: state.history.map(h => [h.day, h.slot, h.cardId, h.choiceId]), facts: state.facts,
    origins: state.heroDevelopmentProfile.evidence.map(e => [e.cardId, e.selectionOrigin]) })).slice(0, 16);
}

if (process.argv[1]?.endsWith('focused-baseline.ts')) {
  const runs: Record<string, string[]> = {};
  for (const policy of POLICIES) runs[policy] = Array.from({ length: SEEDS }, (_, i) => runFingerprint(policy, i + 1));
  const counts: Record<string, number> = {};
  for (const c of content.cards) counts[kindOf(c)] = (counts[kindOf(c)] ?? 0) + 1;
  const record = { contentVersion: CONTENT_VERSION, cards: content.cards.length, kinds: counts, seedsPerPolicy: SEEDS, protectedCardsHash: protectedCardsHash(),
    policyHash: Object.fromEntries(Object.entries(runs).map(([p, l]) => [p, sha(l.join(''))])), runs };
  if (process.argv.includes('--write')) { writeFileSync(FILE, JSON.stringify(record, null, 1) + '\n'); console.log('written', FILE.pathname); }
  if (existsSync(FILE)) {
    const saved = JSON.parse(readFileSync(FILE, 'utf8')) as typeof record;
    const diff = POLICIES.filter(p => saved.runs[p]?.some((h, i) => h !== runs[p]![i]));
    console.log(diff.length || saved.protectedCardsHash !== record.protectedCardsHash ? `DIFFERS: policies ${diff.join(',') || '-'}; protected hash ${saved.protectedCardsHash === record.protectedCardsHash ? 'same' : 'changed'}` : 'IDENTICAL to the recorded baseline');
    if (diff.length || saved.protectedCardsHash !== record.protectedCardsHash) process.exitCode = 1;
  }
  console.log(JSON.stringify({ kinds: counts, policyHash: record.policyHash, protectedCardsHash: record.protectedCardsHash }, null, 1));
}
