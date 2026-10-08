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

interface Target { title: string; source: [string, string]; host: string; hostVariant?: string; force?: Record<string, string> }
// Ten chains over the whole episode: the decisions of chapters 1-2 and what they became in days 11-30 (force = further decisions fixed for the example).
const TARGETS: Target[] = [
  { title: '1. Алексей молчит, а ты спросил → он просит малую партию → его своя партия', source: ['c2_gaze_alexey_silence', 'ask'], host: 'x3_alexey_asks_for_order', force: { x3_alexey_asks_for_order: 'whole' } },
  { title: '2. Алексей молчит, ты не трогал → цену он назвать не решается', source: ['c2_gaze_alexey_silence', 'respect'], host: 'enc_3_10', hostVariant: 'enc_3_10_silent' },
  { title: '3. Тёмное окно Марты, ты зашёл → вторая чашка → вечер, который стал вашим', source: ['c2_gaze_marta_window', 'visit'], host: 'x3_marta_second_cup', force: { x3_marta_second_cup: 'take' } },
  { title: '4. Тёмное окно Марты, ты прошёл мимо → расстояние → записка у двери', source: ['c2_gaze_marta_window', 'home'], host: 'x3_marta_apart', force: { x3_marta_apart: 'nod' } },
  { title: '5. Хлеб для мальчика → мальчик у двери мастерской → Странник за ним', source: ['c2_gaze_wanderer_bread', 'offer'], host: 'x3_boy_at_door', force: { x3_boy_at_door: 'stay' } },
  { title: '6. Хлеб не предложен → мальчик у реки → что Странник об этом знает', source: ['c2_gaze_wanderer_bread', 'watch'], host: 'x3_boy_by_river', force: { x3_boy_by_river: 'feed' } },
  { title: '7. «Договориться на вечер» с Мартой → вечер у печи → Марта помнит', source: ['r_marta_hello', 'b2'], host: 'r_marta_evening', force: { r_marta_evening: 'wait' } },
  { title: '8. Чашка Марты, ты спросил ещё раз → она встречает тебя с чашкой → вторая чашка', source: ['c2_silence_marta_cup', 'ask'], host: 'enc_3_2', hostVariant: 'enc_3_2_cup_asked' },
  { title: '9. Ладонь Алексея, ты попросил показать → образец ошибки → миска в кухне', source: ['c2_silence_alexey_hand', 'look'], host: 'enc_3_7', hostVariant: 'enc_3_7_hand_shown' },
  { title: '10. Пустая лавка Тимона, ты спросил → доставка без недомолвок → общий счёт кухни', source: ['c2_silence_market_pause', 'ask'], host: 'enc_3_5', hostVariant: 'enc_3_5_asked_stall' }
];

function chain(t: Target): string[] {
  const key = `${t.source[0]}/${t.source[1]}`;
  for (let seed = 1; seed <= 1500; seed++) {
    const { state, draws, events } = playObserved(seed, { policy: 'mixed', content: on, choices: { [t.source[0]]: t.source[1], ...(t.force ?? {}) } });
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
  return [`### ${t.title}`, '', 'Цепочка не найдена за 1500 seeds.', ''];
}
if (process.argv[1]?.endsWith('chains-example.ts')) {
  const md = TARGETS.flatMap(chain).join('\n'); console.log(md);
  if (process.env.CHAINS_OUT) writeFileSync(process.env.CHAINS_OUT, md + '\n');
}
