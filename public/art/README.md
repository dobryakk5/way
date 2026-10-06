# Key illustrations

Visual layer for **Путь: Становление**.

These assets do not change engine logic, card effects, diagnostic vectors,
scheduling, saves, or development mechanics.

## Chapter illustrations

The game uses exactly four key chapter illustrations, all without people:

- `chapters/chapter-1-preparation.webp` — Глава 1 «Подготовка»
- `chapters/chapter-2-to-fair.webp` — Глава 2 «К ярмарке»
- `chapters/chapter-3-price-of-result.webp` — Глава 3 «Цена результата»
- `chapters/chapter-4-new-venture.webp` — Глава 4 «Новое дело»

They are shown by `src/ui/screens/MorningScreen.tsx` only on the first morning
of a chapter: days 1, 6, 11 and 21. Ordinary game cards keep the lightweight
procedural pottery visual.

## Art direction

- no people or hands in chapter art;
- warm clay, wood and fire;
- wine-brown shadows with restrained gold light;
- painterly cinematic realism;
- no diagnostic labels, stage names, percentages, or moral judgement in art.


## Life-facet icon system

`facets/facet-icons.webp` is a compact 4×2 sprite generated for the visual
language of the game. It contains eight symbols:

1. money
2. relationships
3. work
4. health
5. meaning
6. family
7. freedom
8. responsibility

The current engine has four canonical `LifeFacet` values, so the UI maps them
without changing game logic:

- `work` → work
- `relationships` → relationships
- `body` → health
- `inner` → meaning

The resource strip also reuses semantically matching symbols:

- `wealth` → money
- `strength` → health
- `peace` → meaning
- `bonds` → relationships

Family, freedom and responsibility stay in the asset set for later expansion;
they are not introduced as new engine facets by this visual change.
