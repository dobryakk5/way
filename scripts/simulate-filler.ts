// FOCUSED-ENCOUNTERS v1.1: does a scene feel like part of the story or like filler? A scene is "connected" if the hero meets a line that recalls
// an earlier decision of hers (a text variant chosen by a past `chose`/fact, a scheduled follow-up, a choice variant), or if the choice she makes in it
// has a designed consequence (a reader in the static influence graph). A scene with neither is "filler" in this sense.
//   FILLER_RUNS=300 FILLER_OUT=file.md npm run focused:filler
import { writeFileSync } from 'node:fs';
import { content } from '../src/content';
import { freePool, isFacetWeightedDrawCandidate, rankFocusedStory } from '../src/engine';
import { buildImpactGraph, impactOf } from '../src/engine/impact';
import type { GameContent, GoalId } from '../src/engine';
import { play, POLICIES } from './play';

const RUNS = Number(process.env.FILLER_RUNS ?? 300);
const GOALS: GoalId[] = ['order', 'workshop', 'alexey'];
const RANGE = content.profile.focusedEncounters;
const graph = buildImpactGraph(content);
const on: GameContent = { ...content, profile: { ...content.profile, rollout: { ...content.profile.rollout, focusedEncounters: true } } };
const off: GameContent = { ...content, profile: { ...content.profile, rollout: { ...content.profile.rollout, focusedEncounters: false } } };
interface Row { path: 'dice' | 'direct'; tier: string; inbound: boolean; outbound: boolean; id: string }

function rows(c: GameContent): Row[] {
  const out: Row[] = [];
  for (const policy of POLICIES) for (let seed = 1; seed <= RUNS; seed++) {
    const pending: Record<string, { path: 'direct'; tier: string; inbound: boolean; id: string }> = {};
    const { state } = play(seed, { policy, content: c, goal: GOALS[seed % 3]!,
      onDraw: (s, draw) => {
        if (s.day < RANGE.fromDay || s.day > RANGE.throughDay || !isFacetWeightedDrawCandidate(draw.card)) return;
        const tier = String(rankFocusedStory(s, c, freePool(s, c)).find(r => r.card.id === draw.card.id)?.tier ?? 'none');
        // a dice-landed scene arrives as 'current'; a direct draw as 'pool'
        if (draw.source === 'pool') pending[`${s.day}/${s.slot}`] = { path: 'direct', tier, inbound: !!draw.variantId, id: draw.card.id };
        else if (draw.source === 'current') pending[`${s.day}/${s.slot}`] = { path: 'direct', tier, inbound: !!draw.variantId, id: draw.card.id };
      } });
    const diceDays = new Map(state.diceHistory.map(d => [`${d.day}/${d.slot}`, d]));
    for (const h of state.history) {
      const p = pending[`${h.day}/${h.slot}`];
      if (!p) continue;
      const landed = [...diceDays.values()].some(d => d.day === h.day && d.cardId === h.cardId);
      out.push({ path: landed ? 'dice' : 'direct', tier: p.tier, inbound: p.inbound, outbound: impactOf(graph, h.cardId, h.choiceId).count > 0, id: p.id });
    }
  }
  return out;
}
const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(0)}%` : '—';
function table(name: string, r: Row[]): string[] {
  const L = [`**${name}**`, '', '| Путь | Показов | Есть отклик на прошлый выбор | Есть задуманное последствие | Наполнитель (ни того, ни другого) |', '|---|---:|---:|---:|---:|'];
  for (const path of ['dice', 'direct'] as const) {
    const x = r.filter(y => y.path === path);
    L.push(`| ${path === 'dice' ? 'кубик' : 'прямой'} | ${x.length} | ${pct(x.filter(y => y.inbound).length, x.length)} | ${pct(x.filter(y => y.outbound).length, x.length)} | ${pct(x.filter(y => !y.inbound && !y.outbound).length, x.length)} |`);
  }
  L.push('', '| Уровень (прямой путь) | Показов | Наполнитель |', '|---|---:|---:|');
  for (const t of ['1', '2', '3', '4', '5', 'none']) { const x = r.filter(y => y.path === 'direct' && y.tier === t); if (x.length) L.push(`| P${t === 'none' ? ' —' : t} | ${x.length} | ${pct(x.filter(y => !y.inbound && !y.outbound).length, x.length)} |`); }
  const top = Object.entries(r.filter(y => y.path === 'direct' && !y.inbound && !y.outbound).reduce<Record<string, number>>((a, y) => (a[y.id] = (a[y.id] ?? 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
  L.push('', `Чаще всего «наполнитель» в прямом отборе: ${top.map(([k, v]) => `${k} (${v})`).join(', ') || '—'}.`, '');
  return L;
}
if (process.argv[1]?.endsWith('simulate-filler.ts')) {
  const L = [`Прогонов: ${RUNS} × ${POLICIES.length} политик в каждом режиме; дни 1–${RANGE.throughDay}; цели вращаются по seed.`, ''];
  L.push(...table('OFF (легаси-отбор)', rows(off)), ...table('ON (фокус)', rows(on)));
  const md = L.join('\n'); console.log(md);
  if (process.env.FILLER_OUT) writeFileSync(process.env.FILLER_OUT, md + '\n');
}
