/** Reproducible content audit. Scripted policies are not models of psychological stages. */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { content } from '../src/content/index';
import { CONTENT_VERSION } from '../src/content/version';
import { journeyPeriod } from '../src/engine/journey';
import { play } from '../scripts/play';

const control: Record<string, string> = {
  d11_0_apprentice: 'a', d11_3_apprentice: 'b',
  d14_0_apprentice: 'a', d14_3_apprentice: 'b',
  d17_0_apprentice: 'a', d17_3_apprentice: 'b',
  d20_0_apprentice: 'a', d20_3_apprentice: 'b',
  d22_0_apprentice: 'a', d22_3_apprentice: 'b',
  d25_0_apprentice: 'a', d25_3_apprentice: 'b',
  d28_0_apprentice: 'a', d28_3_apprentice: 'b',
};
const tryAndRepeat: Record<string, string> = {
  ...control,
  d17_0_apprentice: 'b', d17_3_apprentice: 'a',
  d20_0_apprentice: 'b', d20_3_apprentice: 'a',
  d22_0_apprentice: 'b', d22_3_apprentice: 'a',
  d25_0_apprentice: 'b', d25_3_apprentice: 'a',
  d28_0_apprentice: 'b', d28_3_apprentice: 'a',
};
const tryThenRevert: Record<string, string> = {
  ...control,
  d17_0_apprentice: 'b', d17_3_apprentice: 'a',
  d20_0_apprentice: 'b', d20_3_apprentice: 'a',
};
const examineWithoutTrial = { ...control, d11_0_apprentice: 'b', d11_3_apprentice: 'a', d14_0_apprentice: 'b' };
const scenarios = [
  { id: 'control', label: 'Сохранение контроля в линии Алексея', choices: control },
  { id: 'try_repeat', label: 'Проба с дня 17 и повторение в новом заказе', choices: tryAndRepeat },
  { id: 'try_revert', label: 'Проба в день 17 и возвращение к контролю с дня 22', choices: tryThenRevert },
  { id: 'examine_no_trial', label: 'Обсуждение чужого критерия без самостоятельной партии', choices: examineWithoutTrial },
];
const checks: string[] = [];
const seeds = 100;
const proofIds = ['d17_0_apprentice','d17_3_apprentice','d22_0_apprentice','d22_3_apprentice','d25_0_apprentice','d25_3_apprentice','d28_0_apprentice','d28_3_apprentice'];
const results = scenarios.map(scenario => {
  const experiments: number[] = [];
  const perspectives: number[] = [];
  const falseExperimentEvidence: number[] = [];
  const seen = new Set<string>();
  let witness: unknown;
  let completed = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const { state, draws } = play(seed, { policy: 'greedy-resources', choices: scenario.choices });
    if (state.phase === 'boundary' && state.history.length === 120 && state.nights.length === 30) completed++;
    else checks.push(`${scenario.id}/${seed}: incomplete calendar`);
    for (const [id, choiceId] of Object.entries(scenario.choices)) {
      if (!state.history.some(h => h.cardId === id && h.choiceId === choiceId)) checks.push(`${scenario.id}/${seed}: missing requested choice ${id}/${choiceId}`);
    }
    for (const draw of draws) seen.add(draw.cardId);
    const apprentice = state.history.filter(h => h.cardId.endsWith('_apprentice') && h.day >= 11);
    experiments.push(apprentice.filter(h => h.decisionKinds?.includes('experiment')).length);
    perspectives.push(apprentice.filter(h => h.decisionKinds?.includes('perspective')).length);
    const contradictory = apprentice.filter(h => ['d17_3_apprentice','d22_3_apprentice','d25_3_apprentice','d28_3_apprentice'].includes(h.cardId) && h.choiceId === 'b' && h.decisionKinds?.includes('experiment'));
    falseExperimentEvidence.push(contradictory.length);
    if (seed === 1) witness = {
      seed, history: state.history.filter(h => proofIds.includes(h.cardId)),
      nights: state.nights.filter(n => [17,22,25,28].includes(n.day)),
      journey: journeyPeriod(state, content, 30).decisions.map(d => ({ kind: d.kind, count: d.evidence.length, recurring: d.recurring })),
      evidence: state.evidence.filter(e => proofIds.includes(e.cardId)),
      milestone: state.milestones.fair,
      resources: state.resources,
    };
  }
  return { id: scenario.id, label: scenario.label, seeds, completed,
    apprenticeExperimentTags: { min: Math.min(...experiments), max: Math.max(...experiments) },
    apprenticePerspectiveTags: { min: Math.min(...perspectives), max: Math.max(...perspectives) },
    contraryExperimentLabels: { min: Math.min(...falseExperimentEvidence), max: Math.max(...falseExperimentEvidence) },
    uniqueCardsAcrossSeeds: seen.size, witness,
  };
});
const mirroredEncounters = content.cards.filter(c => c.id.startsWith('enc_4_')).filter(c => {
  const prior = content.cards.find(p => p.id === c.id.replace('enc_4_', 'enc_3_'));
  return prior && c.text === `В новом заказе ${prior.text}` && JSON.stringify(c.choices) === JSON.stringify(prior.choices);
}).map(c => c.id);
const audit = {
  purpose: 'Проверка доступности сцен и корректности свидетельств. Не измеряет психологическую стадию, осознание или эффект игры на человека.',
  contentVersion: CONTENT_VERSION,
  contentHash: createHash('sha256').update(JSON.stringify(content)).digest('hex'),
  cards: content.cards.length, days: content.episode.days, decisionsPerRun: content.episode.days * content.episode.slotsPerDay,
  runs: seeds * scenarios.length, baselinePolicy: 'greedy-resources', commonGoal: 'order',
  method: 'По 100 одинаковых seed для четырёх сценариев. Различаются только явно заданные выборы в линии Алексея. Остальные решения выбирает одна ресурсная политика. Возникающие ресурсные последствия могут менять свободные встречи. Метки считаются только в обязательных сценах Алексея после дня 10.',
  results, mirroredEncounters, errors: [...new Set(checks)],
};
writeFileSync('reports/development-audit-2026-10-04.json', JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify({ ...audit, results: results.map(({witness, ...r}) => r) }, null, 2));
if (audit.errors.length) process.exitCode = 1;
