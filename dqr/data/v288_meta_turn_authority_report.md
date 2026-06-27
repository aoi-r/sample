# v288 meta turn authority sync guard

## Fix
v287 made live sync (`syncV287`) carry and apply `currentTurnPlayerId`.
That made turn ownership ambiguous and could override the room meta listener with stale live-state data.

v288 restores the rule:

- `rooms/{roomId}/meta.currentTurnPlayerId` is the only turn authority.
- Live sync mirrors board/HP/MP/tension only.
- `advanceTurnToOpponent()` delegates to the older stable meta update path.
- A small meta watchdog re-applies the meta turn after sync renders.

## Expected result
Turn end should hand control to the opponent again, while board/status sync remains active.
