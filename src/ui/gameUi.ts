import { content, contentMeta } from '../content';
import type { Choice, DayText, GameState, Resource } from '../engine/types';

export const resourceUi: Record<
  Resource,
  { label: string; symbol: string; description: string }
> = {
  wealth: { label: 'Достаток', symbol: '◒', description: 'Деньги, еда и товар' },
  strength: { label: 'Силы', symbol: '◇', description: 'Телесная энергия' },
  peace: { label: 'Покой', symbol: '○', description: 'Внутреннее состояние' },
  bonds: { label: 'Близкие', symbol: '∞', description: 'Тепло отношений' }
};

export function characterName(characterId?: string): string {
  if (!characterId) return 'Город';
  return (
    contentMeta.characters.find((character) => character.id === characterId)?.name ??
    characterId
  );
}

export function dayText(day: number, part: DayText['part']): string {
  return (
    content.dayTexts?.find((entry) => entry.day === day && entry.part === part)?.text ??
    ''
  );
}

export function wisdomTexts(state: GameState): string[] {
  const byId = new Map((content.wisdoms ?? []).map((wisdom) => [wisdom.id, wisdom.text]));
  return [...new Set(state.pendingWisdoms)]
    .map((id) => byId.get(id))
    .filter((text): text is string => Boolean(text));
}

export function impactForChoice(choice: Choice): Partial<Record<Resource, number>> {
  return choice.effects.resources ?? {};
}

export function impactDotCount(delta: number): number {
  const magnitude = Math.abs(delta);
  if (magnitude >= 12) return 3;
  if (magnitude >= 6) return 2;
  return magnitude > 0 ? 1 : 0;
}
