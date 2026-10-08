# FOCUSED-ENCOUNTERS — baseline (этап 0)

> **Исторический отчёт этапа 0.** Отпечаток `focused-encounters-baseline.json` перезаписывался при законных изменениях контента старым (этапа 0) селектором: `npm run focused:baseline:rerecord`; при текущем контенте `npm run focused:baseline` даёт «IDENTICAL to the recorded baseline».

ТЗ: `REQs/FOCUSED-ENCOUNTERS-v1.1.md`. Ветка работы: `feature/focused-encounters-v1-1` (от `main`). Ничего в `main` не вливалось.

## 1. Зафиксированное состояние

| | |
|---|---|
| SHA `main` | `ae8bad78ab3c3f4c1fe4424dec2d2d7e0e295cdf` («Evening: the day's conclusion, links to what changed, a manual next day») |
| `CONTENT_VERSION` | `mvp-v2.5-alpha.2`, совместима с `mvp-v2.5-alpha.1` |
| Среда | Node v22.23.1, vitest 3.2.7, `testTimeout` 20000 мс (`vite.config.ts`) |
| Карточек | 234 (`situation` 205, `chain` 14, `routine` 10, `crisis` 5) |
| Дней / слотов | 30 × 4 = 120; главы 1: дни 1–5, 2: 6–10, 3: 11–20, 4: 21–30; пересмотр цели в дни 11 и 21 |
| `threads.json` | 14 записей |
| Флаги `rollout` | `adaptiveSelection: true`, `developmentArcs: true`, `facetAttention: false` |

### Проверка чисел ТЗ (раздел «Проверенный состав контента»)

Пересчитано по `src/content/data/cards.*.json`: свободных `situation/routine` без `at` — **168**: neutral/probe 53 (neutral 32 + probe 21), development 60, route-only 12, обычные сюжетные **43**. Совпадает с ТЗ. Обычная карточка определяется кодом `isFacetWeightedDrawCandidate` (`src/engine/facets.ts`): свободная, не `key/required/mustShowBy`, без `diagnostic`/`development`/`probe-only`/`route-only`.

Распределение 43 по главам: гл. 1 — 3, гл. 2 — 6, `any` — 10, гл. 3 — 12, гл. 4 — 12. **Для дней 1–10 (этап 2) доступны не более 3 + 6 + 10 = 19 обычных карточек**, из них часть закрыта `requires`.

## 2. Команды и результаты

| Команда | Результат |
|---|---|
| `npm run check` | `content:check` OK (234 карточки, 30 дней); `cards:lint` 0 ошибок, 73 предупреждения (существующие); `typecheck` OK; `vitest`: **466 passed, 2 failed, 14 skipped** — оба падения таймаут 20 с при параллельной загрузке (`scenarios.routes.test.ts` «both candidates are reachable at 2/2/workshop», `scenarios.test.ts` «marta_help …»). Отдельный перезапуск этих двух файлов: **34 passed**. |
| `npm run build` | OK, 29 с |
| `npm run simulate` (1000 прогонов × 7 политик) | OK, 433 с, `SIMULATION v2.5 TARGETS OK`, failures `[]` |
| `npm run simulate:profile` | OK, failures `[]`; контент-гейт: достижимы 6 из 8 логик, **`alchemist` и `ironic` недостижимы** (существующее состояние, не относится к ТЗ) |
| `npm run facets:simulate` | OK, 41 с. Закоммиченный `reports/FACET-ATTENTION-SIMULATION-v1.md` **устарел** (в нём 184 карточки, сейчас 234); при запуске скрипт его перезаписывает — я откатил файл, чтобы не смешивать с этой задачей |

## 3. Реальные селекторы

Поток выбора свободной карточки (`src/engine/draw.ts:drawCard`), по приоритету: `current` → `at` → `route` → обязательства/ёмкость (`capacity`) → кризис → дедлайны (`mustShowBy`/`latestDay`) → `scheduled` → дуга развития (`development`, если прошлая свободная не `adaptive`) → `probe` (`probeScenes`, если включён `adaptiveSelection`) → **свободный пул** `freePool` (+ `independentPool` после adaptive) → `drawFreePoolWeighted`.

**Две точки выбора обычных story-сцен, которые затрагивает ТЗ:**

1. **Кубик** — `src/engine/journey.ts:prepareEncounter`. Сначала вызывается `drawCard`; только если источник `pool`, строится набор из 6: пул (после `independentPool`) сортируется детерминированным shuffle (`candidate:<id>`), берутся первые 5 + один probe (`probeScenes`, не более одного) либо первые 6; story-позиции перевыбираются `facetAdjustedSlice` (только при `facetAttention=true`); результат снова перемешивается; при `length !== 6` запись не создаётся (→ прямой розыгрыш). Один бросок за игровой день: `diceHistory.some(d => d.day === state.day)`.
2. **Прямой розыгрыш** — `draw.ts:drawFreePoolWeighted`: сначала легаси `weighted` по `legacyWeight` (вес × 1.2 за намерение); если выпала обычная story и `facetAttention` включён — перевыбор среди story по весу сфер.

**Важное наблюдение для оценки влияния.** Кубик бросается один раз в день (первый свободный слот). По baseline на прогон (политика `mixed`): кубиковых показов ≈ 29, прямых `pool`-розыгрышей ≈ 27,6. То есть **около половины свободных показов идёт через прямой отбор**, и вторая точка (§7 ТЗ) не запасная, а равноправная.

## 4. Совместимость сохранений

- `diceHistory` — строгая схема `dice5` (`src/persistence/save.ts`): ровно 6 уникальных существующих `candidates`, `candidateOrigins` длиной 6 (необязательно), `face`/`cardId` согласованы, один бросок в день. Проверяется **наличие** карточек, а не допустимость/уровень релевантности.
- Валидация сохранения не пересчитывает селекторы, поэтому смена флага `focusedEncounters` или появление `Card.story` не может изменить ни сохранённый набор, ни выпавшую карточку.
- `current` хранит замороженные `choiceIds`, `choices`, `selectionOrigin`, `visual`; сверяется с контентом через `canonical`. Метаданные `story` в эти данные не попадают.
- `contentVersion` в сохранении — строго `CONTENT_VERSION` (`z.literal`); совместимые версии перечислены в `COMPATIBLE_CONTENT_VERSIONS` и поднимаются при загрузке. Правка только `Card.story`/флага не меняет предъявленные тексты и выборы, но по §13 ТЗ любое изменение предъявляемого контента (этап 2) требует отдельного решения о версии.
- `Card` и `profileConfigSchema` в `scripts/schema.ts` — `strict()`: новые поля нужно добавлять в схему явно (это единственная точка, где `story` и `focusedEncounters` будут проверяться на этапе 1).

## 5. Отпечаток легаси-селекторов (для AC-1)

`npm run focused:baseline` проигрывает полные 30-дневные прогоны (seeds 1…40 для каждой из 7 политик) и хэширует: все показы с источником, шесть кандидатов с `candidateOrigins` и гранью, принятые решения, факты и `selectionOrigin` доказательств профиля. Плюс хэш защищённых карточек (neutral, probe, development) без блока `story`. Эталон — `reports/focused-encounters-baseline.json`, получен на SHA выше; повторный запуск даёт идентичный результат (детерминизм подтверждён).

Хэш защищённых карточек: `55f20fd03d71adbc…`

| Политика | Хэш 40 прогонов |
|---|---|
| random | `0f4f45d962bdeb75…` |
| always-first | `fc4d280cb685fb69…` |
| always-second | `ecdaaf545dd8d673…` |
| always-costly | `25679ec26e954e9f…` |
| greedy-resources | `8b1b333fb19ca6f3…` |
| greedy-qualities | `98265c31804ac5d3…` |
| mixed | `cf1b20ac258578e5…` |

Состав карточек по роли: fixed 49, route-only 12, ordinary-story 43, chain 12, crisis 5, development 60, probe 21, neutral 32.

## 6. Метрики слотов и диагностики

Скрипт: `npm run focused:metrics` (`FOCUSED_SEEDS=300`). Те же seeds и политики будут использоваться для сравнения OFF/ON.

### Метрики 30-дневных прогонов (среднее за прогон)

Прогонов на политику: 300 (seeds 1…300); контент mvp-v2.5-alpha.2, флаг фокуса отсутствует.

| Политика | 120 слотов | Бросков/прогон | Прямых pool/прогон | Кандидаты story / neutral / probe / dev (из 6 × бросков) | Выпало story / neutral / probe / dev | Макс. probe в наборе | Показано neutral / probe / story | N / W / K (вечер 30) | Coverage | Confidence |
|---|---|---:|---:|---|---|---:|---|---|---:|---:|
| random | да | 29.33 | 28.52 | 95.68 / 78.04 / 2.28 / 0.00 | 15.84 / 13.15 / 0.35 / 0.00 | 1 | 26.4 / 3.2 / 28.8 | 24.0 / 13.3 / 24.0 | 1.00 | 0.28 |
| always-first | да | 29.10 | 26.34 | 92.50 / 78.52 / 3.56 / 0.00 | 15.44 / 13.09 / 0.57 / 0.00 | 1 | 25.3 / 4.3 / 26.6 | 24.0 / 13.1 / 24.0 | 1.00 | 0.17 |
| always-second | да | 29.41 | 28.67 | 94.43 / 78.92 / 3.10 / 0.00 | 15.62 / 13.28 / 0.50 / 0.00 | 1 | 26.4 / 4.0 / 27.9 | 24.0 / 13.3 / 24.0 | 1.00 | 0.18 |
| always-costly | да | 28.07 | 22.94 | 89.95 / 77.29 / 1.20 / 0.00 | 14.74 / 13.12 / 0.21 / 0.00 | 1 | 24.8 / 1.6 / 25.1 | 23.5 / 13.2 / 23.5 | 0.99 | 0.56 |
| greedy-resources | да | 29.41 | 28.59 | 96.05 / 78.02 / 2.38 / 0.00 | 15.74 / 13.28 / 0.39 / 0.00 | 1 | 26.7 / 3.2 / 28.7 | 24.0 / 13.4 / 24.0 | 1.00 | 0.22 |
| greedy-qualities | да | 29.10 | 27.48 | 93.64 / 78.28 / 2.68 / 0.00 | 15.66 / 13.02 / 0.42 / 0.00 | 1 | 25.7 / 3.6 / 27.8 | 23.9 / 13.2 / 23.9 | 1.00 | 0.33 |
| mixed | да | 29.18 | 27.55 | 94.82 / 78.29 / 1.95 / 0.00 | 15.88 / 13.02 / 0.28 / 0.00 | 1 | 26.2 / 2.6 / 28.5 | 24.0 / 13.4 / 24.0 | 1.00 | 0.32 |

### Статус профиля и стадия развития на 30-й день (число прогонов)

| Политика | Статус профиля | Стадия развития |
|---|---|---|
| random | provisional: 300 | -: 289, diplomat: 1, achiever: 3, opportunist: 2, expert: 2, strategist: 2, individualist: 1 |
| always-first | provisional: 300 | -: 300 |
| always-second | provisional: 300 | -: 300 |
| always-costly | provisional: 269, stable: 31 | opportunist: 97, -: 192, expert: 8, alchemist: 3 |
| greedy-resources | provisional: 300 | -: 287, individualist: 5, ironic: 5, diplomat: 3 |
| greedy-qualities | provisional: 297, stable: 3 | -: 272, achiever: 3, expert: 8, ironic: 11, strategist: 1, alchemist: 5 |
| mixed | provisional: 300 | opportunist: 13, -: 269, alchemist: 9, expert: 2, diplomat: 3, ironic: 1, achiever: 3 |

### Источники показов (среднее за прогон)

| Политика | Источники |
|---|---|
| random | at: 49.00, current: 29.33, pool: 28.52, route: 4.00, scheduled: 4.96, mustShowBy: 3.00, crisis: 0.99, development: 0.19 |
| always-first | at: 49.00, current: 29.10, pool: 26.34, route: 4.00, scheduled: 4.71, mustShowBy: 3.00, crisis: 3.85 |
| always-second | at: 49.00, current: 29.41, pool: 28.67, route: 4.00, scheduled: 4.93, mustShowBy: 3.00, crisis: 0.99 |
| always-costly | at: 49.00, current: 28.07, pool: 22.94, route: 4.00, scheduled: 4.65, mustShowBy: 3.00, crisis: 5.52, development: 2.82 |
| greedy-resources | at: 49.00, current: 29.41, pool: 28.59, route: 4.00, scheduled: 4.98, mustShowBy: 3.00, crisis: 0.70, development: 0.32 |
| greedy-qualities | at: 49.00, current: 29.10, pool: 27.48, route: 4.00, scheduled: 4.83, mustShowBy: 3.00, crisis: 1.58, development: 1.01 |
| mixed | at: 49.00, current: 29.18, pool: 27.55, route: 4.00, scheduled: 4.81, mustShowBy: 3.00, crisis: 2.03, development: 0.44 |

Различных обычных story-карточек, показанных хотя бы раз: random 43, always-first 43, always-second 40, always-costly 43, greedy-resources 40, greedy-qualities 43, mixed 43.

Проверки: у всех прогонов 120 решений — да; шесть уникальных кандидатов в каждом наборе — да; максимум probe в одном наборе — 1; неисполненных required-продолжений — 0.


Сопоставление для ТЗ: «120 слотов» подтверждено; шесть уникальных кандидатов в каждом наборе и не более одного probe в наборе — подтверждено; пустых слотов нет. Диагностика на 30-й день: у большинства политик статус `provisional`, `stable` достигают только `always-costly` (31/300) и `greedy-qualities` (3/300) — это baseline, с которым будут сравниваться N/W/K, coverage, confidence и доли стадий. Числа получены на 300 прогонах на политику; полные 1000 прогонов на политику (требование ТЗ §12.4 для итоговой симуляции) выполняются на этапе 2 при реальном включении флага.

## 7. Кандидаты: 43 обычные свободные сцены (текущая разметка отсутствует)

`Card.story` пока нигде не заполнен. Сводка по `lineStep` и `pursuesGoals` — это то, что **уже есть в выборах** и даст основу для авторской разметки на этапе 2 (подробный аудит — отдельный артефакт `FOCUSED-ENCOUNTERS-CONTENT-AUDIT.md` этапа 2).

| Глава | id | Тип | Сферы | Персонаж | once/cooldown | requires | lineStep (линии выборов) | pursuesGoals | Файл |
|---|---|---|---|---|---|---|---|---|---|
| 1 | c1_liya_letter | situation | relationships,inner | liya | - | да | commitments | - | ch1 |
| 1 | c1_neighbor_noise | situation | body,relationships |  | - | да | pace | order,workshop | ch1 |
| 1 | c1_old_bowl | situation | inner,body |  | - | да | pace | order,workshop | ch1 |
| 2 | c2_gaze_alexey_silence | situation | relationships,work | alexey | - | да | apprentice | alexey,order,workshop | ch2 |
| 2 | c2_gaze_marta_window | situation | inner,relationships | marta | - | да | commitments | - | ch2 |
| 2 | c2_gaze_wanderer_bread | situation | body,relationships | wanderer | - | да | pace | - | ch2 |
| 2 | c2_silence_alexey_hand | situation | body,relationships | alexey | - | да | apprentice | alexey | ch2 |
| 2 | c2_silence_market_pause | situation | inner,work | timon | - | да | commitments | order,workshop | ch2 |
| 2 | c2_silence_marta_cup | situation | inner,relationships | marta | - | да | commitments | - | ch2 |
| 3 | enc_3_0 | situation | body,inner |  | cd3 | - | pace | order,workshop | continuation |
| 3 | enc_3_1 | situation | work,relationships |  | cd3 | - | apprentice | alexey | continuation |
| 3 | enc_3_10 | situation | work,relationships |  | cd3 | - | apprentice | alexey | continuation |
| 3 | enc_3_11 | situation | relationships,work |  | cd3 | - | commitments | order,workshop | continuation |
| 3 | enc_3_2 | situation | relationships,work |  | cd3 | - | commitments | order,workshop | continuation |
| 3 | enc_3_3 | situation | body,inner |  | cd3 | - | pace | order,workshop | continuation |
| 3 | enc_3_4 | situation | work,relationships |  | cd3 | - | apprentice | alexey | continuation |
| 3 | enc_3_5 | situation | relationships,work |  | cd3 | - | commitments | order,workshop | continuation |
| 3 | enc_3_6 | situation | body,inner |  | cd3 | - | pace | order,workshop | continuation |
| 3 | enc_3_7 | situation | work,relationships |  | cd3 | - | apprentice | alexey | continuation |
| 3 | enc_3_8 | situation | relationships,work |  | cd3 | - | commitments | order,workshop | continuation |
| 3 | enc_3_9 | situation | body,inner |  | cd3 | - | pace | order,workshop | continuation |
| 4 | enc_4_0 | situation | body,inner |  | cd3 | - | pace | order,workshop | continuation |
| 4 | enc_4_1 | situation | work,relationships |  | cd3 | - | apprentice | alexey | continuation |
| 4 | enc_4_10 | situation | work,relationships |  | cd3 | - | apprentice | alexey | continuation |
| 4 | enc_4_11 | situation | relationships,work |  | cd3 | - | commitments | order,workshop | continuation |
| 4 | enc_4_2 | situation | relationships,work |  | cd3 | - | commitments | order,workshop | continuation |
| 4 | enc_4_3 | situation | body,inner |  | cd3 | - | pace | order,workshop | continuation |
| 4 | enc_4_4 | situation | work,relationships |  | cd3 | - | apprentice | alexey | continuation |
| 4 | enc_4_5 | situation | relationships,work |  | cd3 | - | commitments | order,workshop | continuation |
| 4 | enc_4_6 | situation | body,inner |  | cd3 | - | pace | order,workshop | continuation |
| 4 | enc_4_7 | situation | work,relationships |  | cd3 | - | apprentice | alexey | continuation |
| 4 | enc_4_8 | situation | relationships,work |  | cd3 | - | commitments | order,workshop | continuation |
| 4 | enc_4_9 | situation | body,inner |  | cd3 | - | pace | order,workshop | continuation |
| any | r_breakfast | routine | body,work | alexey | cd3 | - | - | - | common |
| any | r_coins | routine | work,body | timon | cd3 | - | - | - | common |
| any | r_customer_wait | routine | work,body | alexey | cd3 | - | - | - | common |
| any | r_evening_light | routine | inner,relationships | marta | cd3 | - | - | - | common |
| any | r_kiln | routine | relationships,work | alexey | cd3 | - | - | - | common |
| any | r_letter_stack | routine | relationships,inner | liya | cd3 | - | - | - | common |
| any | r_market_price | routine | work,inner | timon | cd3 | - | - | - | common |
| any | r_marta_hello | routine | relationships,work | marta | cd3 | - | - | - | common |
| any | r_river | routine | body,inner | wanderer | cd3 | - | - | - | common |
| any | r_sweep | routine | body,work | alexey | cd3 | - | - | - | common |


## 8. Найденные проблемы baseline

1. **Нестабильные таймауты тестов.** Два сценарных теста (по 20–28 с) падают по `testTimeout` при полном параллельном `vitest run`, но проходят отдельно (~3–6 с каждый). Не связано с ТЗ; `npm run check` на медленной/загруженной машине может быть красным без причины. Рекомендую отдельную задачу (увеличить таймаут или вынести эти файлы).
2. **Устаревший отчёт** `reports/FACET-ATTENTION-SIMULATION-v1.md` (184 карточки вместо 234).
3. **Недостижимы `alchemist` и `ironic`** в симуляции профиля на реальном контенте (существующий контент-гейт).
4. **Шумная зависимость порядка.** `prepareEncounter` сначала вызывает полный `drawCard`, а затем заново строит пул — при включённом фокусе это означает двойной расчёт контекста; допустимо, но учтено в дизайне (контекст чистый и дешёвый).
5. В днях 1–10 доступно не более 19 обычных сцен, из них часть под `requires`: риск дефицита контекстных карточек (§6.3, `FOCUS_POOL_EMPTY`) на этапе 2.

## 9. Перезаписи эталона (контентные коммиты меняют легаси-розыгрыши)

Исходный эталон (этап 0) записан на SHA `ac370ba`. Контентные коммиты, которые законно меняют легаси-розыгрыши, **перезаписывают эталон старым движком** (`npm run focused:baseline:rerecord`: временный worktree на `ac370ba` + текущий контент). Затем `npm run focused:baseline` и тест AC-1 обязаны сказать IDENTICAL: это доказывает, что текущий движок при `focusedEncounters=false` ведёт себя так же, как оригинальный, на этом контенте.

| Коммит | Что изменило легаси-розыгрыши |
|---|---|
| `0de823e` | `r_letter_stack` ждёт первого письма; у `r_river` убран `character` (регрессия `npm run simulate` — TARGETS OK) |
| `37c0ac4` | продолжение `r_marta_hello` (новая карточка `r_marta_evening`), отклики главы 2 |
| `8f39016` | условия возвратов (срок свежести) — отпечаток учитывает показанный `variantId` |
| `fdfaaeb`, следующий | возвраты в бытовых сценах (показанный `variantId`) |

Проверено отдельно: добавление `textVariants` в бытовые сцены не меняет ни одного показа, набора кубика, записи истории или факта (280 из 280 прогонов совпали с вариантами и без них) — меняется только текст.
