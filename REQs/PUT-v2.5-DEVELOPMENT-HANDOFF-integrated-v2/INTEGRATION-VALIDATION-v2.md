# INTEGRATION-VALIDATION-v2
## Проверка handoff после применения RECONCILIATION-v2

**Дата:** 5 октября 2026  
**Результат:** PASS — структурных конфликтов из reconciliation не осталось.

## Что проверено

- **Neutral main:** 32 ситуации / 128 action vectors / 32 unique contextId / facets 8×4 / pressure 8.
- **Top-1 balance:** каждая из 8 ActionLogic — 16 top-1; для каждой A/B/C/D = 4/4/4/4.
- **Probe:** 21 unique; 3 на каждую пару; rotation `.01/.02/.03` корректен; control не привязан к C.
- **Development cards:** 50 unique cardId; внутренних битых `dev.*` ссылок нет.
- **Retry:** 6 `retry.01`; все требуют только `withdrawal@pressure`; transfer идёт через `retry-transfer`.
- **Alchemist→Ironic IDs:** `dev.si.*` полностью заменён на `dev.alir.*` в нормативных/content-файлах.
- **Main spec:** встроены canonical glossary, facet gate, initial rebase, новые validators и boundary ActionLogic ≠ morality/spirituality.
- **Save compatibility:** если v5 уже выпущен, требуется migration: missing `initialRebaseCount → 0`, `currentOrigin transition → promotion`.

## Aggregate LogicVector audit

Для 128 main neutral choices суммарные веса остаются предметом calibration, а не runtime normalization:

```text
opportunist    11.25
diplomat       13.65
expert         19.05
achiever       23.80
individualist  21.90
strategist     17.05
alchemist      10.95
ironic         10.35
```

Это не считается ошибкой структуры. `check-aggregate-vector-bias` теперь является обязательным calibration gate.

## Поиск старых конфликтующих формулировок

В нормативных/content-файлах не осталось:

- `withdrawal на transfer/pressure` для `retry.01`;
- универсального утверждения «вариант C — control»;
- `dev.si.*`;
- статуса `Final v2.5 spec TODO`.

## Что остаётся до production

- repo binding;
- blind review;
- `simulate-profile`;
- aggregate vector calibration;
- timing audit;
- migration/chain-test сохранений, если v5 уже существует в production.
