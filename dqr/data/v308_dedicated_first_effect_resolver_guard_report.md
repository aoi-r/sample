# v308 dedicated-first effect resolver guard

## Purpose

The previous guards reduced duplicate effects, but high-risk bugs can still appear when a card has both:

- a dedicated official resolver, and
- a generic text-parser fallback.

v308 adds a routing layer: once a high-risk card is handled by its dedicated resolver, generic text fallback for the same card/event is skipped.

## Exclusive resolver sets

- Fortune exclusive: 10 cards
- Renkei exclusive: 26 cards
- Summon exclusive: 24 cards

## Additional correction

`シーゴーレム` had a partial dedicated branch that applied HP+2 / taunt but returned `false`, allowing later generic summon text to continue. v308 makes that branch exclusive and returns `true` when it applies.

## Static result

- node --check js/app.js: OK
- static checks: 8 passed / 0 failed

## Runtime test API

`window.__DQR_TEST__.v308`:

- `auditDedicatedFirstV308()`
- `simulateDedicatedMiniSkipV308()`
- `simulateSeaGolemExclusiveV308()`

## Honest limitation

This is a stronger routing guard, not a mathematical proof of every possible browser/Firebase timing. It intentionally avoids global low-level blocking so legitimate multi-hit/multi-draw/GET(2) effects are not broken.
