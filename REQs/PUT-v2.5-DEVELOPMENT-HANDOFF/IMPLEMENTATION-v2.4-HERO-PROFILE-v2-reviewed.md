# ТЗ на реализацию: «Путь» v2.4 — профиль логики героя

Дата: 5 октября 2026 года  
Редакция: 1.1 — после проверки внутренней непротиворечивости  
Основание: `REQUIREMENTS-v2.4(1).md` + `REQUIREMENTS-v2.4-ADDENDUM.md`  
Целевая кодовая база: текущий снимок `src.zip` + `scripts.zip`.

## 1. Цель реализации

Реализовать в существующей игре постоянное наблюдение за логикой действий **вымышленного героя** по реальным решениям в сюжете и отделить это наблюдение от уже существующего механизма подтверждаемого развития.

После доработки новая игра должна работать по цепочке:

**открытые ситуации → диагностические кейсы → свидетельства → текущий профиль 100% → устойчивый наблюдаемый центр → адаптация свободных ситуаций → обнаружение ограничения текущего способа → подтверждённое освоение следующего способа через сюжетный опыт.**

Критически важно сохранить две независимые системы:

1. `heroDevelopmentProfile` — наблюдает, **какие логики проявляются в решениях героя**.
2. `development` — фиксирует, **какой способ герой подтвердил опытом и какой следующий способ осваивает**.

Изменение процентов профиля не является развитием. Подтверждённое развитие само по себе не меняет диагностические проценты.

## 2. Приоритет и неизменяемые правила

Это ТЗ реализует дополнение к v2.4. При конфликте с текущим кодом и исходным `REQUIREMENTS-v2.4` действуют новые правила.

Обязательные изменения поведения:

- новая игра **не начинается Экспертом**;
- новая игра не получает заранее `available = [opportunist, diplomat, expert]`;
- новая игра не активирует автоматически `expert-achiever`;
- первый `developmentCurrent` устанавливается только после первого устойчивого `observedPrimary`;
- все восемь логик участвуют в диагностике с начала новой игры;
- один ответ, даже с сильным сигналом Стратега/Алхимика, не назначает центр;
- старые `qualities`, `decisionKinds`, успех/провал результата мира не преобразуются автоматически в логики;
- мотив не угадывается из действия;
- наступившее последствие мира не является диагностическим `behavior`; учитывается только отдельная последующая реакция героя;
- `adaptive`-свидетельства не могут подтверждать текущий наблюдаемый центр;
- проценты — производная от `evidence[]`, а не источник истины;
- уже показанные карточка, текст, стороны и варианты не меняются после уточнения профиля;
- обязательные события, кризисы, назначенные последствия и дедлайны всегда приоритетнее диагностической адаптации.

## 3. Что есть в текущем коде и что требуется изменить

Текущая реализация уже содержит:

- `ActionLogic` на 8 логик в `src/engine/types.ts`;
- `HeroDevelopment.current`, `available`, `growingEdge`, `activeArcId`, `evidence`, `pendingPromotion`, `transitions`;
- `initialDevelopment()` в `src/engine/development.ts`, который назначает `development.json.initial.current`;
- единственную готовую сюжетную цепочку `expert → achiever`;
- запись `trial / consequence / review / transfer / pressure / withdrawal`;
- подтверждение перехода через `developmentProgress()` и ночной `commitDevelopmentPromotion()`;
- фильтрацию карточек через `developmentCardEligible()`;
- строгую валидацию сохранений и миграцию v3 → текущая версия;
- `JourneyScreen`, который сейчас предполагает, что `development.current` всегда существует;
- `DebugPanel` и скрипты проверки/симуляции.

Новая реализация должна **сохранить механизм реального освоения**, но изменить вход в него и добавить отдельный модуль наблюдения.

## 4. Целевая структура модулей

Создать/изменить следующие зоны.

### Новые файлы

```text
src/engine/heroDevelopmentProfile.ts
src/engine/heroDevelopmentProfile.test.ts
src/content/data/development-profile.json
src/ui/screens/MotiveScreen.tsx
scripts/profile-scenarios.ts
scripts/simulate-profile.ts
```

При необходимости разрешается разделить `heroDevelopmentProfile.ts` на `profile/cases.ts`, `profile/scoring.ts`, `profile/stability.ts`, если один файл становится трудно поддерживать. Публичный API при этом экспортировать из одного модуля.

### Изменяемые файлы

```text
src/engine/types.ts
src/engine/development.ts
src/engine/initialState.ts
src/engine/apply.ts
src/engine/day.ts
src/engine/draw.ts
src/engine/journey.ts
src/engine/schedule.ts
src/engine/conditions.ts
src/engine/navigation.ts
src/engine/index.ts

src/content/index.ts
src/content/version.ts
src/content/data/development.json
src/content/data/cards.*.json

src/ui/screens/JourneyScreen.tsx
src/App.tsx
src/debug/DebugPanel.tsx

src/persistence/save.ts
src/persistence/migration.test.ts
src/persistence/save.test.ts

scripts/schema.ts
scripts/check-content.ts
scripts/development-scenarios.ts
scripts/simulate-development.ts
```

## 5. Контракты состояния

### 5.1. `HeroDevelopment`

Переименовать поля без параллельного дублирования:

```ts
interface HeroDevelopment {
  developmentCurrent?: ActionLogic;
  currentOrigin?: 'observed-initial' | 'transition' | 'legacy-authored';

  // Только логики, подтверждённые в этом прохождении или перенесённые как legacy.
  // Более ранние логики не добавляются автоматически из-за их положения в последовательности.
  available: ActionLogic[];

  transitionTarget?: ActionLogic;
  activeArcId?: string;

  evidence: DevelopmentEvidence[];
  pendingPromotion?: { arcId: string; to: ActionLogic };
  transitions: {
    arcId: string;
    from: ActionLogic;
    to: ActionLogic;
    day: number;
    evidenceIds: string[];
  }[];
}
```

Правила:

- в новой игре `developmentCurrent`, `currentOrigin`, `transitionTarget`, `activeArcId`, `pendingPromotion` отсутствуют;
- `available = []`;
- после первого устойчивого центра: `developmentCurrent = observedPrimary`, `currentOrigin = 'observed-initial'`, `available = [observedPrimary]`;
- после подтверждённого перехода новая логика добавляется в `available`, `currentOrigin = 'transition'`;
- мигрированный старый Эксперт: `currentOrigin = 'legacy-authored'`;
- условия `availableLogic` продолжают означать **подтверждённый в истории способ**, а не «все более ранние стадии».

### 5.2. Основные типы профиля

Добавить:

```ts
type DiagnosticSource = 'action' | 'motive' | 'behavior';
type DiagnosticSelectionOrigin = 'neutral' | 'probe' | 'adaptive';
type ProfileStatus = 'insufficient' | 'provisional' | 'stable';

type LogicVector = Record<ActionLogic, number>;

type RubricAxis =
  | 'SELF'
  | 'OTHERS'
  | 'COMPLEXITY'
  | 'TIME'
  | 'PERSPECTIVE'
  | 'UNCERTAINTY';

type DiagnosticRationale = Record<RubricAxis, string>;
```

### 5.3. Диагностическое свидетельство

```ts
interface HeroDevelopmentProfileEvidence {
  id: string;
  caseId: string;
  situationId: string;
  source: DiagnosticSource;

  day: number;
  slot: number;
  cardId: string;
  choiceId: string;
  variantId?: string;
  motiveOptionId?: string;

  contextId: string;
  facets: LifeFacet[];
  pressure: boolean;

  selectionOrigin: DiagnosticSelectionOrigin;
  developmentWeight: number;
  vector: LogicVector;

  algorithmVersion: string;
  scoringVersion: string;
  rubricVersion: string;
  contentVersion: string;
}
```

`effectiveWeight` и вклад каждой логики не хранить как независимую истину: вычислять из сохранённых исходных данных. Для `behavior` поля `contextId`, `facets`, `pressure`, `developmentWeight` копируются из исходного `DiagnosticCase`; `day/slot/cardId/choiceId` описывают фактический follow-up выбор.

### 5.4. `DiagnosticCase`

```ts
interface DiagnosticCase {
  id: string;
  situationId: string;

  openedDay: number;
  openedSlot: number;
  cardId: string;
  choiceId: string;

  contextId: string;
  facets: LifeFacet[];
  pressure: boolean;
  actionOrigin: DiagnosticSelectionOrigin;
  developmentWeight: number;

  actionEvidenceId: string;
  motiveEvidenceId?: string;
  behaviorEvidenceId?: string;

  motiveState: 'none' | 'pending' | 'recorded' | 'skipped' | 'suppressed';
  behaviorState: 'none' | 'pending' | 'recorded' | 'expired';

  status: 'open' | 'complete' | 'expired';
  expiresDay: number;
}
```

`caseId` должен быть детерминированным для фактического решения, например:

```text
runId/day/slot/cardId/choiceId/situationId
```

Повторный вызов регистрации того же источника использует ключ `caseId + source` и ничего не добавляет.

Автомат состояний кейса:

- при `openDiagnosticCase()` action сразу считается записанным;
- `motiveState = pending`, только если у choice есть `diagnosticMotive` **и** на этот день ещё не исчерпан лимит мотив-вопросов;
- если мотив-вопрос отсутствует, `motiveState = none`; если он есть, но дневной лимит исчерпан, `motiveState = suppressed`;
- `behaviorState = pending`, если в версионированном контенте существует допустимое продолжение `continuesSituationId === situationId`; иначе `none`;
- если `expiresInDays` не задан, использовать `defaultExpiresInDays = 3` из versioned config;
- `expiresDay = openedDay + expiresInDays`; поведение разрешено во всех слотах дня `expiresDay` включительно; истечение применяется только при вечерней фиксации этого дня после всех слотов;
- кейс становится `complete`, когда ни motive, ни behavior больше не находятся в `pending`;
- если срок behaviour истёк, `behaviorState = expired`; если других pending-источников нет, `status = expired`;
- `complete/expired` кейс больше не принимает новые motive/behavior evidence.

`GameState` обязан содержать стабильный `runId: string`. Новая игра создаёт его один раз. Миграция legacy-состояния без `runId` создаёт детерминированный идентификатор из канонического legacy save, чтобы повторная миграция того же входа не меняла `caseId`.

### 5.5. Расчётный срез профиля

```ts
interface DevelopmentProfileSlice {
  distribution?: LogicVector;
  N: number;
  W: number;
  K: number;
  delta: number;
  coverage: number;
  confidence: number;
  caseIds: string[];
}
```

### 5.6. Вечерний снимок

```ts
interface DevelopmentProfileEveningSnapshot {
  day: number;
  status: ProfileStatus;
  current: DevelopmentProfileSlice;
  observedPrimary?: ActionLogic;
  candidatePrimary?: ActionLogic;
  candidateSinceDay?: number;
  candidateSinceIndependentActionCount?: number;
  asOfEvidenceCount: number;
  fallback?: ActionLogic;
  leadingEdge?: ActionLogic;
  emergingSignals: {
    logic: ActionLogic;
    actionCount: number;
    contextIds: string[];
    evidenceIds: string[];
  }[];
}
```

Снимок — проверяемый кеш и аудит. Источник истины — журнал фактических свидетельств.

### 5.7. `heroDevelopmentProfile`

```ts
interface HeroDevelopmentProfile {
  algorithmVersion: '1';

  evidence: HeroDevelopmentProfileEvidence[];
  cases: DiagnosticCase[];

  status: ProfileStatus;

  lifetimeDistribution?: LogicVector;
  currentDistribution?: LogicVector;

  observedPrimary?: ActionLogic;
  candidatePrimary?: ActionLogic;
  candidateSinceDay?: number;
  candidateSinceIndependentActionCount?: number;

  fallback?: ActionLogic;
  leadingEdge?: ActionLogic;
  emergingSignals: DevelopmentProfileEveningSnapshot['emergingSignals'];

  coverage: number;
  confidence: number;

  facets: Record<LifeFacet, {
    lifetime?: DevelopmentProfileSlice;
    current?: DevelopmentProfileSlice;
    sufficient: boolean;
  }>;

  eveningSnapshots: DevelopmentProfileEveningSnapshot[];
}
```

Добавить `GameState.heroDevelopmentProfile`.

### 5.8. Состояние необязательного вопроса о мотиве

Добавить фазу:

```ts
type Phase = ... | 'motive';
```

и:

```ts
interface PendingMotive {
  caseId: string;
  promptId: string;
  text: string;
  options: { id: string; label: string }[];
  // Куда продолжить после ответа/пропуска.
  resume: { day: number; slot: number; next: 'next-slot' | 'evening' };
}
```

В `GameState`:

```ts
pendingMotive?: PendingMotive;
```

Показанный prompt и список вариантов сохраняются snapshot-ом так же, как сейчас сохраняется показанная пара карточки. Перезагрузка не должна менять уже предъявленный вопрос.

## 6. Контракты авторского контента

### 6.1. Версионируемая конфигурация

Создать `src/content/data/development-profile.json` как реестр алгоритмов, а не как один изменяемый набор чисел:

```json
{
  "currentAlgorithmVersion": "1",
  "algorithms": {
    "1": {
      "scoringVersion": "1",
      "rubricVersion": "1",
      "windowCases": 24,
      "defaultExpiresInDays": 3,
      "motivePrompt": { "maxPerDay": 1 },
      "probe": { "maxShareOfIndependentWindow": 0.3333333333333333 },
      "sourceWeights": {
        "action": 0.50,
        "motive": 0.30,
        "behavior": 0.20
      },
      "provisional": {
        "minDay": 3,
        "minCases": 5,
        "minContexts": 2
      },
      "stableCandidate": {
        "minDay": 3,
        "minCases": 12,
        "minWeight": 5,
        "minContexts": 3,
        "minLeaderShare": 0.30,
        "minDelta": 0.10,
        "minConfidence": 0.60,
        "evenings": 2,
        "minNewIndependentActionsBetweenConfirmations": 2
      },
      "confidence": {
        "nTarget": 24,
        "wTarget": 10,
        "kTarget": 4,
        "deltaTarget": 0.15
      },
      "facetConfidence": {
        "nTarget": 6,
        "wTarget": 2.5,
        "kTarget": 2,
        "deltaTarget": 0.15,
        "minCases": 4,
        "minWeight": 1.5,
        "minContexts": 2,
        "minConfidence": 0.45
      }
    }
  }
}
```

Конкретное прохождение навсегда привязано к `heroDevelopmentProfile.algorithmVersion`. При реконструкции evidence и snapshots валидатор обязан брать именно соответствующую ветку `algorithms[algorithmVersion]` и проверять совпадение `scoringVersion`/`rubricVersion`. Изменять числа внутри уже опубликованной ветки запрещено; новая методика получает новую версию.

В этом же versioned-наборе или в отдельном versioned `development-rubric.json` хранить rubric восьми логик. В браузерной логике rubric не используется для автоматической классификации; он нужен валидатору, debug и редакторскому аудиту.

`minDelta = 0.10` оставить намеренно: при близких лидерах система должна требовать почти полное покрытие окна. Это отдельный явный guardrail, даже если при текущей формуле часть его эффекта уже следует из `confidence`.

### 6.2. Диагностическая метаинформация карточки

Расширить `Card`:

```ts
interface CardDiagnostic {
  situationId: string;
  contextId: string;
  facets: LifeFacet[];
  developmentWeight: number; // 0..1

  pressure?: boolean;
  expiresInDays?: number;

  // Сцена пригодна для целевого probe-подбора.
  distinguishes?: ActionLogic[];
}

interface Card {
  ...
  diagnostic?: CardDiagnostic;
}
```

`diagnostic.facets` — грани **самой ситуации**, а не `servesFacets` выбранного ответа.

`contextId` — смысловая задача, а не card id и не обязательно грань.

### 6.3. Разметка действия

Расширить `Choice`:

```ts
interface DiagnosticSignalDefinition {
  vector: LogicVector;
  rationale: DiagnosticRationale;
  scoringVersion: '1';
  rubricVersion: '1';
}

interface Choice {
  ...
  diagnosticAction?: DiagnosticSignalDefinition;
  diagnosticMotive?: {
    promptId: string;
    text: string;
    optional: true;
    options: {
      id: string;
      label: string;
      signal: DiagnosticSignalDefinition;
    }[];
  };
  diagnosticBehavior?: {
    continuesSituationId: string;
    signal: DiagnosticSignalDefinition;
  };
}
```

Ограничение: один фактический choice не может одновременно быть `diagnosticAction` нового кейса и `diagnosticBehavior` старого кейса.

### 6.4. Валидация векторов

Для каждого `vector`:

- ровно 8 ключей;
- все значения конечны и `>= 0`;
- сумма `1 ± 1e-9`;
- минимум две ненулевые компоненты;
- максимум одной компоненты `<= 0.70`;
- автоматическая нормализация запрещена;
- у каждой ненулевой компоненты должно быть содержательное основание в `rationale`;
- `rationale` содержит все 6 осей, допускается текст `не наблюдается`.

## 7. Модуль `heroDevelopmentProfile.ts`

Реализовать чистые функции. Имена могут незначительно отличаться, но обязанности должны остаться разделёнными.

```ts
createEmptyHeroDevelopmentProfile(config): HeroDevelopmentProfile

openDiagnosticCase(state, content, card, choice, selectionOrigin): GameState
recordDiagnosticAction(state, content, caseId, card, choice): GameState
recordDiagnosticMotive(state, content, caseId, promptId, optionId): GameState
skipDiagnosticMotive(state, caseId): GameState
recordDiagnosticBehavior(state, content, card, choice, selectionOrigin): GameState
expireDiagnosticCases(state, content): GameState

calculateProfileSlice(state, content, scope): DevelopmentProfileSlice
recalculateHeroDevelopmentProfile(state, content): GameState
updateObservedPrimaryAtEvening(state, content): GameState
updateFallbackLeadingEdgeAndSignals(state, content): GameState
establishInitialDevelopmentCurrent(state, content): GameState

validateHeroDevelopmentProfile(state, content): boolean
```

### 7.1. Формула вклада

Для источника:

```text
effectiveWeight = developmentWeight × sourceCoefficient
contribution[logic] = effectiveWeight × vector[logic]
```

Для кейса:

```text
Wcase = developmentWeight ×
        (0.50 × actionPresent
       + 0.30 × motivePresent
       + 0.20 × behaviorPresent)
```

Общий вес:

```text
W = Σ Wcase
```

Профиль:

```text
profile[logic] = S[logic] / W, W > 0
```

При `W = 0` распределение отсутствует, `confidence = 0`.

Отсутствующий источник даёт 0. Его коэффициент не перераспределяется.

### 7.2. Историческое распределение

`lifetimeDistribution` включает все валидные свидетельства, включая `adaptive`.

Старые данные не затухают и не удаляются.

### 7.3. Актуальное независимое окно

`currentDistribution`:

1. взять кейсы с зарегистрированным независимым action evidence происхождения `neutral | probe`;
2. отсортировать по позиции исходного действия;
3. взять последние 24;
4. для выбранных кейсов включить допустимые независимые источники;
5. источник продолжения с происхождением `adaptive` в актуальный расчёт не включать;
6. поздний behavior кейса, уже вышедшего из окна, меняет только исторический профиль.

Мотив не перемещает кейс в конец окна.

### 7.4. `N / W / K / delta / coverage / confidence`

```text
N = число кейсов окна с зарегистрированным независимым action
W = фактически внесённый независимый вес окна
K = число разных contextId исходных действий окна
Δ = leaderShare - secondShare

coverage = 0.35 × min(N / 24, 1)
         + 0.35 × min(W / 10, 1)
         + 0.30 × min(K / 4, 1)

separation = min(Δ / 0.15, 1)
confidence = coverage × separation
```

Пороговые проверки используют неокруглённые значения.

### 7.5. Статусы

`insufficient`:

- до дня 3; или
- `N < 5`; или
- `K < 2`.

`provisional`:

- предварительного материала достаточно;
- устойчивый центр ещё не подтверждён либо прежний вывод сейчас уточняется.

`stable`:

- один кандидат выполнил все критерии два разных последовательных завершённых вечера.

### 7.6. Кандидат центра

Кандидат существует только если одновременно:

```text
day >= 3
N >= 12
W >= 5
K >= 3
leaderShare >= 0.30
Δ >= 0.10
confidence >= 0.60
```

Первый подходящий вечер:

```text
candidatePrimary = leader
candidateSinceDay = day
candidateSinceIndependentActionCount = totalIndependentActionCountAsOfEvening
```

Сам по себе второй календарный вечер не является подтверждением. Для фиксации `stable` одновременно требуются:

- другой завершённый вечер;
- тот же кандидат и все критерии снова выполнены;
- после первого кандидатного вечера зарегистрировано минимум `minNewIndependentActionsBetweenConfirmations = 2` новых **independent action cases** (`neutral | probe`). Motive/behavior без нового action это условие не закрывают.

Если следующий вечер наступил без достаточного числа новых independent action cases, кандидат сохраняется, но `stable` не устанавливается. Это задержка ожидания новых наблюдений, а не второе подтверждение.

Если лидер изменился — начать подтверждение заново и обновить anchor count. Если кандидата нет — очистить текущего кандидата; если ранее был `observedPrimary`, оставить его как последний подтверждённый вывод, но статус сделать `provisional`.

Если после такого дребезга прежний `observedPrimary` снова становится лидером, он **не восстанавливает `stable` за один вечер**: требуется новая двухточечная фиксация по тем же правилам и с новыми независимыми action между фиксациями. UI всё это время показывает, что прежний вывод уточняется.

Повторный вызов обработки того же вечера ничего не меняет.

### 7.7. `fallback`

Считать только после появления `developmentCurrent`.

Подвыборка:

- независимые кейсы актуального окна;
- `pressure = true`;
- минимум 3 действия;
- минимум 2 контекста.

Кандидат:

- лидер подвыборки;
- доля `>= 0.30`;
- преимущество `>= 0.10`;
- логика строго раньше `developmentCurrent`;
- условия выполнены два последовательных вечера.

Если лидер равен текущей или позже неё — `fallback` отсутствует.

### 7.8. `leadingEdge`

Только следующая соседняя логика после `developmentCurrent`.

Условия:

- её доля `currentDistribution >= 0.15`;
- минимум 3 независимых action с компонентой этой логики `>= 0.35`;
- минимум 2 контекста.

Это наблюдение, а не разрешение перехода.

### 7.9. `emergingSignals`

Для каждой более дальней поздней логики:

- минимум 3 независимых action текущего окна;
- компонент этой логики в каждом `>= 0.35`;
- минимум 2 контекста.

Не менять `transitionTarget` и не перескакивать промежуточные переходы.

### 7.10. Профили граней

Грани:

```text
work          Дело и деньги
relationships Отношения
body          Тело и здоровье
inner         Внутренний мир
```

Если кейс относится к двум граням, вклад каждого его источника в грань делится пополам. Общий профиль получает полный вклад один раз.

Актуальная грань использует поднабор кейсов **общего окна**, а не собственные последние 24. Для граней нельзя использовать общие targets `N=24/W=10/K=4`: они заведомо слишком велики для подвыборки. Использовать отдельные `facetConfidence` targets из versioned config.

`facet.sufficient = true` только если одновременно:

```text
Nfacet >= 4
Wfacet >= 1.5
Kfacet >= 2
facetConfidence >= 0.45
```

Для первой версии **не хранить и не показывать отдельный `facets[].observedPrimary`**: грань является объясняющим срезом, а не самостоятельной стадией. При `sufficient = true` UI может показывать распределение/лидирующий способ как текущий срез без слова «устойчивый центр». При `false` грань скрывается из пользовательского «Подробнее» и остаётся доступна только в debug.

Центр общего профиля не вычислять голосованием граней.

## 8. Регистрация действия, мотива и поведения

### 8.1. Порядок в `applyChoice()`

Текущий `applyChoice()` необходимо рефакторить так, чтобы после выбора можно было остановиться на вопросе о мотиве, не продвигая слот дважды.

Целевой порядок:

```text
1. проверить текущую сохранённую пару;
2. применить эффекты мира;
3. записать history/trace/line evidence;
4. записать существующее development evidence;
5. если choice = behavior старого DiagnosticCase:
     записать behavior старого кейса;
   иначе если card/choice диагностические:
     открыть новый кейс и записать action;
6. пересчитать производные профиля;
7. удалить current;
8. если для выбранного action есть motive prompt И дневной лимит мотив-вопросов не исчерпан:
     motiveState = pending;
     сохранить pendingMotive;
     phase = motive;
     НЕ переходить в следующий слот;
   иначе:
     если motive prompt был, но лимит исчерпан: motiveState = suppressed;
     вызвать общий helper завершения choice.
```

Вынести текущую логику «следующий слот или evening» в чистый helper, например:

```ts
advanceAfterResolvedChoice(state, content): GameState
```

Его вызывают и обычный выбор, и завершение motive.

### 8.2. Мотив

Добавить действия:

```ts
answerMotive(state, content, optionId)
skipMotive(state, content)
```

Правила:

- доступны только в `phase === 'motive'`;
- используют сохранённый `pendingMotive.caseId`;
- вариант должен существовать в snapshot/версионированном контенте;
- ответ создаёт один `source = motive`;
- пропуск переводит `motiveState = skipped` без evidence;
- в продуктовой версии показывать **не более одного motive prompt за игровой день**; счётчик определяется по фактически показанным `pendingMotive`, а не по наличию метаданных в карточках;
- если второй/последующий диагностический choice дня содержит `diagnosticMotive`, вопрос не показывать, поставить `motiveState = suppressed`, evidence не создавать и коэффициент 0.30 не перераспределять;
- после ответа/пропуска удалить `pendingMotive` и вызвать `advanceAfterResolvedChoice()`;
- повторное нажатие/повторный handler после перехода безопасен и не добавляет второе evidence.

Это ограничение обязательно: мотив-вопрос должен оставаться редкой рефлексивной паузой, а не превращать поток игры в анкету.

### 8.3. Последующее поведение

При выборе с `diagnosticBehavior.continuesSituationId`:

1. найти все открытые кейсы этого `situationId`, у которых `behaviorState = pending` и `currentDay <= expiresDay`;
2. если кандидатов 0 — выбор остаётся обычным игровым решением без диагностического behavior;
3. если кандидат 1 — использовать его;
4. если кандидатов >1 — это дефект контента, который обязан ловить `check-content.ts`; рантайм **не падает и не портит save**, а детерминированно выбирает самый недавно открытый кейс (`openedDay DESC`, `openedSlot DESC`, затем `caseId ASC`) и пишет debug warning;
5. записать behavior с **developmentWeight, contextId, facets и pressure исходного кейса**; `day/slot/cardId/choiceId` берутся из фактического follow-up решения;
6. `selectionOrigin` behavior определяется фактическим способом показа follow-up, а не наследуется автоматически от action;
7. этот же choice не открывает новый диагностический кейс.

Вечером дня `expiresDay` сначала доступны все игровые слоты, затем `expireDiagnosticCases()` помечает оставшийся `pending` behavior как `expired`.

## 9. `selectionOrigin` и защита от самоподтверждения

### 9.1. Фиксация происхождения при показе

Расширить `DrawResult` и сохранённый `GameState.current`:

```ts
selectionOrigin?: DiagnosticSelectionOrigin;
```

Происхождение фиксируется при **первом показе** и сохраняется вместе с текущей карточкой. После reload оно не пересчитывается.

### 9.2. Правила происхождения

- `neutral` — обычная независимая сцена, не выбранная из-за гипотезы профиля/стадии;
- `probe` — сцена целенаправленно выбрана для различения логик из `diagnostic.distinguishes`;
- `adaptive` — карточка или диагностическая пара выбраны с учётом `observedPrimary`, `developmentCurrent`, активной цепочки, `leadingEdge`, `emergingSignals` либо stage/profile gating.

Если карточка стала доступна из-за `development.stages`, `heroStage`, `availableLogic`, `developmentEvent`, активной arc или будущего profile-gating, она не может считаться `neutral`.

### 9.3. Актуальная диагностика

`adaptive`:

- входит в `lifetimeDistribution`;
- отображается в аудите;
- **не входит** в `currentDistribution`, `confidence`, `observedPrimary`, `fallback`, `leadingEdge`, `emergingSignals`.

Это правило должно быть реализовано фильтрацией источников, а не «штрафом» веса.

## 10. Подбор карточек и адаптация

Реализацию разбить на два этапа: сначала диагностика на независимом контенте, затем включение адаптации после прохождения калибровки.

### 10.1. Приоритеты `drawCard()` после доработки

Сохранить текущие приоритеты:

```text
current
→ fixed at
→ route
→ capacity obligations
→ crisis
→ mustShowBy
→ scheduled
```

После них:

```text
→ обязательное готовое продолжение активной development arc, если оно не ломает capacity
→ probe, если профиль неоднозначен и доступна подходящая сцена
→ adaptive/free content
→ neutral pool
```

Порядок `probe/adaptive/neutral` реализовать с правилом независимости ниже, а не безусловно именно в этой строке.

### 10.2. Минимум независимой диагностики

В свободных диагностических кейсах обеспечить минимум один `neutral/probe` на каждые два новых кейса, но **probe не может единолично закрывать квоту независимости**.

Практическое правило первой версии:

- если последний свободный диагностический кейс был `adaptive`, следующий диагностический свободный выбор должен быть `neutral/probe`, если такой контент доступен;
- среди independent cases актуального окна доля `probe` не должна превышать `1/3`; при достижении лимита selector обязан выбирать `neutral`, если neutral-контент доступен;
- до накопления трёх independent cases допускается не более одного probe; далее проверять лимит по фактическому `probeCount / independentN`;
- обязательные сцены могут отложить это требование, но не создают фиктивный независимый кейс;
- до первого устойчивого центра свободные диагностические сцены только `neutral/probe`, при этом лимит probe уже действует.

### 10.3. Выбор `probe`

Если:

- предварительный профиль есть;
- устойчивого кандидата нет или две ведущие логики близки;
- лимит probe в актуальном независимом окне не исчерпан;
- доступна `probe`-сцена, у которой `distinguishes` содержит две ведущие логики;

то приоритетно выбрать такую сцену среди свободных диагностических возможностей.

**Две ведущие логики для probe всегда берутся только из `currentDistribution`.** `lifetimeDistribution` для этого запрещён, потому что в нём присутствует adaptive evidence и он может самоподтверждать старую гипотезу. Если `currentDistribution` отсутствует или не имеет двух определяемых лидеров, probe по профилю не выбирается.

Сами варианты и их векторы заранее заданы контентом и не меняются под ожидаемый ответ. Даже корректный probe остаётся вмешательством selector-а, поэтому его доля ограничена предыдущим пунктом.

### 10.4. Кубик

`prepareEncounter()` обязан заморозить не только 6 `cardId`, но и диагностическое происхождение кандидатов, если оно зависит от профиля.

Расширить запись `diceHistory`, например:

```ts
{
  day,
  slot,
  candidates: string[],
  candidateOrigins?: DiagnosticSelectionOrigin[],
  face?,
  cardId?
}
```

`rollEncounter()` использует сохранённое происхождение выбранного кандидата. Уточнение профиля между подготовкой и броском не пересобирает шесть карточек.

## 11. Изменение существующего `development.ts`

### 11.1. `initialDevelopment()`

Для новой игры больше не читать `development.initial.current`.

Целевой результат:

```ts
{
  available: [],
  evidence: [],
  transitions: []
}
```

`development.json.initial` удалить из нового контракта и нового `development.json`.

### 11.2. `developmentProgress()`

Если `developmentCurrent` или `activeArcId` отсутствуют — вернуть `undefined`, не считать это ошибкой.

Использовать новые имена `developmentCurrent` / `transitionTarget`.

Логика `trial → consequence → review → transfer → pressure`, `withdrawal`, разные контексты и существующая цепочка `expert-achiever` сохраняются.

### 11.3. Установка исходной логики

Создать функцию, например:

```ts
establishInitialDevelopmentCurrent(state, content): GameState
```

Она работает только если:

```text
developmentCurrent отсутствует
AND heroDevelopmentProfile.observedPrimary устойчиво подтверждён впервые
```

Результат:

```text
developmentCurrent = observedPrimary
currentOrigin = observed-initial
available = [observedPrimary]
```

После этого:

- найти авторскую соседнюю arc `from === developmentCurrent`;
- если arc существует — установить `activeArcId` и `transitionTarget`;
- если arc нет — оставить их пустыми, игра продолжает обычную жизнь.

Не превращать диагностические ответы до этой точки в `DevelopmentEvidence` задним числом.

### 11.4. `commitDevelopmentPromotion()`

Переход допускается только если `developmentCurrent` существовал **до текущей вечерней фиксации**.

Если в этот же вечер впервые установлен исходный центр, повышение в ту же фиксацию запрещено.

После перехода:

- `developmentCurrent = arc.to`;
- добавить `arc.to` в `available`;
- `currentOrigin = 'transition'`;
- записать transition;
- активировать следующую соседнюю arc только если она реально существует в контенте;
- отсутствие следующей arc не является ошибкой.

### 11.5. `developmentCardEligible()`

При отсутствии `developmentCurrent`:

- карточка без stage gating доступна по обычным правилам;
- карточка с `development.stages` недоступна;
- обязательная история не должна быть stage-gated согласно валидатору.

## 12. Порядок вечерней фиксации

Изменить `prepareEvening()` так, чтобы один и тот же день обрабатывался идемпотентно.

Порядок:

```text
1. expire opportunities / существующие проверки обязательств;
2. expire diagnostic cases, срок которых завершён;
3. пересчитать профиль из evidence;
4. обновить candidate / observedPrimary / confidence / facets;
5. обновить fallback / leadingEdge / emergingSignals;
6. если developmentCurrent отсутствовал в начале фиксации
   и впервые появился устойчивый observedPrimary:
      установить исходную developmentCurrent;
      НЕ делать promotion в этот вечер;
7. иначе выполнить существующий commitDevelopmentPromotion();
8. сформировать evening text / snapshot / night;
9. сохранить DevelopmentProfileEveningSnapshot этого дня один раз.
```

Повторный `prepareEvening()` того же дня должен вернуть то же состояние без новых кейсов, evidence, candidate-confirmation и transitions.

## 13. Экран `MotiveScreen`

Новый экран не должен выглядеть как психологический тест.

Требования:

- короткий текст типа «Что здесь для героя было главным?»;
- 2–4 авторских варианта;
- отдельная кнопка «Не выбирать объяснение» / «Пропустить»;
- не показывать названия логик, проценты, scoring;
- после выбора сразу продолжить обычный игровой поток;
- back/reload показывает тот же prompt и варианты;
- ответ не меняет уже применённые эффекты мира.

## 14. Экран «Мой путь»

Текущий `JourneyScreen` нельзя больше строить с предположением `game.development.current!`.

### 14.1. До свидетельств

Показывать:

> Наблюдения появятся после решений героя.

Не показывать 12.5% × 8.

### 14.2. `insufficient`

Показывать отдельные поступки и нейтральные описания без вывода «обычно герой…».

### 14.3. `provisional`

Показывать смысловые описания способов обычным языком, без названий восьми стадий и без процентов.

Если ранее был стабильный `observedPrimary`, но сейчас данные смешались — явно написать, что прежний вывод уточняется.

### 14.4. `stable`

Основной блок:

```text
Сейчас герой чаще смотрит на ситуации через ...
```

При `leadingEdge`:

```text
В некоторых решениях появляется вопрос ...
```

Отдельно показывать **подтверждённое развитие** (`developmentCurrent`, active arc, completed evidence). Не смешивать его с наблюдаемым профилем.

### 14.5. «Подробнее»

Пользовательский экран «Подробнее» с названиями восьми логик и процентами доступен **только при `status === stable`**. При `insufficient` и `provisional` проценты и названия логик не показывать; если stable ранее был потерян из-за новых смешанных данных, временно скрыть детальные проценты и показать сообщение «прежний вывод уточняется». Debug этими ограничениями не связан.

При `stable` показывать:

- 8 логик и целые проценты;
- переключатель `Последний этап / Весь путь`;
- `Достаточность наблюдений`, не «вероятность диагноза»;
- число независимых кейсов;
- раскрываемые исходные события;
- профили граней только при достаточной опоре.

Целые проценты — метод наибольших остатков; сумма всегда 100.

## 15. Округление процентов

Реализовать отдельную чистую функцию:

```ts
largestRemainderPercent(distribution: LogicVector): Record<ActionLogic, number>
```

Алгоритм:

1. умножить каждую долю на 100;
2. взять `floor`;
3. посчитать недостающие единицы до 100;
4. распределить их по убыванию дробного остатка;
5. при равном остатке использовать порядок:
   `opportunist, diplomat, expert, achiever, individualist, strategist, alchemist, ironic`.

Тест: при 8 равных долях первые 4 получают 13%, последние 4 — 12%.

## 16. Сохранения и версии

### 16.1. Версии

Увеличить:

```text
GAME_STATE_VERSION: 4 → 5
CONTENT_VERSION: mvp-v2.4-alpha.1 → следующая версия контента
```

Точное имя новой `CONTENT_VERSION` выбрать по принятой в репозитории схеме.

`heroDevelopmentProfile.algorithmVersion = "1"` закрепляется на прохождение. Все расчёты save validation и исторических snapshots используют immutable config-ветку этой версии.

Семантика `as-of` для вечернего snapshot: он воспроизводится только из prefix `evidence[]`, существовавшего в момент фиксации. `asOfEvidenceCount` хранит длину этого prefix. Evidence, записанное в более поздний день (например, поздний behavior старого кейса), не имеет права менять уже сохранённый snapshot прошлого вечера.

### 16.2. Манифесты

Сохранить возможность строгой проверки известных старых версий:

- v3 — текущий `legacy-v3`;
- v4 / `mvp-v2.4-alpha.1` — снимок до профиля;
- v5 — новый контракт.

Не проверять старое сохранение против нового контента «по похожести».

### 16.3. Миграция v4 → v5

Перенести без переигрывания:

- мир;
- фазу;
- history;
- nights;
- current snapshot;
- scheduled;
- факты/ресурсы;
- существующие development evidence/transitions.

Существующую авторскую стадию сохранить:

```text
developmentCurrent = old.current
currentOrigin = legacy-authored
available = old.available
transitionTarget = old.growingEdge
activeArcId = old.activeArcId
```

Добавить пустой `heroDevelopmentProfile` версии 1.

Исторические `decisionKinds`, qualities и старые выборы **не пересчитывать** в диагностические проценты.

Показанную до миграции текущую карточку не превращать задним числом в диагностику, если она уже была предъявлена.

С нового ещё не выбранного подходящего события разрешается собирать профиль; первый новый `observedPrimary` в legacy-run не заменяет `legacy-authored developmentCurrent`.

Примечание по версии методики: правило «новая версия алгоритма применяется только к новым играм» относится к будущей смене `algorithmVersion` после появления v1. Переход pre-profile сохранения на пустой журнал v1 является миграцией схемы, а не ретроспективным пересчётом его истории.

### 16.4. Валидация сохранения

`validateSave()` дополнительно проверяет:

- уникальность `evidence.id`;
- уникальность `caseId + source`;
- existence card/choice/variant/motive option;
- action evidence соответствует фактически выбранному history choice;
- motive evidence соответствует реально сохранённому prompt/option;
- behavior относится к существующему открытому кейсу и допустимому continuation;
- day/slot не идут назад;
- content/scoring/rubric/algorithm versions известны;
- vector/weight проходят валидатор;
- `currentDistribution`, `lifetimeDistribution`, N/W/K/confidence и snapshots воспроизводятся из evidence;
- никакие сохранённые проценты без исходных свидетельств не принимаются;
- transition остаётся валиден по существующему `DevelopmentEvidence`;
- pendingMotive указывает на существующий case в состоянии `pending`;
- каждый evening snapshot воспроизводится по `evidence.slice(0, asOfEvidenceCount)` и versioned config этого прохождения.

В `migration.test.ts` обязательно проверить не только прямой v4 → v5, но и полную цепочку **v3 → v4 → v5** с сохранением мира, development evidence/transitions и текущей показанной карточки.

## 17. `scripts/schema.ts` и `check-content.ts`

### 17.1. Schema

Добавить Zod-схемы:

- profile config;
- `LogicVector`;
- rationale 6 осей;
- card diagnostic;
- action/motive/behavior metadata;
- `distinguishes`;
- pressure/expiry.

Удалить обязательность `development.initial` в новом development schema.

### 17.2. Семантические проверки

`check-content.ts` должен проверять не только shape, но и смысловые связи:

- `situationId` стабилен и уникален там, где это требуется;
- `contextId` известен/не пуст;
- facets известны;
- weight 0..1;
- vector точно нормирован и не имеет max > 0.70;
- минимум две ненулевые компоненты;
- `probe`/`distinguishes` содержат известные логики;
- для целевой probe имеются варианты, действительно различающие указанные логики;
- choice не одновременно action и behavior;
- `continuesSituationId` ссылается на существующую диагностическую ситуацию;
- continuation не может иметь два возможных открытых владельца в одной достижимой ветке;
- обязательная сцена не зависит от неопределённой стадии;
- stage-gated диагностическая сцена не маркируется независимой по умолчанию;
- для каждой из 8 логик и состояния «центр не установлен» существует достижимый контент до конца эпизода;
- отсутствие следующей arc допустимо;
- готовая `expert-achiever` остаётся соседней и валидной.

## 18. Debug-аудит

Расширить `DebugPanel` отдельным разделом «Профиль логики героя».

Показывать:

```text
algorithmVersion / scoringVersion / rubricVersion / contentVersion
status
observedPrimary / candidatePrimary / candidateSinceDay
developmentCurrent / transitionTarget
fallback / leadingEdge / emergingSignals

currentDistribution
lifetimeDistribution
N / W / K / delta / coverage / confidence
```

Для каждого evidence:

```text
caseId
situationId
source
selectionOrigin
day/slot/card/choice
vector
developmentWeight
sourceCoefficient
effectiveWeight
contribution by logic
included/excluded from current + reason
```

Для каждого case:

```text
action → motive → behavior
status / expiresDay
```

Debug должен позволять объяснить любое число из профиля до исходного фактического выбора.

## 19. Тесты чистой арифметики

В `heroDevelopmentProfile.test.ts` минимум:

1. `W = 0` → нет распределения, confidence 0.
2. Только action при weight 1 → `Wcase = 0.5`.
3. Action + motive → `0.8`.
4. Все источники → `1.0`.
5. Пропуск motive не перераспределяет его 0.3.
6. Один case остаётся одним N при трёх источниках.
7. 24-case окно сдвигается по позиции исходного action.
8. Поздний motive не возвращает вышедший case в окно.
9. Поздний adaptive behavior не входит в current.
10. Adaptive action входит lifetime, не входит current.
11. Восемь равных долей → `13,13,13,13,12,12,12,12`.
12. Порог `N=12,W=5,K=3` не может дать confidence 0.60 при максимальном separation (`0.575`).
13. Один подходящий вечер не устанавливает центр.
14. Второй вечер с теми же данными и без новых independent action **не** устанавливает центр.
15. Тот же кандидат после минимум 2 новых independent action на следующем завершённом вечере устанавливает stable.
16. Смена кандидата перезапускает подтверждение.
17. Повтор prepare evening идемпотентен.
18. После потери stable возврат прежнего лидера требует новой двухточечной фиксации.
19. `fallback` не может быть равен или позже `developmentCurrent`.
20. Дальний Стратег при Expert → emergingSignal, не transitionTarget.
21. facet split 50/50 не удваивает общий вклад; facet sufficient использует отдельные targets.
22. Probe не может превысить 1/3 independent window при наличии neutral-контента.
23. Motive prompt показывается не чаще 1 раза в день; suppressed не создаёт evidence.
24. Behavior в последний слот `expiresDay` принимается, затем кейс истекает вечером.
25. Snapshot прошлого вечера не меняется от позднего evidence благодаря `asOfEvidenceCount`.
26. Поддельный derived distribution не проходит save validation.

## 20. Интеграционные сценарии

Добавить сценарии полного прохождения.

### Диагностика

- новая игра: `developmentCurrent === undefined`;
- 12 независимых одинаково размеченных кейсов по 4 контекстам, vector `0.70 target / 0.30 neighbor`, action-only → `W=6`, confidence `0.685`;
- после первого подходящего вечера и следующего подходящего вечера, между которыми есть минимум 2 новых independent action cases, устанавливается target;
- прогнать target по всем 8 логикам;
- те же 12 кейсов в 1 контексте → центра нет;
- те же кейсы `adaptive` → актуального центра нет;
- смешанный профиль остаётся provisional;
- один сильный Strategist answer не устанавливает Strategist.

### Развитие

Сохранить существующие 4 политики линии Алексея:

- контроль;
- проба и отступление;
- быстрое освоение;
- освоение после повторной возможности.

Но запускать их после того, как герой получил `developmentCurrent = expert` либо через тестовый fixture, либо через синтетический профиль. Не возвращать hardcoded Expert в production initial state.

Проверять, что завершение `expert → achiever`:

- не меняет diagnostic percentages;
- применяется один раз;
- требует реального consequence/review/transfer/pressure;
- не пересчитывает уже показанную пару;
- открывает achiever-content;
- не добавляет автоматом более ранние стадии.

### Сохранения

Проверить reload:

- после action до motive;
- на MotiveScreen;
- после motive до behavior;
- между behavior и evening;
- на первом candidate evening;
- между первым candidate evening и подтверждением после новых independent actions;
- сразу после initial developmentCurrent;
- внутри active `expert-achiever`;
- перед и после promotion.

В каждом случае journal, W, percentages, case states и transition должны совпадать с непрерывным прохождением.

## 21. Калибровка до включения адаптации

Адаптацию по профилю не включать в продуктовый поток, пока не завершены **два разных вида проверки**: арифметическая симуляция движка и независимая проверка авторской разметки. Симуляция на тех же векторах, которыми считает движок, доказывает только корректность формул и не считается доказательством качества контента.

### 21.1. Арифметическая симуляция

Подготовить `scripts/simulate-profile.ts` и отчёт, содержащий:

- seed;
- набор кейсов;
- векторы;
- контексты;
- вечерние snapshots;
- момент candidate/stable;
- число новых independent action между candidate и stable;
- итоговый primary;
- confusion по соседним логикам.

Нужны траектории:

- 8 целевых логик;
- смешанная;
- смена способа во времени;
- мотив расходится с последующим поведением;
- много adaptive evidence;
- недостаток контекстов;
- повторный вечер без новых action — **не** подтверждает stable;
- probe-heavy траектория упирается в лимит 1/3.

Для каждого из 8 synthetic targets прогнать минимум 20 seed/trajectory-вариантов. Критерии:

- target stable hit-rate ≥ 95%;
- non-adjacent wrong-center rate ≤ 2%;
- mixed false-stable rate ≤ 10%;
- insufficient false-stable rate = 0%;
- adaptive-only false-stable rate = 0%.

### 21.2. Независимая редакторская проверка разметки

Второй редактор получает тексты ситуаций/вариантов и rubric, но **не видит сохранённые vectors**. Для каждого диагностического варианта он независимо указывает доминирующую логику и допустимую вторую логику. После этого считается согласие:

- Cohen’s κ по top-1 логике ≥ 0.70;
- совпадение исходного top-1 с независимым top-2 редактора ≥ 90%;
- варианты, не прошедшие пороги, переразмечаются или исключаются из neutral/probe pool.

Rubric-проверка без числовой метрики не считается завершённой.

### 21.3. Минимальный объём независимого контента

До включения adaptive selector должно быть размечено не менее:

- **32 уникальных neutral диагностических ситуаций** в достижимом до/после центра свободном пуле;
- минимум 4 разных `contextId` в neutral pool;
- минимум 6 neutral ситуаций, относящихся к каждой из четырёх граней (мультигранные сцены могут считаться в обе, но не заменяют разнообразие контекстов);
- **3 разные probe-сцены на каждую из 7 соседних пар** — всего минимум 21 probe scene. Одна и та же probe-сцена не повторяется в одном прохождении и потому не может быть единственным способом различить пару.

Матрица 7 соседних пар:

```text
Opportunist ↔ Diplomat
Diplomat ↔ Expert
Expert ↔ Achiever
Achiever ↔ Individualist
Individualist ↔ Strategist
Strategist ↔ Alchemist
Alchemist ↔ Ironic
```

### 21.4. Проверка тайминга развития

Текущая поставка содержит только реальную сюжетную arc `expert → achiever`. Это **осознанное ограничение MVP**: если первым устойчивым центром стала другая из семи логик и соседней arc нет, игра продолжает обычную жизнь, диагностику и адаптацию, но не имитирует подтверждённое развитие заглушкой. UI прямо показывает отсутствие активной линии освоения.

Для Expert отдельно посчитать timing budget по реальному расписанию контента:

- earliest / median / P90 день первого stable center;
- сколько eligible свободных слотов остаётся до конца эпизода;
- минимальное число слотов, необходимое существующей `trial → consequence → review → transfer → pressure` цепочке;
- запас не менее **2 дополнительных eligible slots** сверх минимального пути.

Адаптацию нельзя включать, если на P90 Expert-траектории после устойчивого центра не остаётся `minArcSlots + 2` подходящих слотов.

### 21.5. Условие перехода к adaptive selector

Одновременно должны выполняться:

- все 8 synthetic target достижимы с указанным hit-rate;
- mixed/insufficient/adaptive-only проходят пороги false-stable;
- independent editor agreement проходит пороги;
- выполнен минимальный объём neutral/probe контента;
- для каждой соседней пары есть минимум 3 проверенных probe-сцены;
- нет системного перевеса одной логики из-за количества сцен или формулировок по calibration report;
- Strategist/Alchemist/Ironic не назначаются одной «умной» формулировкой;
- Expert timing budget оставляет достаточно времени на реальную arc.

## 22. Этапы реализации и порядок коммитов

### Этап A — контракты, версия состояния и пустой старт

1. Типы профиля.
2. `HeroDevelopment` optional current + rename.
3. Удаление `development.initial` из нового контракта.
4. `GAME_STATE_VERSION = 5`, новый v5 save schema и строгая валидация новых полей.
5. Versioned `development-profile.json` + immutable algorithm branch.
6. `GameState.runId`.
7. `createInitialGameState()` с пустым development/profile.
8. Обновление conditions/eligibility для undefined current.
9. Обновить `development-scenarios` test fixture: для старых сценариев явно устанавливать Expert/legacy fixture, не возвращая hardcoded Expert в production initial state.
10. Тест новой игры и прежних development scenarios.

**Критерий:** игра запускается и может жить без назначенной стадии; v5-state уже валидируется строго; прежние development tests остаются зелёными через явный fixture.

### Этап B — scoring engine без UI-адаптации

1. `heroDevelopmentProfile.ts`.
2. Formula / window / confidence / percentages.
3. cases/evidence/idempotency.
4. facet slices.
5. unit tests.

**Критерий:** синтетический журнал полностью воспроизводит ожидаемые числа.

### Этап C — регистрация реальных решений

1. Content schema diagnostic metadata.
2. action registration.
3. motive phase + screen + skip/suppressed + max 1/day.
4. behavior linking + deterministic ambiguity fallback.
5. expiry state machine.
6. v5 save/reload tests на всех новых полях.

**Критерий:** один реальный кейс корректно проходит action → motive → behavior и переживает reload уже под строгой v5-валидацией.

### Этап D — вечер и исходный центр

1. nightly recalc.
2. candidate 2 evenings.
3. initial developmentCurrent.
4. fallback / leadingEdge / emergingSignals.
5. no same-evening promotion.

**Критерий:** новый герой может впервые стать Opportunist/Diplomat/Expert/.../Ironic только по данным, без hardcoded Expert.

### Этап E — legacy-миграция

1. Зафиксировать v4 manifest/content snapshot.
2. v4 → v5 migration.
3. v3 → v4 → v5 chain test.
4. legacy authored current semantics.
5. Проверка, что миграция не создаёт ретроспективных diagnostic evidence.

**Критерий:** существующее прохождение не теряет мир/transition; новая история не получает legacy start; сама v5-схема и строгая валидация уже были введены раньше и здесь не откладываются.

### Этап F — «Мой путь» и debug

1. UI insufficient/provisional/stable.
2. detail percentages + last/lifetime.
3. facet views.
4. development block separately.
5. debug audit.

**Критерий:** пользователь не видит психологический ярлык, разработчик может объяснить каждое число.

### Этап G — независимый диагностический контент и калибровка

1. Разметить минимум 32 `neutral` ситуации по правилам §21.3.
2. Подготовить минимум 3 probe-сцены на каждую соседнюю пару.
3. Провести blind second-editor review и посчитать κ/top-2 agreement.
4. Прогнать `simulate-profile` по числовым порогам §21.1.
5. Посчитать Expert timing budget.
6. Исправить перекосы и повторить калибровку.

**Критерий:** выполнены условия раздела 21.

### Этап H — адаптация

1. targeted probe selection.
2. adaptive free scenes.
3. 1 independent case per 2 new diagnostic cases.
4. frozen origin in current/dice.
5. повторная симуляция.

**Критерий:** адаптация не усиливает собственную гипотезу за счёт dependent evidence.

## 23. Критерии приёмки поставки

Поставка принимается только если одновременно выполняется следующее:

- новая игра не назначает Эксперта или любую другую стадию;
- профиль отсутствует до первого свидетельства, а не равен 12.5% × 8;
- после свидетельств сумма внутренних долей = 1, UI процентов = 100; пользовательские проценты доступны только при stable;
- один ответ не назначает центр;
- устойчивый центр требует двух вечерних фиксаций одного кандидата **и минимум 2 новых независимых action-кейса между ними**;
- Opportunist и Diplomat реально достижимы как первый центр;
- `adaptive` не подтверждает наблюдаемую гипотезу, а probe ограничен максимум 1/3 independent window;
- одинаковое действие с разным выбранным мотивом даёт разные evidence;
- пропуск мотива ничего не угадывает;
- behavior — отдельное фактическое решение, а не outcome;
- historical и current distributions различаются после смены актуального поведения;
- изменение `observedPrimary` не меняет `developmentCurrent`;
- transition не меняет проценты без новых diagnostic evidence;
- Expert → Achiever продолжает требовать реального опыта из v2.4;
- отсутствие arc для текущей логики не ломает календарь и не подменяется фиктивным «развитием»; это допустимое ограничение MVP;
- reload не дублирует evidence; motive prompt не показывается чаще одного раза за игровой день;
- migration сохраняет текущую историю и existing transitions;
- сохранение с поддельными derived percentages отклоняется;
- debug объясняет итог до исходного card/choice;
- существующие проверки обязательных событий, расписания, фактов, концовок и текущих development scenarios остаются зелёными.

## 24. Что не входит в эту поставку

Не требуется:

- писать сразу все 7 соседних сюжетных переходов;
- использовать внешнюю AI/LLM-модель для классификации ответов;
- анализировать свободный текст игрока;
- строить психологический профиль человека за экраном;
- автоматически переводить качества/ресурсы в Action Logic;
- делать отдельное дерево стадий для каждой грани;
- ретроспективно скорить старую историю без проверенной разметки;
- копировать алгоритм Leadership Development Profile / Harthill.

Готовая `expert → achiever` остаётся первой реализованной сюжетной arc. Новая система делает её **одной из доступных цепочек после установления соответствующего текущего способа**, а не обязательным стартом каждого нового прохождения.

## 25. Результат работы разработчика

По завершении разработчик должен передать:

1. Изменённый код и контент.
2. Новые/обновлённые unit и integration tests.
3. Скрипт `simulate-profile`.
4. Отчёт независимой калибровки.
5. Отчёт симуляции после включения адаптации.
6. Краткий migration note: v3/v4 → новый state.
7. Список реально размеченных neutral/probe/adaptive сцен.
8. Подтверждение, что существующая линия `expert-achiever` проходит все прежние требования и не стала арифметическим повышением.

