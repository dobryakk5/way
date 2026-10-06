# FACET-ATTENTION v1 (этап Ф3.5, между Ф3 и Ф4 плана v2.5)

Лёгкая адаптация сюжетных сцен к тому, куда игрок свободно вкладывает внимание. Центры (Action Logic) остаются главной осью развития; сферы — вторичный контекст и не влияют на scoring, probe, neutral и development.

## Что реализовано
- `facetAttention` — derived state из `history[].facets`; нового persisted поля нет, сейвы не мигрируют.
- Окно: последние `windowSize = 16` evidence-решений. Решение с N уникальными сферами даёт каждой 1/N; сумма нормализуется к 1.
- `target = (1 − playerWeight)·uniform + playerWeight·attention` (`playerWeight = 0.5`). При `evidence < minEvidence (6)` target равномерный.
- Множитель карточки: среднее target по её уникальным сферам / 0.25, × `declaredIntentionPrior`, clamp `[0.60, 1.60]`. Карточка без `facets` — 1.
- `declaredIntentionPrior = 1.15` только пока `evidence < 6` и намерение входит в `card.facets`; позже реальные решения полностью заменяют заявленное намерение.
- Конфиг: `development-profile.json` → `facetAttention {…}` и `rollout.facetAttention` (по умолчанию `false`). Rollout не связан с `adaptiveSelection` / `probeSelection` / `developmentArcs`.

## Предикаты (по структуре карточки, не по файлу и не по ID)
| карточка | evidence | кандидат веса |
|---|---|---|
| обычная свободная story / routine | да | да |
| `route-only` | да | нет |
| neutral, behavior-chain, probe, development, chain, crisis, `at`, `key`, `required`, `mustShowBy` | нет | нет |

- `isFacetAttentionEvidenceSource(card)` — выбор отражает добровольное направление внимания.
- `isFacetWeightedDrawCandidate(card)` — вероятность появления разрешено менять.
- Facets записи: `entry.facets`, а если пусто — `choice.servesFacets`; затем уникализация.

## Где применяется (важно)
Реальный выбор сцены идёт через кости: `prepareEncounter` берёт первые 6 карточек равномерного shuffle свободного пула, игрок бросает кость. Поэтому вес применён там, а не в `weighted()`:
- `facetAdjustedSlice` (`draw.ts`): все не-story слоты остаются ровно такими, как дал shuffle (neutral не меняется); пересобираются только story-слоты — по весам сфер, взвешенная выборка без возвращения.
- `drawFreePoolWeighted` — тот же принцип для прямого розыгрыша, когда в пуле меньше 6 карточек (двухступенчатый: ступень 1 — прежний `weighted()` решает «story или нет», ступень 2 перевыбирает среди story-кандидатов; legacy ×1.2 за declaredIntention на ступени 2 не применяется, двойного веса нет).
- Общий `weighted()` не менялся; route, probe, development, scheduled его вызывают без facet-слоя.

## Инварианты (тесты `src/engine/facetAttention.test.ts`)
FACET-1 scoring/профиль не меняется; FACET-2 neutral-кандидаты те же при любом внимании; FACET-3 probe selector не зависит; FACET-4 development выдаётся тот же; FACET-5/6 множитель в `[0.6, 1.6]`; FACET-7 равномерная история → ≈1; FACET-8 старше окна не влияет; FACET-9 multi-facet делит единицу. Сценарии A–E покрыты.

## Simulation
`npm run facets:simulate` → `reports/FACET-ATTENTION-SIMULATION-v1.md` (реальный контент, дни 8/14/24, ≥1000 draws на сценарий: uniform, work/relationships/body/inner-heavy, переключения work→relationships и relationships→body). Наблюдаемое распределение совпадает с ожидаемым на реальном пуле; все сферы присутствуют; neutral-кандидаты побитно совпадают при on/off.

## Замечания и открытое
- Сейчас в свободном пуле story-сцен мало (15–20 при ≈180 карточках), а neutral занимают около 35–60 % сцен, которые выпадают на кубике. Эффект сфер ограничен этим составом; сдвиг растёт вместе с контентом Ф4.
- Старый `declaredIntention ×1.2` в `weighted()` продолжает действовать в прямом розыгрыше и на neutral. Это прежнее поведение; не менялось, чтобы не сдвинуть калибровку диагностики.
- Включение (`rollout.facetAttention = true`) — отдельное решение после просмотра отчёта на финальном контенте.
- Не входит: состояние сферы, кризис/рост, отдельные дуги по сферам, изменение scoring по сфере, новые facets.
