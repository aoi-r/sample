# v263 Soak PvP Summon State Guard

## Summary

- Base: v262_long_pvp_kernel_verification
- Version: v263_soak_pvp_summon_state_guard
- Main fix: action replay after summon now sends an authoritative `unitStatePatchV263` after all summon effects resolve.
- Main guard: remote board slots created by action replay are protected briefly from stale Firebase public state snapshots.

## Real-device report reproduced

User reported that a summoned **シーゴーレム** disappeared when the turn moved to the opponent, and that the acting side had `味方ヒーローがいる場合HP+2` while the opponent side did not show the +2.

Root cause found:

1. `unitSummoned` action payload was cloned before summon handlers finished mutating the unit.
2. A stale `rooms/{roomId}/states/{playerId}` board snapshot could arrive after action replay and overwrite `enemy.board` with an older empty/base board.

Fix applied:

- `summonUnitFromHandToBoard` now emits `unitStatePatchV263` after local summon resolution.
- Remote reducer applies this patch to the mirrored unit.
- `mergeRemoteBoard` preserves recently action-replayed slots against stale null/base snapshots.
- Unit death clears the protection slot.

## シーゴーレム test

Dedicated two-client test verified:

- A summons シーゴーレム with a hero active.
- B receives `unitSummoned` then `unitStatePatchV263`.
- B sees シーゴーレム as 2/6 with におうだち/taunt.
- Applying an older empty public state snapshot does not delete it.
- Applying a turn-end action does not delete it.

## Soak test

- 2 Chromium/CDP clients
- 18 matches
- 55 steps per match
- Total: 990 consecutive cross-client action replay steps
- Mixed operations: summon, summon-state patch, unit attack, leader attack, damage, death, turn events, discard Sandy path, stale snapshot injection
- Result: 3 passed / 0 failed

## Regression tests rerun

- v262 long PvP kernel: 7 / 0
- v260 review closeout PvP: 20 / 0
- v258 counter/Kandakobun/merchant PvP: 10 / 0
- v256 Maiyu/Slime Fever PvP: 5 / 0
- v255 combat/Dolmages PvP: 10 / 0
- v248 Chappy PvP emulator: 14 / 0

## Notes

This is still a browser/CDP two-client emulator gate. Firebase production reconnection/offline/write-order chaos should be a separate gate, but this patch directly targets the race between action replay and public state snapshots that the reported Sea Golem behavior exposed.
