// FOCUSED-ENCOUNTERS v1.1: real, reproducible chains "situation -> choice -> consequence -> what that led to" taken from actual runs of the game
// (focus ON, days 1-10 selector, then the rest of the run). The first decision of each chain is forced (that is the only thing that is not the
// policy's own choice); everything else is what the engine drew. Step 3 is the next visible consequence of the SAME decision (or of the consequence
// itself) found by the impact observer, never just "the next scene". The seed is printed so that a chain can be replayed.
//   npm run focused:chains   (writes CHAINS_OUT when set)
import { writeFileSync } from 'node:fs';
import { content } from '../src/content';
import type { GameContent, GameState, ObservableImpactEvent } from '../src/engine';
import { isDecisionImpact, playObserved } from './impact-observe';

const on: GameContent = { ...content, profile: { ...content.profile, rollout: { ...content.profile.rollout, focusedEncounters: true } } };
const card = (id: string) => content.cards.find(c => c.id === id)!;
type H = GameState['history'][number];
const trace = (s: GameState, h: H) => s.observations.find(o => o.kind === 'trace' && o.day === h.day && o.slot === h.slot)?.text;
const at = (s: GameState, day: number, slot: number) => s.history.find(h => h.day === day && h.slot === slot);

interface Target { title: string; source: [string, string]; host: string; hostVariant?: string }
const TARGETS: Target[] = [
  { title: 'Алексей молчит, а ты спросил', source: ['c2_gaze_alexey_silence', 'ask'], host: 'r_customer_wait', hostVariant: 'r_customer_wait_alexey_spoke' },
  { title: 'Вечер, о котором договорились с Мартой', source: ['r_marta_hello', 'b'], host: 'r_marta_evening' },
  { title: 'Пустая лавка Тимона', source: ['c2_silence_market_pause', 'ask'], host: 'r_coins', hostVariant: 'r_coins_asked_about_stall' },
  { title: 'Лишние монеты Тимона (первые дни)', source: ['c1_extra_change', 'keep'], host: 'c1_timon_returns' },
  { title: 'Старая чаша Егора (из первых дней в главу 2)', source: ['c1_old_bowl', 'pause'], host: 'c2_marta_window_result' }
];

function chain(t: Target): string[] {
  const key = `${t.source[0]}/${t.source[1]}`;
  for (let seed = 1; seed <= 600; seed++) {
    const { state, draws, events } = playObserved(seed, { policy: 'mixed', content: on, choices: { [t.source[0]]: t.source[1] } });
    const a = state.history.find(h => h.cardId === t.source[0] && h.choiceId === t.source[1]);
    if (!a) continue;
    const shownAs = (e: ObservableImpactEvent) => at(state, e.day, state.history.find(h => h.day === e.day && h.cardId === e.visibleCardId)?.slot ?? -1);
    const mine = events.filter(e => isDecisionImpact(e) && `${e.sourceCardId}/${e.sourceChoiceId}` === key && !e.visibleCardId.startsWith('daytext:') && e.sourceDay === a.day);
    const second = mine.find(e => e.visibleCardId === t.host && (!t.hostVariant || draws.some(d => d.day === e.day && d.cardId === e.visibleCardId && d.variantId === t.hostVariant)));
    const b = second && shownAs(second);
    if (!second || !b) continue;
    // step 3: another visible consequence of the same decision, else of the consequence scene's own choice
    const third = events.find(e => isDecisionImpact(e) && !e.visibleCardId.startsWith('daytext:') && (e.day > b.day || e.day === b.day && (state.history.find(h => h.day === e.day && h.cardId === e.visibleCardId)?.slot ?? 0) > b.slot) &&
      (`${e.sourceCardId}/${e.sourceChoiceId}` === key && e.visibleCardId !== t.host || (e.sourceCardId === b.cardId && e.sourceChoiceId === b.choiceId)));
    const c = third && state.history.find(h => h.day === third.day && h.cardId === third.visibleCardId);
    if (!c || !third) continue;
    const via = (e: ObservableImpactEvent) => e.kinds.includes('delayed') ? 'запланированное продолжение' : e.kinds.includes('choice') ? 'изменился набор выборов' : 'отклик на прошлое решение';
    const step = (h: H, extra?: string) => `**День ${h.day}, слот ${h.slot + 1} · ${card(h.cardId).character ?? 'город'}**\n> ${h.text}\n\nТы: «${h.label}»${extra ? `\n\n_Отклик:_ ${extra}` : ''}`;
    return [`### ${t.title}`, '', `Прогон: политика mixed, seed ${seed}; первое решение (\`${key}\`) задано, остальное — выбор движка.`, '',
      '1. **Ситуация и выбор.** ' + step(a, trace(state, a)).replace(/\n/g, '\n   '), '',
      `2. **Последствие** (через ${b.day - a.day} дн.; ${via(second)}). ` + step(b, trace(state, b)).replace(/\n/g, '\n   '), '',
      `3. **Что было дальше** (через ${c.day - b.day} дн. после шага 2; ${via(third)}). ` + step(c, trace(state, c)).replace(/\n/g, '\n   '), ''];
  }
  return [`### ${t.title}`, '', 'Цепочка не найдена за 600 seeds.', ''];
}
if (process.argv[1]?.endsWith('chains-example.ts')) {
  const md = TARGETS.flatMap(chain).join('\n'); console.log(md);
  if (process.env.CHAINS_OUT) writeFileSync(process.env.CHAINS_OUT, md + '\n');
}
