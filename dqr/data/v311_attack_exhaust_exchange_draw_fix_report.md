# v311 attack exhaust / exchange draw fix

## Fixes

1. Units could attack repeatedly because v299 render/sync readiness repair restored `canAttack=true` after an attack consumed `attacksLeft`. v311 marks `_v311AttackExhaustedTurn` before render and makes the v299 readiness repair refuse to ready exhausted units during the same turn.

2. Exchange cards drew a card after every option because `useExchangeCard()` called `drawCard(1)` unconditionally. v311 only draws when the selected option costs exactly 3 coins.

## Checks

- node --check js/app.js
- data/v311_static_checks.json

## Runtime test API

- `window.__DQR_TEST__.v311.simulateAttackRestoreGuardV311()`
- `window.__DQR_TEST__.v311.simulateExchangeDrawRuleV311(coins)`
