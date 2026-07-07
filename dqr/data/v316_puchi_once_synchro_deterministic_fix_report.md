# v316 puchi once and synchro deterministic fix

## Fixed

### ぷちメタル

v312 tried to suppress the old end-turn branch by setting `_puchiMetalEndGetDone=true` before calling the legacy handler. After that, the v312 grant check read the same flag and treated the effect as already used, so GET(1) could become zero times.

v316 adds its own lifetime ledger `_v316PuchiMetalGetOnce` and grants after the legacy handler when v316 has not granted for that unit life yet. The same unit cannot grant again on later turns.

### シンクロ / 同調

The old synchro refresh was additive. Render/hero refresh/put-into-play static checks could call synchro again, turning `プチファイター` into impossible stats such as 18/15.

v316 makes synchro deterministic: for the current hero level, compute the desired printed synchro bonus and apply only the delta from the previously applied synchro bonus. It also blocks direct cumulative `applySynchroEffectText` calls for synchro sources.

Expected examples:

- プチファイター Lv3: 1/1 + attack +1 + HP +1 + haste = 2/2 速攻
- ブラバニクイーン Lv3: 4/2 + attack +1 + pierce + haste = 5/2 貫通/速攻

## Checks

- node --check js/app.js
- static v316 checks

Dynamic browser/Firebase tests are still not claimed as completed in this sandbox because of the known external HTTPS/Chromium constraints.
