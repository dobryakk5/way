# FACET-ATTENTION-SIMULATION v1

Real content (184 cards), dice flow (`prepareEncounter`: six candidates, fair die). Base states: first free slot of days 8, 14, 24 of a real run (seed 1, policy mixed). 1500 draws per scenario and base state, each with a different seed; the attention history is synthetic (16 decisions, see scenarios).

Columns are always Дело | Отношения | Тело | Внутреннее. A multi-sphere scene gives 1/N to each of its spheres in every column.
- **pool**: the sphere mix of the eligible story pool, weights equal (what you get with the mechanism off, on average).
- **expected**: first-order expectation for the real pool, each story scene weighted by its facet multiplier (an approximation: it ignores sampling without replacement among the six).
- **offered on / off**: observed mix of story scenes among the six candidates. **landed on / off**: observed mix of the scene the die landed on.
- **neutral on / off**: share of draws where the die landed on a neutral scene (differs by die noise only: the neutral scenes among the six are checked to be identical draw by draw, FACET-2).

## Day 8 (chapter 2)

### uniform

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  25.0% |  25.0% |  25.0% |  25.0% |
| target |  25.0% |  25.0% |  25.0% |  25.0% |
| pool (15 story scenes) |  26.7% |  30.0% |  20.0% |  23.3% |
| expected |  26.7% |  30.0% |  20.0% |  23.3% |
| offered on |  26.3% |  29.9% |  20.3% |  23.5% |
| offered off |  26.6% |  30.1% |  19.6% |  23.7% |
| landed on |  26.9% |  30.2% |  20.0% |  23.0% |
| landed off |  27.4% |  28.8% |  19.7% |  24.1% |

neutral on / off:  60.8% /  59.7%; story scenes among the six on / off: 2.36 / 2.36; draws 1500.

### work-heavy

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  75.0% |  12.5% |   6.3% |   6.3% |
| target |  50.0% |  18.8% |  15.6% |  15.6% |
| pool (15 story scenes) |  26.7% |  30.0% |  20.0% |  23.3% |
| expected |  34.6% |  26.7% |  19.2% |  19.4% |
| offered on |  34.4% |  26.7% |  19.2% |  19.7% |
| offered off |  26.6% |  30.1% |  19.6% |  23.7% |
| landed on |  35.0% |  25.7% |  19.8% |  19.4% |
| landed off |  27.4% |  28.8% |  19.7% |  24.1% |

neutral on / off:  60.2% /  59.7%; story scenes among the six on / off: 2.36 / 2.36; draws 1500.

### relationships-heavy

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  12.5% |  75.0% |   6.3% |   6.3% |
| target |  18.8% |  50.0% |  15.6% |  15.6% |
| pool (15 story scenes) |  26.7% |  30.0% |  20.0% |  23.3% |
| expected |  23.5% |  37.4% |  16.5% |  22.6% |
| offered on |  23.7% |  36.9% |  16.9% |  22.5% |
| offered off |  26.6% |  30.1% |  19.6% |  23.7% |
| landed on |  22.1% |  38.0% |  16.5% |  23.3% |
| landed off |  27.4% |  28.8% |  19.7% |  24.1% |

neutral on / off:  60.9% /  59.7%; story scenes among the six on / off: 2.36 / 2.36; draws 1500.

### body-heavy

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  12.5% |   6.3% |  75.0% |   6.3% |
| target |  18.8% |  15.6% |  50.0% |  15.6% |
| pool (15 story scenes) |  26.7% |  30.0% |  20.0% |  23.3% |
| expected |  27.0% |  25.7% |  28.8% |  18.5% |
| offered on |  26.4% |  25.7% |  28.5% |  19.4% |
| offered off |  26.6% |  30.1% |  19.6% |  23.7% |
| landed on |  26.9% |  26.0% |  29.1% |  18.1% |
| landed off |  27.4% |  28.8% |  19.7% |  24.1% |

neutral on / off:  60.2% /  59.7%; story scenes among the six on / off: 2.36 / 2.36; draws 1500.

### inner-heavy

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  12.5% |   6.3% |   6.3% |  75.0% |
| target |  18.8% |  15.6% |  15.6% |  50.0% |
| pool (15 story scenes) |  26.7% |  30.0% |  20.0% |  23.3% |
| expected |  23.4% |  29.1% |  15.7% |  31.7% |
| offered on |  23.5% |  28.7% |  16.0% |  31.8% |
| offered off |  26.6% |  30.1% |  19.6% |  23.7% |
| landed on |  22.8% |  29.6% |  15.6% |  32.0% |
| landed off |  27.4% |  28.8% |  19.7% |  24.1% |

neutral on / off:  59.4% /  59.7%; story scenes among the six on / off: 2.36 / 2.36; draws 1500.

### switch work → relationships, after 8 new

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  50.0% |  50.0% |   0.0% |   0.0% |
| target |  37.5% |  37.5% |  12.5% |  12.5% |
| pool (15 story scenes) |  26.7% |  30.0% |  20.0% |  23.3% |
| expected |  29.5% |  32.6% |  17.4% |  20.5% |
| offered on |  29.3% |  32.4% |  17.5% |  20.7% |
| offered off |  26.6% |  30.1% |  19.6% |  23.7% |
| landed on |  28.4% |  33.1% |  17.8% |  20.7% |
| landed off |  27.4% |  28.8% |  19.7% |  24.1% |

neutral on / off:  60.7% /  59.7%; story scenes among the six on / off: 2.36 / 2.36; draws 1500.

### switch work → relationships, after 16 new (old left the window)

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |   0.0% | 100.0% |   0.0% |   0.0% |
| target |  12.5% |  62.5% |  12.5% |  12.5% |
| pool (15 story scenes) |  26.7% |  30.0% |  20.0% |  23.3% |
| expected |  21.9% |  39.5% |  15.8% |  22.8% |
| offered on |  22.2% |  39.1% |  15.9% |  22.8% |
| offered off |  26.6% |  30.1% |  19.6% |  23.7% |
| landed on |  20.9% |  40.5% |  15.5% |  23.1% |
| landed off |  27.4% |  28.8% |  19.7% |  24.1% |

neutral on / off:  60.5% /  59.7%; story scenes among the six on / off: 2.36 / 2.36; draws 1500.

### switch relationships → body, after 8 new

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |   0.0% |  50.0% |  50.0% |   0.0% |
| target |  12.5% |  37.5% |  37.5% |  12.5% |
| pool (15 story scenes) |  26.7% |  30.0% |  20.0% |  23.3% |
| expected |  23.7% |  32.9% |  23.0% |  20.4% |
| offered on |  23.6% |  32.8% |  23.0% |  20.6% |
| offered off |  26.6% |  30.1% |  19.6% |  23.7% |
| landed on |  24.1% |  33.5% |  22.6% |  19.8% |
| landed off |  27.4% |  28.8% |  19.7% |  24.1% |

neutral on / off:  60.6% /  59.7%; story scenes among the six on / off: 2.36 / 2.36; draws 1500.

### switch relationships → body, after 16 new (old left the window)

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |   0.0% |   0.0% | 100.0% |   0.0% |
| target |  12.5% |  12.5% |  62.5% |  12.5% |
| pool (15 story scenes) |  26.7% |  30.0% |  20.0% |  23.3% |
| expected |  26.0% |  25.0% |  31.3% |  17.7% |
| offered on |  25.5% |  25.1% |  30.9% |  18.5% |
| offered off |  26.6% |  30.1% |  19.6% |  23.7% |
| landed on |  26.6% |  25.1% |  31.3% |  17.0% |
| landed off |  27.4% |  28.8% |  19.7% |  24.1% |

neutral on / off:  60.3% /  59.7%; story scenes among the six on / off: 2.36 / 2.36; draws 1500.

## Day 14 (chapter 3)

### uniform

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  25.0% |  25.0% |  25.0% |  25.0% |
| target |  25.0% |  25.0% |  25.0% |  25.0% |
| pool (20 story scenes) |  32.5% |  27.5% |  22.5% |  17.5% |
| expected |  32.5% |  27.5% |  22.5% |  17.5% |
| offered on |  32.8% |  27.6% |  22.4% |  17.2% |
| offered off |  32.5% |  27.5% |  22.5% |  17.5% |
| landed on |  33.2% |  28.0% |  22.0% |  16.8% |
| landed off |  34.1% |  27.5% |  22.5% |  15.9% |

neutral on / off:  46.2% /  45.6%; story scenes among the six on / off: 3.24 / 3.24; draws 1500.

### work-heavy

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  75.0% |  12.5% |   6.3% |   6.3% |
| target |  50.0% |  18.8% |  15.6% |  15.6% |
| pool (20 story scenes) |  32.5% |  27.5% |  22.5% |  17.5% |
| expected |  39.8% |  31.1% |  18.9% |  10.2% |
| offered on |  39.5% |  30.9% |  19.1% |  10.5% |
| offered off |  32.5% |  27.5% |  22.5% |  17.5% |
| landed on |  39.9% |  30.9% |  19.1% |  10.1% |
| landed off |  34.1% |  27.5% |  22.5% |  15.9% |

neutral on / off:  46.3% /  45.6%; story scenes among the six on / off: 3.24 / 3.24; draws 1500.

### relationships-heavy

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  12.5% |  75.0% |   6.3% |   6.3% |
| target |  18.8% |  50.0% |  15.6% |  15.6% |
| pool (20 story scenes) |  32.5% |  27.5% |  22.5% |  17.5% |
| expected |  36.2% |  35.9% |  14.1% |  13.8% |
| offered on |  36.3% |  35.4% |  14.6% |  13.7% |
| offered off |  32.5% |  27.5% |  22.5% |  17.5% |
| landed on |  37.1% |  35.8% |  14.2% |  12.9% |
| landed off |  34.1% |  27.5% |  22.5% |  15.9% |

neutral on / off:  46.5% /  45.6%; story scenes among the six on / off: 3.24 / 3.24; draws 1500.

### body-heavy

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  12.5% |   6.3% |  75.0% |   6.3% |
| target |  18.8% |  15.6% |  50.0% |  15.6% |
| pool (20 story scenes) |  32.5% |  27.5% |  22.5% |  17.5% |
| expected |  30.0% |  19.1% |  30.9% |  20.0% |
| offered on |  30.7% |  19.9% |  30.1% |  19.3% |
| offered off |  32.5% |  27.5% |  22.5% |  17.5% |
| landed on |  30.8% |  19.7% |  30.3% |  19.2% |
| landed off |  34.1% |  27.5% |  22.5% |  15.9% |

neutral on / off:  45.8% /  45.6%; story scenes among the six on / off: 3.24 / 3.24; draws 1500.

### inner-heavy

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  12.5% |   6.3% |   6.3% |  75.0% |
| target |  18.8% |  15.6% |  15.6% |  50.0% |
| pool (20 story scenes) |  32.5% |  27.5% |  22.5% |  17.5% |
| expected |  24.7% |  24.3% |  25.7% |  25.3% |
| offered on |  25.7% |  24.9% |  25.1% |  24.3% |
| offered off |  32.5% |  27.5% |  22.5% |  17.5% |
| landed on |  26.4% |  24.7% |  25.3% |  23.6% |
| landed off |  34.1% |  27.5% |  22.5% |  15.9% |

neutral on / off:  46.5% /  45.6%; story scenes among the six on / off: 3.24 / 3.24; draws 1500.

### switch work → relationships, after 8 new

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  50.0% |  50.0% |   0.0% |   0.0% |
| target |  37.5% |  37.5% |  12.5% |  12.5% |
| pool (20 story scenes) |  32.5% |  27.5% |  22.5% |  17.5% |
| expected |  38.9% |  34.4% |  15.6% |  11.1% |
| offered on |  38.5% |  34.1% |  15.9% |  11.5% |
| offered off |  32.5% |  27.5% |  22.5% |  17.5% |
| landed on |  38.9% |  34.5% |  15.5% |  11.1% |
| landed off |  34.1% |  27.5% |  22.5% |  15.9% |

neutral on / off:  46.3% /  45.6%; story scenes among the six on / off: 3.24 / 3.24; draws 1500.

### switch work → relationships, after 16 new (old left the window)

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |   0.0% | 100.0% |   0.0% |   0.0% |
| target |  12.5% |  62.5% |  12.5% |  12.5% |
| pool (20 story scenes) |  32.5% |  27.5% |  22.5% |  17.5% |
| expected |  36.3% |  37.7% |  12.3% |  13.7% |
| offered on |  36.2% |  37.0% |  13.0% |  13.8% |
| offered off |  32.5% |  27.5% |  22.5% |  17.5% |
| landed on |  36.8% |  37.5% |  12.5% |  13.2% |
| landed off |  34.1% |  27.5% |  22.5% |  15.9% |

neutral on / off:  46.8% /  45.6%; story scenes among the six on / off: 3.24 / 3.24; draws 1500.

### switch relationships → body, after 8 new

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |   0.0% |  50.0% |  50.0% |   0.0% |
| target |  12.5% |  37.5% |  37.5% |  12.5% |
| pool (20 story scenes) |  32.5% |  27.5% |  22.5% |  17.5% |
| expected |  32.5% |  27.5% |  22.5% |  17.5% |
| offered on |  32.8% |  27.6% |  22.4% |  17.2% |
| offered off |  32.5% |  27.5% |  22.5% |  17.5% |
| landed on |  33.2% |  28.0% |  22.0% |  16.8% |
| landed off |  34.1% |  27.5% |  22.5% |  15.9% |

neutral on / off:  46.2% /  45.6%; story scenes among the six on / off: 3.24 / 3.24; draws 1500.

### switch relationships → body, after 16 new (old left the window)

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |   0.0% |   0.0% | 100.0% |   0.0% |
| target |  12.5% |  12.5% |  62.5% |  12.5% |
| pool (20 story scenes) |  32.5% |  27.5% |  22.5% |  17.5% |
| expected |  28.4% |  16.4% |  33.6% |  21.6% |
| offered on |  28.9% |  17.2% |  32.8% |  21.1% |
| offered off |  32.5% |  27.5% |  22.5% |  17.5% |
| landed on |  29.0% |  16.9% |  33.1% |  21.0% |
| landed off |  34.1% |  27.5% |  22.5% |  15.9% |

neutral on / off:  46.1% /  45.6%; story scenes among the six on / off: 3.24 / 3.24; draws 1500.

## Day 24 (chapter 4)

### uniform

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  25.0% |  25.0% |  25.0% |  25.0% |
| target |  25.0% |  25.0% |  25.0% |  25.0% |
| pool (19 story scenes) |  34.2% |  26.3% |  21.1% |  18.4% |
| expected |  34.2% |  26.3% |  21.1% |  18.4% |
| offered on |  34.0% |  25.5% |  21.8% |  18.8% |
| offered off |  33.9% |  26.1% |  21.0% |  19.0% |
| landed on |  33.9% |  26.3% |  20.8% |  19.0% |
| landed off |  34.0% |  25.5% |  21.2% |  19.3% |

neutral on / off:  35.4% /  35.8%; story scenes among the six on / off: 3.84 / 3.84; draws 1500.

### work-heavy

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  75.0% |  12.5% |   6.3% |   6.3% |
| target |  50.0% |  18.8% |  15.6% |  15.6% |
| pool (19 story scenes) |  34.2% |  26.3% |  21.1% |  18.4% |
| expected |  41.0% |  28.9% |  18.1% |  12.1% |
| offered on |  40.4% |  28.0% |  18.9% |  12.7% |
| offered off |  33.9% |  26.1% |  21.0% |  19.0% |
| landed on |  40.4% |  28.8% |  18.3% |  12.5% |
| landed off |  34.0% |  25.5% |  21.2% |  19.3% |

neutral on / off:  35.0% /  35.8%; story scenes among the six on / off: 3.84 / 3.84; draws 1500.

### relationships-heavy

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  12.5% |  75.0% |   6.3% |   6.3% |
| target |  18.8% |  50.0% |  15.6% |  15.6% |
| pool (19 story scenes) |  34.2% |  26.3% |  21.1% |  18.4% |
| expected |  36.9% |  34.8% |  13.4% |  14.9% |
| offered on |  36.4% |  33.6% |  14.5% |  15.5% |
| offered off |  33.9% |  26.1% |  21.0% |  19.0% |
| landed on |  36.9% |  34.2% |  14.2% |  14.7% |
| landed off |  34.0% |  25.5% |  21.2% |  19.3% |

neutral on / off:  35.8% /  35.8%; story scenes among the six on / off: 3.84 / 3.84; draws 1500.

### body-heavy

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  12.5% |   6.3% |  75.0% |   6.3% |
| target |  18.8% |  15.6% |  50.0% |  15.6% |
| pool (19 story scenes) |  34.2% |  26.3% |  21.1% |  18.4% |
| expected |  32.1% |  18.6% |  29.6% |  19.8% |
| offered on |  32.4% |  18.6% |  29.4% |  19.7% |
| offered off |  33.9% |  26.1% |  21.0% |  19.0% |
| landed on |  32.2% |  20.0% |  28.3% |  19.5% |
| landed off |  34.0% |  25.5% |  21.2% |  19.3% |

neutral on / off:  35.5% /  35.8%; story scenes among the six on / off: 3.84 / 3.84; draws 1500.

### inner-heavy

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  12.5% |   6.3% |   6.3% |  75.0% |
| target |  18.8% |  15.6% |  15.6% |  50.0% |
| pool (19 story scenes) |  34.2% |  26.3% |  21.1% |  18.4% |
| expected |  27.5% |  23.2% |  22.9% |  26.4% |
| offered on |  28.3% |  22.9% |  23.1% |  25.7% |
| offered off |  33.9% |  26.1% |  21.0% |  19.0% |
| landed on |  27.7% |  22.7% |  23.4% |  26.2% |
| landed off |  34.0% |  25.5% |  21.2% |  19.3% |

neutral on / off:  35.2% /  35.8%; story scenes among the six on / off: 3.84 / 3.84; draws 1500.

### switch work → relationships, after 8 new

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |  50.0% |  50.0% |   0.0% |   0.0% |
| target |  37.5% |  37.5% |  12.5% |  12.5% |
| pool (19 story scenes) |  34.2% |  26.3% |  21.1% |  18.4% |
| expected |  39.7% |  32.7% |  15.0% |  12.6% |
| offered on |  39.3% |  31.7% |  15.8% |  13.1% |
| offered off |  33.9% |  26.1% |  21.0% |  19.0% |
| landed on |  39.6% |  32.8% |  14.6% |  13.0% |
| landed off |  34.0% |  25.5% |  21.2% |  19.3% |

neutral on / off:  35.0% /  35.8%; story scenes among the six on / off: 3.84 / 3.84; draws 1500.

### switch work → relationships, after 16 new (old left the window)

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |   0.0% | 100.0% |   0.0% |   0.0% |
| target |  12.5% |  62.5% |  12.5% |  12.5% |
| pool (19 story scenes) |  34.2% |  26.3% |  21.1% |  18.4% |
| expected |  36.8% |  36.8% |  11.8% |  14.7% |
| offered on |  36.4% |  35.8% |  12.7% |  15.1% |
| offered off |  33.9% |  26.1% |  21.0% |  19.0% |
| landed on |  37.2% |  36.5% |  12.2% |  14.1% |
| landed off |  34.0% |  25.5% |  21.2% |  19.3% |

neutral on / off:  35.9% /  35.8%; story scenes among the six on / off: 3.84 / 3.84; draws 1500.

### switch relationships → body, after 8 new

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |   0.0% |  50.0% |  50.0% |   0.0% |
| target |  12.5% |  37.5% |  37.5% |  12.5% |
| pool (19 story scenes) |  34.2% |  26.3% |  21.1% |  18.4% |
| expected |  33.9% |  26.9% |  21.5% |  17.7% |
| offered on |  33.5% |  26.0% |  22.3% |  18.2% |
| offered off |  33.9% |  26.1% |  21.0% |  19.0% |
| landed on |  33.6% |  26.8% |  21.4% |  18.2% |
| landed off |  34.0% |  25.5% |  21.2% |  19.3% |

neutral on / off:  35.5% /  35.8%; story scenes among the six on / off: 3.84 / 3.84; draws 1500.

### switch relationships → body, after 16 new (old left the window)

| | Дело | Отношения | Тело | Внутреннее |
|---|---|---|---|---|
| input attention (16 decisions) |   0.0% |   0.0% | 100.0% |   0.0% |
| target |  12.5% |  12.5% |  62.5% |  12.5% |
| pool (19 story scenes) |  34.2% |  26.3% |  21.1% |  18.4% |
| expected |  30.6% |  16.1% |  32.3% |  21.0% |
| offered on |  31.1% |  16.4% |  31.8% |  20.7% |
| offered off |  33.9% |  26.1% |  21.0% |  19.0% |
| landed on |  31.1% |  17.3% |  31.2% |  20.4% |
| landed off |  34.0% |  25.5% |  21.2% |  19.3% |

neutral on / off:  35.6% /  35.8%; story scenes among the six on / off: 3.84 / 3.84; draws 1500.

## Checks

- all spheres present in every scenario, the neutral candidates identical draw by draw on and off, every sampled slot had a full dice set
