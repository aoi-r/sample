# v284 landscape wide slots + PvP boardPatch sync

## Layout
- Smartphone landscape summon slots widened by reducing field side gutters and increasing min/max slot width.
- Enemy leader X position remains mirrored inward from the right edge to avoid the iPhone camera island.
- v283 compact choice/hand-use modal CSS is preserved.

## PvP sync
- Added `boardPatchV284` action.
- Sent after:
  - `summonUnitFromHandToBoard`
  - `putUnitIntoPlayFromCard` for player side
  - `resolveDeaths`
- Payload contains board/HP/MP/tension/weapon/handCount/deckCount only.
- It never sends actual `handIds`.
- Remote reducer applies the patch directly to `game.enemy.board`, bypassing stale public state snapshots.

## Notes
- render->sync loop remains disabled.
- Tap/choice modal handlers are unchanged.
