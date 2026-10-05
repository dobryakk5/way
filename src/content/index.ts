import development from './data/development.json';
import profile from './data/development-profile.json';
import developmentCards from './data/cards.development.json';
import cardsCh1 from './data/cards.ch1.json';
import cardsCh2 from './data/cards.ch2.json';
import continuation from './data/cards.continuation.json';
import cardsCommon from './data/cards.common.json';
import cardsProbe from './data/cards.probe.json';
import characters from './data/characters.json';
import days from './data/days.json';
import endings from './data/endings.json';
import insights from './data/insights.json';
import reflections from './data/reflections.json';
import ui from './data/ui.ru.json';
import wisdoms from './data/wisdoms.json';
import episodes from './data/episodes.json';
import factsSchema from './data/facts.schema.json';
import traces from './data/traces.json';
import portraitFragments from './data/portraitFragments.json';
import type { GameContent } from '../engine/types';
// JSON is validated by check-content before tests/build. No Zod in the browser bundle.
export const content = {
  cards: [...cardsCh1, ...cardsCh2, ...cardsCommon, ...continuation, ...developmentCards, ...cardsProbe], development, profile, insights, endings, reflections,
  wisdoms, dayTexts: days, episode: episodes[0], factsSchema, traces, portraitFragments
} as unknown as GameContent;
export const contentMeta = { characters, ui } as const;
