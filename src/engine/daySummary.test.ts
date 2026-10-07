import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { play } from '../../scripts/play';
import { PERSONAL_TRAIT_PATTERN, echoErrors, summaryErrors } from '../../scripts/check-content';
import { buildDaySummary, echoOf, prepareEvening, leaveEvening } from '.';
import type { ActionLogic, DevelopmentProfileEveningSnapshot, GameContent, GameState, ProfileStatus } from './types';

/** A prepared evening of the given day from a real run. */
function eveningOf(seed: number, day: number): GameState {
  let found: GameState | undefined;
  play(seed, { beforeStep: s => { if (!found && s.phase === 'evening' && s.day === day) found = prepareEvening(s, content); return s; } });
  return found!;
}
const strip = (s: GameState): GameState => ({ ...s, nights: s.nights.map(({ summary: _s, ...n }) => n) });

type Snap = { status: ProfileStatus; candidatePrimary?: ActionLogic; observedPrimary?: ActionLogic };
/** The evening before (optional) and tonight's evening, with exactly the given statuses and candidates. */
function withSnapshots(state: GameState, previous: Snap | undefined, tonight: Snap, c: GameContent = content): ReturnType<typeof buildDaySummary> {
  const base = state.heroDevelopmentProfile.eveningSnapshots.find(x => x.day === state.day)!;
  const make = (day: number, x: Snap): DevelopmentProfileEveningSnapshot => {
    const { candidatePrimary: _c, observedPrimary: _o, ...rest } = base;
    return { ...rest, day, status: x.status, ...(x.candidatePrimary ? { candidatePrimary: x.candidatePrimary } : {}), ...(x.observedPrimary ? { observedPrimary: x.observedPrimary } : {}) };
  };
  const snaps = [...(previous ? [make(state.day - 1, previous)] : []), make(state.day, tonight)];
  return buildDaySummary({ ...state, heroDevelopmentProfile: { ...state.heroDevelopmentProfile, eveningSnapshots: snaps } }, c).reflection as never;
}

describe('Day Reflection: the six cases in priority order (REQs/DAY-REFLECTION-v1.md, 6.1)', () => {
  const state = eveningOf(11, 4);
  const at = (previous: Snap | undefined, tonight: Snap, c?: GameContent) => withSnapshots(state, previous, tonight, c) as unknown as ReturnType<typeof buildDaySummary>['reflection'];

  it('1. a stable profile that stops being stable is a downgrade, even when the candidate also changed', () => {
    expect(at({ status: 'stable', observedPrimary: 'expert' }, { status: 'provisional', candidatePrimary: 'achiever' }).case).toBe('downgrade');
    expect(at({ status: 'stable', observedPrimary: 'expert' }, { status: 'insufficient' }).case).toBe('downgrade');
  });
  it('2. a changed or vanished candidate while provisional is a refinement', () => {
    expect(at({ status: 'provisional', candidatePrimary: 'expert' }, { status: 'provisional', candidatePrimary: 'achiever' }).case).toBe('refining');
    expect(at({ status: 'provisional', candidatePrimary: 'expert' }, { status: 'provisional' }).case).toBe('refining');
  });
  it('2 holds only while provisional: a stable reading is never intercepted by a changed candidate', () => {
    const r = at({ status: 'provisional', candidatePrimary: 'expert' }, { status: 'stable', candidatePrimary: 'achiever', observedPrimary: 'achiever' });
    expect(r.case).toBe('stable');
    expect(r.templateId).toBe('reflection.stable.achiever');
  });
  it('a first candidate is not a refinement', () => {
    const r = at({ status: 'provisional' }, { status: 'provisional', candidatePrimary: 'expert' });
    expect(r.case).toBe('provisional');
    expect(r.templateId).toBe('reflection.provisional.expert');
  });
  it('3-5. provisional with a candidate, provisional without, insufficient', () => {
    expect(at({ status: 'provisional', candidatePrimary: 'expert' }, { status: 'provisional', candidatePrimary: 'expert' }).case).toBe('provisional');
    expect(at({ status: 'insufficient' }, { status: 'provisional' }).case).toBe('forming');
    expect(at(undefined, { status: 'insufficient' }).case).toBe('just_started');
  });
  it('6. stable reads the observed center', () => {
    const r = at({ status: 'stable', observedPrimary: 'expert' }, { status: 'stable', observedPrimary: 'expert' });
    expect(r).toMatchObject({ case: 'stable', templateId: 'reflection.stable.expert', observed: 'expert', previousStatus: 'stable' });
  });
  it('the first evening has nothing to compare with', () => {
    const r = at(undefined, { status: 'provisional', candidatePrimary: 'expert' });
    expect(r.case).toBe('provisional');
    expect(r.previousStatus).toBeUndefined();
  });
  it('the last day without a stable reading says the way of acting has not settled; a stable one still reads the center', () => {
    const last = { ...content, episode: { ...content.episode, days: state.day } } as GameContent;
    expect(at({ status: 'provisional', candidatePrimary: 'expert' }, { status: 'provisional', candidatePrimary: 'expert' }, last).case).toBe('unsettled');
    expect(at(undefined, { status: 'insufficient' }, last).case).toBe('unsettled');
    expect(at({ status: 'stable', observedPrimary: 'expert' }, { status: 'stable', observedPrimary: 'expert' }, last).case).toBe('stable');
  });
  it('a stage transition is a separate message and does not change the chosen case', () => {
    const arc = content.development.arcs[0]!;
    const withTransition = { ...state, development: { ...state.development, transitions: [...state.development.transitions, { arcId: arc.id, from: arc.from, to: arc.to, day: state.day, evidenceIds: [] }] } };
    const r = withSnapshots(withTransition, { status: 'provisional', candidatePrimary: 'expert' }, { status: 'provisional', candidatePrimary: 'expert' }) as unknown as ReturnType<typeof buildDaySummary>['reflection'];
    expect(r.case).toBe('provisional');
    expect(r.transition).toEqual({ arcId: arc.id, text: arc.promotionText });
  });
  it('before stable, no text states a lasting property; stable is the only place for a general reading', () => {
    const t = content.summaryTemplates.reflection;
    for (const l of Object.keys(t.provisional) as ActionLogic[]) {
      expect(t.provisional[l].every(x => !PERSONAL_TRAIT_PATTERN.test(x) && x.startsWith('В нескольких ситуациях ты '))).toBe(true);
      expect(t.provisional[l]).not.toEqual(t.stable[l]);
    }
    for (const group of ['just_started', 'forming', 'refining', 'downgrade', 'unsettled'] as const) expect(t[group].every(x => !PERSONAL_TRAIT_PATTERN.test(x))).toBe(true);
    for (const forbidden of ['Ты обычно сначала разбираешься.', 'Тебе свойственно разбираться.', 'Ты предпочитаешь сначала разобраться.', 'Для тебя главное — понять.', 'Ты склонен всё проверять.', 'Ты всегда так.'])
      expect(PERSONAL_TRAIT_PATTERN.test(forbidden), forbidden).toBe(true);
    expect(PERSONAL_TRAIT_PATTERN.test('В нескольких ситуациях ты сначала пытался разобраться, а потом действовал.')).toBe(false);
  });
});

describe('Day Reflection: a deterministic projection of the day', () => {
  it('every evening of a run carries a summary whose sources are provable and whose size is bounded', () => {
    for (const seed of [3, 11]) {
      const { state } = play(seed);
      expect(state.nights).toHaveLength(content.episode.days);
      for (const n of state.nights) {
        const s = n.summary!;
        expect(s.day).toBe(n.day);
        expect(s.worldChanges.length).toBeLessThanOrEqual(3);
        expect(s.unfinished.length).toBeLessThanOrEqual(2);
        expect(s.profileAlgorithmVersion).toBe(state.heroDevelopmentProfile.algorithmVersion);
        expect(s.reflection.text.length).toBeGreaterThan(0);
        for (const w of s.worldChanges) {
          expect(w.text).not.toBe('');
          if (w.source.kind === 'choice') {
            const src = w.source;
            expect(state.history.some(h => h.day === src.day && h.slot === src.slot && h.cardId === src.cardId && h.choiceId === src.choiceId)).toBe(true);
          }
        }
      }
    }
  });
  it('the first evening has too little data and says so, without any claim about the person', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const first = play(seed).state.nights[0]!.summary!;
      expect(first.reflection.status).toBe('insufficient');
      expect(first.reflection.case).toBe('just_started');
      expect(first.reflection.previousStatus).toBeUndefined();
    }
  });
  it('the same seed and choices give a byte-identical summary', () => {
    const a = play(7).state.nights.map(n => n.summary);
    const b = play(7).state.nights.map(n => n.summary);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('repeating the evening preparation does not rebuild or change the summary', () => {
    const prepared = eveningOf(5, 3);
    expect(prepareEvening(prepared, content)).toBe(prepared);
  });
  it('nothing in the engine reads the summary: the whole run is the same without it', () => {
    const plain = play(9);
    const blind = play(9, { beforeStep: s => strip(s) });
    expect(strip(blind.state)).toEqual(strip(plain.state));
  });
  it('leaving the evening does not depend on the stored summary', () => {
    const s = eveningOf(9, 3);
    expect(strip(leaveEvening(s, content))).toEqual(strip(leaveEvening(strip(s), content)));
  });
  it('an unfinished promise is firm only for a scheduled required card, and may say tomorrow only when it is tomorrow', () => {
    let firm = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const run = play(seed);
      for (const n of run.state.nights) for (const u of n.summary!.unfinished) {
        if (u.promise === 'firm') {
          firm++;
          expect(u.source.kind).toBe('scheduled');
          if (u.source.kind !== 'scheduled') continue;
          const card = content.cards.find(c => c.id === (u.source as { cardId: string }).cardId)!;
          expect(card.required).toBe(true);
          expect(u.source.latestDay).toBeDefined();
          if (/завтра/i.test(u.text)) expect(u.source.day).toBe(n.day + 1);
        } else expect(/завтра|послезавтра/i.test(u.text)).toBe(false);
      }
    }
    expect(firm).toBeGreaterThan(0);
  });
  it('the Alexey jug on day 1 promises a firm tomorrow, because its follow-up is required with a latest day', () => {
    const u = play(2).state.nights[0]!.summary!.unfinished.find(x => x.threadId === 'alexey_cup')!;
    expect(u.promise).toBe('firm');
    expect(u.text).toMatch(/Завтра/);
    expect(u.source).toMatchObject({ kind: 'scheduled', cardId: 'c1_alexey_after_jug', day: 2, latestDay: 2 });
  });
  it('a firm promise is kept: the promised chain card is shown by its latest day in every run', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { state } = play(seed);
      for (const n of state.nights) for (const u of n.summary!.unfinished) if (u.source.kind === 'scheduled') {
        const src = u.source;
        expect(state.history.some(h => h.cardId === src.cardId && h.day >= n.day && h.day <= (src.latestDay ?? 99)), `${seed}/${src.cardId}`).toBe(true);
      }
    }
  });
});

describe('Day Reflection: the content contract', () => {
  const mutate = (change: (c: GameContent) => void) => { const c = structuredClone(content); change(c); return summaryErrors(c); };
  it('the shipped threads and templates satisfy it', () => expect(summaryErrors(content)).toEqual([]));
  it('rejects a thread whose stages miss a value of its fact', () => {
    expect(mutate(c => { const t = c.threads.find(x => x.kind === 'fact')!; if (t.kind === 'fact') delete t.stages['unknown']; }).join()).toMatch(/cover exactly/);
  });
  it('rejects a fact thread on a fact that an opportunity already reports', () => {
    expect(mutate(c => { c.threads.push({ id: 'dup', kind: 'fact', fact: 'egor.meeting', stages: { waiting: 'dormant', talked: 'open', missed: 'abandoned' }, texts: { open: ['x'] } }); }).join()).toMatch(/belongs to an opportunity/);
  });
  it('rejects a firm promise on a card the engine does not guarantee', () => {
    expect(mutate(c => { const t = c.threads.find(x => x.id === 'liya_letters')!; if (t.kind === 'chain') t.followUp.firmTexts = ['Письмо придёт.']; }).join()).toMatch(/cannot carry a firm promise/);
  });
  it('rejects a firm text that names a day, and a tomorrow text that does not say tomorrow', () => {
    expect(mutate(c => { const t = c.threads.find(x => x.id === 'alexey_cup')!; if (t.kind === 'chain') t.followUp.firmTexts = ['Завтра придёт.']; }).join()).toMatch(/must not name a day/);
    expect(mutate(c => { const t = c.threads.find(x => x.id === 'alexey_cup')!; if (t.kind === 'chain') t.followUp.tomorrowTexts = ['Скоро придёт.']; }).join()).toMatch(/say 'завтра'/);
  });
  it('rejects a template that claims a fact its choice does not set, and one for an unknown choice', () => {
    expect(mutate(c => { c.summaryTemplates.changes[0]!.source = { cardId: 'c1_extra_change', choiceId: 'keep', fact: { key: 'timon.trust', value: 'open' } }; }).join()).toMatch(/does not set/);
    expect(mutate(c => { c.summaryTemplates.changes[0]!.source = { cardId: 'nope', choiceId: 'x' }; }).join()).toMatch(/unknown choice/);
  });
  it('rejects a lasting-property wording before stable, and identical provisional and stable texts', () => {
    expect(mutate(c => { c.summaryTemplates.reflection.provisional.expert = ['В нескольких ситуациях ты предпочитаешь разбираться. Посмотрим.']; }).join()).toMatch(/lasting property/);
    expect(mutate(c => { c.summaryTemplates.reflection.provisional.expert = c.summaryTemplates.reflection.stable.expert; }).join()).toMatch(/must differ/);
  });
});

describe('Day Reflection: the behavioural echo of the day\'s own decisions', () => {
  const base = eveningOf(11, 4);
  const T = content.summaryTemplates;
  /** Today's four decisions replaced by the given card/choice pairs; the profile snapshots stay as they are. */
  const withToday = (picks: [string, string][]): GameState => {
    const today = base.history.filter(h => h.day === base.day);
    const rest = base.history.filter(h => h.day !== base.day);
    return { ...base, history: [...rest, ...today.map((h, i) => ({ ...h, cardId: picks[i]![0], choiceId: picks[i]![1] }))] };
  };
  const forceCase = (state: GameState, status: ProfileStatus, candidate?: ActionLogic): GameState => {
    const snaps = state.heroDevelopmentProfile.eveningSnapshots.map(x => x.day === state.day
      ? { ...x, status, candidatePrimary: candidate, observedPrimary: status === 'stable' ? candidate : undefined } : x);
    return { ...state, heroDevelopmentProfile: { ...state.heroDevelopmentProfile, eveningSnapshots: snaps.map(({ candidatePrimary, observedPrimary, ...r }) => ({ ...r, ...(candidatePrimary ? { candidatePrimary } : {}), ...(observedPrimary ? { observedPrimary } : {}) })) } };
  };
  const obs = (id: string) => T.observations.find(o => o.id === id)!;
  // Two labelled choices with the same observation, and two with different ones, taken from the shipped registry.
  const same = Object.entries(T.observed).filter(([, v]) => v === 'check_how_it_works').map(([k]) => k.split('/') as [string, string]);
  const other = Object.entries(T.observed).filter(([, v]) => v === 'protect_own_side').map(([k]) => k.split('/') as [string, string]);
  const none: [string, string] = ['c1_alexey_bad_work', 'independent'];   // deliberately unlabelled

  it('two decisions with the same authored label are said to repeat, with proof of both', () => {
    const state = withToday([same[0]!, same[1]!, none, none]);
    const echo = echoOf(state, content, state.history.filter(h => h.day === state.day).map(h => ({ ...h })))!;
    expect(echo.kind).toBe('repeat');
    expect(echo.observationId).toBe('check_how_it_works');
    expect(echo.text).toContain(obs('check_how_it_works').text);
    expect(echo.sources).toHaveLength(2);
    expect(echo.sources.map(x => `${x.cardId}/${x.choiceId}`).sort()).toEqual([same[0]!.join('/'), same[1]!.join('/')].sort());
  });
  it('decisions that all differ are said to be different, and a single labelled decision stays silent', () => {
    const varied = echoOf(withToday([same[0]!, other[0]!, none, none]), content, withToday([same[0]!, other[0]!, none, none]).history.filter(h => h.day === 4))!;
    expect(varied.kind).toBe('varied');
    expect(varied.observationId).toBeUndefined();
    expect(varied.sources).toHaveLength(2);
    const one = withToday([same[0]!, none, none, none]);
    expect(echoOf(one, content, one.history.filter(h => h.day === one.day))).toBeUndefined();
  });
  it('the most repeated action wins', () => {
    const state = withToday([other[0]!, same[0]!, same[1]!, same[2]!]);
    expect(echoOf(state, content, state.history.filter(h => h.day === state.day))!.observationId).toBe('check_how_it_works');
  });
  it('appears wherever the profile has nothing content-ful to say, and nowhere else', () => {
    const picks: [string, string][] = [same[0]!, same[1]!, none, none];
    const echoFor = (status: ProfileStatus, candidate?: ActionLogic, previous?: ProfileStatus) => {
      let st = forceCase(withToday(picks), status, candidate);
      if (previous) st = { ...st, heroDevelopmentProfile: { ...st.heroDevelopmentProfile, eveningSnapshots: [...st.heroDevelopmentProfile.eveningSnapshots.filter(x => x.day !== st.day - 1).map(x => x), { ...st.heroDevelopmentProfile.eveningSnapshots.find(x => x.day === st.day)!, day: st.day - 1, status: previous }].sort((a, b) => a.day - b.day) } };
      const r = buildDaySummary(st, content).reflection;
      return { case: r.case, echo: r.echo?.kind };
    };
    expect(echoFor('insufficient')).toEqual({ case: 'just_started', echo: 'repeat' });
    expect(echoFor('provisional')).toEqual({ case: 'forming', echo: 'repeat' });
    expect(echoFor('provisional', 'expert')).toEqual({ case: 'provisional', echo: undefined });
    expect(echoFor('stable', 'expert')).toEqual({ case: 'stable', echo: undefined });
    expect(echoFor('provisional', undefined, 'stable').echo).toBe('repeat');   // downgrade still gets the literal echo
  });
  it('is the same for the same day, and never depends on the profile', () => {
    const picks: [string, string][] = [same[0]!, same[1]!, other[0]!, none];
    const a = buildDaySummary(forceCase(withToday(picks), 'insufficient'), content).reflection.echo;
    const b = buildDaySummary(forceCase(withToday(picks), 'provisional'), content).reflection.echo;
    expect(a).toEqual(b);
  });
  it('every authored action reads as what was done today, never as a property of the person', () => {
    expect(echoErrors(content)).toEqual([]);
    for (const o of T.observations) for (const sentence of T.echo.repeat) {
      const text = sentence.replace('{action}', o.text);
      expect(PERSONAL_TRAIT_PATTERN.test(text), text).toBe(false);
      expect(text.startsWith('Сегодня в нескольких ситуациях ты ')).toBe(true);
    }
  });
  it('is named after what was done, not after a stage, and is never derived from the profile vectors', () => {
    for (const o of T.observations) for (const logic of Object.keys(T.reflection.provisional)) expect(o.id.includes(logic)).toBe(false);
    const labelled = Object.keys(T.observed).length;
    expect(labelled).toBeGreaterThan(200);
  });
  it('rejects a mapping to an unknown choice or observation, an observation used once, and an observation addressed to the person', () => {
    const mutate = (change: (c: GameContent) => void) => { const c = structuredClone(content); change(c); return echoErrors(c).join(); };
    expect(mutate(c => { c.summaryTemplates.observed['nope/x'] = 'check_how_it_works'; })).toMatch(/unknown choice/);
    expect(mutate(c => { c.summaryTemplates.observed['neutral.work.01/A'] = 'missing'; })).toMatch(/unknown observation/);
    expect(mutate(c => { c.summaryTemplates.observations.push({ id: 'lonely', text: 'сделал что-то' }); })).toMatch(/fewer than two/);
    expect(mutate(c => { c.summaryTemplates.observations[0]!.text = 'ты предпочитаешь разбираться'; })).toMatch(/property of the person/);
    expect(mutate(c => { c.summaryTemplates.observations[0]!.id = 'expert_style'; for (const k of Object.keys(c.summaryTemplates.observed)) if (c.summaryTemplates.observed[k] === 'check_how_it_works') c.summaryTemplates.observed[k] = 'expert_style'; })).toMatch(/named after a stage/);
    expect(mutate(c => { c.summaryTemplates.echo.repeat = ['Сегодня ты всегда {action}. Посмотрим.']; })).toMatch(/lasting property/);
  });
});
