# v270 authoritative board sync

## Fixed direction
- Added full public board snapshot to every outbound battle action.
- Public Firebase state now publishes board / HP / MP / maxMP / tension / weapon / terrain / handCount as an authoritative snapshot.
- Remote receiver applies the snapshot after action replay, so summons, spell-created units, buffs, debuffs, weapon changes, terrain and leader resources recover even if a per-card reducer misses something.
- Stale lower-sequence snapshots are ignored.
- PvP hand privacy remains: handIds are redacted outside solo mode.
- Added target-selection deadlock recovery: battlefield background tap clears stale selection, and any selection waiting over 12 seconds is auto-cleared.
- Portrait layout reduced the dead space between own summon slots and own HP/MP/tension HUD.

## Local checks
- node --check js/app.js: OK
