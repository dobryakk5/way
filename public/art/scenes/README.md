# World-impact scene states

State variants of repeated places, shown by `Card.visualVariants` (WORLD-IMPACT v1).

| file | purpose | shown when |
| --- | --- | --- |
| `workshop-cup-shown.webp` | Alexey's cup is clearly visible in the workshop | the cup was shown to the buyer (`c1_alexey_broken_jug/show`) |
| `workshop-cup-stand.webp` | Alexey's handmade stand is visible on the workbench | the order was packed instead (`.../prepare`) |
| `kiln-plan.webp` | the firing plan is visible beside the kiln | the firing was calculated together (`c1_alexey_after_jug/teach`) |
| `kiln-alone.webp` | one small cup stands alone by the kiln | Alexey was left to do it himself (`.../work`) |
| `market-empty-basket.webp` | an empty basket is clearly visible at the stall | the hero stopped for the traveller and part of the order stayed behind (`c1_wounded_road/stop`) |

These are the production v1 visuals replacing the initial composited placeholders. The content paths did not change, so no card or engine code needs to change.

Files are 640x853 WebP. Keep the meaningful object inside the central visible band: the card crops the art aggressively, especially when three choices are shown.
