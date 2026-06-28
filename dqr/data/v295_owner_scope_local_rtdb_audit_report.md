# v295 owner-scope local RTDB audit

The sandbox has no external network egress, not just DNS failure:
- DNS resolution fails for Google/Firebase hosts.
- Direct HTTPS to 1.1.1.1 and 8.8.8.8 also fails.

Because real Firebase cloud cannot be reached here, v295 adds a local Chromium owner-scope audit harness and hardens the actual game code against the bug class found with ベホイミスライム.

## Code hardening
- Direct `死亡時:GET(n)` is parsed generically.
- `BET:死亡時にGET(n)` applies only when the runtime flag exists.
- Rewards are granted to the dead unit owner only.
- Opponent exact hand IDs are not materialized locally; only public hand count changes.
- Multiple historical paths (`unitDeath`, `applyDeathrattle`, cost-specific handlers) are deduplicated.

## Regression targets
- ベホイミスライム
- だいおうイカ
- ミリオンゼニー BET付与死亡時GET(2)
- Text-leak guard: ミリオンゼニー without BET must not grant death GET.


## Test status in this sandbox

Completed:
- `node --check js/app.js`
- static owner-scope audit over cards.json

Not completed here:
- Real Firebase cloud test: external HTTPS egress is blocked, including direct IP.
- Headless Chromium dynamic test: the installed `/usr/bin/chromium` exits before CDP with crashpad handler error in this runtime.

The dynamic harness is included so it can be run on a normal PC/CI environment.
