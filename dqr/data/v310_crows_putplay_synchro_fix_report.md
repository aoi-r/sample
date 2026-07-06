# v310 Crows / put-into-play / synchro fix

## Fixed

1. クロウズ召喚時に味方リーダーが必中モードにならない問題。
   - `handleUnitSummonedEvent` と `applySummonV166` の両方を最終段で補強。
   - `fortuneMode='hit'` / `fortuneModeUntil=''` / `permanentHitFortuneV310=true` を設定。
   - クロウズ死亡やターン跨ぎでは消えない。

2. 位置指定なしの「場に出す」がランダム/変な位置になる問題。
   - player は `[0,1,2,3,4,5]`、enemy は `[3,4,5,0,1,2]` を優先。
   - `firstEmptyByOwnerPriorityV217`、`firstEmptySummonPosV134`、`summonNamedUnitToFriendlyEmptyV187` を補強。
   - バルーンコールのプヨンターゲットなどは前列上段優先。

3. シンクロが召喚後のヒーローLv上昇に追従しない問題。
   - 召喚時に適用済みLvを記録。
   - ヒーローLvが上がった時、未適用Lvの効果だけ追加適用。
   - プチファイターは Lv1で攻撃力+1、Lv2到達でHP+1、Lv3到達で速攻を得る。

## Checks

- node --check js/app.js: OK
- static checks: 6 passed / 0 failed

## Runtime test APIs

- `window.__DQR_TEST__.v310.simulateCrowsHitModeV310()`
- `window.__DQR_TEST__.v310.simulatePutPlayPriorityV310()`
- `window.__DQR_TEST__.v310.simulateSynchroFollowV310()`
