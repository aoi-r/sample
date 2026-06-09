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


## v7 notes

- ヒーローカードは0枚でも複数種類でも編成可能です。
- ヒーローカード使用後に出るヒーロースキル・レベルアップ後カードは `data/hero_skill_cards.json` に分離し、デッキ編成不可にしています。
- デッキ作成画面では `flags.deckBuildable === false` または `cardType === "トークン"` のカードを表示しません。
- 画像は `official.imageVerified === true` かつ `official.verifiedName === card.name` のものだけ表示します。間違った画像を出すより、未同期画像は非表示にしています。
- 完全画像同期は `node tools/sync_official_gameconductor.mjs` をプロジェクトルートで実行してください。公式DBのaタグ→詳細ページ名称→カード画像を照合してから反映します。


## 画像について（v8）

誤画像を出さないため、`cards.json` では `official.imageVerified === true` かつ `official.verifiedName === card.name` の画像だけ表示します。
未同期カードは画像なしで表示されます。

完全同期はプロジェクトルートで以下を実行してください。

```bash
node tools/sync_official_gameconductor.mjs
```

このスクリプトは公式DBの `https://gameconductor.com/dqrivals/card` から各カードの `<a href="/dqrivals/c/d/{id}">カード名</a>` を取得し、詳細ページの `名称` がローカルJSONの `name` と完全一致した場合だけ `https://gameconductor.com/dqrivals/wp-content/uploads/card_img_{id}.jpg` を採用します。

つまり、デボラにくらやみにゅうどうの画像が付くような事故は、同期条件上起きないようにしています。


## v9 manual image batch

公式DBを1枚ずつ確認する方式に切り替え。v9_common_001_030 では公式ID 1〜30（スライム〜レッドアーチャー）だけ画像表示を許可。その他の画像は誤表示防止のため非表示。


## v10 画像手動照合: 共通カード先頭ブロック

公式DB `https://gameconductor.com/dqrivals/card` の先頭共通カードブロック、公式ID 1〜163 を画像照合済みにしました。

- 対象: スライム〜ゾーマ
- 照合方式: 公式DB一覧のカードリンク順と、ローカルJSONの共通カード順を照合
- 表示条件: `official.imageVerified === true` かつ `official.verifiedName === card.name`
- レポート: `data/official_image_manual_batch_v10_common_001_163.json`

この範囲外の共通カード、ヒーローカード、各職業カードは、誤画像防止のため未検証画像は非表示のままです。


## v11 update
- 戦士カード 164〜305 を公式DB順で画像URL対応
- 追加レポート: data/official_image_manual_batch_v11_warrior_164_305.json


## v12 update
- 戦士画像が反映されない場合への対策として、data/*.json の読み込みにキャッシュ回避を追加。
- fetch は `cache: 'no-store'` と `?v=v12-warrior-images-cache-bust` を使用。
- カード画像の img に `referrerPolicy='no-referrer'` を追加。


## v13 update
- 共通カード001〜163は確定済みベースラインとして保持。
- 戦士カード画像を、ユーザー提供の公式DB詳細リンク一覧に基づいて再マッピング。
- 追加レポート: `data/official_image_manual_batch_v13_warrior_user_links.json`
- `DATA_VERSION = v13-warrior-user-link-map` でキャッシュ回避。


## v14 update
- 共通001〜163と戦士v13は保持。
- `魔法使い.xlsx` の左端カード名セルのハイパーリンクから公式DB詳細IDを抽出し、魔法使いカード140枚に画像URLを反映。
- 追加レポート: `data/official_image_manual_batch_v14_mage_xlsx_links.json`
- `DATA_VERSION = v14-mage-xlsx-link-map` でキャッシュ回避。


## v15 update
- `他カード.xlsx` の左端カード名セルのハイパーリンクから公式DB IDを抽出して画像URLを反映。
- 共通001〜163はOK済みベースラインとして保持。
- 魔法使いはv14の確定分を保持。
- 追加レポート: `data/official_image_manual_batch_v15_all_xlsx_links.json`
- `DATA_VERSION = v15-all-xlsx-links` でキャッシュ回避。


## v16 update
- 残り2枚の画像リンクを手動反映。
- しゃくねつのツメ → /c/d/1193
- サラマンダー → /c/d/1139
- 画像未反映カード数を 0 に更新。


## v17 update
- 「たたかう」「天空の英知」をヒーロースキル由来カードとしてデッキ編成不可に修正。
- アップロードされたヒーローカード一覧から16枚のヒーロースターターを確認。
- `data/hero_starters.json` / `data/tension_system.json` / `data/hero_skill_deck_check_v17.json` を追加。
- 共通001〜163の確定済み画像ベースラインは維持。


## v18 update
- PC版のデッキ作成画面は維持。
- スマホ版は本家アプリ風に、縦スクロールを抑えた2エリア構成へ変更。
  - 上側: デッキ名/職業/保存/選択中デッキ
  - 下側: 検索/絞り込み/カード一覧
- スマホ版カード一覧は横スクロール、2段表示。
- スマホ版にカード表示サイズスライダーを追加。
