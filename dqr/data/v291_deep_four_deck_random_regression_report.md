# v291 4デッキ深掘りランダム回帰テスト

## 対象デッキ

- イレブンテリー
- ドラゴンタバサミネア
- イルルカドラゴンゼシカ
- デボラトルネコ

## 実行結果

- 総テスト数: 283
- 成功: 283
- 失敗: 0
- Runtime exception: 0

## 追加で深掘りした観点

- 4デッキ全ユニークカードの単体使用
- 選択/占い/願い/さくせん/交換/BET系の選択分岐
- ランダム生成/ランダム選出カードのseed付きストレス
- 8 seed × 21 high-risk random cards
- 手札/山札IDの存在検査
- HP0ユニット残り検査
- 自ターン操作ロック残り検査
- 選択モーダル開きっぱなし検査
- バフ/デバフやGET/BETの明らかな二重発火検査
- リモートpublic state適用時の手札混同検査

## 重点再確認

- 死神のタロット 必中「全ユニットに3ダメージ」
- 勇者イレブン Lv2 + テンション0 + かくれんぼう
- タバサ Lv2 + 元コスト2以上特技でのドロー
- ぷちメタル/ベホイミスライム/ルドマン/マデサゴーラ/福招きのそろばんの二重発火疑い
- パピラス/コンガオンガ/シュプリンガー/ラプソーン/怪獣プスゴン/しんりゅう等のランダム・生成・選択系

## 修正

今回の深掘り検証では不具合は再現しなかったため、効果処理本体の修正は入れていません。
自動検証の精度を上げるため、`__DQR_TEST__` に `applyPendingGenericEffectToUnit` / `applyPendingGenericEffectToLeader` を公開しています。これはテスト補助用で、通常UIの挙動は変えません。

## 出力

- `data/v291_deep_four_deck_random_regression_tests.json`
- `data/v291_checks.json`
- `data/v291_deep_four_deck_random_regression_report.md`
- `tools/v291_deep_four_deck_random_regression_tests.py`
