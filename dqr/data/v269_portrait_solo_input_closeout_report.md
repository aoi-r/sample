# v269 portrait / solo input closeout

## Fixes

- Portrait battle layout: enemy/player leaders are placed outside the unit grid with absolute positioning so the enemy leader no longer appears around the player front row.
- Portrait unit grid: enemy back/front and player front/back rows are separated by a visible center lane.
- Hero skill modal: shrunk and wrapped for portrait so the confirm button is no longer clipped.
- Solo player hand strip: tapping a player hand card now opens the normal "use this card?" confirmation flow.
- Coin/BET: tapping a coin no longer fires the only available BET target directly; it always opens a BET target choice modal.
- Attack MP guard: normal attacks preserve the defender leader MP display unless a real effect explicitly changes MP elsewhere.

## Checks

- node --check js/app.js: OK
