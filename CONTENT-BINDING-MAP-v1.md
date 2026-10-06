# CONTENT-BINDING-MAP-v1 (черновик, до реализации)

**Пакет:** `PUT-v2.5-DEVELOPMENT-HANDOFF-integrated-v2.zip` → распакован в `PUT-v2.5-DEVELOPMENT-HANDOFF-integrated-v2/` (старая папка `PUT-v2.5-DEVELOPMENT-HANDOFF/` не тронута; она — более ранняя редакция, без RECONCILIATION-v2).
**Код:** `/Users/pavellebedev/Desktop/way`, content `mvp-v2.4-alpha.2`, state v5, algorithm `1`.
**Базовая линия:** `npm run check` — контент OK, TypeScript strict, **186/186 тестов зелёные**.
**Дата:** 5 октября 2026

---

## 0. Вывод

Пакет внутренне непротиворечив (reconciliation-v2 применён, структурные счётчики сходятся), но он писался **без доступа к репозиторию** (сам пакет: «`src.zip/scripts.zip` не предоставлен»). Поэтому «repo-binding» здесь — не переименование ключей, а три структурных расхождения и одно сюжетное:

| # | Блокер | Что в пакете | Что в коде |
|---|---|---|---|
| **B1** | Число вариантов | neutral — 4, probe — 3, development — 3 на сцену | везде ровно 2: `choices: [Choice, Choice]`, `choiceIds: [string,string]`, `leftChoiceId/rightChoiceId`, swipe-UI, zod `pair` |
| **B2** | Мир и герой | герой — «Алексей», обычная современная работа: релиз, команда, клиент, руководитель, премия, инвестиции, тренер | герой — безымянный гончар («Ты — гончар»); **Алексей — ученик (NPC, 13 карточек)**; круг: Марта, Тимон, Алексей, Егор, Лия, Странник; ресурсы wealth/strength/peace/bonds |
| **B3** | Модель развития | 5 «битов» (trial→consequence→review→transfer→pressure), одна карточка на бит; `withdrawal` не стирает прежнее; retry закрывает ровно свой бит; cooldown | `developmentProgress()` — циклы (trial/consequence/review) + обязательный `limitation`; `withdrawal` **обнуляет** циклы до него (`lastWithdrawal`); `consequence` — только presented-событие, валидатор запрещает его на выборе |
| **B4** | Диагностический пул | 32 neutral + 21 probe — единственный сбалансированный пул (по 16 top-1 на логику) | уже размечено 84 neutral-сцены + 21 probe + 11 motive + 7 behavior (2 варианта, перекос: Алхимик/Ироничный — 3 и 7 из 172 вариантов) |

Всё остальное (вокабуляр, формула, пороги, двухвечернее подтверждение, probe ≤ 1/3, `selectionOrigin`, rebase, F≥2) ложится на код как точечные правки.

---

## 1. Что в пакете (проверено)

| Артефакт | Содержимое |
|---|---|
| Neutral | 32 сцены × 4 варианта = 128 векторов (всего 168 векторов с motive/behavior, у всех ровно 3 ненулевые компоненты, max 0.60), 32 уникальных contextId, facets 8/8/8/8, 8 pressure, 8 motive, 4 behavior |
| Probe | 21 сцена × 3 варианта = 63; 7 пар × 3; ротация left/right/control `.01/.02/.03` |
| Development | 50 карточек × 3 варианта; 6 дуг; facets work 20 / relationships 18 / inner 7 / body 5; события: 39 withdrawal, по 12 trial/transfer/pressure, по 7 consequence/review; `worldEffectSpec` текстом — только в 4 карточках |
| Rubric | 8 логик × 6 осей — **уже есть** в `development-profile.json` (`rubricVersion 1`), сверять, а не писать заново |
| Retry-граф | 6 pressure-retry (`dev.<arc>.retry.01`) + 14 support-карточек; пустые клетки: consequence/review (кроме O→D review, D→E consequence) |
| Id последней дуги | `dev.alir.*`, `probe.alir.*` (в `RECONCILIATION-v2` §8 строка `dev.alir.* → dev.alir.*` — опечатка-тавтология, по факту всё уже `alir`; `INTEGRATION-VALIDATION` подтверждает 0 вхождений `dev.si.`) |

---

## 2. Привязка схемы данных (Card / Choice)

| Автор-понятие пакета | Runtime сейчас | Действие | Статус |
|---|---|---|---|
| 3–4 варианта на сцену | `choices: [Choice, Choice]` (types.ts:84, schema.ts `pair`), `ChoiceVariant.choices: [Choice,Choice]`, `DrawResult.choices`, `current.choiceIds: [string,string]`, `leftChoiceId/rightChoiceId`, `applyChoice` («Choice is outside the presented pair»), `variants.ts`, `GameCard.tsx`, `save.ts` envelope | Обобщить до `Choice[]` длины 2–4: tuple→array; `current.choiceIds: string[]` — **замороженный порядок показа** (§7 пакета); `leftChoiceId` оставить только для 2-вариантных. UI: swipe для 2, вертикальный список для 3–4 (`ResourceStrip` preview по наведению сохранить). Профильный движок читает `choice.id`, не индекс — править не нужно | **blocked на решение D1** |
| `choiceId` как якорь семантики | уже так: `diagnosticAction`, `developmentEvents`, `chose:{card,choice}` — всё по id | Ничего. Добавить `check-choice-id-binding` | mapped |
| Position balance (neutral 4/4/4/4) | авторский порядок A..D = порядок массива; сейчас сторона 2-вариантных свапается детерминированно (`sides:` в draw.ts) | Для ≥3 вариантов свап не применять (порядок = авторский, иначе теряется баланс). Для 2-вариантных не менять | mapped |
| `selectionOrigin` | `current.selectionOrigin`, `naturalSelectionOrigin()` | neutral/probe/adaptive уже есть | mapped |
| `diagnostic.{situationId,contextId,facets,developmentWeight,pressure,distinguishes}` | `CardDiagnostic` (types.ts:75) | 1:1 | mapped |
| `diagnosticAction/Motive/Behavior` | есть | motive: ≤4 опции, `text ≤120`, `label ≤80` — проверить 8 motive-промптов пакета на длину | mapped, проверить |
| probe: `tags:['probe-only']`, `distinguishes` пара, нет `requires/at/development` | валидатор уже требует | при конвертации 21 новая probe заменяет 21 старую (id `probe_od_price` → `probe.od.01`); старые убрать | mapped |
| Текст сцены ≤500, `servesFacets` 1–2 у **каждого** варианта | zod + check-content | в dev-карточках макс. текст 324 — ок; `servesFacets` у вариантов в пакете нет → дописать | gap (авторская работа) |
| Trace у **каждого** варианта situation/chain (`response ≤280` + ≥1 reader) | check-content `No trace` | 128+63+150 = **341 новый trace** с читателями. Пакет их не содержит | gap (авторская работа, объём большой) |
| Эффекты варианта: `resources` (±), `qualities`, flags/facts | `Effects`; факт/флаг без читателя запрещён (`Unread fact/flag`) | Пакет даёт только смысл («доверие ухудшается»). Нужны числа по 4 ресурсам на каждый вариант | gap |
| `worldEffectSpec` «через 1–3 обычных решения открыть X» | `schedule` работает в **днях** (`inDays ≥ 1`), цели — только `type:'chain'` | Расстояние в «решениях» схемой не выражается → новый атом условия (см. §3), без `schedule` | gap (нужен код) |
| Окна по календарю | `chapter` 1–4/`any`, `requires:{dayGte..}`, 30 дней × 4 слота = 120; занято фиксированным 49 + маршрутов 4 → **67 свободных слотов** | Дуги стартуют после первого центра (день 5 / 10 / 16 — min/медиана/P90 по отчёту v2.4) → все dev-карточки `chapter:'any'` + `development.stages:[from]` + `arcId` | mapped (см. timing §7) |
| Пост-промоушен контент | `check-content` «No content for reachable stage X» — для `to` каждой дуги нужна карточка/вариант стадии | Для diplomat, expert*, individualist, strategist, alchemist, ironic в пакете **нет** контента «после перехода» (у expert/achiever есть `dev_achiever_1..4`). Либо минимальные stage-варианты текста, либо ослабить правило для v2.5 | gap → решение D5 |

---

## 3. Привязка движка развития (arc-модель, retry, cooldown)

| Требование v2.5 | Сейчас | Действие |
|---|---|---|
| Реестр 7 соседних дуг | `development.json.arcs[]` — только `expert-achiever` с `cycles` | Расширить **тот же** реестр (запрет конкурирующего). Добавить поле `model: 'cycles' \| 'beats'`; `expert-achiever` остаётся `cycles` (не переписывать, §21) |
| Беты trial/consequence/review/transfer/pressure, по карточке на бит | `developmentProgress()`: циклы + `limitation>0` + `minContexts` | Для `beats`: прогресс = по одному валидному evidence на каждый бит; `limitation` для `beats` не требуется; `transfer.contextId ≠ trial.contextId` |
| `withdrawal` не стирает прежнее | `lastWithdrawal` обрезает trial/consequence/review | Для `beats` — evidence накопительный по биту; withdrawal лишь открывает retry этого бита. Legacy-ветка не меняется |
| Retry закрывает только свой бит; `retry.01` ≡ только `withdrawal@pressure` | нет | Новые атомы условия (расширить `Condition` + zod `conditionSchema` + `evaluateCondition` + walk в check-content): `{ developmentBeatWithdrawn: beat }`, `{ developmentCooldownMet: {eventId?, evenings:1, decisions:2} }` (1 вечер **или** 2 resolved non-arc выбора), `{ developmentDecisionsSince: {eventId, gte} }` для «1–3 обычных решения» между битами |
| Первый незавершённый бит определяет, что показывать; нельзя прыгнуть к retry-pressure | `draw.ts` берёт **первую** подходящую dev-карточку (`content.cards.find`) без приоритета бита | Приоритет задаётся `requires` через новые атомы + порядок; плюс тест «после withdrawal@trial retry-pressure недоступен» |
| `consequence`/`review` как событие **выбора** | `check-content`: «Presentation event used as decision» запрещает `consequence` на выборе; presented — только `limitation`/`consequence` | Разрешить `consequence` на выборе для `model:'beats'`. Подтверждённый `developmentEvidence` остаётся идемпотентным по (runId, cardId, choiceId) — уже так через ключ `eventId/day/slot` |
| Идемпотентность / reload | `record()` дедуп по `eventId+day+slot`; `current` заморожен | Покрыто; добавить тесты по списку §23 пакета |
| Promotion только вечером, один раз; `pendingPromotion` | `prepareDevelopmentPromotion` + `commitDevelopmentPromotion` в `prepareEvening` | Работает. Заменить `currentOrigin:'transition'` → `'promotion'` (types, development.ts:64, save.ts, validateDevelopmentEvidence, 4 тест-файла) |
| `ironic` без следующей дуги | `nextArc` необязателен в `commit` | Уже допустимо; проверить, что UI не обещает «следующую стадию» |
| Initial rebase (раздел 9.1) | отсутствует; `establishInitialDevelopmentCurrent` только первая фиксация | Новый шаг в `prepareEvening`: перед `commitDevelopmentPromotion` проверить `canInitialRebase`; закрыть дугу с `reason:'initial-reconciliation'`. Нужны: `initialRebaseCount: 0\|1` в `HeroDevelopment`, место для `closedArcs/reason` в истории, `validateDevelopmentEvidence` должен уметь восстановить состояние после rebase (сейчас реконструкция строго от `initialStage`) |
| F ≥ 2 для первой stable-фиксации | `evaluateEvening` проверяет N/W/K/Δ/confidence, K = контексты | Добавить `F` (число разных `facets` среди action-кейсов окна); только для **первой** фиксации. Опираться на `contextId + facets`, `contextFamily` не вводить |
| Feature gate | `rollout.adaptiveSelection:false`, **но** dev-карточки (`draw.ts:121`) от флага не зависят — существующая дуга живая всегда | Для новых дуг нужен отдельный выключатель (`rollout.developmentArcs` либо привязка к `adaptiveSelection`). Иначе 6 новых дуг включатся до калибровки → решение D4 |

---

## 4. NPC-привязка (14 ролей пакета → мир «Пути»)

В мире нет «менеджера/клиента/команды/тренера». Это не механическое сопоставление, а **контентное решение** (правило пакета: нового NPC молча не заводить).

| Ключ пакета | Предложение | Статус |
|---|---|---|
| `npc.colleague.primary` | Тимон (равный по ремеслу, торговец) | proposed |
| `npc.colleague.senior` | Странник | proposed (альт.: старый мастер без NPC-id) |
| `npc.manager.primary` | нет аналога (герой работает на себя). Варианты: Тимон как заказчик / безымянный заказчик ярмарки | **decision** |
| `npc.close.primary` | Лия (сестра, письма) | proposed (альт.: Марта) |
| `npc.close.secondary` | Егор (старый друг) | proposed |
| `npc.partner.primary` | Тимон (совместный заказ/прилавок) | proposed |
| `npc.specialist.primary/secondary` | нет (тренер, врач, юрист вне мира) | **blocked** |
| `npc.family.group` | нет группы; Лия + Марта? | **decision** |
| `npc.team`, `.a`, `.b` | Алексей-ученик + соседи/рынок | **decision** |
| `npc.acquaintance.primary` | Марта | proposed |
| `npc.authority.primary` | нет (староста/мастер?) | **decision** |

См. B2: пока не решён вопрос мира, NPC-карта остаётся предложением.

---

## 5. Валидаторы и скрипты

| Из пакета (§16) | Состояние | Куда |
|---|---|---|
| базовые v2.4 (вектор, ≥2 ненулевых, rationale 6 осей, ≤4 логик, motive/behavior-ссылки) | **есть** в `validateDiagnostics` | сохранить |
| `check-choice-position-bias` (neutral 4/4/4/4; probe-ротация; dev 17/17/16) | нет | новый модуль в `scripts/`, подключить в `content:check` |
| `check-choice-id-binding` | частично (уникальность id в карточке) | дополнить: перестановка вариантов не меняет семантику |
| `check-retry-coverage`, `check-retry-beat-routing`, `check-retry-cooldown` | нет | новые; зависят от §3 |
| `check-development-reachability` (control / trial-withdrawal / fast / retry × 6 дуг + 4 регресса expert-achiever) | `scripts/development-scenarios.ts`, `simulate-development.ts` — 5 траекторий × 100 только для expert-achiever | расширить сценарии на 6 дуг (24 + 4 = 28 интеграционных) |
| `check-aggregate-vector-bias` | `profile-calibration.ts` считает баланс по-другому | новый отчёт; цифры из RECONCILIATION (achiever 23.80 против ironic 10.35 — разница 2.3×) — калибровочный gate |
| `check-probe-role-rotation` | валидатор проверяет только «пара разделяется ≥ .15» | добавить роль-ротацию по вектору (не по букве) |
| `check-initial-rebase`, `check-initial-stable-facet-diversity` | нет | юнит-тесты движка (5 + 2 сценария) |
| package counts (32/21/50/…) | нет | проверка на уровне конвертера |
| `simulate-profile` | **есть**, арифметическая + реальный контент (8 целей) | пересчитать на новом пуле, ≥20 seed на цель, стратегии «всегда A/B/C/D», 9 траекторий §19 |
| blind-review pack | `reports/profile-editor-review.json` + `--agreement` | собрать `CALIBRATION-BLIND-PACK-v1` (без Lead/вектора/позиции) для нового пула; нужен второй редактор-человек |
| существующие проверки, которые новый контент сломает | «Too little independent content dominated by X», «Situation marked differently», «Fixed chain…» | пересмотреть после решения D3 |

---

## 6. Сохранения

- `GAME_STATE_VERSION = 5`; в проекте нет git и нет сведений о выпущенных v5-сейвах (README: плейтеста не было). Если v5 не выходил — `initialRebaseCount` и `currentOrigin:'promotion'` встраиваются **в v5** (раздел 24 пакета разрешает, решение фиксировать здесь), без новой версии.
- При любом варианте: на входе принимать `'transition'` и нормализовать в `'promotion'`; отсутствующий `initialRebaseCount` → 0. Литерал `'transition'` сейчас в 6 файлах: types.ts, development.ts, save.ts, migration.test.ts, profile.integration.test.ts, heroDevelopmentProfile.test.ts — их придётся править вместе с переименованием.
- Порядок вариантов 3–4-вариантных карточек хранится в `current.choiceIds` (уже замороженный snapshot) — отдельного persisted-поля не нужно.
- `CONTENT_VERSION` обновить (`mvp-v2.5-alpha.1`); известные v4/v5-сейвы с открытой 2-вариантной карточкой остаются валидными.

---

## 7. Календарь и тайминг (предварительно)

- 30 дней × 4 слота = 120; фиксированных 49 + маршрутных 4 → **67 свободных**, примерно 2.2 в день.
- Первый центр: день 5 / 10 / 16 (min / медиана / P90, отчёт v2.4). Остаётся ~14 дней ≈ 31 свободный слот для P90.
- Минимальный путь одной дуги: 5 битов + ≥1–3 обычных решения после trial + ≥2 после review + «обычная жизнь» перед pressure ≈ 12–14 слотов, при этом quota «после adaptive — neutral/probe» съедает каждый второй свободный слот ⇒ требование §20 «P90 остаток ≥ minArcSlots + 2» **вероятно не выполняется для поздних центров**.
- Архитектурно: `day === days → phase 'boundary'`, следующего эпизода в коде нет («День 30 обозначает границу написанного продолжения»). Значит вариант «дуга переходит границу эпизода» недоступен → действует вариант «дуга обязана завершиться внутри эпизода»; нужен `DEVELOPMENT-TIMING-REPORT-v1`, а слабые места — решение продукта (сжать дугу, сдвинуть старт, принять незавершённость).
- Цепочка дуг в 30 дней практически ограничена одной дугой после первого центра (промоушен дуги N → старт дуги N+1 — вторая дуга не уложится). Это нужно знать до написания 6 дуг.

---

## 8. Порядок реализации после снятия блокеров

0. **Решения D1–D5** (ниже).
1. Движок N-вариантов + UI (B1) — прежде чем конвертировать хоть одну сцену.
2. Условия/arc-модель `beats` + retry + cooldown (B3), rename `promotion`, `initialRebaseCount`, F≥2, rebase — движок + юнит-тесты (28+ сценариев).
3. Валидаторы (§5) — сначала на «сухом» парсере пакета (markdown → JSON), чтобы доказать структурные счётчики пакета до портирования текстов.
4. Конвертер пакета → `cards.*.json` (neutral/probe) после решения B2/B4; затем dev-карточки с эффектами и trace.
5. `simulate-profile` на реальном новом пуле → решение, нужен ли «алгоритм 2» (контрастная оценка; см. D3).
6. Blind-review (человек), timing audit, затем adaptive/arcs ON.

---

## 9. Решения (5 октября 2026)

**Приняты:** D1 — `Choice[2..4]`; D2 — переписать под гончара; D3 — новый пул заменяет, 84 neutral-сцены остаются сюжетом; D4 — `rollout.developmentArcs=false`; D6 — поля встраиваются в v5 без новой версии (при условии, что реальных v5-сейвов нет). **Не решён:** D5.

Исходные формулировки и рекомендации:

| Id | Вопрос | Рекомендация |
|---|---|---|
| **D1** | Расширить движок/UI до 3–4 вариантов? | Да: `Choice[2..4]`, swipe остаётся для 2, список для 3–4. Альтернативы (ужимать пакет до 2 вариантов) разрушают ротацию ролей и вектора |
| **D2** | Мир: переписать 103 сцены под гончара и деревню? | Да, сохранив структуру (вариант→вектор→роль→позиция). Тексты меняются ⇒ blind-review обязан идти по **перенесённому** тексту; векторы пакета — стартовая разметка. Использовать общий мир как есть — ломает сюжет и трактовку Алексея как ученика |
| **D3** | Судьба существующих 84+21 диагностических сцен и «алгоритма 2» | Новый пул заменяет probe полностью; 84 neutral-размеченные историй-сцены снять с profile-eligible (оставить как сюжет), иначе баланс пакета размывается. Формулу не менять, пока `simulate-profile` на новом пуле не покажет провал (v2.4-отчёт: на старом пуле 4 из 8 логик недостижимы — ключевой риск) |
| **D4** | Выключатель новых дуг | Отдельный `rollout.developmentArcs=false`; `expert-achiever` продолжает работать как раньше |
| **D5** | Контент «после перехода» и конфликт `No content for reachable stage` | Минимальные stage-варианты текста (2–3 на стадию) в рамках v2.5, либо документированное ослабление правила для стадий без контента |
| **D6** | Сейвы v5 | Встраивать в v5 (подтвердите, что реальных v5-сейвов нет) |


---

## 10. Статус реализации (5 октября 2026)

| Фаза | Состояние | Где |
|---|---|---|
| Ф0 de-risk | выполнена; gate на scoring v1 не пройден → ветка `algorithmVersion 2` (контраст, пороги 0.34/0.10/0.5) | `reports/V25-PHASE0-GATE.md`, `scripts/v25/simulate-package.ts` |
| Ф1 `Choice[2..4]` | выполнена: types/draw/save/schema/UI (список 1–4 для 3–4 вариантов, swipe для 2), dev-страница `dev-card-preview.html` | `src/engine/multiChoice.test.ts` |
| Ф2 движок развития | выполнена: модель `beats`, условия `developmentBeat`/`developmentSince`, retry и cooldown от последней попытки, initial rebase (запись в `transitions` с `reason`), F≥2 только для первой stable-фиксации (ветка 2), флаг `rollout.developmentArcs`, `promotion` вместо `transition` + нормализация старых v5 | `src/engine/{beats,development,heroDevelopmentProfile}.ts` + 4 новых тест-файла |
| Ф3 валидаторы | выполнена: структура источника, parity источник↔runtime (с мутационными тестами), сценарии 6 дуг × 4 на реальном контракте | `scripts/v25/{source-checks,parity}.ts`, `src/content/v25.test.ts` |
| Ф4 контент | инфраструктура готова (`npm run v25:build`, skin-файлы `content-src/v2.5/skin/`); тексты — на утверждении партиями | — |

Уточнения к карте по ходу работ:
- `rollout.adaptiveSelection` по коду включает **и** probe selection, **и** квоту «после adaptive — profile-eligible»; отдельного `probeSelection` нет. `rollout.developmentArcs` управляет только `beats`-дугами; `expert-achiever` от него не зависит.
- Rebase записывается как элемент `development.transitions` с `reason: 'initial-reconciliation'` (без `rebases[]`); промоушены — без `reason` (по умолчанию `promotion`).
- Retry-карточки повторяемы (`once:false`) и после отказа остаются на предложении; cooldown считается от **последней попытки дуги**, не только от последнего withdrawal, иначе отказ от retry давал бы показ в каждом слоте.
- Карточка бита без target-эвиденса (выбор «старым способом») расходует единственную попытку основного бита: дуга остаётся незавершённой (как и в `expert-achiever`); retry доступен только после withdrawal.
- Владельцы behavior-продолжений (4 сцены) получают окно `dayLte: 28` (календарь, не профиль) — иначе продолжение не помещается в 30 дней; это единственное разрешённое `requires` у neutral-сцен.
- D5 сузилось до одной стадии: единственное, что не проходит `check-content` на полном пакете, — «нет контента для достижимой стадии `ironic»; нужны 2–3 стадийных варианта текста в сюжетных недиагностических сценах.

## 11. Партия 1 влита (5 октября 2026)

В игре: 32 neutral-сцены, 8 вопросов о мотиве, 4 сцены-продолжения (`cards.neutral.json`, `traces.v25.json`), собранные `npm run v25:build` из `content-src/v2.5/neutral.json` × `skin/neutral.json`, `skin/behaviors.json`. Новый пул — единственный профильный: с 84 сюжетных сцен и старых motive/behavior снята диагностическая разметка (199 вариантов, 84 карточки). `currentAlgorithmVersion = "2"`, `CONTENT_VERSION = mvp-v2.5-alpha.1` (старые локальные сохранения v5 с прежней версией контента будут предложены к восстановлению). Старые 21 проба пока лежат в `cards.probe.json` и дожидаются партии 2.

Что пришлось решить при слиянии:
- **Плотность диагностики.** Неразбавленные 32 сцены занимали около половины свободных слотов, и ранние сюжетные сцены главы 1 падали ниже 50 % прохождений. Нейтральные сцены не показываются в день 1 (`NEUTRAL_FROM_DAY = 2`, календарное `requires`; для владельцев продолжений ещё `dayLte 28`), три ранние сюжетные сцены получили вес 4. Первый центр на реальном движке: медиана день 10, P90 13–15, попадание 61/64.
- **Качества.** Диагностические варианты получили +1 к качеству по смыслу (без отрицательных, без привязки к логике): иначе половина слотов не растила внимание/честность и т. д., и тень качества не достигалась. Тест достижимости теней снова зелёный.
- **Валидаторы.** `Too little independent content` считает календарные `requires` (dayGte/dayLte) не зависимостью; parity проверяет их точно.
- **Отчёт `reports/simulation.v2.4.json` был перезаписан** прогоном во время работы (флаг `--write`); новый отчёт пишется в `reports/simulation.v2.5.json` (200 прохождений × 7 политик, без провалов).

Остаётся: Алхимик (и частично Ироничный) в реальной игре держат долю лидера около порога 0.34 (Алхимик: 50 % прогонов становятся центром, 30 % остаются стабильными к дню 30). Решается в Ф5 правкой векторов после слепой проверки либо отдельным решением о пороге ветки 2.

## 12. Партия 2 влита (6 октября 2026)

21 проба (по 3 на каждую соседнюю пару) в игре вместо старых `probe_*`: `cards.probe.json` собирается `npm run v25:build` из `content-src/v2.5/probes.json` × `skin/probes.json`; id вариантов — смысловые (`protect-self`, `use-crisis`…), как в пакете. Старые 42 trace пробы удалены. Адресный выбор проб остаётся выключенным (`rollout.adaptiveSelection=false`) до калибровки. Проверено: `check`, `simulate`, `simulate:profile` зелёные.

## 13. Партия 3 влита (6 октября 2026)

50 карточек шести дуг (`cards.arcs.json`, `development.arcs.json`) собраны `npm run v25:build` из `content-src/v2.5/development.json` × `skin/development.json`, `skin/arcs.json`; в `src/content/index.ts` дуги добавлены к реестру `development.arcs`. D5: три сюжетные сцены главы 4 (`enc_4_1`, `enc_4_4`, `enc_4_9`) получили вариант текста для стадии `ironic` (условие `heroStage`, только недиагностический контент). `check` зелёный (292 теста), `content:check` — без замечаний, `cards:lint` — 0 ошибок.

Флаг `rollout.developmentArcs` остаётся **выключенным**: карточки дуг игроку не показываются. Измерение с флагом «вкл» (12 прогонов на логику, герой выбирает целевые варианты дуг): новая дуга завершается через 5–6 дней после первого центра (день 15–18), у Алхимика центр формируется лишь в 8 из 12 прогонов.

Замечания по ходу: у целевых вариантов дуг в первой версии подпись была самой длинной в карточке (подсказка «правильного» ответа) — подписи переписаны до 33–54 символов с разбросом длины ≤ 15 внутри карточки; у ряда целевых вариантов был строго лучший набор ресурсов — добавлена цена. В нейтральном пуле качества распределены неровно по логикам (например, Стратег — внимание ×12, Эксперт — честность ×10): мягкая корреляция, не блокирует, стоит просмотреть на калибровке.
