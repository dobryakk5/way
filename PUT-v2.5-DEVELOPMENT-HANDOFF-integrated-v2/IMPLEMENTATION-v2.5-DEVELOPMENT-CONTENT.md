# ТЗ на реализацию: «Путь» v2.5 — диагностический контент и 7 линий развития

**Статус:** готово к передаче разработчику как интеграционное ТЗ.  
**Дата:** 5 октября 2026  
**Зависимость:** `IMPLEMENTATION-v2.4-HERO-PROFILE-v2-reviewed.md`  
**Главное ограничение:** до включения adaptive/profile-driven контента обязательны blind-review, `simulate-profile` и repo-binding.

---

# 1. Цель поставки

v2.5 не меняет базовую идею v2.4:

```text
открытые ситуации
→ profile-eligible diagnostic evidence (`neutral | probe`)
→ профиль героя
→ устойчивый observedPrimary
→ developmentCurrent
→ реальный опыт следующего способа
→ promotion
```

v2.5 добавляет полноценный **контентный слой** для этой архитектуры:

1. канонический rubric восьми логик;
2. 32 profile-unconditioned neutral-ситуации;
3. 21 profile-conditioned probe-сцену для семи соседних пар;
4. 50 новых production-карточек для шести отсутствующих development arcs;
5. полную цепочку соседних переходов от Opportunist до Ironic;
6. закрытый retry-граф для ранних и поздних withdrawal;
7. новые content validators;
8. калибровочный и repo-binding gate перед включением адаптации.

После v2.5 ситуация «центр установлен, но для него нет развития» остаётся только для `ironic`, потому что вертикальная следующая стадия для него в этой версии не вводится.

---

# 2. Источники и приоритет документов

## 2.1. Нормативные документы

При реализации использовать в таком порядке приоритета:

1. **Этот документ** — `IMPLEMENTATION-v2.5-DEVELOPMENT-CONTENT.md`.
2. `IMPLEMENTATION-v2.4-HERO-PROFILE-v2-reviewed.md` — профиль, evidence, cases, selectionOrigin, scoring, saves, UI и вечерняя фиксация, если v2.5 явно не меняет правило.
3. `DEVELOPMENT-RUBRIC-v1-final.md` — канонический authoring rubric.
4. `DIAGNOSTIC-PROBES-v1-final.md` — 21 probe-сцена.
5. `NEUTRAL-DIAGNOSTIC-CONTENT-v1-final.md` — 32 neutral-ситуации + motive/behavior продолжения.
6. `DEVELOPMENT-PRODUCTION-CARDS-v1-final.md` — 50 production development-карточек.

## 2.2. Аудит

`CONTENT-INTEGRATION-REVIEW-v1-final.md` фиксирует выполненный reconciliation и обязательные следующие quality gates.

## 2.3. Справочные документы

Следующие документы используются для понимания смысла, но не переопределяют финальные production-данные:

- `DEVELOPMENT-MODEL-v1.md`;
- `DEVELOPMENT-BEHAVIOR-MATRIX-v1.md`.

Если старый документ расходится с `*-final.md`, использовать `*-final.md`.

---

## 2.4. Канонический словарь v2.5

- `ActionLogic` — одна из восьми логик действия `opportunist ... ironic`.
- `observedPrimary` — текущая устойчивая доминирующая ActionLogic по profile-eligible diagnostic evidence.
- `developmentCurrent` — последняя ActionLogic, принятая как исходная для развития либо подтверждённая завершённой development arc.
- `transitionTarget` — соседняя ActionLogic, осваиваемая текущей arc.
- `leadingEdge` — признаки `next(developmentCurrent)`; сам по себе не является promotion.
- `fallback` — более ранняя логика под pressure; не является автоматическим regression.
- `emergingSignal` — признаки более дальней логики; не позволяет перескочить соседнюю arc.
- `profile-eligible diagnostic evidence` — `neutral + probe`. `neutral` profile-unconditioned; `probe` profile-conditioned по `currentDistribution`.

Термины «стадия», «центр», «уровень» не создают дополнительных runtime-сущностей. `developmentWeight` — legacy technical name для diagnostic evidence weight и не означает степень развития героя.

# 3. Что v2.5 изменяет относительно v2.4

v2.4 сознательно допускал MVP, в котором реальная arc существовала только для:

```text
expert → achiever
```

В v2.5 это ограничение снимается.

Целевая цепочка:

```text
opportunist
→ diplomat
→ expert
→ achiever
→ individualist
→ strategist
→ alchemist
→ ironic
```

Реализация:

| From | To | Источник |
|---|---|---|
| `opportunist` | `diplomat` | новая production arc v2.5 |
| `diplomat` | `expert` | новая production arc v2.5 |
| `expert` | `achiever` | существующая arc, не переписывать |
| `achiever` | `individualist` | новая production arc v2.5 |
| `individualist` | `strategist` | новая production arc v2.5 |
| `strategist` | `alchemist` | новая production arc v2.5 |
| `alchemist` | `ironic` | новая production arc v2.5 |
| `ironic` | — | вертикального перехода в v2.5 нет |

`Ironic` не получает искусственную девятую стадию. Интеграционные испытания поздней игры — отдельная будущая задача.

---

# 4. Что не менять

Без отдельного решения не менять:

- восемь значений `ActionLogic`;
- формулу scoring v2.4;
- `sourceWeights`;
- `windowCases`;
- пороги provisional/stable;
- двухвечернее подтверждение;
- требование минимум 2 новых profile-eligible action (`neutral | probe`; legacy counter `independent`) между подтверждениями;
- максимум `1/3` probe в profile-eligible window (legacy `independentN`);
- различие `lifetimeDistribution` и `currentDistribution`;
- правило, что `adaptive` не подтверждает `observedPrimary`;
- `developmentCurrent` отдельно от `observedPrimary`;
- вечерний promotion;
- существующую семантику `expert → achiever`;
- существующие v5 save semantics, кроме явно добавленного reconciliation-state (`initialRebaseCount` и нормализация legacy `currentOrigin = transition`), для которого действует раздел 24.

Веса и векторы контента **не корректировать на глаз во время интеграции**. Их содержательная переразметка делается только после blind-review/calibration.

---

# 5. Пакет контента v2.5

## 5.1. Rubric

Файл:

```text
DEVELOPMENT-RUBRIC-v1-final.md
```

Содержит:

- 8 логик;
- 6 обязательных осей:
  - `SELF`
  - `OTHERS`
  - `COMPLEXITY`
  - `TIME`
  - `PERSPECTIVE`
  - `UNCERTAINTY`
- 7 соседних границ;
- false-positive правила;
- authoring policy для `LogicVector`;
- `developmentWeight`;
- blind-review procedure;
- position-bias policy.

Runtime не классифицирует текст по rubric. Rubric нужен:

- content validator;
- debug/audit;
- редакторам;
- calibration report.

Для первой версии:

```text
rubricVersion = "1"
scoringVersion = "1"
algorithmVersion = "1"
```

---

## 5.2. Neutral pool

Файл:

```text
NEUTRAL-DIAGNOSTIC-CONTENT-v1-final.md
```

Пакет:

```text
32 main neutral situations
4 facets × 8 situations
128 action choices
8 motive prompts
4 behavior continuations
8 pressure situations
32 unique contextId
```

Каждая main neutral card:

```text
selectionOrigin = neutral
developmentWeight = 1.0
```

Main pool:

- не зависит от `developmentCurrent`;
- не зависит от `observedPrimary`;
- не зависит от `leadingEdge`;
- не зависит от `activeArcId`;
- не получает stage/profile gating;
- входит в `currentDistribution`, когда реально показан как `neutral`.

### Баланс позиций

В основном пуле:

```text
для каждой из 8 top-1 логик:
A = 4
B = 4
C = 4
D = 4
```

Это обязательный invariant конкретного v1-пакета.

---

## 5.3. Probe pool

Файл:

```text
DIAGNOSTIC-PROBES-v1-final.md
```

Пакет:

```text
21 scenes
7 adjacent pairs
3 scenes per pair
3 choices per scene
63 choices
```

Пары:

```text
Opportunist ↔ Diplomat
Diplomat ↔ Expert
Expert ↔ Achiever
Achiever ↔ Individualist
Individualist ↔ Strategist
Strategist ↔ Alchemist
Alchemist ↔ Ironic
```

Каждая probe card:

```text
selectionOrigin = probe
diagnostic.distinguishes = [left, right]
```

Probe не stage-gated и не development-gated.

### Role rotation

В каждой тройке одной пары:

```text
.01  A=left    B=right   C=control
.02  A=right   B=control C=left
.03  A=control B=left    C=right
```

`control` — правдоподобный вариант, лидирующий вне целевой пары.

Это обязательный invariant v1.

---

## 5.4. Development cards

Файл:

```text
DEVELOPMENT-PRODUCTION-CARDS-v1-final.md
```

Содержит **50 новых карточек** для шести arc:

```text
opportunist → diplomat
diplomat → expert
achiever → individualist
individualist → strategist
strategist → alchemist
alchemist → ironic
```

`expert → achiever` не переписывается.

Все новые development cards:

```text
selectionOrigin = adaptive
```

Они:

- дают `DevelopmentEvidence`;
- не подтверждают `currentDistribution`;
- не подтверждают `observedPrimary`;
- не меняют `developmentCurrent` напрямую;
- promotion делают только через существующий `developmentProgress()` / вечерний commit.

### Position balance development cards

В 50 карточках target development choice распределён:

```text
position 1 = 17
position 2 = 17
position 3 = 16
```

Смысл и event всегда привязаны к `choiceId`, а не к позиции.

---

# 6. Runtime mapping диагностического контента

## 6.1. Neutral card

Authoring source переводится в существующую `Card` schema v2.4:

```text
diagnostic.situationId
diagnostic.contextId
diagnostic.facets
diagnostic.developmentWeight
diagnostic.pressure?
diagnostic.expiresInDays?
```

У каждого диагностического choice:

```text
choice.id
choice.diagnosticAction.vector
choice.diagnosticAction.rationale
choice.diagnosticAction.scoringVersion = "1"
choice.diagnosticAction.rubricVersion = "1"
```

Если у сцены есть motive:

```text
choice.diagnosticMotive
```

Если continuation является behavior старого кейса:

```text
choice.diagnosticBehavior.continuesSituationId
```

Не создавать второй формат данных специально для v2.5.

---

## 6.2. Probe card

То же, что neutral, плюс:

```text
diagnostic.distinguishes = [logicA, logicB]
```

`distinguishes` не означает, что все варианты обязаны принадлежать только этим двум логикам.

В v1 как раз требуется контрольный вариант вне пары.

---

## 6.3. Development card

Точный runtime shape брать из уже существующей development/card schema репозитория.

Содержательно каждая карточка должна сохранить:

```text
cardId
arcId
developmentFunction
contextId
facet
cast/NPC binding
requires
choices[].choiceId
choices[].developmentEvent?
world effects
scheduled continuation
```

Не создавать новый параллельный runtime `DevelopmentCard`, если текущая карточная модель уже поддерживает необходимую семантику.

---

# 7. Choice order и `choiceId`

## 7.1. Главный принцип

Логика выбора всегда привязана к:

```text
cardId + choiceId
```

Запрещено:

```text
if choiceIndex === 1 -> trial
if choiceIndex === 2 -> withdrawal
```

или аналогичная привязка vector/event к индексу массива.

## 7.2. Runtime shuffle

Специально добавлять shuffle ради v2.5 **не требуется**: контент уже position-balanced.

Если текущий UI уже перемешивает choices либо shuffle будет включён:

1. порядок генерируется один раз при первом показе;
2. порядок сохраняется вместе с current/case snapshot;
3. reload не меняет порядок;
4. `diagnosticAction` и `developmentEvent` разрешаются по `choiceId`.

---

# 8. Selector

Использовать правила v2.4.

Приоритет обязательных событий остаётся выше диагностики:

```text
current
→ fixed at
→ route
→ capacity obligations
→ crisis
→ mustShowBy
→ scheduled
```

После обязательного слоя:

```text
→ обязательный следующий beat active development arc
→ probe, если нужен и разрешён лимитом
→ adaptive/free
→ neutral
```

Конкретная реализация обязана соблюдать независимость, а не только этот текстовый порядок.

---

## 8.1. До первого stable center

Свободный диагностический контент:

```text
neutral / probe only
```

Никакая development arc до установки `developmentCurrent` не запускается.

---

## 8.2. Probe selection

Probe можно выбирать, если:

- есть минимум две определяемые ведущие логики в `currentDistribution`;
- stable ещё нет либо верх профиля неоднозначен;
- `probeCount / independentN < 1/3`, где `independentN` — legacy runtime name для числа profile-eligible (`neutral | probe`) cases;
- существует доступная сцена, `distinguishes` которой содержит две ведущие логики.

Две ведущие логики берутся **только** из:

```text
currentDistribution
```

Не из lifetime.

---

## 8.3. Profile-eligible quota (`independent*` — legacy runtime naming)

Сохранить v2.4:

- после adaptive свободного diagnostic case следующий свободный диагностический case должен быть profile-eligible (`neutral | probe`), если контент доступен;
- probe не закрывает всю квоту;
- при лимите probe selector выбирает neutral;
- до 3 profile-eligible cases — максимум 1 probe.

---

## 8.4. Facet diversity первой stable-фиксации

Для **первой** установки stable `observedPrimary` одного `K >= 3` недостаточно. Дополнительно:

```text
F = число разных facets среди исходных profile-eligible action cases окна
F >= 2
```

Для последующего обновления уже когда-либо установленного `observedPrimary` этот facet-gate не требуется. `contextId` остаётся семантическим идентификатором задачи; отдельный `contextFamily` в v2.5 не вводится.

---

# 9. Запуск development arc

После того как `developmentCurrent` существует:

```text
from = developmentCurrent
```

Если для `from` существует соседняя arc и нет другой активной arc:

```text
activeArcId = corresponding arc
transitionTarget = arc.to
```

Условия diagnostic profile после этого не являются prerequisite progression.

То есть активная arc не должна внезапно исчезнуть только потому, что `observedPrimary` позже изменился.

---

## 9.1. Initial reconciliation: однократный rebase ошибочного первого центра

Обычное изменение `observedPrimary` не должно дёргать active arc. Но до существенного progression разрешён один initial rebase, если ранняя первая фиксация оказалась ошибочной.

Дополнительное состояние:

```ts
currentOrigin?: "observed-initial" | "promotion" | "legacy-authored";
initialRebaseCount: 0 | 1;
```

Условие:

```text
canInitialRebase =
  currentOrigin == "observed-initial"
  AND initialRebaseCount == 0
  AND observedPrimary is stable
  AND observedPrimary != developmentCurrent
  AND новое observedPrimary подтверждено двумя вечерними фиксациями
  AND между подтверждениями есть >= 2 новых profile-eligible action evidence
  AND нет valid evidence для consequence/review/transfer/pressure текущей arc
  AND pendingPromotion == false
```

Только `trial` rebase не блокирует. При rebase старая arc закрывается с `reason = initial-reconciliation`; diagnostic evidence сохраняется; development evidence старой arc остаётся в истории, но не переносится; `developmentCurrent = observedPrimary`; `initialRebaseCount = 1`; выбирается новая adjacent arc; `pendingPromotion = false`.

После первого consequence, любого promotion, legacy-authored старта или первого rebase повторный rebase запрещён.

---

# 10. Arc registry

Реестр соседних arc должен содержать:

```text
opportunist-diplomat
diplomat-expert
expert-achiever
achiever-individualist
individualist-strategist
strategist-alchemist
alchemist-ironic
```

Для `ironic`:

```text
nextArc = undefined
```

Это валидное состояние, не ошибка.

Если в repo уже существует registry/definition текущей `expert-achiever`, расширить его. Не создавать конкурирующий реестр.

---

# 11. Development progress

Каждая arc должна проверять минимум:

```text
trial
consequence
review
transfer
pressure
```

Успешный прямой путь:

```text
trial
→ consequence
→ review
→ transfer
→ pressure
→ pendingPromotion
→ evening commit
```

`pendingPromotion` не означает немедленную смену `developmentCurrent`.

---

# 12. Retry state machine

## 12.1. Семантика

`withdrawal` означает:

> beat не освоен в этой попытке.

Он не:

- стирает предыдущие валидные evidence;
- понижает `developmentCurrent`;
- меняет diagnostic percentages;
- считается «проигрышем».

## 12.2. Формальный граф

```text
withdrawal@trial
  → cooldown
  → retry-trial
  → trial evidence
  → consequence

withdrawal@consequence
  → cooldown
  → retry-consequence
  → consequence evidence
  → review

withdrawal@review
  → cooldown
  → retry-review
  → review evidence
  → transfer

withdrawal@transfer
  → cooldown
  → retry-transfer
  → transfer evidence
  → pressure

withdrawal@pressure
  → cooldown
  → retry-pressure
  → pressure evidence
  → pendingPromotion
```

## 12.3. Cooldown

Для любого retry:

```text
1 completed evening
OR
2 resolved non-arc choices
```

Не показывать retry немедленно.

## 12.4. Первый незавершённый beat

Scheduler определяет:

```text
first required beat without valid evidence
```

Если после последней попытки этого beat записан withdrawal:

- до cooldown beat недоступен;
- после cooldown выбирается соответствующий `retry-*`.

Нельзя после `withdrawal@trial` перескочить сразу к `retry-pressure`.

---

# 13. Retry coverage v1

Текущий пакет имеет:

| Arc | retry-trial | retry-consequence | retry-review | retry-transfer | retry-pressure |
|---|---|---|---|---|---|
| O→D | yes | — | yes | yes | yes |
| D→E | yes | yes | — | yes | yes |
| A→I | yes | — | — | yes | yes |
| I→S | yes | — | — | yes | yes |
| S→Al | yes | — | — | yes | yes |
| Al→Ir | yes | — | — | yes | yes |

Знак `—` означает, что текущие production choices этого beat не создают reachable withdrawal.

Если редактор позже добавляет withdrawal туда, где retry отсутствует, validator обязан отклонить контент.

---

# 14. Scheduling development cards

Базовый ритм:

```text
trial
→ 1–3 ordinary decisions
→ consequence
→ review
→ >= 2 ordinary decisions OR day boundary
→ transfer
→ ordinary life
→ pressure
```

Не показывать все beats как отдельный учебный блок подряд.

Обязательные fixed/route/capacity/crisis/mustShowBy/scheduled события имеют приоритет.

Development content не должен ломать календарь.

---

# 15. Repo-binding — обязательный первый integration step

Authoring content намеренно использует ролевые NPC и смысловые `worldEffectSpec`.

До переноса карточек в runtime разработчик должен сделать `CONTENT-BINDING-MAP-v1.md` или эквивалентный машинно-проверяемый mapping.

## 15.1. NPC binding

Сопоставить:

```text
npc.colleague.primary
npc.colleague.senior
npc.manager.primary
npc.close.primary
npc.close.secondary
npc.partner.primary
npc.specialist.primary
npc.specialist.secondary
npc.family.group
npc.team
npc.team.a
npc.team.b
npc.acquaintance.primary
npc.authority.primary
```

с реальными существующими NPC.

Правило:

> не создавать нового NPC, если сюжетную функцию уже выполняет существующий персонаж.

Если подходящего NPC нет — это контентное решение, которое надо зафиксировать отдельно, а не молча придумывать в коде.

## 15.2. Effects

Каждый `worldEffectSpec` перевести в существующие runtime-механизмы:

```text
facts
resources
scheduled
relationships
flags
existing effect types
```

Не оставлять consequence только литературным текстом, если он должен влиять на мир.

## 15.3. Requires

Текстовые `requires` перевести в реальные conditions текущей schema.

## 15.4. Calendar

Для всех 50 карточек указать:

- доступные дни/окна;
- conflict rules;
- capacity impact;
- `mustShowBy`, если действительно нужен;
- scheduled delay consequence;
- cooldown compatibility.

---

# 16. Контентные валидаторы v2.5

Расширить `check-content` / semantic validator.

## 16.1. Базовые v2.4 проверки

Сохраняются все проверки:

- vector keys;
- finite values;
- nonnegative;
- sum;
- minimum two nonzero;
- max component;
- rationale six axes;
- valid facets/context;
- valid `distinguishes`;
- no malformed behavior/motive links.

## 16.2. `check-choice-position-bias`

### Neutral v1

Проверить в main pool:

```text
32 situations
128 action choices
8 top-1 per logic? NO:
16 top-1 choices per logic
and for each logic:
A=4 B=4 C=4 D=4
```

### Probe v1

Для каждой пары проверить rotation:

```text
.01 left/right/control
.02 right/control/left
.03 control/left/right
```

### Development v1

Для 50 новых cards:

```text
target positions = [17,17,16] in any order of counts by slot,
max(count)-min(count) <= 1
```

Точная текущая ожидаемая матрица:

```text
position1 = 17
position2 = 17
position3 = 16
```

---

## 16.3. `check-choice-id-binding`

Validator/test должен доказать:

- `choiceId` уникален внутри card;
- vector/event/effect связаны с `choiceId`;
- перестановка массива choices не меняет семантику;
- reload не меняет уже показанный порядок.

---

## 16.4. `check-retry-coverage`

Для каждой reachable development choice:

если:

```text
developmentEvent = withdrawal
```

то validator определяет beat и проверяет существование достижимого retry этого beat.

Исключение допускается только если arc после withdrawal намеренно завершается навсегда — в текущем v1 таких исключений нет.

---

## 16.5. `check-retry-cooldown`

Ни один `retry-*` не должен быть eligible:

```text
immediately after withdrawal
```

до выполнения cooldown.

---

## 16.6. `check-development-reachability`

Для каждой из шести новых arc доказать достижимость:

```text
control
trial-withdrawal
fast-mastery
mastery-after-retry
```

Для существующей `expert-achiever` сохранить прежние 4 regression scenarios.

---

## 16.7. Content counts

Для конкретного v1 package проверить:

```text
neutral main = 32
probe = 21
probe per pair = 3
new development cards = 50
unique new development cardId = 50
neutral contextId = 32 unique
neutral facets = 8/8/8/8
neutral pressure = 8
motive prompts = 8
behavior continuations = 4
```

---

## 16.8. `check-retry-beat-routing`

Проверить строгий контракт:

```text
withdrawal@trial       → retry-trial
withdrawal@consequence → retry-consequence
withdrawal@review      → retry-review
withdrawal@transfer    → retry-transfer
withdrawal@pressure    → retry-pressure (`dev.<arc>.retry.01`)
```

`retry.01` не может закрывать withdrawal@transfer.

## 16.9. `check-aggregate-vector-bias`

Для каждого diagnostic pool вывести число choices, top-1 count, сумму/среднее каждого `LogicVector` component, max/min, max-minus-min и распределение по facet/choice position. Это calibration report, не runtime normalization.

## 16.10. `check-probe-role-rotation`

Роль control проверяется по semantic role/metadata/LogicVector, а не по букве A/B/C. Контракт `.01/.02/.03` должен совпадать с rotation matrix раздела 16.2.

## 16.11. `check-initial-rebase`

Минимум regression cases:

```text
wrong-initial-center-before-consequence → allowed
mismatch-after-consequence              → forbidden
mismatch-after-promotion                → forbidden
unstable-new-primary                    → forbidden
second-rebase-attempt                    → forbidden
```

## 16.12. `check-initial-stable-facet-diversity`

Первая stable-фиксация обязана иметь `F >= 2`; последующее обновление уже существовавшего `observedPrimary` не блокируется этим gate.

---

# 17. Нельзя использовать «позицию» как сигнал

Ни diagnostic engine, ни development engine не имеют права читать:

```text
A/B/C/D
index 0/1/2/3
```

как содержательный признак.

Даже при статичном UI position balance остаётся защитой от игрового угадывания, а не частью алгоритма.

---

# 18. Blind-review gate

До production-enabled profile adaptation подготовить экспорт:

```text
CALIBRATION-BLIND-PACK-v1
```

В нём второй редактор видит:

- текст ситуации;
- тексты choices;
- rubric.

Не видит:

- `Lead`;
- исходный `LogicVector`;
- исходную позицию choice;
- предполагаемую «следующую стадию».

Для каждого диагностического choice редактор указывает:

```text
top1
optional top2
pair actually distinguished
motive-guessing flag
moral-language flag
```

Критерии:

```text
Cohen's kappa top-1 >= 0.70
original top-1 ∈ independent editor top-2 >= 90%
```

Если вариант не проходит:

1. сначала переписать формулировку;
2. либо смягчить vector;
3. либо исключить из profile-eligible diagnostic pool.

Нельзя сохранять спорный текст и просто увеличивать числовой вес.

---

## 18.1. Отдельная проверка `alchemist ↔ ironic`

Для этой пары action evidence не трактуется как доказательство внутреннего мотива само по себе. Calibration отдельно считает accuracy/confusion matrix `alchemist ↔ ironic`. Motive/behavior могут подтверждать вывод, но не увеличивают `N` без нового action case. Специальный runtime shortcut до результатов calibration запрещён.

---

# 19. `simulate-profile`

Скрипт:

```text
scripts/simulate-profile.ts
```

или эквивалент существующей scripts-архитектуры.

Отчёт должен содержать:

- seed;
- выбранные cases;
- origin;
- contexts;
- source evidence;
- evening snapshots;
- candidate/stable;
- profile-eligible actions between confirmations;
- final primary;
- confusion matrix.

## 19.1. Обязательные траектории

- 8 target logics;
- mixed;
- insufficient;
- change over time;
- motive vs later behavior disagreement;
- adaptive-heavy;
- context-poor;
- repeated evening without new action;
- probe-heavy reaching `1/3` limit.

Для каждого из 8 target:

```text
>= 20 seeds/trajectories
```

Итого минимум 160 target simulation runs плюс специальные сценарии.

## 19.2. Пороги

```text
target stable hit-rate >= 95%
non-adjacent wrong-center <= 2%
mixed false-stable <= 10%
insufficient false-stable = 0%
adaptive-only false-stable = 0%
```

## 19.3. Position strategy regression

Дополнительно прогнать четыре искусственные стратегии:

```text
always choose A
always choose B
always choose C
always choose D
```

на neutral main pool.

Цель проверки:

> сама позиция ответа не создаёт систематического prior к одной стадии.

Поскольку v1 neutral pool имеет 4/4/4/4 для каждого top-1, структурный результат должен быть нейтральным по position bias.

---

# 20. Timing audit теперь для всех outgoing arcs

v2.4 проверял timing в основном для `Expert → Achiever`, потому что это была единственная готовая arc.

v2.5 должен проверить **все 7 outgoing arcs**:

```text
O→D
D→E
E→A
A→I
I→S
S→Al
Al→Ir
```

Для каждой:

- earliest / median / P90 момента установки соответствующего `developmentCurrent`;
- число eligible slots после этого;
- минимальный путь arc;
- retry reserve;
- влияние fixed/scheduled/capacity events.

Если текущий эпизод обязан завершить arc внутри себя:

```text
P90 remaining eligible slots >= minArcSlots + 2
```

Если текущая архитектура разрешает arc переходить границу эпизода, вместо этого обязателен integration test сохранения active arc через эту границу.

Не вводить молча новый продуктовый режим. Выбрать один из двух вариантов после repo-аудита и зафиксировать в binding report.

---

# 21. Existing `expert → achiever`

Существующую arc:

- не переименовывать;
- не менять рабочие card IDs без миграционной причины;
- не переписывать как новые v2.5 cards;
- проверить по общему semantic contract:
  `trial → consequence → review → transfer → pressure`.

Обязательные regression scenarios:

```text
control
trial-withdrawal
fast-mastery
mastery-after-retry
```

Если текущая arc не имеет полного retry по новым правилам, сначала документировать расхождение. Не менять её без отдельного regression-safe patch.

---

# 22. Development integration scenarios

Для **каждой из шести новых arc** минимум:

## A. Control

Игрок выбирает старый способ.

Ожидание:

```text
developmentCurrent remains from
no promotion
calendar valid
```

## B. Withdrawal

Игрок получает target evidence на части beats и делает withdrawal.

Ожидание:

```text
previous valid evidence remains
retry blocked by cooldown
promotion absent
```

## C. Fast mastery

```text
trial
consequence
review
transfer
pressure
```

Ожидание:

```text
pendingPromotion exactly once
promotion only at evening
developmentCurrent = to
to ∈ available
```

## D. Mastery after retry

Ожидание:

- retry закрывает только свой beat;
- старый evidence не дублируется;
- promotion один раз;
- reload не меняет progress.

Итого:

```text
6 new arcs × 4 = 24 scenarios
+ 4 existing expert-achiever regressions
>= 28 development integration scenarios
```

---

# 23. Reload/idempotency tests

Обязательные точки reload:

- после показа neutral до choice;
- после diagnostic action;
- на motive prompt;
- после skip motive;
- после behavior;
- после показа probe;
- после каждого development beat;
- сразу после withdrawal;
- во время retry cooldown;
- после retry evidence;
- при `pendingPromotion`;
- после evening promotion.

Повторная обработка:

```text
same runId + cardId + choiceId
```

не должна дублировать ни diagnostic, ни development evidence.

---

# 24. Сохранения

Новые статические cards сами по себе не требуют повышения `GAME_STATE_VERSION`. Однако reconciliation добавляет persisted state:

```text
initialRebaseCount: 0 | 1
currentOrigin: observed-initial | promotion | legacy-authored
```

Если v5 **уже выпускался или существуют реальные v5 saves**, repo-binding обязан повысить save version и добавить migration:

```text
old initialRebaseCount missing → 0
legacy currentOrigin = transition → promotion
legacy-authored остаётся legacy-authored
```

Если v5 ещё не был выпущен и находится только в незавершённой ветке реализации, поле можно встроить в v5 до release — это решение фиксируется в `CONTENT-BINDING-MAP-v1.md`.

Остальное предпочтительно не дублировать в persisted state:

- retry progress восстанавливать из существующего `DevelopmentEvidence`;
- cooldown выводить из journal/day/resolved choices, если это надёжно;
- порядок choices использовать уже существующий frozen current snapshot.

Обязательны migration/chain tests для реально существующей предыдущей версии. Не хранить derived profile percentages как источник истины.

---

# 25. UI

v2.5 не вводит новый психологический экран поверх v2.4.

Сохраняется разделение:

```text
наблюдаемая логика ≠ освоенная development логика
```

Во время arc пользователь не видит технический чеклист:

```text
trial 1/1
review 1/1
pressure 0/1
```

DebugPanel — может.

Пользовательский текст описывает происходящее естественно.

Для `ironic`, если следующей arc нет, UI не должен показывать ошибку или обещание «следующей стадии».

---

# 26. Feature gate / rollout

Adaptive/profile-driven selection нельзя включать пользователям до завершения calibration gate.

Использовать существующий feature/config механизм, если он есть.

Если его нет, добавить минимальный switch, позволяющий режим:

```text
profile scoring ON
neutral recording ON
probe/adaptive selection OFF
```

для калибровки.

После успешной калибровки:

```text
probe selection ON
adaptive selection ON
development arcs ON
```

Development cards при этом всё равно остаются dependent evidence.

---

# 27. Repo-binding deliverable

До merge разработчик возвращает/фиксирует таблицу:

| authoring key | runtime binding | status |
|---|---|---|
| `npc.*` | real npc id | mapped/new/blocked |
| `worldEffectSpec` | actual effect(s) | mapped |
| textual `requires` | condition(s) | mapped |
| card window | calendar eligibility | mapped |
| scheduled consequence | scheduler representation | mapped |

Дополнительно:

- список конфликтующих существующих card IDs;
- список переиспользованных NPC;
- список новых NPC, если без них нельзя;
- список arc, которые могут не помещаться в календарный остаток;
- решение по cross-episode arc persistence.

---

# 28. Порядок реализации

## Phase 0 — Repo audit/binding

1. Проверить фактические schemas и текущую `expert-achiever`.
2. Подготовить binding map.
3. Решить вопрос календаря/cross-episode.
4. Не писать новый параллельный формат.

**Gate:** все authoring concepts имеют runtime mapping.

## Phase 1 — Validators

1. position bias;
2. choiceId binding;
3. retry coverage;
4. retry beat routing;
5. retry cooldown;
6. reachability;
7. aggregate LogicVector bias;
8. probe role rotation;
9. initial rebase regression;
10. initial stable facet diversity;
11. package counts.

**Gate:** текущие `*-final` источники проходят structural validation.

## Phase 2 — Neutral + Probe runtime content

1. Конвертировать принятый neutral pool.
2. Конвертировать probe pool.
3. Подключить rubric v1.
4. Проверить origin.
5. Проверить frozen choice order/reload.

**Gate:** контент доступен без adaptive enablement.

## Phase 3 — Development content

1. Extend arc registry.
2. Встроить 50 cards.
3. Привязать NPC/effects/conditions.
4. Реализовать retry scheduling.
5. Сохранить `expert-achiever`.

**Gate:** 28+ development scenarios green.

## Phase 4 — Blind review + calibration

Blind review может идти параллельно Phase 0–3, но **enablement ждёт его результата**.

1. κ/top-2 agreement.
2. Исправление спорных choices.
3. Повтор validator.
4. `simulate-profile`.
5. timing audit.

**Gate:** все числовые пороги выполнены.

## Phase 5 — Adaptive enablement

1. включить targeted probe;
2. включить adaptive/free;
3. повторить full simulation;
4. full regression;
5. release.

---

# 29. Что можно делать параллельно

Параллельные ветки:

```text
A. Repo binding development cards
B. Conversion neutral/probe
C. Validators
D. Blind editor review
E. simulate-profile harness
```

Сводятся перед Phase 5.

Критическая зависимость:

```text
Blind review + simulation + binding + validators
                    ↓
              enable adaptive
```

---

# 30. Definition of Done v2.5

Поставка считается принятой, когда одновременно:

### Диагностика

- [ ] rubric v1 подключён и versioned;
- [ ] 32 neutral cards доступны как profile-unconditioned content;
- [ ] 21 probes доступны как profile-conditioned diagnostic content;
- [ ] 3 probes на каждую соседнюю пару;
- [ ] probe limit `<= 1/3` работает;
- [ ] top two для probe берутся из `currentDistribution`;
- [ ] neutral/probe не stage-gated;
- [ ] adaptive evidence не входит в current profile;
- [ ] первая stable-фиксация требует минимум 2 facets;
- [ ] initial rebase работает только один раз и только до consequence/promotion;
- [ ] motive и behavior работают по v2.4;
- [ ] choice position не используется как сигнал;
- [ ] choice semantics привязана к `choiceId`.
- [ ] UI/контент не трактуют более позднюю ActionLogic как автоматическую нравственную/духовную превосходность.

### Position bias

- [ ] neutral: каждая top-1 logic имеет 4×A/4×B/4×C/4×D;
- [ ] probe role rotation проходит;
- [ ] control role не привязан к букве C;
- [ ] aggregate LogicVector bias report построен и принят calibration;
- [ ] development target positions = 17/17/16;
- [ ] shuffle/reload, если существует, сохраняет choice identity.

### Development

- [ ] все 7 соседних arcs зарегистрированы;
- [ ] шесть новых arc используют 50 новых cards;
- [ ] `expert-achiever` regression green;
- [ ] каждая новая arc имеет путь `trial→consequence→review→transfer→pressure`;
- [ ] каждый reachable withdrawal имеет retry соответствующего beat;
- [ ] `retry.01` закрывает только `withdrawal@pressure`; `withdrawal@transfer` идёт только в `retry-transfer`;
- [ ] cooldown работает;
- [ ] previous evidence не стирается;
- [ ] promotion только вечером;
- [ ] promotion максимум один раз;
- [ ] `observedPrimary` не является prerequisite завершения active arc;
- [ ] `ironic` без next arc является валидным состоянием.

### Repo/world

- [ ] все `npc.*` привязаны;
- [ ] все `worldEffectSpec` превращены в runtime effects;
- [ ] textual requires превращены в conditions;
- [ ] все 50 cards имеют допустимые calendar windows;
- [ ] development content не ломает fixed/scheduled/capacity events.

### Calibration

- [ ] blind κ ≥ 0.70;
- [ ] original top-1 входит в editor top-2 ≥ 90%;
- [ ] отдельная confusion/accuracy проверка `alchemist ↔ ironic` проведена и спорные action-only варианты отредактированы/приняты документированно;
- [ ] 8 target hit-rate ≥ 95%;
- [ ] non-adjacent wrong center ≤ 2%;
- [ ] mixed false-stable ≤ 10%;
- [ ] insufficient false-stable = 0%;
- [ ] adaptive-only false-stable = 0%;
- [ ] position-strategy tests не создают stage prior;
- [ ] timing audit принят для 7 outgoing arcs.

### Reliability

- [ ] reload tests green;
- [ ] idempotency green;
- [ ] существующие saves мигрируют без потерь; если v5 уже выпускался, есть chain-test v5 → новая версия и `transition → promotion`;
- [ ] existing mandatory-event/calendar/endings tests green;
- [ ] full content validator green.

---

## 30.1. Граница продуктовой интерпретации

`ActionLogic` не является шкалой нравственной или духовной ценности. UI и контент не должны утверждать, что более поздняя ActionLogic автоматически означает «лучший», «добрее», «честнее» или «более духовный» человек. Возможный слой values/spiritual integration проектируется отдельно от `LogicVector`.

---

# 31. Что не входит в v2.5

Не входит:

- девятая вертикальная стадия после Ironic;
- LLM-классификация свободного текста;
- автоматическое определение «психологического уровня человека»;
- изменение scoring thresholds без calibration decision;
- переразметка vectors разработчиком по собственной интерпретации;
- новая параллельная schema development cards;
- переписывание существующей `expert-achiever` без отдельной причины;
- публичный показ внутренних Lead/LogicVector/rationale;
- признание adaptive development choices profile-eligible diagnostic evidence.

---

# 32. Артефакты, которые должны остаться после реализации

В репозитории или release package должны быть:

```text
IMPLEMENTATION-v2.5-DEVELOPMENT-CONTENT.md
DEVELOPMENT-RUBRIC-v1-final.md
DIAGNOSTIC-PROBES-v1-final.md
NEUTRAL-DIAGNOSTIC-CONTENT-v1-final.md
DEVELOPMENT-PRODUCTION-CARDS-v1-final.md
CONTENT-INTEGRATION-REVIEW-v1-final.md
RECONCILIATION-v2.md  # audit/change log; правила уже встроены в документы выше

CONTENT-BINDING-MAP-v1.md
CALIBRATION-BLIND-RESULT-v1.md
PROFILE-SIMULATION-REPORT-v1.md
DEVELOPMENT-TIMING-REPORT-v1.md
```

Первые семь — входной пакет (`RECONCILIATION-v2.md` только как audit/change log). Последние четыре — обязательные результаты integration/calibration.

---

# 33. Финальная продуктовая инварианта

v2.5 считается правильно реализованной, если выполняется одновременно:

```text
игра не спрашивает у игрока «какой вы тип»
+
profile-eligible решения (`neutral + probe`) формируют профиль
+
профиль не самоподтверждается адаптивным контентом
+
устойчивый центр открывает реальную соседнюю development arc
+
новый способ должен быть прожит через trial/consequence/review/transfer/pressure
+
withdrawal даёт другую попытку, а не наказание
+
более поздняя стадия не спрятана в позиции «правильного ответа»
+
promotion не меняет диагностические проценты сам по себе
```

Это и есть граница между тестом со «зрелыми ответами» и игровой системой, в которой способ действия сначала наблюдается, а развитие подтверждается отдельным опытом.
