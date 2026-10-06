// Mechanical part of REQs/CARD-AUTHORING-STANDARD-v1.md (§9, §13). Run after every content batch:
//   npm run cards:lint                     all cards, report only
//   npm run cards:lint -- --only probe     one kind: neutral | probe | development | story (comma-separated)
//   npm run cards:lint -- --strict         exit 1 on errors (warnings never fail); part of `npm run check` with --quiet
//   npm run cards:lint -- --quiet          errors and the total only
// Errors: label > 70, modern/computer vocabulary, stop words. Warnings: label > 55, scene > 200, response > 100,
// label length spread > 15 inside a card, evaluative words. Pool reports: sphere × leading logic, position balance,
// which logic the longest label belongs to. Meaning (is the distinguishing part of a label still there, §7) stays with a human.
import { content } from '../src/content';
import { forbiddenText } from './stoplist';
import type { ActionLogic, Card, Choice } from '../src/engine';

type Kind = 'neutral' | 'probe' | 'development' | 'story';
const KINDS: Kind[] = ['neutral', 'probe', 'development', 'story'];
const LOGICS: ActionLogic[] = ['opportunist', 'diplomat', 'expert', 'achiever', 'individualist', 'strategist', 'alchemist', 'ironic'];
const LOGIC_RU: Record<ActionLogic, string> = { opportunist: 'Оппортунист', diplomat: 'Дипломат', expert: 'Эксперт', achiever: 'Достигатель',
  individualist: 'Индивидуалист', strategist: 'Стратег', alchemist: 'Алхимик', ironic: 'Ироничный' };
export const LIMITS = { label: 55, labelMax: 70, scene: 200, response: 100, spread: 15 };

const word = (stem: string) => new RegExp(`(?<!\\p{L})(?:${stem})`, 'iu');
// §9: things you cannot touch in the potter's world. Stems catch the inflected forms.
export const MODERN = ['приложени', 'экран', 'созвон', 'дедлайн', 'релиз', 'клиент', 'проект', 'бонус', 'kpi', 'рассылк', 'чат(?!\\p{L})', 'чата', 'чате',
  'совещани', 'трекер', 'челлендж', 'инвестиц', 'доходност', 'диет', 'офис', 'менеджер', 'компьютер', 'телефон', 'имейл', 'e-?mail', 'фидбек', 'feedback'];
// §9: evaluation instead of action. «правильно» may be an Expert's own word, so these are warnings for a human to read.
export const EVALUATIVE = ['правильн', 'неправильн', 'мудр', 'зрел(?:ый|ая|ое|ые|ого|ому|ым|ых|ость)', 'осознанн', 'системн(?:ый|ого|ым) подход', 'разумн', 'глуп', 'эгоистичн', 'по-взрослому'];
const modernRx = MODERN.map(word), evaluativeRx = EVALUATIVE.map(word);
const hits = (text: string, rxs: RegExp[], stems: string[]) => stems.filter((_, i) => rxs[i]!.test(text));

export function kindOf(card: Card): Kind {
  if (card.tags?.includes('probe-only')) return 'probe';
  if (card.diagnostic || card.choices.some(c => c.diagnosticBehavior)) return 'neutral';
  if (card.development) return 'development';
  return 'story';
}
const allChoices = (card: Card): Choice[] => [...card.choices, ...(card.choiceVariants ?? []).flatMap(v => v.choices)];
const lead = (c: Choice): ActionLogic | undefined => {
  const v = c.diagnosticAction?.vector; if (!v) return undefined;
  return LOGICS.reduce((a, b) => v[b] > v[a] ? b : a);
};

export interface Finding { level: 'error' | 'warn'; kind: Kind; cardId: string; where: string; rule: string; text: string }
export function lintCards(cards: Card[], responses: Map<string, string>): Finding[] {
  const out: Finding[] = [];
  const add = (level: Finding['level'], card: Card, where: string, rule: string, text: string) => out.push({ level, kind: kindOf(card), cardId: card.id, where, rule, text });
  const words = (card: Card, where: string, text: string) => {
    for (const w of hits(text, modernRx, MODERN)) add('error', card, where, `слово «${w}»`, text);
    for (const w of hits(text, evaluativeRx, EVALUATIVE)) add('warn', card, where, `оценка «${w}»`, text);
    if (forbiddenText(text)) add('error', card, where, 'стоп-слово', text);
  };
  for (const card of cards) {
    if (card.text.length > LIMITS.scene) add('warn', card, 'text', `сцена ${card.text.length} > ${LIMITS.scene}`, card.text);
    words(card, 'text', card.text);
    for (const v of card.textVariants ?? []) words(card, `variant ${v.id}`, v.text);
    // §10: no option is at least as good as every other one in all four resources.
    const RES = ['wealth', 'strength', 'peace', 'bonds'] as const;
    const r = (c: Choice, k: typeof RES[number]) => c.effects.resources?.[k] ?? 0;
    for (const c of card.choices) if (card.choices.length > 1 && card.choices.every(o => o === c || RES.every(k => r(c, k) >= r(o, k)) && RES.some(k => r(c, k) > r(o, k))))
      add('warn', card, c.id, 'вариант лучше остальных по ресурсам (не хуже ни в одном)', c.label);
    const shown = card.choices.map(c => c.label.length);
    if (shown.length > 1 && Math.max(...shown) - Math.min(...shown) > LIMITS.spread)
      add('warn', card, 'choices', `разброс длины ${Math.max(...shown) - Math.min(...shown)} > ${LIMITS.spread}`, card.choices.map(c => `${c.label.length}`).join('/'));
    for (const c of allChoices(card)) {
      const n = c.label.length;
      if (n > LIMITS.labelMax) add('error', card, c.id, `вариант ${n} > ${LIMITS.labelMax}`, c.label);
      else if (n > LIMITS.label) add('warn', card, c.id, `вариант ${n} > ${LIMITS.label}`, c.label);
      words(card, c.id, c.label);
      const response = c.response ?? responses.get(`${card.id}/${c.id}`);
      if (response) { if (response.length > LIMITS.response) add('warn', card, `${c.id} отклик`, `отклик ${response.length} > ${LIMITS.response}`, response); words(card, `${c.id} отклик`, response); }
      const m = c.diagnosticMotive;
      if (m) { words(card, `${c.id} мотив`, m.text); for (const o of m.options) { if (o.label.length > LIMITS.labelMax) add('error', card, `${c.id} мотив ${o.id}`, `вариант ${o.label.length} > ${LIMITS.labelMax}`, o.label); words(card, `${c.id} мотив ${o.id}`, o.label); } }
    }
  }
  // §6.1: the same wording in two diagnostic cards reads as a template (and teaches the player a tell). Story and the old
  // development retries repeat labels on purpose: they are versions of one scene.
  const seen = new Map<string, Card>();
  for (const card of cards.filter(c => kindOf(c) === 'neutral' || kindOf(c) === 'probe')) for (const c of card.choices) {
    const key = c.label.toLocaleLowerCase('ru').replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
    const other = seen.get(key);
    if (other && other.id !== card.id) add('warn', card, c.id, `повтор метки из ${other.id}`, c.label); else seen.set(key, card);
  }
  return out;
}

/** §2, §6: pool-level balance of the diagnostic cards. */
export function poolReport(cards: Card[]): string[] {
  const lines: string[] = [];
  const diag = cards.filter(c => (kindOf(c) === 'neutral' || kindOf(c) === 'probe') && c.diagnostic && c.choices.every(x => x.diagnosticAction));
  for (const kind of ['neutral', 'probe'] as const) {
    const pool = diag.filter(c => kindOf(c) === kind); if (!pool.length) continue;
    const facets = [...new Set(pool.flatMap(c => c.facets ?? []))].sort();
    const matrix = Object.fromEntries(LOGICS.map(l => [l, Object.fromEntries(facets.map(f => [f, 0]))])) as Record<ActionLogic, Record<string, number>>;
    const positions = Object.fromEntries(LOGICS.map(l => [l, [0, 0, 0, 0]])) as Record<ActionLogic, number[]>;
    const longest = Object.fromEntries(LOGICS.map(l => [l, 0])) as Record<ActionLogic, number>;
    for (const card of pool) {
      card.choices.forEach((c, i) => { const l = lead(c)!; for (const f of card.facets ?? []) matrix[l][f]!++; positions[l][i]!++; });
      const max = Math.max(...card.choices.map(c => c.label.length));
      for (const c of card.choices) if (c.label.length === max) longest[lead(c)!]++;
    }
    lines.push(`### ${kind}: ведущая логика варианта × сфера карточки (${pool.length} карточек)`, '', `| логика | ${facets.join(' | ')} | позиции A/B/C${kind === 'neutral' ? '/D' : ''} | самый длинный вариант |`, `|---|${facets.map(() => '---').join('|')}|---|---|`);
    for (const l of LOGICS) {
      const pos = positions[l].slice(0, kind === 'neutral' ? 4 : 3).join('/');
      lines.push(`| ${LOGIC_RU[l]} | ${facets.map(f => matrix[l][f]).join(' | ')} | ${pos} | ${longest[l]} |`);
    }
    // §10: resources and qualities must not reward a logic; §6.1: no logic owns an opening word.
    const res = Object.fromEntries(LOGICS.map(l => [l, { n: 0, sum: 0, loss: 0, q: {} as Record<string, number>, first: {} as Record<string, number> }]));
    for (const card of pool) for (const c of card.choices) {
      const r = res[lead(c)!]!; const v = Object.values(c.effects.resources ?? {}); r.n++;
      r.sum += v.reduce((a, b) => a + b, 0); r.loss += v.filter(x => x < 0).reduce((a, b) => a + b, 0);
      for (const [k, x] of Object.entries(c.effects.qualities ?? {})) r.q[k] = (r.q[k] ?? 0) + x;
      const w = c.label.split(/[\s,.:;—-]+/u)[0]!.toLocaleLowerCase('ru'); r.first[w] = (r.first[w] ?? 0) + 1;
    }
    // What a player who plays «for resources» picks: the option with the largest resource sum in each card (ties split).
    const greedy = Object.fromEntries(LOGICS.map(l => [l, 0])) as Record<ActionLogic, number>;
    // Fair share: a logic that leads k of a card's n options would win k/n of the time if resources said nothing.
    const fair = Object.fromEntries(LOGICS.map(l => [l, 0])) as Record<ActionLogic, number>;
    for (const card of pool) for (const c of card.choices) fair[lead(c)!] += 1 / card.choices.length;
    for (const card of pool) {
      const sums = card.choices.map(c => Object.values(c.effects.resources ?? {}).reduce((a, b) => a + b, 0)), max = Math.max(...sums);
      const top = card.choices.filter((_, i) => sums[i] === max); for (const c of top) greedy[lead(c)!] += 1 / top.length;
    }
    const allN = LOGICS.reduce((a, l) => a + res[l]!.n, 0), mean = LOGICS.reduce((a, l) => a + res[l]!.sum, 0) / Math.max(allN, 1);
    const qualities = [...new Set(LOGICS.flatMap(l => Object.keys(res[l]!.q)))].sort();
    const qTotal = Object.fromEntries(qualities.map(q => [q, LOGICS.reduce((a, l) => a + (res[l]!.q[q] ?? 0), 0)]));
    lines.push('', `### ${kind}: ресурсы, качества и первое слово по ведущей логике`, '', `| логика | ресурсы Σ на вариант | потери на вариант | выбор «на ресурсы» (честная доля) | ${qualities.join(' | ')} | частое первое слово |`, `|---|---|---|---|${qualities.map(() => '---').join('|')}|---|`);
    const flags: string[] = [];
    for (const l of LOGICS) {
      const r = res[l]!; if (!r.n) continue;
      const avg = r.sum / r.n, [word, count] = Object.entries(r.first).sort((a, b) => b[1] - a[1])[0]!;
      if (Math.abs(avg - mean) > 1.5) flags.push(`ресурсы ${LOGIC_RU[l]}: ${avg.toFixed(1)} против среднего ${mean.toFixed(1)}`);
      if (r.n >= 8 && count / r.n >= .25) flags.push(`${LOGIC_RU[l]} начинается с «${word}» в ${count} из ${r.n}`);
      if (greedy[l] > Math.max(2 * fair[l], fair[l] + 2)) flags.push(`игра «на ресурсы» выбирает ${LOGIC_RU[l]} в ${greedy[l].toFixed(1)} из ${pool.length} при честной доле ${fair[l].toFixed(1)}`);
      lines.push(`| ${LOGIC_RU[l]} | ${avg.toFixed(1)} | ${(r.loss / r.n).toFixed(1)} | ${greedy[l].toFixed(1)} (${fair[l].toFixed(1)}) | ${qualities.map(q => r.q[q] ?? 0).join(' | ')} | ${word} ×${count} |`);
    }
    for (const q of qualities) for (const l of LOGICS) if (qTotal[q]! >= 6 && (res[l]!.q[q] ?? 0) / qTotal[q]! > .5) flags.push(`качество ${q}: ${res[l]!.q[q]} из ${qTotal[q]} у ${LOGIC_RU[l]}`);
    lines.push('', flags.length ? `**Перекосы (§6.1, §10):** ${flags.join('; ')}.` : 'Перекосов по ресурсам, качествам и первым словам нет.');
    const late = (['individualist', 'strategist', 'alchemist', 'ironic'] as ActionLogic[]).reduce((a, l) => a + longest[l], 0), all = LOGICS.reduce((a, l) => a + longest[l], 0);
    lines.push('', `Самый длинный вариант у поздних логик (Индивидуалист…Ироничный): ${late} из ${all}${all && late / all > .6 ? ' — **перекос: поздние варианты длиннее, проверить §6.1**' : ''}.`, '');
  }
  const dev = cards.filter(c => kindOf(c) === 'development' && c.development?.arcId);
  if (dev.length) {
    lines.push('### development: позиция целевого события по дугам', '', '| дуга | карточек | позиции A/B/C |', '|---|---|---|');
    for (const arc of [...new Set(dev.map(c => c.development!.arcId!))].sort()) {
      const pos = [0, 0, 0, 0];
      for (const c of dev.filter(x => x.development!.arcId === arc)) {
        const i = c.choices.findIndex(x => x.developmentEvents?.some(e => e.kind !== 'withdrawal')); if (i >= 0) pos[i]!++;
      }
      const total = pos.reduce((a, b) => a + b, 0);
      lines.push(`| ${arc} | ${total} | ${pos.slice(0, 3).join('/')}${total >= 4 && Math.max(...pos) / total > .6 ? ' — **перекос**' : ''} |`);
    }
    lines.push('');
  }
  return lines;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const onlyArg = args[args.indexOf('--only') + 1];
  const only = args.includes('--only') && onlyArg ? onlyArg.split(',') as Kind[] : KINDS;
  for (const k of only) if (!KINDS.includes(k)) throw new Error(`Unknown kind ${k}; use ${KINDS.join(', ')}`);
  const responses = new Map(content.traces.map(t => [`${t.source.cardId}/${t.source.choiceId}`, t.response]));
  const cards = content.cards.filter(c => only.includes(kindOf(c)));
  const findings = lintCards(cards, responses);
  const errors = findings.filter(x => x.level === 'error').length;
  if (args.includes('--quiet')) {
    for (const x of findings.filter(y => y.level === 'error')) console.log(`ERROR ${x.cardId} [${x.where}] ${x.rule}: ${x.text}`);
    console.log(`cards:lint: ошибок ${errors}, предупреждений ${findings.length - errors} (подробно: npm run cards:lint)`);
    if (args.includes('--strict') && errors) process.exitCode = 1;
    process.exit();
  }
  console.log(`# cards:lint — ${only.join(', ')} (${cards.length} карточек)\n`);
  for (const kind of only) {
    const f = findings.filter(x => x.kind === kind); const n = cards.filter(c => kindOf(c) === kind).length;
    console.log(`## ${kind}: ${n} карточек, ошибок ${f.filter(x => x.level === 'error').length}, предупреждений ${f.filter(x => x.level === 'warn').length}\n`);
    for (const level of ['error', 'warn'] as const) for (const x of f.filter(y => y.level === level))
      console.log(`${level === 'error' ? 'ERROR' : 'warn '} ${x.cardId} [${x.where}] ${x.rule}: ${x.text}`);
    if (f.length) console.log('');
  }
  console.log(poolReport(cards).join('\n'));
  console.log(`Итого: ошибок ${errors}, предупреждений ${findings.length - errors}. Смысловые пункты чек-листа (§13) проверяет человек.`);
  if (args.includes('--strict') && errors) process.exitCode = 1;
}
