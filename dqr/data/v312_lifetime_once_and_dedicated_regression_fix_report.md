# v312 lifetime once and dedicated regression fix

## Fixed

- ぷちメタル: `自分のターン終了時GET(1)、この効果は一度しか発動しない` is now protected by a lifetime ledger per unit. The old v166 branch is suppressed and v312 grants once.
- ブラバニクイーン: synchro level effects are now ledgered per unit/source/level, preventing Lv3 `攻撃力+1` from being applied again on render/hero refresh loops.
- しんりゅう: summon wish resolver is restored as an explicit dedicated summon resolver, so v308+ generic/dedicated routing cannot swallow the summon choice.

## Notes

This patch repairs regressions caused by moving away from generic fallbacks. It does not claim real Firebase/Chromium exhaustive verification in this sandbox.
