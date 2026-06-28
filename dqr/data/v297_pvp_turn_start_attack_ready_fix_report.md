# v297 PvP turn-start attack readiness fix

## Bug
In PvP, normal units summoned on a previous own turn could still show `canAttack=false` on the next own turn.
Haste units could attack because they are set to `canAttack=true` immediately when summoned, hiding the issue.

Affected examples reported:
- ルドマン
- ブラッドレディ
- ラプソーン
- トンネラー
- 黄金兵

## Cause
The Firebase/meta turn-start path calls `prepareOwnTurnStartV280()`.
That function advanced turn resources and drew a card, but did not call the unit refresh logic that solo mode uses (`refreshUnitsForSideTurnV114`).
So normal units kept their initial `summoningSickness=true` / `canAttack=false` state.

## Fix
A v297 wrapper around `prepareOwnTurnStartV280()` now runs once per own turn:
- clears normal summoning sickness
- resets `attacksLeft` (2 for double attack, otherwise 1)
- sets `canAttack=true` for alive, non-building units with attack > 0
- preserves explicit attack-lock flags/statuses
- re-renders and syncs public state after readiness is applied

## Runtime test API
`window.__DQR_TEST__.v297.simulateTurnStartAttackReadyV297()`
