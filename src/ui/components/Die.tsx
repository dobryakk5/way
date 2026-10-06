const pips: Record<number, number[]> = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]
};

export function Die({ face, rolling = false, small = false }: { face: number; rolling?: boolean; small?: boolean }) {
  return <span className={`die-face${rolling ? ' die-rolling' : ''}${small ? ' die-small' : ''}`} aria-hidden="true">
    {Array.from({ length: 9 }, (_, i) => <i key={i} className={pips[face]?.includes(i + 1) ? 'pip visible' : 'pip'} />)}
  </span>;
}
