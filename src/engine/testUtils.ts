import { content } from '../content';
import { createInitialGameState } from './initialState';
import type { Card, GameContent, GameState } from './types';
export function makeCard(overrides:Partial<Card>&Pick<Card,'id'|'type'>):Card {
 return {chapter:1,text:overrides.id,choices:[{id:'a',label:'A',effects:{}},{id:'b',label:'B',effects:{}}],...overrides};
}
export function makeContent(overrides:Partial<GameContent>={}):GameContent {
 return {...content,cards:[],insights:[],endings:[],reflections:[],traces:[],portraitFragments:[],
  episode:{...content.episode,routeMoments:[],opportunities:[],finalFacts:[],routePools:{}},...overrides};
}
export function makeState(overrides:Partial<GameState>={}):GameState {
 return {...createInitialGameState(123456),phase:'slot',intentionHistory:[{day:1,facet:'work'}],...overrides};
}
