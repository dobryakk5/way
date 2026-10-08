# FOCUSED-ENCOUNTERS v1.1 — возвращение последствий

Скрипт: `npm run focused:returns` (250 прогонов × 7 политик = 1750 на режим, 30 дней, цели вращаются). Считается только то, что игрок **реально увидел**. «Решение с задуманным последствием» — выбор дней 1–10, у которого в статическом графе влияния (WORLD-IMPACT) есть читатель; «вернулось» — после него в том же прохождении показано последствие (текст-вариант, запланированное продолжение, сцена, существующая только из-за него, вариант выбора).

## Общее

| Режим | Решений с задуманным последствием за прогон | Вернулось (по всему прохождению) | Вернулось к дню 10 | Видимых откликов на прошлые решения за прогон |
|---|---:|---:|---:|---:|
| OFF | 14.86 | 95% | 90% | 54.27 |
| ON | 15.60 | 94% | 87% | 55.00 |

«К дню 10» для решений, принятых на днях 7–10, мало что может показать по определению: большая часть возвратов приходится на дни 11+ (медиана задержки 5–7 дней).

## Шесть сцен главы 2: до и после правок (ON)

Было — один носитель на решение, возврат только в одной бытовой сцене; стало — по два носителя (кроме Странника), плюс отклики на решения первых дней и на вечер у Марты.

| Решение | Вернулось за прохождение, было → стало | К дню 10, было → стало | Где возвращается теперь |
|---|---|---|---|
| Алексей молчит · «Спросить, что случилось» | 18% → 63% | 2% → 11% | `r_breakfast`, `r_kiln`, `r_customer_wait` |
| Алексей молчит · «Не трогать» | 29% → 71% | 2% → 11% | `r_breakfast`, `r_customer_wait`, `r_kiln` |
| Ладонь Алексея · «Попросить показать руку» | 18% → 58% | 2% → 7% | `r_breakfast`, `r_sweep`, `r_kiln` |
| Ладонь Алексея · «Не вмешиваться» | 19% → 60% | 5% → 13% | `r_kiln`, `r_sweep`, `r_breakfast` |
| Окно Марты · «Пойти домой» | 15% → 48% | 1% → 3% | `r_marta_hello`, `r_evening_light` |
| Окно Марты · «Зайти» | 23% → 49% | 1% → 2% | `r_evening_light`, `r_marta_hello` |
| Чашка Марты · «Не настаивать» | 19% → 47% | 3% → 3% | `r_marta_hello`, `r_evening_light` |
| Чашка Марты · «Спросить ещё раз» | 19% → 41% | 1% → 2% | `r_evening_light`, `r_marta_hello` |
| Пустая лавка · «Говорить только о сделке» | 20% → 63% | 6% → 17% | `r_coins`, `r_market_price` |
| Пустая лавка · «Спросить о лавке» | 23% → 59% | 7% → 13% | `r_market_price`, `r_coins` |
| Хлеб Странника · «Не вмешиваться» | 22% → 36% | 3% → 3% | `r_river` |
| Хлеб Странника · «Предложить ещё хлеба» | 24% → 34% | 1% → 1% | `r_river` |

Решения, принятые на днях 7–10, по-прежнему возвращаются не всегда: носителями служат повседневные сцены, которые показываются не каждый раз. Решения Марты и Странника возвращаются реже всего (41–49% и 34–36%): носители — worldFallback-сцены (P5) с малым весом. Гарантированный возврат даёт только планирование (как `r_marta_evening`: 95%) — это требует правки выбора в существующей сцене и вынесено на решение.

## Что возвращается из первых дней (гарантированные решения, ON)

| c1_alexey_after_jug → «Вместе рассчитать обжиг» | 1074 | 100% (100%) | 100% (100%) | 1 | callback 1361, visual 1074 | c1_alexey_bad_work 1074, r_kiln 287 |
| c1_alexey_after_jug → «Не мешать, пусть делает сам» | 676 | 100% (100%) | 100% (100%) | 1 | callback 902, choice 676, visual 676 | c1_alexey_bad_work 676, r_kiln 226 |
| c1_customer_hurry → «Позвать на помощь соседа» | 287 | 100% (100%) | 100% (100%) | 0 | callback 322 | daytext:evening_2 287, r_marta_hello 35 |
| c1_customer_hurry → «Перенести дрова вместе» | 120 | 100% (100%) | 100% (100%) | 0 | callback 152 | daytext:evening_2 120, r_evening_light 17, r_marta_hello 15 |
| c1_extra_change → «Оставить себе» | 713 | 100% (100%) | 100% (100%) | 2 | callback 1053, delayed 713 | c1_timon_returns 713, r_coins 190, r_market_price 150 |
| c1_extra_change → «Вернуть лишнее» | 1037 | 100% (100%) | 100% (100%) | 2 | callback 1633, choice 1037, delayed 1037, cross-character 49 | c1_timon_returns 1037, r_coins 346, r_market_price 201 |
| c1_liya_letter → «Сначала заказ, ответ потом» | 278 | 100% (100%) | 100% (100%) | 2 | delayed 278, callback 496 | c1_liya_second_letter 278, r_letter_stack 218 |
| c1_liya_letter → «Сесть и написать сестре» | 569 | 100% (100%) | 100% (100%) | 1 | callback 1095, delayed 569 | c1_liya_second_letter 569, r_letter_stack 526 |
| c1_marta_firewood → «Позвать на помощь соседа» | 284 | 100% (100%) | 100% (100%) | 0 | callback 303 | daytext:evening_2 284, r_marta_hello 19 |
| c1_marta_firewood → «Перенести дрова вместе» | 139 | 100% (100%) | 100% (100%) | 0 | callback 168 | daytext:evening_2 139, r_marta_hello 17, r_evening_light 12 |
| r_marta_evening → «Заговорить первым» | 34 | 41% (71%) | 0% (33%) | 11 | callback 16 | r_evening_light 11, r_marta_hello 5 |
| r_marta_evening → «Дать ей начать» | 195 | 62% (59%) | 18% (21%) | 10 | callback 176 | r_evening_light 96, r_marta_hello 80 |
| r_marta_hello → «Договориться на вечер» | 241 | 95% (92%) | 95% (87%) | 1 | delayed 229 | r_marta_evening 229 |

Теперь после решений первых дней игрок видит отклик не только в запланированной сцене, но и в бытовых (`r_coins`, `r_market_price`, `r_letter_stack`, `r_kiln`, `r_river`, `r_marta_hello`). Вечер у Марты: после него Марта помнит, как он прошёл (`r_marta_evening` → `r_marta_hello`/`r_evening_light`).

## Полная таблица (ON; в скобках OFF)

### 2. По решениям (ON; в скобках OFF)

| Решение | Принято (ON) | Вернулось | К дню 10 | Медиана задержки, дней | Типы возврата | Где вернулось (сцены) |
|---|---:|---:|---:|---:|---|---|
| c1_alexey_after_jug → «Вместе рассчитать обжиг» | 1074 | 100% (100%) | 100% (100%) | 1 | callback 1361, visual 1074 | c1_alexey_bad_work 1074, r_kiln 287 |
| c1_alexey_after_jug → «Не мешать, пусть делает сам» | 676 | 100% (100%) | 100% (100%) | 1 | callback 902, choice 676, visual 676 | c1_alexey_bad_work 676, r_kiln 226 |
| c1_alexey_bad_work → «Помочь найти другую печь» | 637 | 100% (100%) | 100% (100%) | 7 | choice 637, callback 637 | c2_timon_order_result 637 |
| c1_alexey_bad_work → «Помочь найти другую печь» | 167 | 100% (100%) | 100% (100%) | 7 | choice 167, callback 167 | c2_timon_order_result 167 |
| c1_alexey_bad_work → «Оставить обжиг ему самому» | 185 | 100% (100%) | 100% (100%) | 7 | choice 185, callback 185 | c2_timon_order_result 185 |
| c1_alexey_bad_work → «Обжечь вместе с заказом» | 437 | 100% (100%) | 100% (100%) | 7 | callback 437 | c2_timon_order_result 437 |
| c1_alexey_bad_work → «Обжечь вместе с заказом» | 324 | 100% (100%) | 100% (100%) | 7 | callback 324 | c2_timon_order_result 324 |
| c1_alexey_broken_jug → «Заняться упаковкой заказа» | 831 | 100% (100%) | 100% (100%) | 0 | callback 3017, visual 831, delayed 831, cross-character 1355 | daytext:evening_1 831, c1_alexey_after_jug 831, c1_wounded_road 831 |
| c1_alexey_broken_jug → «Показать чашку Алексея» | 919 | 100% (100%) | 100% (100%) | 0 | callback 3063, visual 919, delayed 919, cross-character 1225 | daytext:evening_1 919, c1_alexey_after_jug 919, c1_wounded_road 919 |
| c1_customer_hurry → «Позвать на помощь соседа» | 287 | 100% (100%) | 100% (100%) | 0 | callback 322 | daytext:evening_2 287, r_marta_hello 35 |
| c1_customer_hurry → «Перенести дрова вместе» | 120 | 100% (100%) | 100% (100%) | 0 | callback 152 | daytext:evening_2 120, r_evening_light 17, r_marta_hello 15 |
| c1_extra_change → «Оставить себе» | 713 | 100% (100%) | 100% (100%) | 2 | callback 1053, delayed 713 | c1_timon_returns 713, r_coins 190, r_market_price 150 |
| c1_extra_change → «Вернуть лишнее» | 1037 | 100% (100%) | 100% (100%) | 2 | callback 1633, choice 1037, delayed 1037, cross-character 49 | c1_timon_returns 1037, r_coins 346, r_market_price 201 |
| c1_last_clay → «Оставить договор до общего разговора» | 161 | 100% (100%) | 100% (100%) | 0 | callback 161, choice 161 | daytext:evening_5 161, c2_timon_joint_order 161 |
| c1_last_clay → «Обсудить совместное место» | 341 | 100% (100%) | 100% (100%) | 0 | callback 341 | daytext:evening_5 341 |
| c1_liya_letter → «Сначала заказ, ответ потом» | 278 | 100% (100%) | 100% (100%) | 2 | delayed 278, callback 496 | c1_liya_second_letter 278, r_letter_stack 218 |
| c1_liya_letter → «Сесть и написать сестре» | 569 | 100% (100%) | 100% (100%) | 1 | callback 1095, delayed 569 | c1_liya_second_letter 569, r_letter_stack 526 |
| c1_market_spot → «Оставить договор до общего разговора» | 110 | 100% (100%) | 100% (100%) | 0 | callback 110, choice 110 | daytext:evening_5 110, c2_timon_joint_order 110 |
| c1_market_spot → «Обсудить совместное место» | 243 | 100% (100%) | 100% (100%) | 0 | callback 243 | daytext:evening_5 243 |
| c1_marta_firewood → «Позвать на помощь соседа» | 284 | 100% (100%) | 100% (100%) | 0 | callback 303 | daytext:evening_2 284, r_marta_hello 19 |
| c1_marta_firewood → «Перенести дрова вместе» | 139 | 100% (100%) | 100% (100%) | 0 | callback 168 | daytext:evening_2 139, r_marta_hello 17, r_evening_light 12 |
| c1_neighbor_noise → «Доделать самому, сколько успею» | 611 | 100% (100%) | 100% (100%) | 5 | callback 632, delayed 611 | c2_alexey_tools_result 611, c2_shadow_courage 20, c2_shadow_compassion 1 |
| c1_neighbor_noise → «Отдать часть работы Алексею» | 614 | 100% (100%) | 100% (100%) | 5 | callback 614, delayed 614 | c2_alexey_tools_result 614 |
| c1_old_bowl → «Посидеть у воды» | 745 | 100% (100%) | 100% (100%) | 5 | callback 753, delayed 1615 | c2_marta_window_result 745, c2_silence_market_pause 383, c2_silence_alexey_hand 275 |
| c1_old_bowl → «Набрать глины и вернуться» | 505 | 100% (100%) | 100% (100%) | 5 | callback 512, delayed 505 | c2_marta_window_result 505, c2_shadow_letgo 7 |
| c1_rain_delivery → «Доделать ручки до ночи» | 432 | 5% (6%) | 5% (6%) | 7 | callback 20 | c2_shadow_courage 20 |
| c1_rain_delivery → «Договориться о меньшей партии» | 265 | 71% (69%) | 71% (69%) | 7 | choice 180, callback 7 | c2_liya_arrives 180, c2_shadow_letgo 7 |
| c1_wounded_road → «Ехать дальше» | 706 | 100% (100%) | 100% (100%) | 0 | callback 2327, cross-character 706, delayed 706 | daytext:evening_3 706, c1_extra_change 706, c1_wanderer_bridge 706 |
| c1_wounded_road → «Остановиться и помочь» | 1044 | 100% (100%) | 100% (100%) | 0 | callback 3342, visual 1044, cross-character 1672, delayed 1951 | daytext:evening_3 1044, c1_extra_change 1044, c1_wanderer_returns 1044 |
| c2_bridge_repair → «Закончить раньше и поесть дома» | 228 | 100% (100%) | 100% (100%) | 0 | callback 228 | daytext:evening_7 228 |
| c2_bridge_repair → «Пройтись и вернуться к упаковке» | 177 | 100% (100%) | 100% (100%) | 0 | callback 177 | daytext:evening_7 177 |
| c2_gaze_alexey_silence → «Спросить, что случилось» | 321 | 63% (71%) | 11% (10%) | 5 | callback 320 | r_breakfast 116, r_kiln 109, r_customer_wait 95 |
| c2_gaze_alexey_silence → «Не трогать» | 56 | 71% (83%) | 11% (6%) | 5 | callback 67 | r_breakfast 28, r_customer_wait 20, r_kiln 19 |
| c2_gaze_marta_window → «Пойти домой» | 110 | 48% (48%) | 3% (10%) | 7 | callback 61 | r_marta_hello 33, r_evening_light 28 |
| c2_gaze_marta_window → «Зайти» | 185 | 49% (40%) | 2% (8%) | 5 | callback 116 | r_evening_light 59, r_marta_hello 57 |
| c2_gaze_wanderer_bread → «Предложить ещё хлеба» | 145 | 34% (38%) | 1% (12%) | 7 | callback 54 | r_river 54 |
| c2_gaze_wanderer_bread → «Не вмешиваться» | 148 | 36% (34%) | 3% (6%) | 7 | callback 61 | r_river 61 |
| c2_liya_arrives → «Назвать новый срок всей партии» | 754 | 100% (100%) | 100% (100%) | 1 | delayed 754, callback 1508, cross-character 754 | c2_timon_order_result 754, d11_0_apprentice 754 |
| c2_liya_arrives → «Отдать всю согласованную партию» | 254 | 100% (100%) | 100% (100%) | 1 | delayed 254, callback 508, cross-character 254 | c2_timon_order_result 254, d11_0_apprentice 254 |
| c2_liya_arrives → «Сдать готовое, изменить объём» | 584 | 100% (100%) | 100% (100%) | 1 | delayed 584, callback 1168, cross-character 584 | c2_timon_order_result 584, d11_0_apprentice 584 |
| c2_liya_arrives → «Согласовать меньшую партию к утру» | 158 | 100% (100%) | 100% (100%) | 1 | delayed 158, callback 316, cross-character 158 | c2_timon_order_result 158, d11_0_apprentice 158 |
| c2_shadow_compassion → «Закончить раньше и поесть дома» | 272 | 100% (100%) | 100% (100%) | 0 | callback 272 | daytext:evening_7 272 |
| c2_shadow_compassion → «Пройтись и вернуться к упаковке» | 203 | 100% (100%) | 100% (100%) | 0 | callback 203 | daytext:evening_7 203 |
| c2_shadow_courage → «Помочь со сборами и вернуться» | 257 | 100% (100%) | 100% (100%) | 0 | callback 257 | daytext:evening_9 257 |
| c2_shadow_courage → «Остаться для разговора» | 182 | 100% (100%) | 100% (100%) | 0 | callback 182 | daytext:evening_9 182 |
| c2_shadow_honesty → «Помочь со сборами и вернуться» | 223 | 100% (100%) | 100% (100%) | 0 | callback 223 | daytext:evening_9 223 |
| c2_shadow_honesty → «Остаться для разговора» | 153 | 100% (100%) | 100% (100%) | 0 | callback 153 | daytext:evening_9 153 |
| c2_shadow_letgo → «Подготовить меньший объём» | 220 | 100% (100%) | 100% (100%) | 0 | choice 220 | c2_liya_arrives 220 |
| c2_silence_alexey_hand → «Попросить показать руку» | 278 | 58% (69%) | 7% (16%) | 5 | callback 232 | r_breakfast 79, r_sweep 77, r_kiln 76 |
| c2_silence_alexey_hand → «Не вмешиваться» | 219 | 60% (67%) | 13% (10%) | 5 | callback 196 | r_kiln 70, r_sweep 68, r_breakfast 58 |
| c2_silence_market_pause → «Спросить о лавке» | 388 | 59% (60%) | 13% (11%) | 5 | callback 317 | r_market_price 164, r_coins 153 |
| c2_silence_market_pause → «Говорить только о сделке» | 327 | 63% (62%) | 17% (14%) | 4 | callback 277 | r_coins 150, r_market_price 127 |
| c2_silence_marta_cup → «Спросить ещё раз» | 213 | 41% (34%) | 2% (5%) | 7 | callback 105 | r_evening_light 53, r_marta_hello 52 |
| c2_silence_marta_cup → «Не настаивать» | 175 | 47% (46%) | 3% (7%) | 7 | callback 98 | r_marta_hello 60, r_evening_light 38 |
| c2_stones_bag → «Простить долг» | 863 | 100% (100%) | 100% (100%) | 2 | delayed 863, callback 863 | c2_egor_after_forgive 863 |
| c2_stones_bag → «Потребовать вернуть» | 887 | 100% (100%) | 100% (100%) | 2 | delayed 887, callback 887 | c2_egor_leaves 887 |
| c2_timon_joint_order → «Привезти заказ без своего прилавка» | 743 | 100% (100%) | 100% (100%) | 3 | callback 743, cross-character 743 | c2_timon_order_result 743 |
| c2_timon_joint_order → «Взять отдельное место у ворот» | 423 | 100% (100%) | 100% (100%) | 3 | callback 423, cross-character 423 | c2_timon_order_result 423 |
| c2_timon_joint_order → «Договориться об общем прилавке» | 352 | 100% (100%) | 100% (100%) | 3 | callback 352, cross-character 352 | c2_timon_order_result 352 |
| c2_timon_joint_order → «Оплатить отдельное место» | 232 | 100% (100%) | 100% (100%) | 3 | callback 232, cross-character 232 | c2_timon_order_result 232 |
| neutral.body.07 → «Вернусь к общему ритму — с близкими проще войти в него» | 259 | 100% (100%) | 78% (74%) | 2 | delayed 259 | neutral.behavior.body.01 259 |
| neutral.body.07 → «Заведу малый порядок для тяжёлых недель: несколько опор» | 127 | 100% (100%) | 77% (74%) | 2 | delayed 127 | neutral.behavior.body.01 127 |
| neutral.body.07 → «Не вернуть график, а поменять, как я живу и что беру на себя» | 165 | 100% (100%) | 72% (72%) | 2 | delayed 165 | neutral.behavior.body.01 165 |
| neutral.body.07 → «Сделаю приятное и скорое: хочу почувствовать себя лучше» | 26 | 100% (100%) | 85% (81%) | 2 | delayed 26 | neutral.behavior.body.01 26 |
| neutral.inner.01 → «Сначала посмотрю, как слышат другие, — не ссорюсь при всех» | 170 | 100% (100%) | 86% (82%) | 2 | delayed 170 | neutral.behavior.inner.01 170 |
| neutral.inner.01 → «Возьму из этого то, что улучшит работу, а тон — потом» | 308 | 100% (100%) | 79% (80%) | 2 | delayed 308 | neutral.behavior.inner.01 308 |
| neutral.inner.01 → «Отвечу сразу, чтобы не решили, что со мной так можно» | 166 | 100% (100%) | 84% (77%) | 2 | delayed 166 | neutral.behavior.inner.01 166 |
| neutral.inner.01 → «Попрошу примеры: где факт, где мнение, права ли критика» | 57 | 100% (100%) | 95% (93%) | 2 | delayed 57 | neutral.behavior.inner.01 57 |
| neutral.relationships.03 → «Скажу вслух, как мы с ней заводим такие ссоры» | 291 | 100% (100%) | 76% (80%) | 2 | delayed 291 | neutral.behavior.relationships.01 291 |
| neutral.relationships.03 → «Отвечу сразу и жёстко — при всех себя в обиду не дам» | 257 | 100% (100%) | 75% (76%) | 2 | delayed 257 | neutral.behavior.relationships.01 257 |
| neutral.relationships.03 → «Попрошу назвать случаи: что было на деле, а что — слова» | 63 | 100% (100%) | 75% (74%) | 2 | delayed 63 | neutral.behavior.relationships.01 63 |
| neutral.relationships.03 → «Скажу, что задело, и спрошу, что она слышит в «положиться»» | 64 | 100% (100%) | 83% (84%) | 2 | delayed 64 | neutral.behavior.relationships.01 64 |
| neutral.work.01 → «Такое не отпущу — переделаю каждую ручку» | 320 | 100% (100%) | 77% (76%) | 2 | delayed 320 | neutral.behavior.work.01 320 |
| neutral.work.01 → «Целые отдам, треснувшие починю потом» | 184 | 100% (100%) | 78% (74%) | 2 | delayed 184 | neutral.behavior.work.01 184 |
| neutral.work.01 → «Промолчу. Если вернут — докажу, что мои целые» | 27 | 100% (100%) | 78% (80%) | 2 | delayed 27 | neutral.behavior.work.01 27 |
| neutral.work.01 → «Один не решу — спрошу, как у мастеров принято» | 156 | 100% (100%) | 79% (75%) | 2 | delayed 156 | neutral.behavior.work.01 156 |
| r_marta_evening → «Заговорить первым» | 34 | 41% (71%) | 0% (33%) | 11 | callback 16 | r_evening_light 11, r_marta_hello 5 |
| r_marta_evening → «Дать ей начать» | 195 | 62% (59%) | 18% (21%) | 10 | callback 176 | r_evening_light 96, r_marta_hello 80 |
| r_marta_hello → «Договориться на вечер» | 241 | 95% (92%) | 95% (87%) | 1 | delayed 229 | r_marta_evening 229 |

