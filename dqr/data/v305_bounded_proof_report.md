# v305 bounded proof and runtime invariant guard

## What is proven

`tools/v305_bounded_proof.py` machine-checks the finite proof obligations represented by:

- `cards.json` effect-text risk classes
- retained v302 effect-entry dedupe guard
- retained v303 effect-context guard
- retained v304 semantic mutation quota guard
- new v305 runtime invariant/recovery guard

Result: **10 passed / 0 failed**.

## What cannot honestly be called 100% proven

A true mathematical 100% proof of the full live game would require a complete formal specification of every official card, all legal/illegal board states, all browser event ordering, all Firebase delivery/retry/stale snapshot interleavings, and all random seeds. That formal model does not exist yet.

So v305 does not claim an unbounded proof over the real internet. It gives a bounded proof over the code/data model in this package, and adds fail-closed runtime invariant checks to catch state corruption during real play.

## New runtime invariants

- boards must be 6 slots
- HP0 units must not remain on board
- attack/maxHP/HP/MP/tension ranges are normalized
- enemy exact hand IDs must not exist in PvP view
- hand size is capped at 10
- own turn cannot remain locked without pending target/choice

## Files

- `tools/v305_bounded_proof.py`
- `data/v305_bounded_proof_results.json`
- `data/v305_checks.json`
