import { LOGICS, type ParsedPackage, type SourceChoice } from './parse-package';
import { developmentRequires, DEFAULT_SPACING, RETRY_COOLDOWN, BEAT_ORDER, neutralRequires } from './runtime';
import type { Card, Choice, Condition, DevelopmentBeat, GameContent } from '../../src/engine/types';

// Structural parity between the committed package extraction (content-src/v2.5/*.json) and the runtime cards.
// Counts alone cannot see a vector that moved to another choiceId; this can. Text is never compared: it is the skin.
// A namespace is checked once any card of it exists in the runtime, so content can be merged in batches (neutral → probes → arcs).
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: Record<string, number>, b: Record<string, number>) => LOGICS.every(l => Math.abs((a[l] ?? NaN) - (b[l] ?? NaN)) < 1e-9);
const tracesOf = (c: GameContent, cardId: string) => c.traces.filter(t => t.source.cardId === cardId);

function checkChoices(c: GameContent, card: Card, expected: { id: string }[], where: string, fail: (s: string) => void) {
  if (!same(card.choices.map(x => x.id), expected.map(x => x.id))) fail(`${where}: choice ids/order ${card.choices.map(x => x.id)} != source ${expected.map(x => x.id)}`);
  for (const ch of card.choices) {
    const t = tracesOf(c, card.id).filter(x => x.source.choiceId === ch.id);
    if (t.length !== 1 || !t[0]!.response) fail(`${where}/${ch.id}: needs exactly one trace with a response`);
  }
}
function checkSignal(actual: { vector: Record<string, number>; rationale: unknown } | undefined, src: SourceChoice, where: string, fail: (s: string) => void) {
  if (!actual) { fail(`${where}: signal missing`); return; }
  if (!near(actual.vector, src.vector)) fail(`${where}: LogicVector differs from source`);
  if (!same(actual.rationale, src.rationale)) fail(`${where}: rationale differs from source`);
}
/** Conditions as a list of structural atoms, without the day window and the free spacing numbers of primary cards. */
const atoms = (cond: Condition | undefined): Condition[] => !cond ? [] : 'all' in cond ? cond.all.flatMap(atoms) : [cond];
const isDay = (x: Condition) => 'dayGte' in x || 'dayLte' in x;
const withoutNumbers = (x: Condition): Condition => 'developmentSince' in x ? { developmentSince: { ...x.developmentSince, decisions: 0, evenings: 0 } } : x;

export function checkParity(src: ParsedPackage, c: GameContent): string[] {
  const errors: string[] = []; const fail = (s: string) => errors.push(`parity: ${s}`);
  const byPrefix = (p: string) => c.cards.filter(x => x.id.startsWith(p));

  // ---- neutral (main pool, motive prompts, behavior continuations) -------------------------------------------------
  const neutralCards = byPrefix('neutral.');
  if (neutralCards.length) {
    const expectedIds = [...src.neutral.map(s => s.id), ...src.behaviors.map(b => b.id)];
    for (const id of expectedIds) if (!neutralCards.some(x => x.id === id)) fail(`${id}: missing in runtime`);
    for (const x of neutralCards) if (!expectedIds.includes(x.id)) fail(`${x.id}: unknown structural id in runtime`);
    for (const s of src.neutral) {
      const card = neutralCards.find(x => x.id === s.id); if (!card) continue;
      const d = card.diagnostic;
      const follow0 = src.behaviors.find(b => b.continuesSituationId === s.situationId);
      // A day window is calendar, not profile: an owner must be shown early enough for its continuation. Nothing else may gate a neutral scene.
      if (card.type !== 'situation' || card.development || card.at || card.tags?.length || !same(card.requires ?? null, neutralRequires(!!follow0, c.episode.days))) fail(`${s.id}: a neutral scene must be a free situation, gated by nothing but the calendar (from day 2; early enough for its continuation)`);
      if (!d || d.situationId !== s.situationId || d.contextId !== s.contextId || !same(d.facets, s.facets) || d.developmentWeight !== s.developmentWeight || (d.pressure ?? false) !== s.pressure || d.distinguishes)
        fail(`${s.id}: diagnostic block differs from source`);
      if (card.textVariants?.length || card.choiceVariants?.length) fail(`${s.id}: a neutral scene has one text and one choice set, independent of the hero's stage`);
      checkChoices(c, card, s.choices, s.id, fail);
      const motive = src.motives.find(m => m.situationId === s.id);
      const follow = src.behaviors.find(b => b.continuesSituationId === s.situationId);
      s.choices.forEach((sc, i) => {
        const ch: Choice | undefined = card.choices[i]; if (!ch) return;
        checkSignal(ch.diagnosticAction, sc, `${s.id}/${sc.id}`, fail);
        if (ch.diagnosticAction && (ch.diagnosticAction.scoringVersion !== '1' || ch.diagnosticAction.rubricVersion !== '1')) fail(`${s.id}/${sc.id}: signal versions`);
        if (!motive !== !ch.diagnosticMotive) fail(`${s.id}/${sc.id}: motive prompt presence differs from source`);
        if (motive && ch.diagnosticMotive) {
          if (!same(ch.diagnosticMotive.options.map(o => o.id), motive.options.map(o => o.id))) fail(`${s.id}/${sc.id}: motive option ids/order`);
          motive.options.forEach((mo, j) => checkSignal(ch.diagnosticMotive!.options[j]?.signal, mo, `${s.id}/${sc.id}/${mo.id}`, fail));
        }
        const scheduled = ch.effects.schedule?.some(x => x.cardId === follow?.id);
        if (!!follow !== !!scheduled) fail(`${s.id}/${sc.id}: behavior continuation must be scheduled by every choice of its owner (and only there)`);
      });
    }
    for (const b of src.behaviors) {
      const card = neutralCards.find(x => x.id === b.id); if (!card) continue;
      if (card.type !== 'chain' || card.diagnostic || card.required) fail(`${b.id}: a continuation is an optional chain scene without its own diagnostic block`);
      checkChoices(c, card, b.choices, b.id, fail);
      b.choices.forEach((sc, i) => {
        const ch = card.choices[i]; if (!ch) return;
        if (ch.diagnosticBehavior?.continuesSituationId !== b.continuesSituationId) fail(`${b.id}/${sc.id}: continues another situation`);
        checkSignal(ch.diagnosticBehavior?.signal, sc, `${b.id}/${sc.id}`, fail);
      });
    }
  }

  // ---- probes -------------------------------------------------------------------------------------------------------
  const probeCards = byPrefix('probe.');
  if (probeCards.length) {
    for (const p of src.probes) if (!probeCards.some(x => x.id === p.id)) fail(`${p.id}: missing in runtime`);
    for (const x of probeCards) if (!src.probes.some(p => p.id === x.id)) fail(`${x.id}: unknown structural id in runtime`);
    for (const p of src.probes) {
      const card = probeCards.find(x => x.id === p.id); if (!card) continue;
      const d = card.diagnostic;
      if (!card.tags?.includes('probe-only') || card.requires || card.development || card.at || card.textVariants?.length || card.choiceVariants?.length) fail(`${p.id}: a probe is free, ungated and stage-invariant`);
      if (!d || d.situationId !== p.id || d.contextId !== p.contextId || !same(d.facets, p.facets) || d.developmentWeight !== p.developmentWeight || !same(d.distinguishes, p.distinguishes)) fail(`${p.id}: diagnostic block differs from source`);
      checkChoices(c, card, p.choices.map(x => ({ id: x.slug! })), p.id, fail);
      p.choices.forEach((sc, i) => checkSignal(card.choices[i]?.diagnosticAction, sc, `${p.id}/${sc.slug}`, fail));
    }
  }

  // ---- development arcs -------------------------------------------------------------------------------------------
  const devCards = byPrefix('dev.');
  if (devCards.length) {
    for (const d of src.development) if (!devCards.some(x => x.id === d.id)) fail(`${d.id}: missing in runtime`);
    for (const x of devCards) if (!src.development.some(d => d.id === x.id)) fail(`${x.id}: unknown structural id in runtime`);
    const arcIds = [...new Set(src.development.map(d => d.arcId))];
    for (const id of arcIds) {
      const arc = c.development.arcs.find(a => a.id === id); const first = src.development.find(d => d.arcId === id)!;
      if (!arc || arc.model !== 'beats' || arc.cycles.length || arc.from !== first.from || arc.to !== first.to) fail(`${id}: arc missing or not a beats arc ${first.from}→${first.to}`);
    }
    for (const d of src.development) {
      const card = devCards.find(x => x.id === d.id); if (!card) continue;
      if (card.type !== 'situation' || card.at || card.required || card.mustShowBy !== undefined || card.diagnostic) fail(`${d.id}: a development scene is a free situation without a diagnostic block`);
      if (!same(card.development, { stages: [d.from], arcId: d.arcId }) || !same(card.facets, [d.facet])) fail(`${d.id}: arc/stage/facet differ from source`);
      if (d.retry ? card.once !== false : card.once === false) fail(`${d.id}: only retry scenes repeat`);
      checkChoices(c, card, d.choices, d.id, fail);
      d.choices.forEach((sc, i) => {
        const ch = card.choices[i]; if (!ch) return;
        const evs = ch.developmentEvents ?? [];
        if (sc.event === null) { if (evs.length) fail(`${d.id}/${sc.id}: a choice without evidence carries an event`); return; }
        const e = evs[0];
        const kind = sc.event === 'withdrawal' ? 'withdrawal' : d.beat;
        if (evs.length !== 1 || !e || e.arcId !== d.arcId || e.kind !== kind || e.contextId !== d.contextId || (kind === 'withdrawal' ? e.beat !== d.beat : e.beat !== undefined))
          fail(`${d.id}/${sc.id}: development event differs from source (${sc.event})`);
        if (sc.event && sc.event !== 'withdrawal' && sc.event !== d.beat) fail(`${d.id}/${sc.id}: source event ${sc.event} is not the beat ${d.beat}`);
      });
      // Gating: the same atoms the builder derives. Free numbers (spacing) and the day window of the first beat are skin; the retry cooldown is not.
      const expected = developmentRequires(d.arcId, d.beat as DevelopmentBeat, d.retry, DEFAULT_SPACING);
      const got = atoms(card.requires).filter(x => !isDay(x)).map(withoutNumbers); const want = atoms(expected).filter(x => !isDay(x)).map(withoutNumbers);
      if (!same(got, want)) fail(`${d.id}: requires differ from the beat contract (${d.retry ? 'retry-' : ''}${d.beat})`);
      if (d.retry) {
        const cool = atoms(card.requires).find(x => 'developmentSince' in x);
        if (!cool || !('developmentSince' in cool) || !same([cool.developmentSince.decisions, cool.developmentSince.evenings], RETRY_COOLDOWN)) fail(`${d.id}: retry cooldown must be ${RETRY_COOLDOWN[0]} decisions or ${RETRY_COOLDOWN[1]} evening`);
      } else if (d.beat !== 'trial') {
        const gap = atoms(card.requires).find(x => 'developmentSince' in x);
        if (!gap) fail(`${d.id}: ${d.beat} needs ordinary life after the previous beat`);
      }
    }
    // Retry routing, per arc: one retry per withdrawn beat, none for a beat nobody can withdraw from.
    for (const id of arcIds) for (const b of BEAT_ORDER) {
      const cards = src.development.filter(d => d.arcId === id && d.beat === b);
      const withdraws = cards.some(d => !d.retry && d.choices.some(x => x.event === 'withdrawal'));
      const retries = cards.filter(d => d.retry).length;
      if (withdraws !== (retries > 0)) fail(`${id}: retry coverage of beat ${b}`);
    }
  }
  return errors;
}
