# World-impact scene states

State variants of repeated places, shown by `Card.visualVariants` (WORLD-IMPACT v1).

The rule: **the same place, the same camera, one clearly visible change.** Every file here is its base scene from
`../backgrounds/` with a single object added; the rest of the picture is the original (about 98% of the pixels are untouched,
the remainder differs only by WebP re-encoding). The hero must feel she came back to a familiar place and noticed something
changed, not that she was shown another illustration of a similar place.

| file | base | the one change | shown when |
| --- | --- | --- | --- |
| `workshop-cup-shown.webp` | workshop-dawn | Alexey's cup stands on the bench in front of the clay | the cup was shown to the buyer (`c1_alexey_broken_jug/show`) |
| `workshop-cup-stand.webp` | workshop-dawn | a thick round wooden stand on the bench in front of the clay | the order was packed instead (`.../prepare`) |
| `kiln-plan.webp` | kiln-firing | a framed plan board on the oven pier | the firing was calculated together (`c1_alexey_after_jug/teach`) |
| `kiln-alone.webp` | kiln-firing | one small pot alone on the oven's stone ledge | Alexey was left to do it himself (`.../work`) |
| `market-empty-basket.webp` | market-fair | an open wicker basket on the free cobbles | the hero stopped for the traveller and part of the order stayed behind (`c1_wounded_road/stop`) |

How they were made: each object is cloned from an object that already exists in the same picture (so light and paint match)
or built from its texture, then set into the left-centre of the frame. The cards crop the art to its middle band
(about 30-70% of the height; a three-choice card shows only about a quarter) and lay a character portrait over the right
40%, so the change has to sit in the left-centre and must not cover the location.

These are composited, not painted. If you repaint them, keep the same 640x853 frame pixel for pixel and change only the one
object; content only names the file, so nothing else needs to change.
