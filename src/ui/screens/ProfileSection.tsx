import { useState } from 'react';
import { content } from '../../content';
import { ACTION_LOGICS, calculateProfileSlice, developmentScale, facetSufficient, largestRemainderPercent, leaders } from '../../engine';
import type { ActionLogic, GameState, LifeFacet } from '../../engine/types';
const facetNames: Record<LifeFacet, string> = { work: 'Дело и деньги', relationships: 'Отношения', body: 'Тело и здоровье', inner: 'Внутренний мир' };
const stage = (id: ActionLogic) => content.development.stages.find(s => s.id === id)!;
const sourceNames = { action: 'Решение', motive: 'Что было главным', behavior: 'Что герой сделал потом' } as const;
function Bars({ distribution }: { distribution: Record<ActionLogic, number> }) {
  const percent = largestRemainderPercent(distribution);
  return <ul className="profile-bars">{ACTION_LOGICS.map(l => <li key={l}><span>{stage(l).name}</span>
    <span className="bar" aria-hidden="true"><i style={{ width: `${percent[l]}%` }} /></span><output>{percent[l]}%</output></li>)}</ul>;
}
function Sources({ game, caseIds }: { game: GameState; caseIds: string[] }) {
  const p = game.heroDevelopmentProfile;
  return <details className="journal"><summary>Исходные события ({caseIds.length})</summary><div className="evidence">{caseIds.map(id => {
    const c = p.cases.find(x => x.id === id); if (!c) return null;
    const h = game.history.find(x => x.day === c.openedDay && x.slot === c.openedSlot);
    const rows = p.evidence.filter(e => e.caseId === id);
    return <article key={id}><p className="eyebrow">День {c.openedDay} · Событие {c.openedSlot + 1}</p><p>{h?.text}</p>
      {rows.map(e => { const later = e.source === 'behavior' ? game.history.find(x => x.day === e.day && x.slot === e.slot) : undefined;
        const motive = e.source === 'motive' ? content.cards.find(x => x.id === e.cardId)?.choices.concat(...(content.cards.find(x => x.id === e.cardId)?.choiceVariants ?? []).map(v => v.choices)).find(x => x.id === e.choiceId)?.diagnosticMotive?.options.find(o => o.id === e.motiveOptionId)?.label : undefined;
        return <p key={e.id}><strong>{sourceNames[e.source]}:</strong> {e.source === 'action' ? h?.label : e.source === 'motive' ? motive : later?.label}{e.selectionOrigin === 'adaptive' ? ' · сцена подобрана под текущий способ' : ''}</p>; })}
    </article>; })}</div></details>;
}
function Details({ game }: { game: GameState }) {
  const p = game.heroDevelopmentProfile; const config = content.profile.algorithms[p.algorithmVersion]!;
  const [scope, setScope] = useState<'current' | 'lifetime'>('current');
  const distribution = scope === 'current' ? p.currentDistribution : p.lifetimeDistribution;
  const independent = p.evidence.filter(e => e.source === 'action' && e.selectionOrigin !== 'adaptive').length;
  const caseIds = calculateProfileSlice(game, content, scope === 'current' ? { kind: 'current' } : { kind: 'lifetime' }).caseIds;
  return <details className="journal"><summary>Подробнее</summary>
    <div className="periods" role="group" aria-label="Период наблюдений">{(['current', 'lifetime'] as const).map(k => <button key={k} className="choice-button" aria-pressed={scope === k} onClick={() => setScope(k)}>{k === 'current' ? 'Последний этап' : 'Весь путь'}</button>)}</div>
    {distribution ? <Bars distribution={distribution} /> : <p>Для этого периода пока нет наблюдений.</p>}
    <p className="profile-note">Достаточность наблюдений: {Math.round(p.confidence * 100)}%. Это не вероятность диагноза, а то, насколько хватает разных решений в разных обстоятельствах. Независимых решений: {independent}.</p>
    <p className="profile-note">«Весь путь» включает и сцены, подобранные под текущий способ героя; «Последний этап» их не учитывает.</p>
    <Sources game={game} caseIds={caseIds} />
    {FACET_ORDER.filter(f => scope === 'current' ? p.facets[f].sufficient : facetSufficient(p.facets[f].lifetime, config)).map(f => {
      const s = scope === 'current' ? p.facets[f].current : p.facets[f].lifetime;
      return s?.distribution ? <section key={f}><h4>{facetNames[f]}</h4><Bars distribution={s.distribution} /></section> : null; })}
  </details>;
}
const pct = (x: number) => `${Math.min(100, Math.max(0, x * 100))}%`;
const LAST = ACTION_LOGICS.length - 1;
/** Moves after every decision; the center (the label) below it changes only through the evenings. */
function Scale({ game }: { game: GameState }) {
  const s = developmentScale(game, content); const p = game.heroDevelopmentProfile;
  if (!s) return null;
  const nearest = ACTION_LOGICS[Math.round(s.position * LAST)]!;
  const shift = s.previousPosition === undefined ? undefined : (s.position - s.previousPosition) * LAST;
  const center = p.observedPrimary;
  return <div className="dev-scale">
    <div className="dev-scale-track" role="img" aria-label={`Последние решения ближе всего к способу «${stage(nearest).name}»`}>
      {ACTION_LOGICS.map((l, i) => <span key={l} className="dev-scale-tick" style={{ left: pct(i / LAST) }} title={stage(l).name} />)}
      {center && <span className={`dev-scale-pin${p.status === 'stable' ? '' : ' unsettled'}`} style={{ left: pct(ACTION_LOGICS.indexOf(center) / LAST) }} title={`Центр: ${stage(center).name}`} />}
      {s.previousPosition !== undefined && <span className="dev-scale-ghost" style={{ left: pct(s.previousPosition) }} />}
      <span className="dev-scale-marker" style={{ left: pct(s.position) }} />
    </div>
    <div className="dev-scale-numbers" aria-hidden="true">{ACTION_LOGICS.map((l, i) => <span key={l} style={{ left: pct(i / LAST) }}>{i}</span>)}</div>
    <div className="dev-scale-ends"><span>{stage(ACTION_LOGICS[0]!).name}</span><span>{stage(ACTION_LOGICS[LAST]!).name}</span></div>
    <p className="dev-scale-caption">Сейчас на шкале <strong>{(s.position * LAST).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>: последние решения ближе всего к способу «{stage(nearest).name}» ({ACTION_LOGICS.indexOf(nearest)}).
      {shift !== undefined && (Math.abs(shift) < 0.15 ? ' С прошлого вечера шкала почти не сдвинулась.' : ` С прошлого вечера она сдвинулась ${shift > 0 ? 'вправо' : 'влево'}.`)}</p>
    <p className="dev-scale-center">{center ? <>Центр героя: <strong>{stage(center).name}</strong>{p.status === 'stable' ? '' : ' — уточняется'}</> :
      <>Центр героя пока не определён. Шкала двигается после каждого решения, а центр закрепляется, только когда способ устойчиво повторяется и вечер это подтверждает.</>}</p>
  </div>;
}
const FACET_ORDER: LifeFacet[] = ['work', 'relationships', 'body', 'inner'];
export function ProfileSection({ game }: { game: GameState }) {
  const p = game.heroDevelopmentProfile;
  const recent = p.cases.slice(-5).map(c => game.history.find(h => h.day === c.openedDay && h.slot === c.openedSlot)).filter(Boolean);
  let body;
  if (!p.evidence.length) body = <p>Наблюдения появятся после решений героя.</p>;
  else if (p.status === 'insufficient') body = <><p>Решений пока мало, чтобы говорить о том, как герой обычно поступает. Вот отдельные поступки:</p>
    <div className="evidence">{recent.map(h => <article key={`${h!.day}/${h!.slot}`}><p className="eyebrow">День {h!.day} · Событие {h!.slot + 1}</p><p>{h!.text}</p><p><strong>{h!.label}</strong></p></article>)}</div></>;
  else if (p.status === 'provisional') {
    const top = p.currentDistribution ? leaders(p.currentDistribution).slice(0, 2) : [];
    body = <>{p.observedPrimary && <p>Прежний вывод уточняется: в последних решениях способы смешались.</p>}
      {top.length === 2 && <p>В последних решениях встречаются разные способы смотреть на ситуации: например, через {stage(top[0]!).lens} и через {stage(top[1]!).lens}. Это пока наблюдение, а не вывод о герое.</p>}</>;
  } else {
    const main = stage(p.observedPrimary!);
    body = <><p>Сейчас герой чаще смотрит на ситуации через {main.lens}.</p>
      {p.leadingEdge && <p>В некоторых решениях появляется вопрос: {stage(p.leadingEdge).wonder}.</p>}</>;
  }
  return <section aria-label="Как герой решает"><h3>Как герой принимает решения</h3><Scale game={game} />{body}{p.status === 'stable' && <Details game={game} />}</section>;
}
