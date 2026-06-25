# v256 マイユ移動カウント / スライムフィーバー / 無鉄砲な作戦 pass8

## 反映内容

- マイユ用に「自分が発動したユニット移動系効果」の移動回数を対戦中ずっとカウントする処理を追加。
  - `player.maiyuMoveEffectCountV256` と既存互換の `player.maiyuMoveDamageBonusV255` を更新。
  - 自分ターン中・自分操作中の移動のみ加算し、remote action replay中は加算しない。
  - `v255SwapFrontBack` / `moveAllEnemyBackToFront` / `moveEnemyUnitsVertical` / `v240MoveUnit` / `moveUnitToBackIfPossibleV217` / `moveUnitOneRowDownV217` を移動検出対象に追加。
  - マイユ召喚時は `3 + 移動回数` の合計ダメージをランダムな敵へ1点ずつ割り振る。

- スライムフィーバーをユーザー確認仕様に修正。
  - 自分の手札になる特技カードは、元カードを破棄してから、全スライム系ユニットカードプールからランダム選出したカードへ入れ替える。
  - `v254AddCardToSideHandByName` / `addCardIdToPlayerHandV110` / `addCardCopyToHand` / `drawCard` 経路を補強。
  - 置換プールはカードDB上のスライム系ユニットを名前重複なしで抽出。v256時点のテスト環境では67種。

- 無鉄砲な作戦を実装。
  - 両プレイヤーはそれぞれ全ての味方ユニットをランダムな味方マスへ移動。
  - 移動回数はマイユ用カウンタに加算。
  - `unitMovedBoardV256` action を追加し、対戦相手側にも移動後盤面を同期。

## 検査

- `node --check js/app.js`: OK
- function重複宣言: 0
- `tools/v256_maiyu_slimefever_pvp_tests.py`: 5 passed / 0 failed
- `tools/v255_combat_dolmages_pvp_tests.py`: 10 passed / 0 failed
- `tools/v248_chappy_pvp_emulator_tests.py`: 14 passed / 0 failed
- `tools/v237_static_emulator_tests.mjs`: OK
- `tools/v240_static_pool_tests.mjs`: OK
- `tools/v246_duplicate_trigger_audit_tests.mjs`: 12 passed / 0 failed

## 優先キュー

- v255後 PENDING: 162
- v256後 PENDING: 161
- v256で追加完了扱い: マイユ / スライムフィーバー / 無鉄砲な作戦

## 継続メモ

- スライムフィーバーは主要な手札追加経路を補強したが、古い直接 `hand.push` 実装がまだ残っている可能性あり。今後PENDING消化時に直接push系を見つけたら `v254AddCardToSideHandByName` または `addCardIdToPlayerHandV110` に寄せる。
- 移動効果は既存主要ヘルパーをラップ済み。新規実装で盤面配列を直接入れ替える場合は、`v256RecordOwnMoveEffect` と `v256PushBoardMoveSync` を使う。
