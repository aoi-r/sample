# v309 front taunt + Ibur coin spell fix

## Fixes

1. におうだち is now active for attack targeting only when the unit is in the front row.
   - Back-row taunt still displays as a keyword, but it does not restrict attack targets.
   - If front-row taunt exists, leader and non-front-taunt units are blocked.
   - Snipe/ねらい撃ち bypass still works.
   - うごくせきぞう no-target restriction is preserved.

2. コイン / スペシャルコイン are treated as 特技 for cost auras.
   - イブール's opponent spell-cost aura applies to コイン and スペシャルコイン.
   - 道具カード remains affected because it is already 特技.

## Runtime test API

`window.__DQR_TEST__.v309`:

- `simulateTauntRowsV309()`
- `simulateIbulCoinCostV309()`

## Static checks

See `data/v309_static_checks.json`.
