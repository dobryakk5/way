# FOCUSED-ENCOUNTERS v1.1 — возвращение последствий (после этапа 3)

Скрипт: `npm run focused:returns` (250 прогонов × 7 политик = 1750 на режим, 30 дней, цели вращаются). Считается только то, что игрок **реально увидел**. «Решение с задуманным последствием» — выбор дней 1–10, у которого в статическом графе влияния (WORLD-IMPACT) есть читатель; «вернулось» — после него в том же прохождении показано последствие (текст-вариант, запланированное продолжение, сцена, существующая только из-за него, вариант выбора).

## Общее (итоговый контент)

| Режим | Решений с задуманным последствием за прогон | Вернулось (по всему прохождению) | Вернулось к дню 10 | Видимых откликов на прошлые решения за прогон |
|---|---:|---:|---:|---:|
| OFF | 15.57 | 97% | 86% | 62.36 |
| ON | 16.49 | 97% | 83% | 64.30 |

«К дню 10» для решений, принятых на днях 7–10, мало что может показать по определению: большая часть возвратов приходится на дни 11+ (медиана задержки 5–7 дней). Поэтому «вернулось по всему прохождению» важнее.

## Шесть сцен главы 2: что было и что есть (ON)

Столбцы «Этап 1» и «Этап 2» — прежние измерения этого отчёта (до правок; после бытовых воспоминаний). «Этап 3» — итоговый контент: к воспоминаниям добавлены переписанные `enc_*` (главы 3–4, они читают эти решения) и **восемь новых сцен-продолжений** `x3_*` / `x4_*`. Последний столбец — как часто игрок, принявший решение, затем видит **отдельную сцену-продолжение** (событий `delayed` на число принятых решений; один показ на решение).

| Решение | Этап 1 | Этап 2 | Этап 3 (по всему прохождению) | К дню 10 (этап 3) | Отдельное продолжение |
|---|---:|---:|---:|---:|---|
| Алексей молчит · «Спросить, что случилось» | 18% | 63% | 97% | 10% | `x3_alexey_asks_for_order` 63% |
| Алексей молчит · «Не трогать» | 29% | 71% | 98% | 10% | `x3_alexey_asks_for_order` 67% |
| Ладонь Алексея · «Попросить показать руку» | 18% | 58% | 91% | 9% | — (`enc_3_7`, `enc_4_7`) |
| Ладонь Алексея · «Не вмешиваться» | 19% | 60% | 88% | 14% | — (`enc_3_7`, `enc_4_7`) |
| Окно Марты · «Пойти домой» | 15% | 48% | 89% | 2% | `x3_marta_apart` 64% |
| Окно Марты · «Зайти» | 23% | 49% | 87% | 1% | `x3_marta_second_cup` 66% |
| Чашка Марты · «Не настаивать» | 19% | 47% | 91% | 1% | `x3_marta_apart` 70% |
| Чашка Марты · «Спросить ещё раз» | 19% | 41% | 83% | 1% | `x3_marta_second_cup` 63% |
| Пустая лавка · «Говорить только о сделке» | 20% | 63% | 89% | 16% | — (`enc_3_5`, `enc_4_5`) |
| Пустая лавка · «Спросить о лавке» | 23% | 59% | 88% | 11% | — (`enc_3_5`, `enc_4_5`) |
| Хлеб Странника · «Не вмешиваться» | 22% | 36% | 81% | 1% | `x3_boy_by_river` 66% |
| Хлеб Странника · «Предложить ещё хлеба» | 24% | 34% | 86% | 1% | `x3_boy_at_door` 55% |

Оценка. Любой возврат (воспоминание, реакция, продолжение) вырос с 15–29% (этап 1) и 34–71% (этап 2) до 81–98%. Продолжения-сцены показываются в 55–70% случаев, **не гарантированно**: они обычные свободные сцены, а движок трактует любую карточку с `mustShowBy` как безусловное обязательство с первого дня главы, поэтому условным продолжениям жёсткий срок давать нельзя (проверено: иначе «Required event cannot satisfy its deadline»). Остальное возвращается воспоминаниями и `enc_*` как носителями последствий. **Слабое место:** возвраты «к дню 10» для решений Марты и Странника ниже, чем при выключенном фокусе (1–2% против 6–13%): ON реже показывает бытовые носители `r_marta_hello`, `r_river`, `r_evening_light`, потому что они P5 (worldFallback) и отдают места сюжетным сценам. Решения дней 7–10 всё равно возвращаются в днях 11+ (медиана 5–8 дней).

## Что возвращается из первых дней

Решения первых дней теперь возвращаются и в запланированных сценях, и в бытовых (`r_coins`, `r_market_price`, `r_letter_stack`, `r_kiln`, `r_river`, `r_marta_hello`). Вечер у Марты (`r_marta_hello` → «Договориться на вечер») возвращает `r_marta_evening` в 100% случаев (163 из 163, день +1); после него Марта помнит, как он прошёл, в `r_marta_hello`, `r_evening_light`, а в днях 11+ — в `x3_marta_second_cup` (`marta.circle=open`) и `x4_marta_keeps_word`. **Повторное обещание Марте** (день 4 → вечер дня 5 → повтор дня 14 → день 15) исправлено: `r_marta_evening` теперь `once:false` с текстом повтора, регрессионный тест — `src/content/dayOneToTenReturns.test.ts` («a repeated promise to Marta is kept as well») — проходит всю цепочку.

## Полная таблица по решениям (ON; в скобках OFF)

| Решение | Принято (ON) | Вернулось | К дню 10 | Медиана задержки, дней | Типы возврата | Где вернулось (сцены) |
|---|---:|---:|---:|---:|---|---|
| c1_alexey_after_jug → «Вместе рассчитать обжиг» | 1074 | 100% (100%) | 100% (100%) | 1 | callback 1357, visual 1074 | c1_alexey_bad_work 1074, r_kiln 283 |
| c1_alexey_after_jug → «Не мешать, пусть делает сам» | 676 | 100% (100%) | 100% (100%) | 1 | callback 890, choice 676, visual 676 | c1_alexey_bad_work 676, r_kiln 214 |
| c1_alexey_bad_work → «Помочь найти другую печь» | 637 | 100% (100%) | 100% (100%) | 7 | choice 637, callback 637 | c2_timon_order_result 637 |
| c1_alexey_bad_work → «Помочь найти другую печь» | 167 | 100% (100%) | 100% (100%) | 7 | choice 167, callback 167 | c2_timon_order_result 167 |
| c1_alexey_bad_work → «Оставить обжиг ему самому» | 185 | 100% (100%) | 100% (100%) | 7 | choice 185, callback 185 | c2_timon_order_result 185 |
| c1_alexey_bad_work → «Обжечь вместе с заказом» | 437 | 100% (100%) | 100% (100%) | 7 | callback 437 | c2_timon_order_result 437 |
| c1_alexey_bad_work → «Обжечь вместе с заказом» | 324 | 100% (100%) | 100% (100%) | 7 | callback 324 | c2_timon_order_result 324 |
| c1_alexey_broken_jug → «Заняться упаковкой заказа» | 831 | 100% (100%) | 100% (100%) | 0 | callback 3017, visual 831, delayed 831, cross-character 1355 | daytext:evening_1 831, c1_alexey_after_jug 831, c1_wounded_road 831 |
| c1_alexey_broken_jug → «Показать чашку Алексея» | 919 | 100% (100%) | 100% (100%) | 0 | callback 3063, visual 919, delayed 919, cross-character 1225 | daytext:evening_1 919, c1_alexey_after_jug 919, c1_wounded_road 919 |
| c1_customer_hurry → «Позвать на помощь соседа» | 287 | 100% (100%) | 100% (100%) | 0 | callback 314 | daytext:evening_2 287, r_marta_hello 27 |
| c1_customer_hurry → «Перенести дрова вместе» | 120 | 100% (100%) | 100% (100%) | 0 | callback 139 | daytext:evening_2 120, r_marta_hello 10, r_evening_light 9 |
| c1_extra_change → «Оставить себе» | 713 | 100% (100%) | 100% (100%) | 2 | callback 1267, delayed 713 | c1_timon_returns 713, enc_3_5 216, r_coins 190 |
| c1_extra_change → «Вернуть лишнее» | 1037 | 100% (100%) | 100% (100%) | 2 | callback 1910, choice 1037, delayed 1037, cross-character 54 | c1_timon_returns 1037, r_coins 327, enc_3_5 283 |
| c1_last_clay → «Оставить договор до общего разговора» | 161 | 100% (100%) | 100% (100%) | 0 | callback 161, choice 161 | daytext:evening_5 161, c2_timon_joint_order 161 |
| c1_last_clay → «Обсудить совместное место» | 341 | 100% (100%) | 100% (100%) | 0 | callback 341 | daytext:evening_5 341 |
| c1_liya_letter → «Сначала заказ, ответ потом» | 318 | 100% (100%) | 100% (100%) | 2 | callback 570, delayed 318 | c1_liya_second_letter 318, r_letter_stack 252 |
| c1_liya_letter → «Сесть и написать сестре» | 687 | 100% (100%) | 100% (100%) | 2 | delayed 687, callback 1435 | c1_liya_second_letter 687, r_letter_stack 637, enc_3_0 111 |
| c1_market_spot → «Оставить договор до общего разговора» | 110 | 100% (100%) | 100% (100%) | 0 | callback 110, choice 110 | daytext:evening_5 110, c2_timon_joint_order 110 |
| c1_market_spot → «Обсудить совместное место» | 243 | 100% (100%) | 100% (100%) | 0 | callback 243 | daytext:evening_5 243 |
| c1_marta_firewood → «Позвать на помощь соседа» | 284 | 100% (100%) | 100% (100%) | 0 | callback 310 | daytext:evening_2 284, r_marta_hello 26 |
| c1_marta_firewood → «Перенести дрова вместе» | 139 | 100% (100%) | 100% (100%) | 0 | callback 165 | daytext:evening_2 139, r_marta_hello 19, r_evening_light 7 |
| c1_neighbor_noise → «Доделать самому, сколько успею» | 639 | 100% (100%) | 100% (100%) | 5 | callback 2562, delayed 639 | c2_alexey_tools_result 639, enc_4_0 377, enc_4_3 374 |
| c1_neighbor_noise → «Отдать часть работы Алексею» | 645 | 100% (100%) | 100% (100%) | 5 | callback 2690, delayed 645 | c2_alexey_tools_result 645, enc_4_3 409, enc_4_0 387 |
| c1_old_bowl → «Посидеть у воды» | 809 | 100% (100%) | 100% (100%) | 5 | callback 1663, delayed 1747 | c2_marta_window_result 809, enc_4_6 480, c2_silence_market_pause 410 |
| c1_old_bowl → «Набрать глины и вернуться» | 541 | 100% (100%) | 100% (100%) | 5 | callback 1090, delayed 541 | c2_marta_window_result 541, enc_4_6 287, enc_3_6 255 |
| c1_rain_delivery → «Доделать ручки до ночи» | 432 | 6% (6%) | 6% (6%) | 7 | callback 25 | c2_shadow_courage 25 |
| c1_rain_delivery → «Договориться о меньшей партии» | 265 | 71% (69%) | 71% (69%) | 7 | choice 180, callback 7 | c2_liya_arrives 180, c2_shadow_letgo 7 |
| c1_wounded_road → «Ехать дальше» | 706 | 100% (100%) | 100% (100%) | 0 | callback 2311, cross-character 706, delayed 706 | daytext:evening_3 706, c1_extra_change 706, c1_wanderer_bridge 706 |
| c1_wounded_road → «Остановиться и помочь» | 1044 | 100% (100%) | 100% (100%) | 0 | callback 3714, visual 1044, cross-character 1681, delayed 1971 | daytext:evening_3 1044, c1_extra_change 1044, c1_wanderer_returns 1044 |
| c2_bridge_repair → «Закончить раньше и поесть дома» | 228 | 100% (100%) | 100% (100%) | 0 | callback 228 | daytext:evening_7 228 |
| c2_bridge_repair → «Пройтись и вернуться к упаковке» | 177 | 100% (100%) | 100% (100%) | 0 | callback 177 | daytext:evening_7 177 |
| c2_gaze_alexey_silence → «Спросить, что случилось» | 334 | 97% (97%) | 10% (10%) | 4 | callback 1021, delayed 212, cross-character 128 | x3_alexey_asks_for_order 212, enc_3_1 157, enc_3_10 128 |
| c2_gaze_alexey_silence → «Не трогать» | 58 | 98% (100%) | 10% (6%) | 4 | callback 180, delayed 39, cross-character 20 | x3_alexey_asks_for_order 39, enc_3_1 35, r_breakfast 25 |
| c2_gaze_marta_window → «Пойти домой» | 101 | 89% (81%) | 2% (10%) | 6 | callback 94, delayed 65 | x3_marta_apart 65, enc_3_2 35, r_marta_hello 30 |
| c2_gaze_marta_window → «Зайти» | 189 | 87% (89%) | 1% (8%) | 5 | callback 169, delayed 125 | x3_marta_second_cup 125, r_evening_light 62, enc_3_2 57 |
| c2_gaze_wanderer_bread → «Предложить ещё хлеба» | 146 | 86% (83%) | 1% (13%) | 7 | callback 110, delayed 80 | x3_boy_at_door 80, r_river 59, enc_4_8 51 |
| c2_gaze_wanderer_bread → «Не вмешиваться» | 158 | 81% (93%) | 1% (6%) | 8 | delayed 105, callback 79 | x3_boy_by_river 105, r_river 55, enc_4_8 24 |
| c2_liya_arrives → «Назвать новый срок всей партии» | 755 | 100% (100%) | 100% (100%) | 1 | delayed 755, callback 1510, cross-character 755 | c2_timon_order_result 755, d11_0_apprentice 755 |
| c2_liya_arrives → «Отдать всю согласованную партию» | 252 | 100% (100%) | 100% (100%) | 1 | delayed 252, callback 504, cross-character 252 | c2_timon_order_result 252, d11_0_apprentice 252 |
| c2_liya_arrives → «Сдать готовое, изменить объём» | 590 | 100% (100%) | 100% (100%) | 1 | delayed 590, callback 1180, cross-character 590 | c2_timon_order_result 590, d11_0_apprentice 590 |
| c2_liya_arrives → «Согласовать меньшую партию к утру» | 153 | 100% (100%) | 100% (100%) | 1 | delayed 153, callback 306, cross-character 153 | c2_timon_order_result 153, d11_0_apprentice 153 |
| c2_shadow_compassion → «Закончить раньше и поесть дома» | 272 | 100% (100%) | 100% (100%) | 0 | callback 272 | daytext:evening_7 272 |
| c2_shadow_compassion → «Пройтись и вернуться к упаковке» | 203 | 100% (100%) | 100% (100%) | 0 | callback 203 | daytext:evening_7 203 |
| c2_shadow_courage → «Помочь со сборами и вернуться» | 257 | 100% (100%) | 100% (100%) | 0 | callback 257 | daytext:evening_9 257 |
| c2_shadow_courage → «Остаться для разговора» | 182 | 100% (100%) | 100% (100%) | 0 | callback 182 | daytext:evening_9 182 |
| c2_shadow_honesty → «Помочь со сборами и вернуться» | 223 | 100% (100%) | 100% (100%) | 0 | callback 223 | daytext:evening_9 223 |
| c2_shadow_honesty → «Остаться для разговора» | 153 | 100% (100%) | 100% (100%) | 0 | callback 153 | daytext:evening_9 153 |
| c2_shadow_letgo → «Подготовить меньший объём» | 220 | 100% (100%) | 100% (100%) | 0 | choice 220 | c2_liya_arrives 220 |
| c2_silence_alexey_hand → «Попросить показать руку» | 302 | 91% (93%) | 9% (16%) | 6 | callback 594 | enc_4_7 189, enc_3_7 114, r_sweep 93 |
| c2_silence_alexey_hand → «Не вмешиваться» | 241 | 88% (88%) | 14% (10%) | 6 | callback 445 | enc_4_7 142, enc_3_7 92, r_kiln 76 |
| c2_silence_market_pause → «Спросить о лавке» | 430 | 88% (91%) | 11% (11%) | 6 | callback 799 | enc_4_5 262, enc_3_5 225, r_coins 158 |
| c2_silence_market_pause → «Говорить только о сделке» | 339 | 89% (94%) | 16% (14%) | 6 | callback 675 | enc_4_5 220, enc_3_5 184, r_coins 136 |
| c2_silence_marta_cup → «Спросить ещё раз» | 235 | 83% (87%) | 1% (6%) | 5 | callback 184, delayed 147 | x3_marta_second_cup 147, enc_3_2 78, r_marta_hello 57 |
| c2_silence_marta_cup → «Не настаивать» | 176 | 91% (79%) | 1% (7%) | 5 | callback 172, delayed 124 | x3_marta_apart 124, enc_3_2 73, r_marta_hello 51 |
| c2_stones_bag → «Простить долг» | 863 | 100% (100%) | 100% (100%) | 2 | delayed 863, callback 1276 | c2_egor_after_forgive 863, enc_3_8 413 |
| c2_stones_bag → «Потребовать вернуть» | 887 | 100% (100%) | 100% (100%) | 2 | delayed 887, callback 1306 | c2_egor_leaves 887, enc_3_8 419 |
| c2_timon_joint_order → «Привезти заказ без своего прилавка» | 743 | 100% (100%) | 100% (100%) | 3 | callback 743, cross-character 743 | c2_timon_order_result 743 |
| c2_timon_joint_order → «Взять отдельное место у ворот» | 423 | 100% (100%) | 100% (100%) | 3 | callback 423, cross-character 423 | c2_timon_order_result 423 |
| c2_timon_joint_order → «Договориться об общем прилавке» | 352 | 100% (100%) | 100% (100%) | 3 | callback 478, cross-character 352 | c2_timon_order_result 352, enc_4_5 126 |
| c2_timon_joint_order → «Оплатить отдельное место» | 232 | 100% (100%) | 100% (100%) | 3 | callback 232, cross-character 232 | c2_timon_order_result 232 |
| c2_timon_order_result → «Дать Алексею представить её самому» | 233 | 85% (90%) | 0% (0%) | 4 | callback 521, cross-character 197 | enc_4_10 120, enc_3_4 115, enc_4_1 112 |
| c2_timon_order_result → «Побыть рядом на его отдельном показе» | 407 | 90% (93%) | 0% (0%) | 6 | callback 997, cross-character 420 | enc_4_10 262, enc_4_1 249, enc_3_4 176 |
| c2_timon_order_result → «Согласовать показ после ярмарки» | 582 | 89% (89%) | 0% (0%) | 4 | callback 1166, cross-character 254 | enc_3_1 305, enc_3_4 305, enc_4_1 302 |
| neutral.body.07 → «Вернусь к общему ритму — с близкими проще войти в него» | 277 | 100% (100%) | 81% (74%) | 2 | delayed 277 | neutral.behavior.body.01 277 |
| neutral.body.07 → «Заведу малый порядок для тяжёлых недель: несколько опор» | 128 | 100% (100%) | 78% (74%) | 2 | delayed 128 | neutral.behavior.body.01 128 |
| neutral.body.07 → «Не вернуть график, а поменять, как я живу и что беру на себя» | 176 | 100% (100%) | 72% (73%) | 2 | delayed 176 | neutral.behavior.body.01 176 |
| neutral.body.07 → «Сделаю приятное и скорое: хочу почувствовать себя лучше» | 28 | 100% (100%) | 86% (81%) | 2 | delayed 28 | neutral.behavior.body.01 28 |
| neutral.inner.01 → «Сначала посмотрю, как слышат другие, — не ссорюсь при всех» | 164 | 100% (100%) | 86% (83%) | 2 | delayed 164 | neutral.behavior.inner.01 164 |
| neutral.inner.01 → «Возьму из этого то, что улучшит работу, а тон — потом» | 297 | 100% (100%) | 80% (80%) | 2 | delayed 297 | neutral.behavior.inner.01 297 |
| neutral.inner.01 → «Отвечу сразу, чтобы не решили, что со мной так можно» | 156 | 100% (100%) | 83% (76%) | 2 | delayed 156 | neutral.behavior.inner.01 156 |
| neutral.inner.01 → «Попрошу примеры: где факт, где мнение, права ли критика» | 62 | 100% (100%) | 92% (93%) | 2 | delayed 62 | neutral.behavior.inner.01 62 |
| neutral.relationships.03 → «Скажу вслух, как мы с ней заводим такие ссоры» | 307 | 100% (100%) | 79% (80%) | 2 | delayed 307 | neutral.behavior.relationships.01 307 |
| neutral.relationships.03 → «Отвечу сразу и жёстко — при всех себя в обиду не дам» | 261 | 100% (100%) | 77% (77%) | 2 | delayed 261 | neutral.behavior.relationships.01 261 |
| neutral.relationships.03 → «Попрошу назвать случаи: что было на деле, а что — слова» | 61 | 100% (100%) | 70% (74%) | 2 | delayed 61 | neutral.behavior.relationships.01 61 |
| neutral.relationships.03 → «Скажу, что задело, и спрошу, что она слышит в «положиться»» | 60 | 100% (100%) | 83% (84%) | 2 | delayed 60 | neutral.behavior.relationships.01 60 |
| neutral.work.01 → «Такое не отпущу — переделаю каждую ручку» | 323 | 100% (100%) | 78% (76%) | 2 | delayed 323 | neutral.behavior.work.01 323 |
| neutral.work.01 → «Целые отдам, треснувшие починю потом» | 195 | 100% (100%) | 75% (75%) | 2 | delayed 195 | neutral.behavior.work.01 195 |
| neutral.work.01 → «Промолчу. Если вернут — докажу, что мои целые» | 24 | 100% (100%) | 79% (80%) | 2 | delayed 24 | neutral.behavior.work.01 24 |
| neutral.work.01 → «Один не решу — спрошу, как у мастеров принято» | 140 | 100% (100%) | 81% (75%) | 2 | delayed 140 | neutral.behavior.work.01 140 |
| r_marta_evening → «Заговорить первым» | 24 | 100% (96%) | 0% (30%) | 13 | callback 51, delayed 10 | r_evening_light 22, r_marta_hello 13, x3_marta_second_cup 10 |
| r_marta_evening → «Дать ей начать» | 137 | 97% (93%) | 12% (20%) | 10 | delayed 83, callback 354 | r_evening_light 107, r_marta_hello 103, x3_marta_second_cup 83 |
| r_marta_hello → «Договориться на вечер» | 163 | 100% (100%) | 99% (93%) | 1 | delayed 163 | r_marta_evening 163 |
