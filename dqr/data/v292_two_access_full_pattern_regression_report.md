# v292 two-access full-pattern regression

## 実行形態
2つの独立した headless Chromium を起動し、片方をA、片方をBとして実際のバトル関数を動かしました。
単一クライアント内の効果エミュレータではなく、2クライアント間で action/live-state bridge を流して、召喚・ダメージ・選択・同期ミラーの不整合を検査しています。

ただし、コンテナ内では本番Firebaseクラウドへ直接接続していません。Firebase配信遅延/権限/ネットワーク切断そのものの検証ではなく、アプリ側の2クライアント受信・反映ロジックの検証です。
また、全手札順・全盤面・全乱数列の数学的完全総当たりではありません。

## 結果
- Browser clients: ['Chrome/144.0.7559.96', 'Chrome/144.0.7559.96']
- Result groups passed: 6
- Result groups failed: 0
- Runtime exceptions: 0
- Meaningful scenario/case count: 70

## 主な検査範囲
- 4デッキ総当たりの高リスク代表効果
- ランダム生成/ランダム選出 stress
- 選択モーダル開きっぱなし検査
- 自ターン lock 残り検査
- invalid hand/deck id 検査
- HP0 unit 残り検査
- A側状態がB側 enemy view に反映されるかの mirror 検査
- B側状態がA側 enemy view に反映されるかの mirror 検査

## 明示的に再確認した既出不具合
- 死神のタロット 必中「全ユニットに3ダメージ」
- 勇者イレブンLv2 + テンション0 + かくれんぼう
- タバサLv2のドロー系経路
- 太陽のタロット
- バルーンコール
- キースドラゴン
- 銀のタロット
- 風の導き

## 見つけて直した不具合
### コンガオンガ
れんけいで「攻撃力6以上の敵ユニットを消滅」する時、対象になる敵ユニットがいない盤面でも対象選択モーダルを開いていました。
この状態だと pending target が残り、ターン終了不能・選択待ち残りの原因になり得ます。

v292では、対象候補が0件なら対象選択を開かず、ログを出してきれいに不発として処理します。

## 追加ファイル
- data/v292_two_access_full_pattern_regression_tests.json
- data/v292_checks.json
- data/v292_two_access_full_pattern_regression_report.md
- tools/v292_two_access_full_pattern_regression.py
