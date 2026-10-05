import { useState } from 'react';
import { content } from '../../content';
import { developmentProgress } from '../../engine/development';
import { journeyPeriod } from '../../engine/journey';
import { ProfileSection } from './ProfileSection';
import type { GameState } from '../../engine/types';
const names={work:'Дело и деньги',relationships:'Отношения',body:'Тело и здоровье',inner:'Внутренний мир'};
function Evidence({items}:{items:GameState['history']}) {
 return <div className="evidence">{items.map(h=><article key={`${h.day}/${h.slot}`}><p className="eyebrow">День {h.day} · Событие {h.slot+1}</p><p>{h.text}</p><p><strong>{h.label}</strong></p>{h.response&&<p>{h.response}</p>}</article>)}</div>;
}
export function JourneyScreen({game,onClose}:{game:GameState;onClose:()=>void}) {
 const dev=game.development;
 const stage=content.development.stages.find(s=>s.id===dev.developmentCurrent);
 const progress=developmentProgress(game,content);
 const receipts=game.development.evidence;
 const evidenceHistory=game.history.filter(h=>receipts.some(e=>e.day===h.day&&e.slot===h.slot&&e.cardId===h.cardId));
 const [period,setPeriod]=useState<1|7|30>(7);const report=journeyPeriod(game,content,period);
 return <main className="screen journey-screen"><section className="narrative-card">
  <button className="choice-button" onClick={onClose}>Вернуться к игре</button><h2>Мой путь</h2>
  <ProfileSection game={game}/>
  <section aria-label="Развитие героя"><h3>Подтверждённое развитие</h3>
  {stage?<><p>Освоенный способ действия: {stage.name}. {stage.description}</p>
  <p>С ним остаются: {dev.available.map(id=>content.development.stages.find(s=>s.id===id)?.ability).join(' · ')}.</p></>:<p>Линия освоения начнётся, когда способ героя станет заметен по его решениям. Наблюдения за решениями сами по себе развитием не считаются.</p>}
  {stage&&!progress&&dev.transitions.length===0&&<p>Для этого способа пока нет написанной линии освоения; жизнь героя продолжается без неё.</p>}
  {progress&&<><h4>Следующая способность</h4><p>{progress.arc.ability}</p><p>{progress.arc.question}</p><p>{progress.ready?'Герой уже проверил новый способ в разных обстоятельствах. Ночью он сможет его закрепить.':progress.completed.length?'Одна проба разобрана. Что произойдёт, когда новый способ понадобится в другой ситуации и будет стоить времени или дохода?':'Герою ещё предстоит попробовать новый способ, увидеть последствия и разобрать их с Алексеем.'}</p></>}
  {dev.transitions.filter(t=>t.reason!=='initial-reconciliation').map(t=><p key={t.arcId}>День {t.day}: {content.development.stages.find(s=>s.id===t.from)?.name} → {content.development.stages.find(s=>s.id===t.to)?.name}. Новый способ закрепился; прежнее мастерство осталось.</p>)}
  <details className="journal"><summary>Сцены развития героя</summary>{evidenceHistory.length?<Evidence items={evidenceHistory}/>:<p>Записи появятся после событий, в которых герой проверяет свой способ работы.</p>}</details></section>
  <div className="periods" role="group" aria-label="Период">{([1,7,30] as const).map(n=><button className="choice-button" aria-pressed={period===n} key={n} onClick={()=>setPeriod(n)}>{n===1?'День':`${n} дней`}</button>)}</div>
  <p>{report.available?`Дни ${report.from}–${report.through}. Доступно ${report.available} из ${period} завершённых дней.`:'Пока нет завершённых дней. Записи появятся после первой ночи.'}</p>
  <h3>Куда уходило время</h3><p>Одно решение может касаться двух граней.</p>
  {report.facets.map(f=><details className="journal" key={f.facet}><summary>{names[f.facet]} · {f.evidence.length} решений</summary><Evidence items={f.evidence}/></details>)}
  <h3>Как принимались решения</h3>
  {report.decisions.map(d=><details className="journal" key={d.kind}><summary>{d.label} · {d.evidence.length+d.reviews.length} поступков</summary><p>{d.recurring?'Этот способ выбора повторялся в нескольких сценах выбранного периода.':'Пока показываем отдельные поступки без вывода о повторяющемся способе выбора.'}</p><Evidence items={d.evidence}/>{d.reviews.map(g=><article key={g.day}><p>День {g.day}: {({select:'Выбрал',keep:'Сохранил',clarify:'Уточнил',change:'Изменил'})[g.action]} цель — {g.wording}</p><details><summary>Сцены перед пересмотром</summary><Evidence items={game.history.filter(h=>h.day===g.day-1)}/></details></article>)}</details>)}
  <h3>Цель героя</h3>{report.goals.map(g=><article key={g.day}><p>День {g.day}: {({select:'Выбрал',keep:'Сохранил',clarify:'Уточнил',change:'Изменил'})[g.action]} — {g.wording}</p><Evidence items={game.history.filter(h=>h.day===g.day&&h.slot===0)}/></article>)}
 </section></main>;
}
