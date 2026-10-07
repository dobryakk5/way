# World-impact scene states

State variants of repeated places, shown by `Card.visualVariants` (WORLD-IMPACT v1). Each file keeps the camera of its
base scene in `../backgrounds/` and changes one visible object, so the hero recognises the place and notices what changed.

| file | base | the visible change | shown when |
| --- | --- | --- | --- |
| `workshop-cup-shown.webp` | workshop-dawn | Alexey's cup stands by the clay | the cup was shown to the buyer (`c1_alexey_broken_jug/show`) |
| `workshop-cup-stand.webp` | workshop-dawn | the stand Alexey made lies by the clay | the order was packed instead (`.../prepare`) |
| `kiln-plan.webp` | kiln-firing | a sheet with the firing plan by the kiln | the firing was calculated together (`c1_alexey_after_jug/teach`) |
| `kiln-alone.webp` | kiln-firing | one small cup stands alone on the ledge | Alexey was left to do it himself (`.../work`) |
| `market-empty-basket.webp` | market-fair | an empty basket by the stall | the hero stopped for the traveller and part of the order stayed behind (`c1_wounded_road/stop`) |

**These five are placeholders.** They are the existing painted backgrounds with one object cloned or drawn in, made so the
mechanism could be seen working end to end. Replace each file with painted art at the same size (640x853, webp) and the same
camera; no code or content change is needed because the content only names the file.

Keep the change inside the middle band of the picture (roughly 30-70% of the height, left of the portrait): the card shows
only that band, and a three-choice card only about a quarter of it.
