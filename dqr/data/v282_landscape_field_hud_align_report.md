# v282 landscape field/HUD alignment

Base: v281_pvp_authoritative_sync_hand_layout_fix

## Scope

CSS-only smartphone landscape layout pass. PvP sync, draw sync, unit death sync, and tap handlers were not changed.

## Fixed from screenshot

- Player HP/MP/tension dark HUD background now wraps content width instead of stretching across the field.
- Player hand is centered at the bottom and no longer inherits the old left-aligned offset.
- Enemy and player leader icons are on the same vertical line.
- The 2nd summon row is aligned to the leader icon center line.
- Top and bottom summon rows stay inside the arena and clear of HUD/hand.

## Verification

- node --check js/app.js: OK
- top-level function duplicates: 0
- v281 PvP sync/hand leak regression: 5 passed / 0 failed
- v282 landscape layout geometry: 14 passed / 0 failed
  - 844x390
  - 667x375

## Test artifacts

- data/v282_checks.json
- data/v282_landscape_layout_tests.json
- data/v282_layout_844x390.png
- data/v282_layout_667x375.png
- tools/v282_landscape_layout_tests.py
