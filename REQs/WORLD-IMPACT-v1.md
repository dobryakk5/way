# WORLD-IMPACT v1 — ощущение влияния игрока на мир

Отдельное ТЗ, которое дополняет `DAY-REFLECTION-v1`, но не меняет методологию профиля.

## 1. Цель

Сделать так, чтобы игрок не только видел итог дня, но и встречался внутри игры с последствиями собственных прошлых решений.

Игрок должен периодически испытывать узнаваемый эффект: «Это произошло потому, что я тогда выбрал именно так».

Для этого использовать прежде всего уже существующие механизмы: `facts`, `flags`, `scheduled`, `opportunities`, `Trace.readers`, `textVariants`, `choiceVariants`, `history`, `observations`, Day Reflection.

Не создавать второй движок последствий и не переносить игровой engine на сервер.

Новые механизмы v1: `visualVariants`; impact metadata для аудита контента; проверки влияния в `check-content`; метрики observable impact в симуляции.

## 2. Главный принцип

Последствие считается реальным влиянием только тогда, когда игрок может его наблюдать.

Недостаточно: `choice → fact изменился`.

Нужно: `choice → fact изменился → позже игрок увидел изменение текста / картинки / вариантов действий / события / поведения персонажа`.

Внутренний `setFact` сам по себе не является пользовательским последствием.

## 3. Не входит в задачу

Не делать: отдельную таблицу `world_impacts`; отдельный серверный event sourcing; новые психологические оценки; новые веса Action Logic; автоматическую генерацию последствий через LLM; числовой показатель «ваше влияние +5»; уведомления вроде «Ваш выбор изменил мир»; зависимость игрового движка от Day Reflection; ретроспективное изменение старых выборов.

`DAY-REFLECTION-v1` остаётся проекцией, а не источником игровых последствий.

## 4. Типы видимого влияния

```ts
type ObservableImpactKind =
  | 'callback'        // персонаж/текст вспоминает прошлое действие
  | 'choice'          // прошлое открыло/изменило будущий выбор
  | 'visual'          // изменилась видимая сцена/предмет/локация
  | 'delayed'         // появился отложенный сюжетный результат
  | 'cross-character'; // на поступок реагирует другой персонаж
```

Один результат может иметь несколько признаков (пример: доверил Тимону работу → через 2 дня Марта это упоминает = callback + delayed + cross-character).

## 5. Память персонажей

Нового runtime-механизма не вводить: `facts / flags`, `textVariants`, `Trace.readers`. Синтаксис `Condition` — существующий.

Callback должен по возможности позволять узнать поступок, а не сообщать техническое состояние. Плохо: «Тимон доверяет тебе меньше». Лучше: «Тимон помнит, что в прошлый раз ты решил всё без него». Запрещено выводить причину, которой фактически нет в состоянии/trace.

## 6. Влияние на будущие варианты решений

Использовать существующие `choiceVariants`: прошлое решение может менять набор реально доступных действий. Новый механизм не нужен.

`check-content.ts` должен гарантировать: `choice.id` уникален в пределах карточки с учётом всех `choiceVariants`; `Condition` ссылается на существующий fact/flag; у читаемого значения существует достижимый writer; `choiceVariant` реально достижим хотя бы в одной ветке. Существующую проверку уникальности `choiceId` сохранить.

## 7. Отложенные последствия

Использовать существующие `effects.schedule`, `scheduled`, chain cards, `required/latestDay`. Особенно ценны последствия, которые создают новое решение, а не только текст. Не превращать любой callback автоматически в diagnostic evidence.

## 8. Визуальные изменения мира (основная новая runtime-возможность)

```ts
interface VisualVariant { id: string; when: Condition; image: string; alt?: string }
interface Card { /* существующие поля */ image?: string; visualVariants?: VisualVariant[] }
```

Если фактическое имя поля с изображением в текущем типе другое — использовать существующее имя, не создавать параллельное.

## 9. Выбор визуального варианта

Чистая функция `resolveCardVisual(state, content, card): ResolvedCardVisual | undefined`, где `ResolvedCardVisual = { variantId?, image, alt? }`.

Алгоритм: проверить `visualVariants` по порядку; взять первый, чей `when === true`; если подходящего нет — базовое `image`; не использовать `Math.random`.

## 10. Визуал замораживается при показе

Нельзя вычислять `visualVariants` внутри React при каждом render. Нужно: prepare/persist draw → `resolveCardVisual()` → сохранить выбранный visual вместе со snapshot предъявленной сцены → UI только отображает snapshot. Reload/back показывают тот же визуальный вариант. Не создавать параллельный механизм сохранения.

## 11. Cross-character последствия

Использовать существующие `Trace.readers` и условия контента. Для таких последствий в симуляции: `kind = callback`, `crossCharacter = true`. Определяется по `character` исходной карточки и карточки-reader.

## 12. Audit metadata для важных выборов

```ts
type ImpactLevel = 'minor' | 'meaningful' | 'major';
interface ChoiceImpactMeta { level: ImpactLevel; require?: { minObservable?: number; delayed?: boolean; crossCharacter?: boolean } }
interface Choice { /* existing */ impact?: ChoiceImpactMeta }
```

`impact` не записывается как факт мира, не влияет на выбор карточек, на профиль, не читается игровыми `Condition`; используется валидатором, тестами и симулятором.

## 13. Требования к уровням

`minor` — требований нет. `meaningful` — минимум 1 наблюдаемое последствие. `major` — минимум 2; минимум одно должно быть delayed ИЛИ cross-character ИЛИ менять future choice. Для ключевых решений первых трёх дней предпочтительно: immediate reaction + delayed/cross-character/future-choice. Не доводить каждую бытовую кнопку до `major`.

## 14–15. Как валидатор определяет последствия; статический influence graph

Список последствий не дублирует контент: `check-content` строит связи из уже имеющихся данных (`setFacts/setFlags` → textVariants / choiceVariants / visualVariants; `schedule` → будущая карточка; `Trace.readers`). Индекс `byChoice: Map<cardId+choiceId, ObservableImpactDefinition[]>`.

## 16. Проверки `visualVariants`

`id` уникален в карточке; `when` валиден; все fact/flag существуют; у condition есть потенциальный writer; `image` задан; файл существует; два безусловно достижимых варианта не создают неоднозначность; базовая картинка остаётся допустимым fallback. Порядок — как у `textVariants`.

## 17. Day Reflection

Summary сообщает только то, что реально произошло. `impact` metadata никогда не является достаточным `SummarySource`. Поле `impactKind` в `worldChanges` — только если действительно нужно.

## 18. UI

Нового экрана нет. Влияние проявляется в карточке/сцене: другой текст, другая картинка, другой набор choices, новая scheduled сцена, callback NPC. Не показывать «+1 влияние», «Мир изменён», «Вы открыли последствие».

## 19–21. Observable Impact для симуляции

```ts
interface ObservableImpactEvent { sourceCardId; sourceChoiceId; day; visibleCardId; kinds: ObservableImpactKind[]; sourceCharacter?; visibleCharacter? }
```

Не обязательно хранить в `GameState`. Считать только фактически показанное: выбранный textVariant, предъявленный choiceVariant, показанный visualVariant, показанный scheduled follow-up, предъявленный Trace.reader. Наличие потенциального reader недостаточно.

Метрики: observable impact count by day; first observable impact day; impact kinds by day; число различных исходных выборов, чьи последствия реально увидены; delayed; cross-character; choice-changing; visual. Отдельно дни 1, 2, 3, 7.

## 22–23. Критерий первых трёх дней и симуляции

К концу дня 1 — хотя бы 1 узнаваемая реакция на собственный выбор. К концу дня 3 — минимум 2 последствия от разных исходных решений, и одно из них delayed / cross-character / future-choice / visual. Не привязывать конкретный callback к номеру дня в engine.

100% обязательных scripted test policies выполняют критерий; в полной стохастической симуляции ≥ 95%. Если ниже — исправлять контент и достижимость readers, а не ослаблять метрику. Отдельно доля прохождений, где первый observable impact возникает: в день 1 / до конца дня 2 / до конца дня 3 / позже / никогда.

## 24–25. Первая поставка контента

Не размечать все 30 дней: первые три дня, примерно 6–8 наиболее заметных решений с полноценными следами (NPC callback, cross-character, будущий choice, scheduled consequence, visual change, opportunity expiration/taken). Для каждого `major`: исходный выбор → немедленная реакция → факт / trace / schedule → поздний observable impact. 3–5 повторяющихся объектов/мест с вариантами состояния: тот же ракурс + видимое изменение объекта. После проверки первых трёх дней масштабировать на остальной эпизод.

## 26. Детерминированность

Все новые функции чистые. Запрещено `Math.random()`, `Date.now()`, зависимость от порядка React render. Одинаковые `contentVersion`, `seed`, `runId`, `state`, `history` дают одинаковый observable world.

## 27. Сохранения и версии

`Card.visualVariants?` и `Choice.impact?` — контентные. Snapshot выбранного visual становится частью сохранения. Если работа идёт поверх неопубликованной `mvp-v2.5-alpha.2`, не создавать искусственный `alpha.3`. Если опубликована или есть реальные сохранения — поднять `CONTENT_VERSION` и добавить аддитивную миграцию. Не ослаблять проверку неизвестных версий. Старый save без resolved visual остаётся загружаемым.

## 28. Файлы

`src/engine/types.ts`, `src/engine/draw.ts` (resolveCardVisual, freeze), `src/engine/apply.ts` принципиально не менять; `src/content/data/*`; `scripts/check-content.ts`; симулятор; UI карточки; `reports/`. Если симуляция v2.5 в другом файле — расширять её, не создавать второй независимый.

## 29–30. Тесты

Unit: нет visualVariants → базовая картинка; подходящий вариант заменяет базовую; порядок; reload не меняет показанный visual; изменившийся после показа fact не меняет сохранённый; недостижимый visualVariant ловится; неизвестный fact/flag ловится; `meaningful` без reader отклоняется; `major` с одним последствием отклоняется; `major` с двумя immediate-only отклоняется, если требует delayed/cross-character; future choiceVariant считается impact только если был показан; не показанный scheduled reader runtime-impact не создаёт; cross-character только при разных персонажах; одинаковый seed/state → одинаковый visual.

Integration: A choice→fact→textVariant; B choice→fact→choiceVariant; C choice→fact→visualVariant; D choice→schedule→delayed card; E персонаж A → Trace/read condition → реакция персонажа B; F opportunity open→expired→мир показывает результат; G reload между выбором и follow-up — последствие не теряется.

## 31. Независимость Day Reflection

Одно и то же прохождение с включённым summary и без `nights[].summary` → одинаковое состояние мира, будущие карточки, visualVariants, choiceVariants. `World → Day Reflection`, никогда наоборот.

## 32. Контентный аудит

Отчёт: все choices первых 3 дней; impact level; какие facts/flags пишут; какие readers имеются; что реально показалось в симуляциях; день первого видимого последствия; тип; есть ли cross-character / delayed / visual / future-choice. Выделить `major choice without observable consequence` — после приёмки таких быть не должно.

## 33. Definition of Done

Игровая логика и профиль не изменены; сервер не потребовал новой схемы; `visualVariants` детерминированы и сохраняются; callbacks используют реальные facts/traces; значимые прошлые выборы могут менять будущие choices; scheduled последствия работают; cross-character callbacks достижимы; валидатор выявляет «мёртвые» значимые выборы; первые три дня размечены; симуляция измеряет именно показанные последствия; критерий первых трёх дней выполняется; `npm run check` и production build проходят; Day Reflection остаётся только читателем; нет регрессий существующих сохранений.

## 34. Приоритет реализации

1. impact graph + проверки существующего контента; 2. visualVariants + snapshot; 3. simulation observable impact; 4. разметка 6–8 решений первых трёх дней; 5. callbacks через textVariants/Trace; 6. future choice через choiceVariants; 7. 3–5 визуальных состояний; 8. полный simulation report; 9. браузерная проверка первых трёх дней; 10. `npm run check` + production build.

Перед масштабированием на весь эпизод остановиться и показать результат первых трёх дней. Если там игрок уже несколько раз может самостоятельно связать изменение мира со своим прошлым решением, механизм достиг цели.
