# v304 semantic mutation quota guard

User requirement: make duplicate effect execution safe across all effect categories, not one card at a time.

## What changed

v303 prevented duplicate high-level effect entry functions by function name. v304 adds a lower semantic layer for the actual dangerous mutations that players notice:

- GET / coin acquisition
- draw
- deterministic add-to-hand
- leader heal
- tension gain
- unit damage
- leader damage

The guard only activates inside an effect event context. It does not globally block low-level functions in normal direct usage.

## Policy

- GET/draw/heal/tension use the card text/timing segment as a quota.
- Example: `召喚時:GET(1)` can only add one coin in that summon event, even if an official handler and generic parser both try.
- `GET(2)` can still add two.
- Multi-target damage is allowed because each target has a different key.
- Same event + same source + same target + same amount is capped unless the text explicitly says multiple times.

## Static risk summary

```json
{
  "get": 51,
  "draw": 161,
  "add": 147,
  "damage": 372,
  "heal": 104,
  "tension": 119,
  "summon": 467,
  "death": 121,
  "bet": 48,
  "renkei": 40,
  "fortune": 66
}
```

## Checks

- node --check js/app.js: see v304_checks.json
- static semantic guard checks: 7 passed / 0 failed

## Still honest limitation

This is a defensive implementation pass and static audit in this sandbox. It is not a mathematical proof over all random/Firebase latency states because external HTTPS/Firebase and Chromium CDP are unavailable in this runtime.
