# CONTENT-INTEGRATION-REVIEW-v1
## Reconciliation пакета диагностики и development-контента

**Дата:** 5 октября 2026  
**Статус:** content package reconciled; следующий gate — blind calibration + repo binding.

## 1. Входные артефакты

Проверены и сведены:

- `DEVELOPMENT-RUBRIC-v1`
- `DIAGNOSTIC-PROBES-v1`
- `NEUTRAL-DIAGNOSTIC-CONTENT-v1`
- `DEVELOPMENT-PRODUCTION-CARDS-v1`

## 2. Что исправлено

### 2.1. Position bias neutral

В исходном neutral-пуле общий top-1 баланс был идеальным (16 вариантов на каждую логику), но позиции ответов были связаны со стадиями. После reconciliation 32 основных кейса переставлены без изменения текста и `LogicVector`.

**Новая обязательная матрица:** для каждой из 8 логик top-1 встречается ровно **4 раза на A, 4 на B, 4 на C и 4 на D**.

Motive prompts и behavior continuations также переставлены так, чтобы top-1 каждой логики был распределён по позициям максимально равномерно в пределах математически возможного.

### 2.2. Position bias probes

В каждой тройке сцен одной соседней пары роли вращаются:

```text
.01  A=left   B=right  C=control
.02  A=right  B=control C=left
.03  A=control B=left   C=right
```

Поэтому позиция больше не кодирует направление развития.

### 2.3. Position bias development cards

36 исходных development-карточек переставлены так, чтобы target `DevelopmentEvidence` не находился почти всегда на позиции №2. В каждой из шести arc исходные 6 карточек дают target по два раза на каждой позиции 1/2/3.

Добавленные retry-support карточки распределены ещё на 14 позиций. Итог по 50 карточкам: target-choice на позиции **1 — 17 раз, 2 — 17 раз, 3 — 16 раз**.

### 2.4. Retry graph

Исходный пакет уверенно закрывал retry после pressure, но не полностью закрывал withdrawal на ранних beats. Добавлены **14 retry-support карточек**:

- 6 × `retry-trial`;
- 6 × `retry-transfer`;
- 1 × `retry-review` для O→D;
- 1 × `retry-consequence` для D→E.

Существующие 6 `retry.01` остаются pressure-retry.

Итого пакет шести новых arc теперь содержит **50 production-карточек** вместо 36; все 50 `cardId` уникальны.

## 3. Формальная retry-машина

```text
trial withdrawal       → retry-trial       → consequence
consequence withdrawal → retry-consequence → review
review withdrawal      → retry-review      → transfer
transfer withdrawal    → retry-transfer    → pressure
pressure withdrawal    → retry-pressure    → pendingPromotion
```

Каждый retry требует cooldown: 1 завершённый вечер **или** 2 обычных resolved выбора. Валидные evidence прежних beats не удаляются.

## 4. Что намеренно НЕ исправлялось автоматически

Reconciliation не меняет содержательную принадлежность choice к логике и не «улучшает» спорные векторы. Это должен сделать blind-review. Не менялись также реальные NPC IDs, runtime effects и календарные окна — они зависят от репозитория.

## 5. Следующий quality gate

До production нужны:

1. blind-review `Rubric + 21 probes + 32 neutral`;
2. Cohen’s κ по лидирующей логике ≥ 0.70 либо документированная переработка спорных сцен;
3. `simulate-profile`: 8 target, mixed, insufficient, transition;
4. проверка false-stable и confusion соседних пар;
5. repo-binding 50 development cards: реальные NPC, effects, conditions, calendar windows;
6. content validator на retry reachability и positional bias;
7. итоговое `IMPLEMENTATION-v2.5-DEVELOPMENT-CONTENT.md`.

## 6. Новые валидаторы, которые должны войти в v2.5

- `check-choice-position-bias`: neutral top-1/position; probe role rotation; development target/position;
- `check-retry-coverage`: любой reachable withdrawal имеет достижимый retry того же beat;
- `check-choice-id-binding`: vectors/events привязаны к choiceId, не к индексу;
- `check-retry-cooldown`: retry не появляется немедленно;
- `check-development-reachability`: для каждой arc существуют control / withdrawal / fast mastery / mastery after retry пути.

## 7. Статус после reconciliation

```text
Behavior Matrix       DONE
Development Rubric    DONE / ready for blind review
21 Probes             DONE / position-balanced / ready for blind review
32 Neutral            DONE / position-balanced / ready for blind review
6 Development arcs    DONE at content level
Production cards      50 cards / retry graph closed at content level
Profile engine        implemented separately under v2.4 workstream
Repo binding          TODO
Calibration           TODO
Final v2.5 spec        TODO
```
