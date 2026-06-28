# v294 Deathrattle GET ownership fix

## Issue
When ベホイミスライム died in a Mage vs Merchant PvP match, both clients could receive coins, and the owner could receive two coins.

## Cause
Multiple death paths could process the same death:

- `unitDeath` event handler -> cost death effect
- `applyDeathrattle()` -> generic death text parser
- explicit card-specific death GET handlers

Those paths used local-player-only `addCardToHandByName('コイン')`, so an enemy-side death could add coins to the wrong local hand. For ベホイミスライム, generic `GET(1)` and explicit handler could also stack.

## Fix
v294 treats death GET as owner-side only:

- if the dead unit is on `player` board: add actual coins to player hand
- if the dead unit is on `enemy` board: only increase enemy public `handCount`; do not leak exact coin IDs to local hand
- same death is guarded by unit/death key, so event + deathrattle paths cannot double-add

Cards covered explicitly:

- ベホイミスライム: 死亡時GET(1)
- だいおうイカ: 死亡時GET(2)
- `betDeathGet2` granted by ミリオンゼニー
