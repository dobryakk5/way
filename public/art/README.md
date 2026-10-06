# Key art atlas

Generated visual layer for **Путь: Становление**.

The images are atmospheric illustrations only. They do not change card logic, effects,
diagnostic vectors, scheduling, saves, or development mechanics.

## `chapters-atlas.webp`

Size: 800 × 450. Grid: 2 × 2, each cell 400 × 225.

| Cell | Canonical chapter |
|---|---|
| 0,0 | Chapter 1 — Подготовка |
| 1,0 | Chapter 2 — К ярмарке |
| 0,1 | Chapter 3 — Цена результата |
| 1,1 | Chapter 4 — Новое дело |

This atlas is intentionally added before a dedicated chapter-transition visual is wired.
It is ready for that screen without touching the engine.

## `key-cards-atlas.webp`

Size: 1200 × 450. Grid: 3 × 2, each cell 400 × 225.

| Cell | Card id | Visual |
|---|---|---|
| 0,0 | `c1_alexey_broken_jug` | forming vessel / Alexey line |
| 1,0 | `c1_wounded_road` | road and difficult choice |
| 2,0 | `c1_extra_change` | money / scales / extra change |
| 0,1 | `c2_stones_bag` | burden / debt |
| 1,1 | `c2_liya_arrives` | arrival / new possibility |
| 2,1 | `c2_timon_order_result` | fair / result of work |

These six cards are wired in `GameCard.tsx`.
All other cards keep the lightweight procedural pottery illustration.

## Art direction

- warm clay, wood and fire;
- wine-brown shadows with restrained gold light;
- painterly cinematic realism;
- image supports the situation and never explains the “correct” answer;
- no diagnostic labels or stage names on card art.
