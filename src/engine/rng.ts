export function hashSeed(seed: number, ...parts: Array<string | number>): number {
  const input = [seed >>> 0, ...parts].join('|');
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function deterministicRandom(
  seed: number,
  day: number,
  slot: number,
  salt: string,
  episodeId = 'fair'
): number {
  return mulberry32(hashSeed(seed, episodeId, day, slot, salt))();
}
