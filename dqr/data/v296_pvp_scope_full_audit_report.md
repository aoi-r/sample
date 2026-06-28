# v296 PvP scope full audit guard

## Scope

This pass is not limited to deathrattle.

Audited categories from cards.json:

```json
{
  "GET": 51,
  "BET": 48,
  "RENKEI": 40,
  "DEATH": 121,
  "SUMMON": 467,
  "DRAW": 6,
  "GENERATE": 149,
  "RANDOM": 217,
  "FORTUNE": 66,
  "DAMAGE": 372,
  "HEAL": 104,
  "BUFF_DEBUFF": 686,
  "OPPONENT_HAND": 19,
  "HAND_DECK": 347
}
```

## Hardening added

- PvP public state never publishes exact `player.hand` IDs.
- Remote public state is sanitized before applying to `game.enemy`.
- Action payload snapshots are scrubbed for exact hand arrays before sending.
- Runtime invariant API detects:
  - enemy exact hand leakage
  - HP0 unit remaining on board
  - own-turn lock with no pending modal/target
  - out-of-range tension/negative HP/MP
- v295 owner-only death GET guard is retained.

## Important limitation

This sandbox still cannot reach real Firebase cloud. It also currently cannot launch the installed Chromium via CDP because Chromium exits with a crashpad handler error. Therefore this v296 package includes code hardening and static/full-scope audit files, but does not honestly claim a completed cloud Firebase run from this sandbox.

## Test files

- `data/v296_pvp_scope_card_audit.json`
- `data/v296_static_pvp_scope_checks.json`
- `data/v296_checks.json`

## Runtime test API

Available under `window.__DQR_TEST__.v296`:

- `runPvpScopeSmokeV296()`
- `classifyCardsForPvpScopeV296()`
- `assertPvpScopeInvariantsV296()`
- `simulatePublicSyncPayloadV296()`
- `simulateRemotePublicStateV296(entry)`
