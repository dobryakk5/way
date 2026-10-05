# Граф контента v2.2

Слоты в данных нумеруются от 0 до 3. Всего 53 карточки; 9 точных и 4 маршрутных слота. Не больше двух зарезервированных слотов в день.

## Точные сцены

| День | Слот | Карточка |
| ---: | ---: | --- |
| 1 | 0 | `c1_alexey_broken_jug` |
| 2 | 0 | `c1_alexey_after_jug` |
| 3 | 0 | `c1_wounded_road` |
| 3 | 1 | `c1_alexey_bad_work` |
| 4 | 0 | `c1_extra_change` |
| 7 | 1 | `c2_timon_joint_order` |
| 8 | 0 | `c2_stones_bag` |
| 9 | 3 | `c2_liya_arrives` |
| 10 | 3 | `c2_timon_order_result` |

## Маршруты

| День/слот | Выбор | Пул сцен |
| --- | --- | --- |
| 2/2 | Вернуться к заказу в мастерской | `c1_rain_delivery`, `r_customer_wait` |
| 2/2 | Зайти к Марте | `c1_marta_firewood`, `c1_customer_hurry` |
| 5/1 | Зайти на рынок | `c1_market_spot`, `c1_last_clay` |
| 5/1 | Час без работы у реки | `c2_shadow_attention`, `r_river` |
| 7/2 | Остаться с Алексеем | `c2_old_master_tools`, `r_kiln` |
| 7/2 | Закончить раньше | `c2_bridge_repair`, `c2_shadow_compassion` |
| 9/1 | Проверить большой заказ | `c2_shadow_letgo`, `r_coins` |
| 9/1 | Встретиться с Ильёй | `c2_shadow_honesty`, `c2_shadow_courage` |

## Окна возможностей

| Возможность | До вечера дня | Факт | Воспользовался / окно прошло |
| --- | ---: | --- | --- |
| `marta_help` | 2 | `liaison.martaHelp` | `hero` / `other` |
| `market_place` | 5 | `market.window` | `reserved` / `other` |
| `quiet_evening` | 7 | `rest.beforeFair` | `kept` / `missed` |
| `ilya_talk` | 9 | `ilya.meeting` | `talked` / `missed` |

Сначала фиксируется реальное предъявление маршрута или сцены. Закрытие окна идемпотентно, без списания ресурсов. Последствия читаются в тексте вечера и дальнейших вариантах.

## Отложенные продолжения

| Источник | Выбор | Через дней | Последний день | Продолжение |
| --- | --- | ---: | ---: | --- |
| `c1_alexey_broken_jug` | `show` | 1 | 2 | `c1_alexey_after_jug` |
| `c1_alexey_broken_jug` | `prepare` | 1 | 2 | `c1_alexey_after_jug` |
| `c1_wounded_road` | `stop` | 3 | 6 | `c1_wanderer_returns` |
| `c1_wounded_road` | `pass` | 3 | 6 | `c1_wanderer_bridge` |
| `c1_extra_change` | `return` | 2 | 6 | `c1_timon_returns` |
| `c1_extra_change` | `keep` | 2 | 6 | `c1_timon_returns` |
| `c1_liya_letter` | `later` | 2 | — | `c1_liya_second_letter` |
| `c1_liya_letter` | `reply` | 2 | — | `c1_liya_second_letter` |
| `c1_old_bowl` | `pause` | 3 | — | `c2_marta_window_result` |
| `c1_old_bowl` | `return` | 3 | — | `c2_marta_window_result` |
| `c1_neighbor_noise` | `rest` | 3 | — | `c2_alexey_tools_result` |
| `c1_neighbor_noise` | `continue` | 3 | — | `c2_alexey_tools_result` |
| `c2_stones_bag` | `insist` | 2 | 10 | `c2_ilya_leaves` |
| `c2_stones_bag` | `forgive` | 2 | 10 | `c2_ilya_after_forgive` |
| `c2_liya_arrives` | `fulfilled` | 1 | 10 | `c2_timon_order_result` |
| `c2_liya_arrives` | `revised` | 1 | 10 | `c2_timon_order_result` |
| `c2_liya_arrives` | `revise_now` | 1 | 10 | `c2_timon_order_result` |
| `c2_liya_arrives` | `deferred` | 1 | 10 | `c2_timon_order_result` |

## Доказательства и итог

`traces.json` связывает поступки с конкретными ответами мира. `body.pace` и `inner.pause` фиксируют самостоятельные линии тела и внутреннего мира. Озарения применяются вечером дней 6–8 и имеют дальнейшие видимые результаты. Пять теней требуют качества ≥8 и действия-свидетельства; сценарии приведены в `scripts/shadow-scenarios.ts`.

Три итоговых факта: `workshop.orderOutcome`, `alexey.path`, `market.arrangement`. Концовка следует из заказа, портрет — из действий, наблюдений и намерения. Грани не суммируются в оценку «правильного пути».
