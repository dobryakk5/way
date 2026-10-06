import { content } from '../../content';
import { routeAt } from '../../engine';
import type { GameState, LifeFacet } from '../../engine';
import { FacetIcon, type FacetIconId } from '../components/FacetIcon';

const facetIcons: Record<LifeFacet, FacetIconId> = {
 work:'work', relationships:'relationships', body:'health', inner:'meaning'
};
export function DirectionScreen({game,onIntention,onRoute}:{game:GameState;onIntention:(f:LifeFacet)=>void;onRoute:(id:string)=>void}) {
 const route=routeAt(game,content);
 const intention=game.phase==='intention';
 const offers=content.episode.opportunities.filter(o=>o.offeredAt.day===game.day&&o.offeredAt.slot===game.slot);
 return <main className="screen narrative-screen"><section className="narrative-card">
  <p className="eyebrow">День {game.day} · К ярмарке</p>
  <h2>{intention?(game.day===6?'Что теперь важнее не упустить?':'Что важнее не упустить к ярмарке?'):'Куда направиться сейчас?'}</h2>
  {intention?<p className="narrative-text">{game.day===6?'Можно оставить прежнее намерение или выбрать другое.':'Всё сразу не успеть. Что ты хочешь сохранить в эти десять дней, пусть даже ценой остального?'} </p>:
    offers.map(o=><p className="narrative-text" key={o.id}>{o.offerText}</p>)}
  <div className="direction-options">{intention?content.episode.intentionOptions.map(o=><button type="button" className="choice-button" key={o.id} onClick={()=>onIntention(o.facet)}><span className="choice-with-icon"><FacetIcon id={facetIcons[o.facet]}/><span>{o.label}{game.declaredIntention===o.facet?' · оставить':''}</span></span></button>):
    route?.options.map(o=><button type="button" className="choice-button" key={o.id} onClick={()=>onRoute(o.id)}><span className="choice-with-icon"><FacetIcon id={facetIcons[o.facets[0] ?? 'work']}/><span>{o.label}</span></span></button>)}</div>
 </section></main>;
}
