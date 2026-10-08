// FOCUSED-ENCOUNTERS v1.1: real, reproducible chains "situation -> choice -> consequence -> next scene" taken from actual runs of the game
// (focus ON, days 1-10). The first decision of each chain is forced (that is the only thing that is not the policy's own choice);
// everything else is what the engine drew. The seed is printed so that a chain can be replayed.
//   npm run focused:chains   (writes CHAINS_OUT when set)
import { writeFileSync } from 'node:fs';
import { content } from '../src/content';
import type { GameContent, GameState } from '../src/engine';
import { play } from './play';

const on: GameContent = { ...content, profile: { ...content.profile, rollout: { ...content.profile.rollout, focusedEncounters: true } } };
const card = (id: string) => content.cards.find(c => c.id === id)!;
const label = (h: GameState['history'][number]) => h.label ?? '';
const trace = (s: GameState, h: GameState['history'][number]) => s.observations.find(o => o.kind === 'trace' && o.day === h.day && o.slot === h.slot)?.text;

interface Target { title: string; source: [string, string]; host: string; hostVariant?: string; policy?: 'mixed' | 'always-first' | 'always-second' | 'random' }
const TARGETS: Target[] = [
  { title: 'Алексей молчит, а ты спросил', source: ['c2_gaze_alexey_silence', 'ask'], host: 'r_customer_wait', hostVariant: 'r_customer_wait_alexey_spoke' },
  { title: 'Вечер, о котором договорились с Мартой', source: ['r_marta_hello', 'b'], host: 'r_marta_evening' },
  { title: 'Пустая лавка Тимона', source: ['c2_silence_market_pause', 'ask'], host: 'r_market_price', hostVariant: 'r_market_price_asked_about_stall' },
  { title: 'Тёмное окно Марты', source: ['c2_gaze_marta_window', 'visit'], host: 'r_evening_light', hostVariant: 'r_evening_light_marta_visited' },
  { title: 'Старая чаша Егора (из первых дней в главу 2)', source: ['c1_old_bowl', 'pause'], host: 'c2_marta_window_result' }
];

function chain(t: Target): string[] {
  for (let seed = 1; seed <= 400; seed++) {
    const { state, draws } = play(seed, { policy: t.policy ?? 'mixed', content: on, choices: { [t.source[0]]: t.source[1] } });
    const i = state.history.findIndex(h => h.cardId === t.source[0] && h.choiceId === t.source[1]);
    if (i < 0) continue;
    const j = state.history.findIndex((h, k) => k > i && h.cardId === t.host && h.day <= 12 && (!t.hostVariant || draws.some(d => d.day === h.day && d.slot === h.slot && d.variantId === t.hostVariant)));
    if (j < 0) continue;
    const a = state.history[i]!, b = state.history[j]!, next = state.history[j + 1];
    const line = (h: GameState['history'][number], extra?: string) => `**День ${h.day}, слот ${h.slot + 1} · ${card(h.cardId).character ?? 'город'}**\n> ${h.text}\n\nТы: «${label(h)}»${extra ? `\n\n_Отклик:_ ${extra}` : ''}`;
    return [`### ${t.title}`, '', `Прогон: политика ${t.policy ?? 'mixed'}, seed ${seed}; первое решение (\`${t.source.join('/')}\`) задано, остальное — выбор движка.`, '',
      '1. ' + line(a, trace(state, a)).replace(/\n/g, '\n   '), '',
      `2. _Через ${b.day - a.day} дн._ ` + line(b, trace(state, b)).replace(/\n/g, '\n   '), '',
      ...(next ? [`3. _Дальше в тот же день/следом_ — **День ${next.day}, слот ${next.slot + 1} · ${card(next.cardId).character ?? 'город'}**\n   > ${next.text}\n\n   Ты: «${label(next)}»`, ''] : [])];
  }
  return [`### ${t.title}`, '', 'Цепочка не найдена за 400 seeds.', ''];
}
if (process.argv[1]?.endsWith('chains-example.ts')) {
  const md = TARGETS.flatMap(chain).join('\n'); console.log(md);
  if (process.env.CHAINS_OUT) writeFileSync(process.env.CHAINS_OUT, md + '\n');
}
