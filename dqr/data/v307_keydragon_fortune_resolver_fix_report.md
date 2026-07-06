# v307 Key Dragon fortune resolver fix

## Problem
キースドラゴンの占いが発動しない報告。v299/v300で専用処理にしたが、後続のdedupe/transaction層や非同期choice callbackの境目で、占い開始または解決が飲まれる余地があった。

## Fix
- `applyTabasaFortuneCardV187` と `applyFortuneEffect` の両方を最終段でv307 resolverへ接続。
- 1ユニット/1ターン/1カードtokenにつき、占い開始は1回だけ。
- 選択効果解決もtokenごとに1回だけ。
- 通常占いは `openChoiceModal` の locked choice timer が飲まれても backup が1回だけ解決。
- 必中/超必中/通常占いに対応。
- HP5回復、正面敵ユニット2ダメージ、死亡処理、操作ロック解除、再描画、同期をv307側で完結。

## Checks
- node --check js/app.js
- data/v307_static_checks.json
