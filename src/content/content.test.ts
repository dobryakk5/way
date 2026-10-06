import { describe, expect, it } from 'vitest';
import { content, contentMeta } from '.';

const expectedCharacters = ['Марта', 'Тимон', 'Алексей', 'Егор', 'Лия', 'Странник'];
// Added for v2.5, where roles of the diagnostic and development packages (healers, elder, old master, family, helper) need their own people.
const addedCharacters = ['Фёкла', 'Радим', 'Мирон', 'Савва', 'Дарья', 'Ульяна'];

describe('MVP content graph', () => {
  it('contains the six permanent characters from TZ v2.2, then the people added for v2.5', () => {
    expect(contentMeta.characters.slice(0, 6).map((character) => character.name)).toEqual(expectedCharacters);
    expect(contentMeta.characters.slice(6).map((character) => character.name)).toEqual(addedCharacters);
  });

  it('uses Алексей as the apprentice', () => {
    expect(contentMeta.characters.map((character) => character.name)).toContain('Алексей');
    expect(JSON.stringify(content)).not.toContain('Ян');
  });

  it('uses the approved positioning line', () => {
    expect(contentMeta.ui.tagline).toBe('Ты выбираешь. Мир запоминает.');
  });

  it('has a data-defined thirty-day calendar and distinct continuation scenes', () => {
    expect(content.episode.days).toBe(30);
    for(let day=11;day<=30;day++)expect(content.cards.filter(c=>c.at?.day===day)).toHaveLength(2);
    expect(content.cards.filter(c=>c.type==='crisis').length).toBeGreaterThan(0);
  });

  it('contains early callback, five shadows and at least nine perception variants', () => {
    expect(content.cards.some((card) => card.at?.day===2&&card.at.slot===0)).toBe(true);
    for (const quality of ['attention', 'honesty', 'compassion', 'letgo', 'courage']) {
      expect(content.cards.some((card) => card.shadow?.quality===quality)).toBe(true);
    }
    expect(content.cards.reduce((sum, card) => sum + (card.textVariants?.length ?? 0), 0)).toBeGreaterThanOrEqual(9);
  });
});
