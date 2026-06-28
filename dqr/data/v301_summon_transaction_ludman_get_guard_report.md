# v301 summon transaction + Ludman GET guard

## Fixes

1. Summon rollback
   - If the summon path throws before the unit is actually placed/resolved, restore MP, hand, board, pending selection and own-turn lock.
   - This prevents the report where an error correction consumes cost even though the unit was not summoned.

2. Direct summon GET once guard
   - Direct `召喚時:GET(n)` is parsed from the pre-BET summon text.
   - During one summon event, coin grants caused by that direct summon GET are capped at `n`.
   - Ludman is therefore capped at one coin for `召喚時:GET(1)` even if older generic/manual handlers both fire.

## Honesty note

The previous statement that duplicate effects were not a problem was too broad. The Ludman report proves there was still a duplicate path. v301 adds an explicit guard instead of relying on broad claims.
