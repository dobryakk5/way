import { readFileSync } from 'node:fs';
import { content } from '../src/content';
import { ACTION_LOGICS, evaluateEvening, zeroVector } from '../src/engine';
import type { ActionLogic, Card, GameContent, HeroDevelopmentProfileEvidence, LogicVector, ProfileAlgorithmConfig } from '../src/engine';
import { play } from './play';
import { leaning } from './profile-scenarios';
type Ev = HeroDevelopmentProfileEvidence;
const base = content.profile.algorithms['1']!;
const untuned = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as Record<string, LogicVector>;
function withVectors(vs: Record<string, LogicVector>): GameContent {
  const cards = content.cards.map(c => !c.diagnostic || c.tags?.includes('probe-only') ? c : ({ ...c,
    choices: c.choices.map(ch => ({ ...ch, diagnosticAction: { ...ch.diagnosticAction!, vector: vs[`${c.id}/${ch.id}`] ?? ch.diagnosticAction!.vector } })) as Card['choices'],
    ...(c.choiceVariants ? { choiceVariants: c.choiceVariants.map(v => ({ ...v, choices: v.choices.map(ch => ({ ...ch, diagnosticAction: { ...ch.diagnosticAction!, vector: vs[`${c.id}/${ch.id}`] ?? ch.diagnosticAction!.vector } })) as Card['choices'] })) } : {}) }));
  return { ...content, cards };
}
const sets = { tuned: content, untuned: withVectors(untuned) };
/** Contrast: what the chosen option has that the rejected one does not, renormalised. */
function contrast(c: GameContent, e: Ev): LogicVector | undefined {
  const card = c.cards.find(x => x.id === e.cardId)!;
  if (e.source === 'motive') return e.vector;
  const sig = (ch: Card['choices'][number]) => (ch.diagnosticAction ?? ch.diagnosticBehavior?.signal)?.vector;
  const pair = [card.choices, ...(card.choiceVariants ?? []).map(v => v.choices)].find(p => p.some(ch => ch.id === e.choiceId))!;
  const others = pair.filter(ch => ch.id !== e.choiceId).map(sig).filter(Boolean) as LogicVector[];
  if (!others.length) return e.vector;
  const v = zeroVector(); let s = 0;
  for (const l of ACTION_LOGICS) { const o = others.reduce((a, x) => a + x[l], 0) / others.length; v[l] = Math.max(0, e.vector[l] - o); s += v[l]; }
  if (s <= 0) return undefined;
  for (const l of ACTION_LOGICS) v[l] /= s;
  return v;
}
type Scoring = 'absolute' | 'contrast';
function replay(c: GameContent, evidence: Ev[], cfg: ProfileAlgorithmConfig, scoring: Scoring) {
  const ev = scoring === 'absolute' ? evidence : evidence.flatMap(e => { const v = contrast(c, e); return v ? [{ ...e, vector: v }] : []; });
  let prev; let ever: ActionLogic | undefined; let firstDay: number | undefined;
  for (let d = 1; d <= 30; d++) { prev = evaluateEvening(prev, ev.filter(e => e.day <= d), d, undefined, cfg); if (prev.observedPrimary && !ever) { ever = prev.observedPrimary; firstDay = d; } }
  return { first: ever, firstDay, final: prev!.status === 'stable' ? prev!.observedPrimary : undefined };
}
const variants: [string, Scoring, Partial<ProfileAlgorithmConfig['stableCandidate']>][] = [
  ['spec 0.30/0.10, absolute', 'absolute', {}],
  ['0.22/0.06, absolute', 'absolute', { minLeaderShare: .22, minDelta: .06 }],
  ['spec 0.30/0.10, contrast', 'contrast', {}],
];
const seeds = Number(process.env.SEEDS ?? 12);
for (const [setName, c] of Object.entries(sets)) {
  // Plays do not depend on scoring (adaptation is off), so one set of journals serves every variant.
  const journals = Object.fromEntries(ACTION_LOGICS.map(L => [L, Array.from({ length: seeds }, (_, k) => play(k + 1, { content: c, ...leaning(L, .1) }).state.heroDevelopmentProfile.evidence)]));
  const random = Array.from({ length: 20 }, (_, k) => play(k + 1, { content: c, policy: 'random' }).state.heroDevelopmentProfile.evidence);
  for (const [name, scoring, sc] of variants) {
    const cfg = { ...base, stableCandidate: { ...base.stableCandidate, ...sc } };
    const row = ACTION_LOGICS.map(L => { const r = journals[L]!.map(j => replay(c, j, cfg, scoring)); const hit = r.filter(x => x.first === L).length; const wrong = r.filter(x => x.first && x.first !== L).length;
      const days = r.flatMap(x => x.first === L && x.firstDay ? [x.firstDay] : []).sort((a, b) => a - b);
      return `${L.slice(0, 5)} ${Math.round(hit / seeds * 100)}%${wrong ? `(!${wrong})` : ''}${days.length ? ' d' + days[days.length >> 1] : ''}`; });
    const fs = random.map(j => replay(c, j, cfg, scoring)).filter(x => x.first).length;
    console.log(`[${setName}] ${name.padEnd(26)} | ${row.join(' | ')} | random false-center ${Math.round(fs / 20 * 100)}%`);
  }
}
