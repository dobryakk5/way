import React from 'react';
import ReactDOM from 'react-dom/client';
import { LazyMotion, domMax, MotionConfig } from 'framer-motion';
import { GameScreen } from '../ui/screens/GameScreen';
import { createInitialGameState } from '../engine/initialState';
import type { DrawResult } from '../engine/draw';
import type { Choice } from '../engine/types';
import '../styles.css';

// Development-only page: /dev-card-preview.html?n=2|3|4&long=1 renders a card with that many choices so the layout can be checked at phone width.
const params = new URLSearchParams(location.search);
const n = Math.min(4, Math.max(2, Number(params.get('n') ?? 4)));
const long = params.get('long') === '1';
const label = (i: number) => long ? `Вариант ${'ABCD'[i]}. Спокойно объяснить Алексею, что именно изменилось в работе, предложить проверить результат вместе и не спорить дальше о сроках, пока не станет ясно, что можно успеть к ярмарке.` : `Вариант ${'ABCD'[i]}`;
const choices: Choice[] = Array.from({ length: n }, (_, i) => ({ id: 'ABCD'[i]!, label: label(i), effects: { resources: { wealth: i === 0 ? 2 : 0, peace: i === 1 ? -1 : 0 } }, servesFacets: ['work'] }));
const game = { ...createInitialGameState(1), phase: 'slot' as const, day: 3, slot: 1 };
const text = 'Ученик показывает чашку и спрашивает, можно ли выставить её на ярмарке. Глазурь легла неровно, но он очень ждал этого дня. Остаётся решить, что сказать ему сейчас и как поступить с заказом Тимона.';
const draw: DrawResult = {
  card: { id: 'preview', chapter: 1, type: 'situation', character: 'alexey', text, choices } as DrawResult['card'], choices, text, source: 'pool',
  ...(n === 2 ? { leftChoiceId: 'A', rightChoiceId: 'B' } : {})
};
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><LazyMotion features={domMax}><MotionConfig reducedMotion="user">
    <GameScreen game={game} draw={draw} onChoose={(cardId, choiceId) => { document.title = `chosen ${cardId}/${choiceId}`; }} />
  </MotionConfig></LazyMotion></React.StrictMode>
);
