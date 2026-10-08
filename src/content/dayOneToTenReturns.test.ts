import { describe, expect, it } from 'vitest';
import { content } from './index';
import { drawCard, resolveCardText, applyChoice, persistDraw, eligible } from '../engine';
import { makeState } from '../engine/testUtils';
import { buildImpactGraph, impactOf } from '../engine/impact';
import type { GameState } from '../engine';

const card = (id: string) => content.cards.find(c => c.id === id)!;
const chose = (cardId: string, choiceId: string, day = 7): GameState['history'][number] => ({ day, slot: 0, cardId, choiceId, text: 't', label: 'l', facets: [], decisionKinds: [] });

// Every significant decision of chapter 2 comes back in an everyday scene (host) with a line the hero can recognise.
const RETURNS: [host: string, variant: string, source: string, choice: string, mustSay: RegExp][] = [
  ['r_customer_wait', 'r_customer_wait_alexey_spoke', 'c2_gaze_alexey_silence', 'ask', /сам говорит, что боится/],
  ['r_customer_wait', 'r_customer_wait_alexey_silent', 'c2_gaze_alexey_silence', 'respect', /не спрашивает/],
  ['r_sweep', 'r_sweep_hand_shown', 'c2_silence_alexey_hand', 'look', /ладонь в повязке/],
  ['r_sweep', 'r_sweep_hand_hidden', 'c2_silence_alexey_hand', 'trust', /в рукаве/],
  ['r_evening_light', 'r_evening_light_marta_visited', 'c2_gaze_marta_window', 'visit', /снова светится/],
  ['r_evening_light', 'r_evening_light_marta_passed', 'c2_gaze_marta_window', 'home', /прошёл мимо/],
  ['r_marta_hello', 'r_marta_hello_cup_on_table', 'c2_silence_marta_cup', 'ask', /чашка теперь стоит/],
  ['r_marta_hello', 'r_marta_hello_cup_silent', 'c2_silence_marta_cup', 'leave', /«нормально»/],
  ['r_market_price', 'r_market_price_asked_about_stall', 'c2_silence_market_pause', 'ask', /про пустую лавку.*уже спросил/],
  ['r_market_price', 'r_market_price_dealt_only', 'c2_silence_market_pause', 'deal', /на пустую лавку.*не смотрит/],
  ['r_river', 'r_river_boy_fed', 'c2_gaze_wanderer_bread', 'offer', /жуёт хлеб/],
  ['r_river', 'r_river_boy_alone', 'c2_gaze_wanderer_bread', 'watch', /смотрит на воду/]
];

describe('chapter 2 decisions come back (no existing choice is edited)', () => {
  it.each(RETURNS)('%s shows %s after %s/%s, and the question of the scene is kept', (host, variant, source, choice, mustSay) => {
    const base = makeState({ day: 9, history: [] });
    expect(resolveCardText(base, card(host), content)).toBe(card(host).text);
    const state = makeState({ day: 9, history: [chose(source, choice)] });
    const text = resolveCardText(state, card(host), content);
    const v = card(host).textVariants!.find(x => x.id === variant)!;
    expect(text).toBe(v.text);
    expect(text).toMatch(mustSay);
    // the scene still ends with its own question: the variant only changes what the hero notices before it
    const lastSentence = (t: string) => t.trim().split(/(?<=[.?!])\s+/).at(-1)!;
    expect(lastSentence(text)).toBe(lastSentence(card(host).text));
  });
  it('the twelve decisions are marked meaningful and the validator finds a reader for each', () => {
    const graph = buildImpactGraph(content);
    for (const [, , source, choice] of RETURNS) {
      const ch = card(source).choices.find(c => c.id === choice)!;
      expect(ch.impact?.level).toBe('meaningful');
      expect(impactOf(graph, source, choice).count).toBeGreaterThanOrEqual(1);
    }
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
