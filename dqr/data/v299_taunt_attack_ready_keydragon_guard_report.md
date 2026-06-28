# v299 taunt attack ready + Key Dragon guard

## Fixes

- PvP live/opponentView stale snapshots could revert own board action flags after turn start. v299 restores own-turn attack readiness on render/sync boundaries while preserving units that entered this same turn.
- This specifically covers normal units with におうだち such as シーゴーレム, as well as other normal units.
- キースドラゴン now uses a dedicated guarded fortune handler. The handler supports hit/super/random modes and always unlocks own turn in `finally`.

## Test helpers

- `window.__DQR_TEST__.v299.simulateSeaGolemStaleOpponentViewV299()`
- `window.__DQR_TEST__.v299.simulateKeyDragonChoiceV299(choice)`

## Static check

- node --check js/app.js: OK
- v299 static checks are saved in `data/v299_static_checks.json`.

## Browser checks

- Sea Golem stale opponentView restore: passed
- Key Dragon damage option no lock/error: passed
- Key Dragon heal option no lock/error: passed
- Same-turn entered unit not readied by restore: passed

Result: 4 passed / 0 failed.
