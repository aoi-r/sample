# v286 PvP live-state two-way sync

## Purpose
Real-device PvP still reported that summons were invisible on the opponent screen and damage did not apply, even after v284 boardPatch and v285 boardMirror.

## Fix
Added an independent Firebase live-state channel:

`rooms/{roomId}/liveStatesV286/{clientInstanceId}`

Each client publishes:

- `self`: the player's own public board/status. The receiver applies this as `enemy`.
- `opponentView`: the board/status that the sender currently sees for the opponent. The receiver applies this to its own `player` side only for enemy-target damage reasons, so damage/death caused by the opponent is reflected without allowing stale opponent views to erase fresh local summons.

## Why this helps
- Summons are synchronized from `self.board`.
- Damage to the opponent is synchronized from `opponentView` after damage calls.
- This does not rely on the existing action reducer or boardPatch action path.
- Receive-side render does not publish, avoiding the v279 render-sync loop.

## Safeguards
- Per-browser `clientInstanceId` prevents ignoring a second client that happens to share the same playerId.
- SessionId is respected when available.
- `opponentView` only patches the local player side for enemy-target damage reasons.
- Hand IDs are never synchronized through this channel.

## Verification
- `node --check js/app.js`: OK
