# «Путь» v2.5 — handoff разработчику

## С чего начать

1. `IMPLEMENTATION-v2.5-DEVELOPMENT-CONTENT.md` — основное и уже reconciled ТЗ этой поставки.
2. `IMPLEMENTATION-v2.4-HERO-PROFILE-v2-reviewed.md` — зависимость: движок профиля/evidence/selectionOrigin/save/UI; reconciliation применён прямо в документ.
3. `DEVELOPMENT-RUBRIC-v1-final.md` — канон разметки.
4. `DIAGNOSTIC-PROBES-v1-final.md` — 21 profile-conditioned probe.
5. `NEUTRAL-DIAGNOSTIC-CONTENT-v1-final.md` — 32 neutral.
6. `DEVELOPMENT-PRODUCTION-CARDS-v1-final.md` — 50 новых development cards; retry/IDs reconciled.
7. `CONTENT-INTEGRATION-REVIEW-v1-final.md` — итоговый аудит и оставшиеся gates.
8. `INTEGRATION-VALIDATION-v2.md` — машинная/структурная проверка после применения reconciliation.

## Справочно

- `DEVELOPMENT-MODEL-v1.md`
- `DEVELOPMENT-BEHAVIOR-MATRIX-v1.md`
- `RECONCILIATION-v2.md` — журнал решений; отдельным patch читать не требуется, все нормативные изменения уже встроены в документы выше.

Старый `DEVELOPMENT-ARCS-v1` в handoff не требуется: его production-смысл уже перенесён и уточнён в `DEVELOPMENT-PRODUCTION-CARDS-v1-final.md`.

## До включения adaptive

Обязательны:

- repo binding;
- blind-review;
- simulate-profile;
- timing audit;
- новые content validators.
