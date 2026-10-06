import { describe, expect, it } from 'vitest';
import { content } from './index';
import { kindOf, lintCards } from '../../scripts/cards-lint';
import { makeCard } from '../engine/testUtils';

describe('cards:lint', () => {
  it('reports the mechanical rules of the authoring standard', () => {
    const card = { ...makeCard({ id: 'x', type: 'situation', chapter: 'any', facets: ['work'] }), text: 'Тимон ждёт',
      choices: [{ id: 'a', label: 'Отправлю клиенту записку', effects: {} }, { id: 'b', label: 'Я'.repeat(71), effects: {} }, { id: 'c', label: 'Поступлю мудро', effects: {} }] };
    const f = lintCards([card], new Map([['x/a', 'Ок']]));
    expect(f.filter(x => x.level === 'error').map(x => x.rule)).toEqual(expect.arrayContaining(['слово «клиент»', 'вариант 71 > 70']));
    expect(f.some(x => x.level === 'warn' && x.rule === 'оценка «мудр»')).toBe(true);
    expect(f.some(x => x.rule.startsWith('разброс длины'))).toBe(true);
  });
  it('classifies the shipped cards and finds no errors in them', () => {
    const kinds = new Set(content.cards.map(kindOf));
    expect([...kinds].sort()).toEqual(['development', 'neutral', 'probe', 'story']);
    const responses = new Map(content.traces.map(t => [`${t.source.cardId}/${t.source.choiceId}`, t.response]));
    expect(lintCards(content.cards, responses).filter(x => x.level === 'error')).toEqual([]);
  });
});
