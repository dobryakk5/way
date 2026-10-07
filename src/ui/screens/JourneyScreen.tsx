import { useState } from 'react';
import { content } from '../../content';
import { developmentProgress } from '../../engine/development';
import { firstStageReadiness } from '../../engine/heroDevelopmentProfile';
import { journeyPeriod } from '../../engine/journey';
import { ProfileSection } from './ProfileSection';
import type { GameState, LifeFacet } from '../../engine/types';
import { FacetIcon, type FacetIconId } from '../components/FacetIcon';
const names:Record<LifeFacet,string>={work:'Дело и деньги',relationships:'Отношения',body:'Тело и здоровье',inner:'Внутренний мир'};
const facetIcons:Record<LifeFacet,FacetIconId>={work:'work',relationships:'relationships',body:'body',inner:'inner'};
function Evidence({items}:{items:GameState['history']}) {
 return <div className="evidence">{items.map(h=><article key={`${h.day}/${h.slot}`}><p className="eyebrow">День {h.day} · Событие {h.slot+1}</p><p>{h.text}</p><p><strong>{h.label}</strong></p>{h.response&&<p>{h.response}</p>}</article>)}</div>;
}
function Readiness({game}:{game:GameState}) {
 const r=firstStageReadiness(game,content);const name=(id:string)=>content.development.stages.find(s=>s.id===id)?.name;
 const missing=[!r.enoughDecisions&&`решений, по которым виден способ: ${r.decisions} из ${r.neededDecisions}`,
  r.contexts<r.neededContexts&&`разных обстоятельств: ${r.contexts} из ${r.neededContexts}`,
  r.facets<r.neededFacets&&`сфер жизни: ${r.facets} из ${r.neededFacets}`].filter((x):x is string=>!!x);
 let status;
 if(r.candidate)status=<p>Способ героя почти определился: <strong>{name(r.candidate)}</strong>. Если следующие решения это подтвердят, вечером начнётся линия освоения.</p>;
 else if(missing.length)status=<><p>Для первого вывода пока не хватает наблюдений:</p><ul className="readiness">{missing.map(m=><li key={m}>{m}</li>)}</ul></>;
 else if(r.leader)status=<p>Способ уже различим: <strong>{name(r.leader)}</strong>. Вечер это отметит, а следующий вечер с новыми решениями — подтвердит.</p>;
 else status=<p>Решений уже достаточно, но в них пока смешаны разные способы. Вывод появится, когда один из них станет заметно чаще.</p>;
 return <div className="development-readiness"><p>Линия освоения начнётся, когда способ героя станет устойчиво заметен по его решениям. Сами наблюдения развитием не считаются.</p>{status}</div>;
}
/** Starting over never deletes: the current run is archived in this browser and the game opens on the start screen. */
function Restart({onRestart}:{onRestart:()=>void}) {
 const [asking,setAsking]=useState(false);
 return <section className="restart-panel" aria-label="Начать заново">
  {asking?<><p>Начать путь с первого дня? Текущее прохождение не удалится: оно останется в архиве этого браузера, но продолжить его будет нельзя.</p>
   <div className="restart-actions"><button type="button" className="choice-button restart-confirm" onClick={onRestart}>Да, начать заново</button><button type="button" className="choice-button" onClick={()=>setAsking(false)}>Отмена</button></div></>
  :<button type="button" className="text-button restart-open" onClick={()=>setAsking(true)}>Начать игру заново</button>}
 </section>;
}
export function JourneyScreen({game,onClose,onRestart}:{game:GameState;onClose:()=>void;onRestart:()=>void}) {
 const dev=game.development;
 const stage=content.development.stages.find(s=>s.id===dev.developmentCurrent);
 const progress=developmentProgress(game,content);
 const receipts=game.development.evidence;
 const evidenceHistory=game.history.filter(h=>receipts.some(e=>e.day===h.day&&e.slot===h.slot&&e.cardId===h.cardId));
 const [period,setPeriod]=useState<1|7|30>(7);const report=journeyPeriod(game,content,period);
 return <main className="screen journey-screen"><section className="narrative-card journey-card">
  <div className="subscreen-head"><button className="subscreen-back" onClick={onClose}>← К игре</button><span>Личная история героя</span></div>
  <p className="eyebrow">Наблюдения и освоенный опыт</p><h2>Мой путь</h2>
  <p className="screen-lead">Здесь отдельно показано, как герой обычно принимает решения, и что он уже успел освоить внутри истории. Это разные вещи.</p>

  <div className="journey-primary"><ProfileSection game={game}/></div>

  <section className="development-panel" aria-label="Развитие героя"><p className="section-kicker">Прожитое развитие</p><h3>Подтверждённое развитие</h3>
  {stage?<><p className="development-current"><span>Освоенный способ</span><strong>{stage.name}</strong></p><p>{stage.description}</p>
  <p className="retained-abilities"><span>С ним остаются</span>{dev.available.map(id=>content.development.stages.find(s=>s.id===id)?.ability).filter(Boolean).join(' · ')}</p></>:<Readiness game={game}/>}
  {stage&&!progress&&dev.transitions.length===0&&<p>Для этого способа пока нет написанной линии освоения; жизнь героя продолжается без неё.</p>}
  {progress&&<div className="next-ability"><p className="section-kicker">Следующая способность</p><h4>{progress.arc.ability}</h4><blockquote>{progress.arc.question}</blockquote><p>{progress.ready?'Герой уже проверил новый способ в разных обстоятельствах. Ночью он сможет его закрепить.':progress.completed.length?'Одна проба разобрана. Что произойдёт, когда новый способ понадобится в другой ситуации и будет стоить времени или дохода?':'Герою ещё предстоит попробовать новый способ, увидеть последствия и разобрать их с Алексеем.'}</p></div>}
  {dev.transitions.filter(t=>t.reason!=='initial-reconciliation').map(t=><p className="milestone" key={t.arcId}>День {t.day}: {content.development.stages.find(s=>s.id===t.from)?.name} → {content.development.stages.find(s=>s.id===t.to)?.name}. Новый способ закрепился; прежнее мастерство осталось.</p>)}
  <details className="journal"><summary>Сцены развития героя</summary>{evidenceHistory.length?<Evidence items={evidenceHistory}/>:<p>Записи появятся после событий, в которых герой проверяет свой способ работы.</p>}</details></section>

  <section className="journey-history" aria-label="История решений"><div className="history-heading"><div><p className="section-kicker">История решений</p><h3>Последние дни</h3></div><div className="periods compact" role="group" aria-label="Период">{([1,7,30] as const).map(n=><button className="choice-button" aria-pressed={period===n} key={n} onClick={()=>setPeriod(n)}>{n===1?'День':`${n} дн.`}</button>)}</div></div>
  <p className="period-copy">{report.available?`Дни ${report.from}–${report.through}. Доступно ${report.available} из ${period} завершённых дней.`:'Пока нет завершённых дней. Записи появятся после первой ночи.'}</p>
  <h4>Куда уходило время</h4><p className="section-note">Одно решение может касаться двух граней.</p>
  {report.facets.map(f=><details className="journal" key={f.facet}><summary><FacetIcon id={facetIcons[f.facet]} className="journal-facet-icon"/><b className="journal-facet-label">{names[f.facet]}</b><span>{f.evidence.length}</span></summary><Evidence items={f.evidence}/></details>)}
  <h4>Как принимались решения</h4>
  {report.decisions.map(d=><details className="journal" key={d.kind}><summary>{d.label} <span>{d.evidence.length+d.reviews.length}</span></summary><p>{d.recurring?'Этот способ выбора повторялся в нескольких сценах выбранного периода.':'Пока показываем отдельные поступки без вывода о повторяющемся способе выбора.'}</p><Evidence items={d.evidence}/>{d.reviews.map(g=><article key={g.day}><p>День {g.day}: {({select:'Выбрал',keep:'Сохранил',clarify:'Уточнил',change:'Изменил'})[g.action]} цель — {g.wording}</p><details><summary>Сцены перед пересмотром</summary><Evidence items={game.history.filter(h=>h.day===g.day-1)}/></details></article>)}</details>)}
  <h4>Цель героя</h4>{report.goals.length?report.goals.map(g=><article className="goal-history" key={g.day}><p>День {g.day}: {({select:'Выбрал',keep:'Сохранил',clarify:'Уточнил',change:'Изменил'})[g.action]} — <strong>{g.wording}</strong></p><Evidence items={game.history.filter(h=>h.day===g.day&&h.slot===0)}/></article>):<p className="section-note">Запись появится после первой выбранной цели.</p>}
  </section>
  <Restart onRestart={onRestart}/>
 </section></main>;
}
