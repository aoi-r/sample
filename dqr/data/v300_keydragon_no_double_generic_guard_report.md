# v300 Key Dragon no-double generic guard

## Finding

v299 added a guarded Key Dragon resolver, but the actual summon path can still invoke `applyTabasaFortuneCardV187(card, {unit})` directly. That function contains the older generic Key Dragon branch.

So the safe answer is: v299 reduced the risk but did not fully prove the generic path could not be reached.

## Fix

v300 wraps the actual summon fortune entry:

- `applyTabasaFortuneCardV187(card, opts)`
- `applyFortuneEffect(card)` as a secondary guard

When `card.name === 'キースドラゴン'`, v300 calls the v299 guarded resolver and immediately returns `true`.
The older generic Key Dragon branch is not entered.

## Retained

- v299 Sea Golem / taunt attack-readiness restoration.
- v299 Key Dragon guarded effect implementation.

## Checks

- `node --check js/app.js`: OK
- static checks in `data/v300_checks.json`
