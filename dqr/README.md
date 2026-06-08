# DQR Rebuild Deck Builder

GitHub Pages向けの静的サイトです。

## 使い方

1. このフォルダをGitHub Pagesに置く
2. `js/firebase-config.js` にFirebase Webアプリ設定を貼る
3. Firebase Authenticationで匿名ログインを有効化
4. Realtime Databaseを作成

Firebase未設定でも、デッキはブラウザ内に保存されます。

## 収録データ

- `data/cards.json`
- `data/systems.json`
- `data/strategies.json`
- `data/fortune.json`
- `data/choices.json`
- `data/dungeons.json`
- `data/heroes.json`
- `data/coin.json`

## 現在実装済み

- アクセス → タップ開始
- ユーザ名入力
- デッキ作成 / バトル仮画面
- 職業選択
- 職業変更時のデッキリセット
- 対応職業 + 共通カード表示
- 検索、種類、コスト、レアリティフィルタ
- カード詳細で占い/選択/ダンジョン/コイン/さくせん/ヒーロー参照表示
- 30枚デッキ
- 同名2枚、レジェンド/ヒーロー1枚制限
- デッキ保存、削除、読込、JSON出力


## デッキ編成可否の整理

`data/cards.json` は全カードを保持しますが、デッキ作成画面では `flags.deckBuildable !== false` のカードだけを表示・選択します。
効果で取得するカード、進化後カード、ヒーロースキル派生、道具/コインなどは `flags.deckBuildable: false` にしています。
判定一覧は `data/deck_rules.json` に出力しています。誤判定があれば、該当カードの `flags.deckBuildable` を手修正してください。


## v3 deck rules

- 交換所カードは通常どおりデッキ編成可能に戻しました。使用時は手札のコインを選択・消費し、枚数に応じた効果を処理します。最低必要コイン未満なら使用不可です。
- ヒーローはプルダウン選択ではなく、ヒーローカードを1枚デッキに編成します。
- ヒーロースキル派生、変更後テンションスキル本体、生成ユニットは `flags.deckBuildable=false` としてカードDBには残しつつデッキ作成画面から除外しています。
- 交換所の構造化データは `data/exchanges.json` と `data/deck_rules.json` に入っています。


## v4: 公式DB寄せのカード整理

- `data/generated_cards.json` に「効果取得・進化後・ヒーロースキル派生・トークン」扱いのカードを分離しました。
- `cards.json` の `flags.deckBuildable === false` はデッキ作成画面に出ませんが、バトル実装時には参照できます。
- 一部カードに `official.imageUrl` を追加し、カード詳細/一覧で公式DB画像を外部参照表示します。
- 公式DBの全件補完は `node tools/sync_official_gameconductor.mjs` で実行できます。


## v5変更点

- ヒーローカードの総枚数制限を撤廃しました。0枚でも、複数種類入れてもOKです。同名カードの上限はレジェンドルールに従い1枚です。
- 誤画像防止のため、公式DB詳細ページの名称一致が取れていない画像URLは表示しない方針にしました。
- `tools/sync_official_gameconductor.mjs` を強化しました。ローカルで `node tools/sync_official_gameconductor.mjs` を実行すると、公式DBを詳細ページまで確認し、名称が一致した画像だけ `cards.json` に反映します。


## v6 official image guard / generated-card rules

- 公式画像は `official.imageVerified === true` のカードだけ表示します。前版のようにIDだけで雑に当てた画像は表示しません。
- 全画像を補完する場合は、ネット接続できるローカル環境で `node tools/sync_official_gameconductor.mjs` を実行してください。GameConductorの一覧ページの `<a href>` と詳細ページの「名称」を照合し、一致したカードだけ `imageUrl` を入れます。
- ヒーローカードは0枚でも複数枚でも編成可能です。ヒーロースキル/進化後の特殊カードは `flags.deckBuildable=false` です。
