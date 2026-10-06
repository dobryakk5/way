import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { GameState } from '../../engine/types';
import { Die } from '../components/Die';
import { useAutoAdvance } from '../useAutoAdvance';

export function DiceScreen({ game, onRoll, onOpen, blocked }: { game: GameState; onRoll: () => void; onOpen: () => void; blocked: boolean }) {
  const dice = game.diceHistory.at(-1)!;
  const reducedMotion = useReducedMotion();
  const [rolling, setRolling] = useState(!dice.face);
  const [previewFace, setPreviewFace] = useState(1);

  // Commit the real result once; changing faces below are only animation.
  useEffect(() => { if (!dice.face && !blocked) onRoll(); }, [dice.face, blocked, onRoll]);
  useEffect(() => {
    if (!rolling) return;
    const interval = reducedMotion ? undefined : setInterval(() => setPreviewFace(face => face % 6 + 1), 75);
    const timer = setTimeout(() => setRolling(false), reducedMotion ? 100 : 650);
    return () => { clearInterval(interval); clearTimeout(timer); };
  }, [rolling, reducedMotion]);
  useAutoAdvance(!rolling && Boolean(dice.face) && !blocked, 260, onOpen);

  return <main className="screen dice-screen"><section className="dice-stage">
    <p className="eyebrow">День {game.day} · Случайная встреча</p>
    <h2>Кого принесёт этот день?</h2>
    <div className="dice-orbit"><Die face={rolling ? previewFace : dice.face ?? 1} rolling={rolling && !reducedMotion} /></div>
    <p className="dice-caption" role="status">{rolling || !dice.face ? 'Кубик в движении…' : `Выпало ${dice.face} · встреча начинается`}</p>
  </section></main>;
}
