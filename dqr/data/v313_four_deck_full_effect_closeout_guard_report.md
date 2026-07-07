# v313 four-deck full effect closeout guard

## Purpose

The four existing decks are now used as the bounded regression scope. This pass adds dedicated recovery for four-deck cards that still depended on generic text resolution after the dedicated-first transition.

## Newly closed routes

- トンネラー: renkei +1/+1 dedicated route
- ナイトキング: renkei leader heal 4 dedicated route
- 銀のタロット: dedicated card-use route for hit mode / 運命の輪 / tension +2
- ゾディアックコード: dedicated permanent super-hit + fortune search route
- タロットフォーチュン: dedicated target-pending 7 damage + ダースドラゴン route
- クロウズ: dedicated summon route for permanent hit mode
- しんりゅう: dedicated summon route for wish resolver

## Audit files

- `data/v313_four_deck_effect_matrix.json`
- `data/v313_static_four_deck_checks.json`
- `data/v313_checks.json`
- `tools/v313_four_deck_full_effect_audit.py`

## Result in this environment

- `node --check js/app.js`: OK
- `tools/v313_four_deck_full_effect_audit.py`: see `data/v313_static_four_deck_checks.json`

## Honest limitation

This still is not a completed real Firebase two-device cloud run in this sandbox. External HTTPS and Chromium/CDP are unavailable in this runtime. The added checks are a bounded four-deck logic/audit closeout and code-level guard pass.
