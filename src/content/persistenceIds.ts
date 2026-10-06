const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;
const MASK_SAFE_INTEGER = (1n << 53n) - 1n;

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/**
 * Stable, environment-independent positive integer identifier.
 *
 * Authoring always uses string keys. Numeric ids are derived from those keys so
 * dev/staging/prod import the same catalog without relying on database sequences.
 * The content build checks collisions across every catalog entity.
 */
export function stableContentId(namespace: string, key: string): number {
  let hash = FNV_OFFSET;
  for (const byte of utf8(`${namespace}:\0${key}`)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  const safe = hash & MASK_SAFE_INTEGER;
  return Number(safe === 0n ? 1n : safe);
}

export function sceneKey(cardId: string): string {
  return cardId;
}

export function choiceKey(cardId: string, choiceId: string): string {
  return `${cardId}/${choiceId}`;
}

export function sceneId(cardId: string): number {
  return stableContentId('scene', sceneKey(cardId));
}

export function choiceId(cardId: string, authorChoiceId: string): number {
  return stableContentId('choice', choiceKey(cardId, authorChoiceId));
}

export function scenePresentationKey(variantId?: string): string {
  return variantId ? `variant:${variantId}` : 'base';
}

export function scenePresentationId(cardId: string, variantId?: string, revision = 1): number {
  return stableContentId(
    'scene-presentation',
    `${sceneKey(cardId)}/${scenePresentationKey(variantId)}/r${revision}`
  );
}

export function choicePresentationKey(): string {
  return 'default';
}

export function choicePresentationId(cardId: string, authorChoiceId: string, revision = 1): number {
  return stableContentId(
    'choice-presentation',
    `${choiceKey(cardId, authorChoiceId)}/${choicePresentationKey()}/r${revision}`
  );
}
