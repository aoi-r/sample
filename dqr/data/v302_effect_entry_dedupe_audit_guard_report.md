# v302 effect entry duplicate audit guard

## Why this version exists

The Ludman report exposed a broader problem: the old duplicate guard was not always receiving the original event id.
`emitBattleEvent()` created `handlerPayload` with `_eventId`, but many handlers destructured the payload and then called `v246EventGuard()` with a new object. That dropped `_eventId`, so the guard could treat duplicate executions as separate effects.

## Guarded entry points

- `handleUnitSummonedEvent`
- `applySummonTextEffect`
- `handleUnitPutIntoPlayEvent`
- `handleUnitDeathEvent`
- `applyDeathrattle`
- `handleCardPlayedEvent`
- `handleBetActivatedEvent`
- `handleAfterAttackEvent`
- `handleTurnStartEvent`
- `handleTurnEndEvent`
- `handleWeaponEquippedEvent`
- context-only `addCardToHandByName`

## Static scope counts

```json
{
  "summon_get": 29,
  "death_get": 5,
  "turn_end_get": 9,
  "bet": 48,
  "renkei": 40,
  "death": 121,
  "summon": 467,
  "after_attack": 54,
  "draw_or_add": 155,
  "random": 217,
  "fortune": 66,
  "damage": 372,
  "buff_debuff": 726
}
```

## Important behavior rules

- Summon/death/deathrattle are deduped by event id and semantic unit id because the same unit cannot be summoned or die twice as the same event.
- Card played, BET, and after-attack are deduped only when an event id/dedupe key exists, because the same card/unit may legitimately act more than once.
- Turn start/end are deduped per turn/side/timing to prevent double GET/double buff/double poison from duplicate meta/action paths.

## Test API

Available as `window.__DQR_TEST__.v302`:

- `auditEffectEntryGuardsV302()`
- `simulateDuplicateSummonHandlerV302(name)`
- `simulateDuplicateDeathHandlerV302(name)`
- `simulateDuplicateTurnEndV302()`

## Environment limitation

This sandbox still cannot honestly complete real Firebase cloud two-client testing because external HTTPS is blocked. The v302 changes are code hardening plus static audit checks.
