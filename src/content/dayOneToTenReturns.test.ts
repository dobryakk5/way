import { describe, expect, it } from 'vitest';
import { content } from './index';
import { recollectionWindowErrors } from '../../scripts/check-content';
import { drawCard, resolveCardText, applyChoice, persistDraw, eligible } from '../engine';
import { makeState } from '../engine/testUtils';
import { buildImpactGraph, impactOf } from '../engine/impact';
import type { GameState } from '../engine';

const card = (id: string) => content.cards.find(c => c.id === id)!;
const chose = (cardId: string, choiceId: string, day = 7): GameState['history'][number] => ({ day, slot: 0, cardId, choiceId, text: 't', label: 'l', facets: [], decisionKinds: [] });

// Every significant decision of chapter 2 comes back in an everyday scene (host) with a line the hero can recognise.
const RETURNS: [host: string, variant: string, source: string, choice: string, mustSay: RegExp, fresh?: number][] = [
  ['r_customer_wait', 'r_customer_wait_alexey_spoke', 'c2_gaze_alexey_silence', 'ask', /сам говорит, что боится/],
  ['r_customer_wait', 'r_customer_wait_alexey_silent', 'c2_gaze_alexey_silence', 'respect', /не спрашивает/],
  ['r_sweep', 'r_sweep_hand_shown', 'c2_silence_alexey_hand', 'look', /след ожога/],
  ['r_sweep', 'r_sweep_hand_hidden', 'c2_silence_alexey_hand', 'trust', /в рукаве/],
  ['r_evening_light', 'r_evening_light_marta_visited', 'c2_gaze_marta_window', 'visit', /снова светится/],
  ['r_evening_light', 'r_evening_light_marta_passed', 'c2_gaze_marta_window', 'home', /прошёл мимо/],
  ['r_marta_hello', 'r_marta_hello_cup_on_table', 'c2_silence_marta_cup', 'ask', /чашка теперь стоит/],
  ['r_marta_hello', 'r_marta_hello_cup_silent', 'c2_silence_marta_cup', 'leave', /«нормально»/],
  ['r_market_price', 'r_market_price_asked_about_stall', 'c2_silence_market_pause', 'ask', /про пустую лавку.*уже спросил/],
  ['r_market_price', 'r_market_price_dealt_only', 'c2_silence_market_pause', 'deal', /на пустую лавку.*не смотрит/],
  ['r_river', 'r_river_boy_fed', 'c2_gaze_wanderer_bread', 'offer', /кому ты предложил хлеб/],
  ['r_river', 'r_river_boy_alone', 'c2_gaze_wanderer_bread', 'watch', /смотрит на воду/],
  // a second host for the same decisions
  ['r_breakfast', 'r_breakfast_alexey_spoke', 'c2_gaze_alexey_silence', 'ask', /садится рядом сам/],
  ['r_breakfast', 'r_breakfast_alexey_silent', 'c2_gaze_alexey_silence', 'respect', /молча ставит еду/],
  ['r_breakfast', 'r_breakfast_hand_shown', 'c2_silence_alexey_hand', 'look', /след ожога/],
  ['r_breakfast', 'r_breakfast_hand_hidden', 'c2_silence_alexey_hand', 'trust', /в рукаве/],
  ['r_kiln', 'r_kiln_alexey_spoke', 'c2_gaze_alexey_silence', 'ask', /больше не молчит/],
  ['r_kiln', 'r_kiln_alexey_silent', 'c2_gaze_alexey_silence', 'respect', /молча/],
  ['r_kiln', 'r_kiln_hand_shown', 'c2_silence_alexey_hand', 'look', /после ожога/],
  ['r_kiln', 'r_kiln_hand_hidden', 'c2_silence_alexey_hand', 'trust', /ниже пояса|выше пояса/],
  ['r_coins', 'r_coins_asked_about_stall', 'c2_silence_market_pause', 'ask', /сказал тебе прямо/],
  ['r_coins', 'r_coins_dealt_only', 'c2_silence_market_pause', 'deal', /пустую лавку/],
  ['r_evening_light', 'r_evening_light_cup_on_table', 'c2_silence_marta_cup', 'ask', /раньше не ставила/],
  ['r_evening_light', 'r_evening_light_cup_silent', 'c2_silence_marta_cup', 'leave', /держит при себе/],
  ['r_marta_hello', 'r_marta_hello_window_visited', 'c2_gaze_marta_window', 'visit', /свечу в окне/],
  ['r_marta_hello', 'r_marta_hello_window_passed', 'c2_gaze_marta_window', 'home', /тёмное окно/],
  // the evening Marta was promised: she remembers how it went
  ['r_marta_hello', 'r_marta_hello_after_evening_first', 'r_marta_evening', 'first', /после вечера у печи ей проще/],
  ['r_marta_hello', 'r_marta_hello_after_evening_wait', 'r_marta_evening', 'wait', /умеешь ждать/],
  ['r_evening_light', 'r_evening_light_after_evening_first', 'r_marta_evening', 'first', /зовёт уже не стесняясь/],
  ['r_evening_light', 'r_evening_light_after_evening_wait', 'r_marta_evening', 'wait', /дал ей время/],
  // the guaranteed decisions of the first days (they are made in every run), recalled for about a week
  ['r_coins', 'r_coins_change_returned', 'c1_extra_change', 'return', /лишние монеты ты вернул/, 12],
  ['r_coins', 'r_coins_change_kept', 'c1_extra_change', 'keep', /лишние монеты остались у тебя/, 12],
  ['r_market_price', 'r_market_price_change_returned', 'c1_extra_change', 'return', /ты вернул ему лишние монеты/, 12],
  ['r_market_price', 'r_market_price_change_kept', 'c1_extra_change', 'keep', /лишние монеты он не забыл/, 12],
  ['r_river', 'r_river_traveller_helped', 'c1_wounded_road', 'stop', /которому ты помог/, 12],
  ['r_river', 'r_river_traveller_passed', 'c1_wounded_road', 'pass', /подобрали не сразу/, 12],
  ['r_letter_stack', 'r_letter_stack_replied', 'c1_liya_letter', 'reply', /на первое ты ответил/],
  ['r_letter_stack', 'r_letter_stack_waiting', 'c1_liya_letter', 'later', /ждёт ответа/],
  ['r_kiln', 'r_kiln_calculated_together', 'c1_alexey_after_jug', 'teach', /составили вместе/, 12],
  ['r_kiln', 'r_kiln_calculated_alone', 'c1_alexey_after_jug', 'work', /не вмешивался/, 12],
  ['r_marta_hello', 'r_marta_hello_firewood_helped', 'c1_marta_firewood', 'help', /вместе убрали/, 12],
  ['r_marta_hello', 'r_marta_hello_firewood_arranged', 'c1_marta_firewood', 'arrange', /убрал другой сосед/, 12],
  ['r_evening_light', 'r_evening_light_firewood_helped', 'c1_marta_firewood', 'help', /ты помог убрать/, 12]
];

describe('chapter 2 decisions come back (no existing choice is edited)', () => {
  it.each(RETURNS)('%s shows %s after %s/%s, and the question of the scene is kept', (host, variant, source, choice, mustSay) => {
    const base = makeState({ day: 9, history: [] });
    expect(resolveCardText(base, card(host), content)).toBe(card(host).text);
    const state = makeState({ day: 9, history: [chose(source, choice, source.startsWith('c1_') ? 2 : source === 'r_marta_evening' ? 5 : 7)] });
    const text = resolveCardText(state, card(host), content);
    const v = card(host).textVariants!.find(x => x.id === variant)!;
    expect(text).toBe(v.text);
    expect(text).toMatch(mustSay);
    // the scene still ends with its own question: the variant only changes what the hero notices before it
    const lastSentence = (t: string) => t.trim().split(/(?<=[.?!])\s+/).at(-1)!;
    expect(lastSentence(text)).toBe(lastSentence(card(host).text));
  });
  it('a recollection holds up to an ABSOLUTE day (dayLte: chapter 1 decisions through day 12, chapter 2 ones through day 20; the evening with Marta has no cut-off) and never mentions the fair', () => {
    for (const [host, variant, source, choice, , fresh] of RETURNS) {
      const v = card(host).textVariants!.find(x => x.id === variant)!;
      expect(v.text).not.toMatch(/ярмарк/i);
      const history = [chose(source, choice, source.startsWith('c1_') ? 2 : source === 'r_marta_evening' ? 5 : 7)];
      const at = (day: number) => resolveCardText(makeState({ day, history }), card(host), content);
      if (source === 'r_marta_evening') { expect([host, variant, at(30)]).toEqual([host, variant, v.text]); continue; }
      const until = fresh ?? 20;
      expect([host, variant, at(until)]).toEqual([host, variant, v.text]);
      expect([host, variant, at(until + 1)]).toEqual([host, variant, card(host).text]);
    }
  });
  it('every chapter 2 decision has a return in at least two everyday scenes, except the wanderer one that has a single place (the river)', () => {
    for (const source of ['c2_gaze_alexey_silence', 'c2_silence_alexey_hand', 'c2_gaze_marta_window', 'c2_silence_marta_cup', 'c2_silence_market_pause', 'c2_gaze_wanderer_bread']) {
      const hosts = new Set(RETURNS.filter(r => r[2] === source).map(r => r[0]));
      expect(hosts.size).toBeGreaterThanOrEqual(source === 'c2_gaze_wanderer_bread' ? 1 : 2);
    }
  });
  it('every decision that gets a return is marked meaningful (or major) and the validator finds a reader for each', () => {
    const graph = buildImpactGraph(content);
    for (const [, , source, choice] of RETURNS) {
      const ch = card(source).choices.find(c => c.id === choice)!;
      expect(['meaningful', 'major']).toContain(ch.impact?.level);
      expect(impactOf(graph, source, choice).count).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(RETURNS.map(r => r[2])).size).toBeGreaterThanOrEqual(11);
  });
  it('the immediate reaction names a person or a physical trace, not a flat report', () => {
    for (const [, , source, choice] of RETURNS) {
      const t = content.traces.find(x => x.source.cardId === source && x.source.choiceId === choice)!;
      expect(t.response.length).toBeLessThanOrEqual(100);
      expect(t.response).not.toMatch(/^(Он|Работу|Разговор)\b/);
    }
  });
});

describe('r_marta_hello keeps the evening it offers', () => {
  const stateWithCard = () => persistDraw(makeState({ day: 4, slot: 0, phase: 'slot' }), { card: card('r_marta_hello'), choices: card('r_marta_hello').choices, text: card('r_marta_hello').text, source: 'pool' }, content);
  it('"Договориться на вечер" schedules r_marta_evening for the next day, which is then shown', () => {
    const next = applyChoice(stateWithCard(), content, 'r_marta_hello', 'b');
    expect(next.scheduled).toContainEqual({ cardId: 'r_marta_evening', day: 5 });
    const { current: _shown, ...rest } = next; void _shown;
    const tomorrow = { ...rest, day: 5, slot: 0, phase: 'slot' as const } as GameState;
    const draw = drawCard(tomorrow, content)!;
    expect(draw.card.id).toBe('r_marta_evening'); expect(draw.source).toBe('scheduled');
  });
  it('"Поговорить сейчас" promises nothing and schedules nothing', () => {
    expect(applyChoice(stateWithCard(), content, 'r_marta_hello', 'a').scheduled.some(s => s.cardId === 'r_marta_evening')).toBe(false);
  });
  it('is an ambient world-fallback scene without an artificial line, and is not offered on the last day (the evening would fall outside the episode)', () => {
    expect(card('r_marta_hello').story).toEqual({ role: 'ambient', worldFallback: true });
    expect(eligible(makeState({ day: 30, chapter: 4 }), card('r_marta_hello'), content)).toBe(false);
    expect(eligible(makeState({ day: 29, chapter: 4 }), card('r_marta_hello'), content)).toBe(true);
  });
  it('the promise is an open thread until Marta comes', () => {
    expect(content.threads.find(t => t.id === 'marta_evening')).toMatchObject({ kind: 'chain', followUp: { cardId: 'r_marta_evening' } });
  });
});

describe('a repeated promise to Marta is kept as well (day 4 → evening on day 5 → promise again on day 14 → evening on day 15)', () => {
  const present = (s: GameState, cardId: string) => persistDraw(s, { card: card(cardId), choices: card(cardId).choices, text: resolveCardText(s, card(cardId), content), source: 'pool' }, content);
  const free = (s: GameState): GameState => { const { current: _shown, ...rest } = s; void _shown; return rest as GameState; };
  it('the evening card shows up again and no promise is left dangling', () => {
    let s = makeState({ day: 4, slot: 0, phase: 'slot' });
    s = applyChoice(present(s, 'r_marta_hello'), content, 'r_marta_hello', 'b');                      // day 4: «Договориться на вечер»
    s = { ...free(s), day: 5, slot: 2, phase: 'slot' };
    const first = drawCard(s, content)!; expect([first.card.id, first.source]).toEqual(['r_marta_evening', 'scheduled']);
    s = applyChoice(persistDraw(s, first, content), content, 'r_marta_evening', 'wait');                // day 5: the evening
    expect(s.scheduled.some(x => x.cardId === 'r_marta_evening')).toBe(false);
    s = { ...free(s), day: 14, slot: 0, phase: 'slot' };
    s = applyChoice(present(s, 'r_marta_hello'), content, 'r_marta_hello', 'b');                      // day 14: promised again
    s = { ...free(s), day: 15, slot: 1, phase: 'slot' };
    const second = drawCard(s, content)!;
    expect([second.card.id, second.source]).toEqual(['r_marta_evening', 'scheduled']);                 // the second promise is kept
    expect(second.text).toMatch(/снова пришла/);
    s = applyChoice(persistDraw(s, second, content), content, 'r_marta_evening', 'first');
    expect(s.scheduled.some(x => x.cardId === 'r_marta_evening')).toBe(false);                         // nothing dangling
    expect(s.shown.r_marta_evening).toEqual([5, 15]);
  });
  it('the first evening keeps its own text, the repeat says that she came again', () => {
    expect(resolveCardText(makeState({ day: 5 }), card('r_marta_evening'), content)).toBe(card('r_marta_evening').text);
    expect(resolveCardText(makeState({ day: 15, shown: { r_marta_evening: [5] } }), card('r_marta_evening'), content)).toMatch(/снова пришла/);
  });
});

describe('everyday scenes fixed by review', () => {
  it('r_letter_stack does not lie on the table before the first letter', () => {
    expect(eligible(makeState({ day: 1 }), card('r_letter_stack'), content)).toBe(false);
    expect(eligible(makeState({ day: 2, shown: { c1_liya_letter: [1] } }), card('r_letter_stack'), content)).toBe(true);
  });
  it('r_river shows no wrong portrait: the text is about a boatman, so the card names no character', () => {
    expect(card('r_river').character).toBeUndefined();
    expect(card('r_river').text).toMatch(/лодочник/);
  });
});

describe('the six chapter 2 scenes keep their setup in every version of the text', () => {
  const SIX: [string, RegExp][] = [
    ['c2_gaze_alexey_silence', /без обычных вопросов/], ['c2_silence_alexey_hand', /прячет ладонь/], ['c2_gaze_marta_window', /свободному стулу|Окно Марты/],
    ['c2_silence_marta_cup', /у неё всё в порядке/], ['c2_silence_market_pause', /предлагает сделку/], ['c2_gaze_wanderer_bread', /делит хлеб с мальчиком/]];
  it.each(SIX)('%s: base text and the familiar-scene detail both state the situation the choices answer', (id, setup) => {
    const c = card(id);
    const detail = c.textVariants!.find(v => v.id === `${id}_detail`)!;
    expect(detail.text).toMatch(setup);
    expect(detail.text.length).toBeLessThanOrEqual(200);
  });
  it('the immediate reactions do not depend on which version of the scene was shown (no candle that ran out in a lit window)', () => {
    const t = (id: string, ch: string) => content.traces.find(x => x.source.cardId === id && x.source.choiceId === ch)!.response;
    expect(t('c2_gaze_marta_window', 'visit')).not.toMatch(/свеч/i);
    expect(t('c2_gaze_marta_window', 'home')).not.toMatch(/свеч|тёмн/i);
  });
});

describe('the recollection window validator', () => {
  it('flags a window that the latest possible decision day leaves (almost) empty, and accepts a roomy one', () => {
    const variant = (dayLte: number) => ({ id: 'v', kind: 'consequence' as const, text: 't', when: { all: [{ chose: { card: 'c2_gaze_alexey_silence', choice: 'ask' } }, { dayLte }] } });
    const withVariant = (dayLte: number) => ({ ...content, cards: content.cards.map(c => c.id === 'r_kiln' ? { ...c, textVariants: [...(c.textVariants ?? []).filter(v => v.id !== 'v'), variant(dayLte)] } : c) });
    expect(recollectionWindowErrors(withVariant(11)).join('\n')).toMatch(/r_kiln\/v stops at day 11/);
    expect(recollectionWindowErrors(withVariant(13))).toEqual([]);
    expect(recollectionWindowErrors(content)).toEqual([]);
  });
});
