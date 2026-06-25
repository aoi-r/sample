# v262 long PvP kernel verification

Base: v261_full_verification_gate_start

目的: 2台相当のChromium/CDPクライアントを維持したまま、長期戦で効果の核が同期崩れしないかを検証する。

## Added verification

- `tools/v262_long_pvp_kernel_tests.py`
- `data/v262_long_pvp_kernel_tests.json`
- 48 consecutive cross-client PvP actions without resetting the browsers:
  - summon / cardPlayed / unitSummoned
  - unit attack / leader attack / counter damage
  - Blood Knife weapon growth and durability
  - terrain modal choice and terrainSet action replay
  - Sandy discard -> unitPutIntoPlay
  - ownTurnEnd / ownTurnStart action replay
  - terrain-on-summon side effects, including 天啓の神域
- Heavy regression blocks:
  - 魔性の道化師ドルマゲス: remote spell cost -5 and expiry
  - カンダタこぶん: next tension-charge cost becomes 0 this turn only
  - ブオーン: PvP action replay survives attack/splash path
  - 妖精サンディ: dungeon-only durability support

## Issues found and fixed

### 1. weaponAfterAttack did not mirror weapon durability

Blood Knife attack growth was mirrored by `weaponUpdateV260`, but the following `weaponAfterAttack` action was only logged by the base reducer. In a long match the remote client could show the correct attack but stale durability.

Fix: v262 remote reducer now handles `weaponAfterAttack` and synchronizes attack, durability, maxDurability, attacksLeft, and counterDamageReduction.

### 2. terrain-on-summon side effects did not mirror through action replay

When a unit was summoned onto `天啓の神域`, the acting client drew/received fatigue, gained tension, and triggered tension-link locally. The remote reducer placed the unit but skipped the terrain side effects, causing mirror drift.

Fix: v262 remote reducer now mirrors terrain-on-summon effects for `宝箱`, `刃の紋章`, `祝福の聖域`, `しあわせの国`, `天啓の神域`, `すべる床`, and the text condition `地形マスに召喚された場合`.

## Results

- `node --check js/app.js`: OK
- duplicate function declarations: 0
- v262 long PvP kernel: 7 passed / 0 failed
- rolling long match: 48 consecutive mirrored steps
- v248 PvP emulator: 14 passed / 0 failed
- v255 combat/Dolmages/Kabau: 10 passed / 0 failed
- v256 Maiyu/Slime Fever/movement: 5 passed / 0 failed
- v258 Kandata/Merchant/Demon: 10 passed / 0 failed
- v260 review closeout PvP: 20 passed / 0 failed
- v237/v240/v246 static regressions: OK

## Remaining verification direction

The long-kernel gate is now green. Next recommended gate is broader randomized deck-vs-deck soak testing with many shuffled decks and seeded random logs, then Firebase real RDB reconnection/presence tests.
