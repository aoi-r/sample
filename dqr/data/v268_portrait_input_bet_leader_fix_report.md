# v268 portrait/input/BET fix

## User-reported issues handled
- Portrait enemy leader icon appeared in the wrong board area.
- Hand-card tap did not show a safe "use?" confirmation flow.
- Coin BET triggered immediately when only one BET target existed.
- Portrait layout still had overlapping touch/UI regions.

## Changes
- Added `confirmHandCardUseV268(index)` and routed hand card click/touch through it.
- Coin BET now always opens a target choice modal, even with a single target.
- Portrait CSS now overrides old absolute leader rules with relative grid placement.
- Portrait board is compressed to 7 rows: enemy leader / enemy back / enemy front / gap / player front / player back / player leader.
- Portrait hand-use and hero/choice modals are constrained to fit the screen.

## Notes
- Generic attack code was inspected; normal leader/unit attacks do not directly subtract enemy MP.
  If enemy MP still appears to change during a specific attack, capture the attacking card/weapon and board state; it is likely an individual card effect or stale UI/sync state.
