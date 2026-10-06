# RECONCILIATION-v2
## «Путь» v2.5 — нормативные уточнения перед repo-binding и разработкой

**Статус:** APPLIED — журнал нормативных решений; изменения встроены в handoff-документы  
**Дата:** 5 октября 2026  
**Назначение:** устранить оставшиеся логические и терминологические расхождения handoff-пакета без переписывания v2.4/v2.5.

---

# 0. Приоритет

Исторически patch имел следующий приоритет. В интегрированном handoff нормативные изменения уже внесены прямо в исходные документы:

1. `RECONCILIATION-v2.md`;
2. `IMPLEMENTATION-v2.5-DEVELOPMENT-CONTENT.md`;
3. `IMPLEMENTATION-v2.4-HERO-PROFILE-v2-reviewed.md`;
4. `*-final.md` content-файлы;
5. справочные документы.

Этот patch **не меняет** базовую цепочку:

```text
neutral/probe evidence
→ observedPrimary
→ developmentCurrent
→ active development arc
→ trial → consequence → review → transfer → pressure
→ pendingPromotion
→ evening promotion
```

---

# 1. Канонический словарь

В нормативных документах использовать следующие значения:

- `ActionLogic` — одна из восьми логик действия: `opportunist ... ironic`.
- `observedPrimary` — текущая устойчивая доминирующая ActionLogic по profile-eligible diagnostic evidence.
- `developmentCurrent` — последняя ActionLogic, принятая как исходная для развития либо подтверждённая завершённой development arc.
- `transitionTarget` — соседняя ActionLogic, осваиваемая текущей arc.
- `leadingEdge` — наблюдаемые признаки `next(developmentCurrent)`; сам по себе не является promotion.
- `fallback` — проявление более ранней логики под pressure; не является автоматическим regression.
- `emergingSignal` — признаки более дальней логики; не разрешают перескочить соседнюю arc.

Термины `стадия`, `центр`, `уровень` не использовать как отдельные runtime-сущности. В пользовательском тексте они допустимы только как редакционные слова, если не создают иной смысл.

`developmentWeight` сохраняется как legacy field ради совместимости. Его смысл в diagnostic content:

```text
diagnostic evidence weight
```

Он **не означает степень развития героя**.

---

# 2. Initial reconciliation: исправление ошибочного первого developmentCurrent

## 2.1. Проблема

Первый `developmentCurrent` устанавливается из первого stable `observedPrimary`. После этого обычное изменение `observedPrimary` не должно дёргать сюжетную arc. Однако ранняя диагностика может оказаться ошибочной.

Поэтому вводится **однократный initial rebase**, но только до существенного progression.

## 2.2. Дополнительное состояние

```ts
type DevelopmentCurrentOrigin =
  | "observed-initial"
  | "promotion";

initialRebaseCount: number; // 0 | 1
```

При первом создании:

```text
developmentCurrentOrigin = observed-initial
initialRebaseCount = 0
```

После любого настоящего promotion:

```text
developmentCurrentOrigin = promotion
```

## 2.3. Когда rebase разрешён

```text
canInitialRebase =
  developmentCurrentOrigin == "observed-initial"
  AND initialRebaseCount == 0
  AND observedPrimary is stable
  AND observedPrimary != developmentCurrent
  AND новое observedPrimary подтверждено двумя вечерними фиксациями
  AND между подтверждениями есть >= 2 новых profile-eligible action evidence
  AND нет valid evidence для consequence/review/transfer/pressure текущей arc
  AND pendingPromotion == false
```

Наличие только `trial` evidence не блокирует rebase.

## 2.4. Что делает rebase

```text
1. закрыть текущую activeArc с reason = initial-reconciliation;
2. diagnostic evidence не удалять и не пересчитывать задним числом;
3. development evidence старой arc сохранить в истории, но не переносить в новую arc;
4. developmentCurrent = observedPrimary;
5. developmentCurrentOrigin = observed-initial;
6. initialRebaseCount += 1;
7. выбрать adjacent arc от нового developmentCurrent;
8. transitionTarget = newArc.to;
9. pendingPromotion = false.
```

После первого `consequence` текущей arc либо после любого promotion rebase запрещён.

**Обычное последующее изменение `observedPrimary` по-прежнему не меняет `developmentCurrent`.**

---

# 3. Что означает `independent` для probe

`probe` выбирается на основе двух ведущих логик `currentDistribution`, поэтому статистически независимым от профиля он не является.

Нормативное значение старого слова `independent` в v2.4/v2.5:

> evidence, не выбранное по `developmentCurrent`, `activeArcId`, `transitionTarget` или adaptive/development hypothesis.

Для новой документации использовать термин:

```text
profile-eligible diagnostic evidence
```

В него входят:

```text
neutral + probe
```

При этом:

- `neutral` — profile-unconditioned sampling;
- `probe` — profile-conditioned diagnostic sampling;
- `adaptive` — не profile-eligible для подтверждения `observedPrimary`;
- лимит probe остаётся прежним: `< 1/3` diagnostic window;
- переименовывать существующие runtime поля только ради терминологии не требуется.

---

# 4. Retry: однозначная маршрутизация

Формальный граф раздела 12 v2.5 является каноном:

```text
withdrawal@trial       → retry-trial
withdrawal@consequence → retry-consequence
withdrawal@review      → retry-review
withdrawal@transfer    → retry-transfer
withdrawal@pressure    → retry-pressure
```

Карточки вида:

```text
dev.<arc>.retry.01
```

являются **только `retry-pressure`**.

Поэтому исправить `requires` для всех шести карточек:

```text
dev.od.retry.01
dev.de.retry.01
dev.ai.retry.01
dev.is.retry.01
dev.sa.retry.01
dev.alir.retry.01   // после rename из раздела 8
```

Было:

```text
withdrawal на transfer/pressure + cooldown
```

Должно быть:

```text
withdrawal@pressure + cooldown
```

`withdrawal@transfer` всегда маршрутизируется только в соответствующий `retry-transfer`.

Validator обязан проверять соответствие **beat → retry beat**, а не только существование любого retry в arc.

---

# 5. Context diversity

`contextId` остаётся **семантическим идентификатором задачи**, а не `cardId`.

Текущий neutral pool имеет 32 уникальных `contextId`; это допустимо, но одного `K >= 3` недостаточно, чтобы доказать разнообразие жизненных граней.

Для **первой установки stable `observedPrimary`** добавить дополнительную проверку:

```text
F = число разных facets среди исходных profile-eligible action cases окна
F >= 2
```

Для последующего обновления уже установленного `observedPrimary` новый facet-gate не требуется.

Не создавать отдельный `contextFamily` в v2.5, если repo ещё не имеет такой сущности: `contextId + facets` достаточно.

---

# 6. Aggregate LogicVector bias

Равный top-1 balance не гарантирует равного суммарного prior полного `LogicVector`.

Для текущих 128 main neutral action choices сумма весов равна:

```text
opportunist    11.25  (8.79%)
diplomat       13.65 (10.66%)
expert         19.05 (14.88%)
achiever       23.80 (18.59%)
individualist  21.90 (17.11%)
strategist     17.05 (13.32%)
alchemist      10.95  (8.55%)
ironic         10.35  (8.09%)
```

Поэтому добавить validator/report:

```text
check-aggregate-vector-bias
```

Он должен выводить по каждому diagnostic pool:

- число choices;
- top-1 count;
- сумму и среднее каждого LogicVector component;
- max/min и max-minus-min;
- распределение по facet и choice position.

В v2.5 это **calibration gate, а не runtime normalization**.

Запрещено автоматически "выравнивать" векторы при scoring. До production-enabled adaptation blind-review/calibration должен либо:

1. скорректировать содержательные векторы/пул;
2. либо документированно подтвердить, что наблюдаемый bias не создаёт систематического ложного stable-профиля в `simulate-profile`.

---

# 7. Probe checklist: control position

В `DIAGNOSTIC-PROBES-v1-final.md` фраза:

```text
вариант C является содержательным контролем вне пары
```

не является универсальной.

Каноническая ротация:

```text
*.01 → A=left,  B=right,   C=control
*.02 → A=right, B=control, C=left
*.03 → A=control,B=left,   C=right
```

Во всех 21 checklist заменить конкретную букву на:

> один вариант является содержательным контролем вне различаемой пары; его позиция соответствует rotation contract.

Validator должен проверять роль choice по metadata/LogicVector, а не по букве `A/B/C`.

---

# 8. ID последней arc

Префикс `dev.alir.*` для `alchemist → ironic` неоднозначен и не соответствует названию arc.

Так как repo-binding ещё `TODO`, выполнить rename до интеграции:

```text
dev.alir.* → dev.alir.*
```

Arc ID остаётся:

```text
alchemist-ironic
```

Обновить все внутренние `requires`, таблицы retry coverage, тестовые fixtures и references.

После repo-binding старый `dev.alir.*` не создавать как alias, если production save с ним ещё не существует.

---

# 9. Статусы и ссылки handoff

Исправить документные расхождения:

1. В `CONTENT-INTEGRATION-REVIEW-v1-final.md`:

```text
Final v2.5 spec TODO
```

заменить на:

```text
Final v2.5 spec DONE / patched by RECONCILIATION-v2
```

2. `Repo binding` и `Calibration` остаются `TODO`.

3. В нормативном списке источников v2.5 удалить `DEVELOPMENT-ARCS-v1.md` из обязательных/справочных файлов handoff. Его production-смысл уже перенесён в `DEVELOPMENT-PRODUCTION-CARDS-v1-final.md`.

4. Все ссылки на rubric/probes/neutral/cards должны указывать на реальные `*-final.md` имена.

5. README должен ставить `RECONCILIATION-v2.md` первым документом чтения.

---

# 10. Alchemist ↔ Ironic: ограничение интерпретации

Для пары `alchemist ↔ ironic` действие часто недостаточно для уверенного вывода о мотиве: одинаково простое действие может быть результатом разных ActionLogic.

Поэтому:

- action evidence этой пары не трактовать как доказательство внутреннего мотива;
- blind-review этой пары проводить отдельно;
- при calibration отдельно смотреть accuracy/confusion matrix `alchemist ↔ ironic`;
- motive/behavior evidence считать подтверждающим, но не увеличивать `N` вопреки правилам v2.4;
- не вводить специальный runtime shortcut только для этой пары до результатов calibration.

---

# 11. Граница модели: ActionLogic ≠ нравственность/духовность

ActionLogic описывает **сложность организации смысла и действия**, но не является прямой оценкой:

- доброты;
- честности;
- любви;
- нравственной ценности;
- духовной глубины человека.

Следовательно, UI/контент не должен утверждать:

```text
более поздняя ActionLogic = лучший / более духовный / более хороший человек
```

Если игре понадобится слой ценностей/духовной интеграции, он проектируется отдельно и не кодируется скрыто в `ActionLogic` или `LogicVector`.

Это не блокирует v2.5 implementation.

---

# 12. Новые/уточнённые validators

Обязательный набор после этого patch:

```text
check-choice-position-bias
check-choice-id-binding
check-retry-coverage
check-retry-beat-routing        // NEW
check-retry-cooldown
check-development-reachability
check-aggregate-vector-bias     // NEW
check-probe-role-rotation       // clarified
check-initial-rebase            // NEW
check-initial-stable-facet-diversity // NEW
```

Минимальные regression cases для `check-initial-rebase`:

```text
1. wrong-initial-center-before-consequence → rebase allowed
2. mismatch-after-consequence              → rebase forbidden
3. mismatch-after-promotion                → rebase forbidden
4. unstable-new-primary                    → rebase forbidden
5. second-rebase-attempt                    → rebase forbidden
```

---

# 13. Acceptance criteria после reconciliation

Пакет можно отдавать в repo-binding, если выполняется всё ниже:

- [x] reconciliation применён прямо к v2.5; отдельный приоритет patch больше не требуется;
- [x] `dev.*.retry.01` принимает только `withdrawal@pressure`;
- [x] `withdrawal@transfer` идёт только в `retry-transfer`;
- [x] реализован/запланирован однократный initial rebase;
- [x] `probe` не называется статистически независимым;
- [x] первая stable фиксация требует минимум 2 facets;
- [x] aggregate vector bias выводится validator-ом;
- [x] probe control не привязан к букве C;
- [x] `dev.si.*` переименован в `dev.alir.*` до repo-binding;
- [x] статусы и ссылки handoff согласованы;
- [x] UI не приравнивает ActionLogic к нравственной или духовной ценности;
- [ ] repo binding и calibration остаются обязательными gates перед production-enabled adaptation.

---

# 14. Что после этого НЕ надо переделывать

Этот patch не требует:

- менять 8 `ActionLogic`;
- переписывать scoring formula v2.4;
- менять `sourceWeights`;
- менять `windowCases`;
- менять provisional/stable thresholds;
- удалять двухвечернее подтверждение;
- менять лимит probe `< 1/3`;
- смешивать `observedPrimary` и `developmentCurrent`;
- переписывать существующую семантику `expert → achiever`;
- вводить девятую ActionLogic после `ironic`;
- вводить runtime normalization для исправления content bias.

После выполнения этого reconciliation следующая инженерная стадия — **repo-binding → validators/simulate-profile → blind calibration → production enablement**.
