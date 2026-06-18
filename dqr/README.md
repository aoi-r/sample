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


## v19 update
- `data/tension_system.json` を更新。
- 既存7職業のテンションスキルに `effect` 構造データを追加。
- カミュのテンションスキル `盗賊のかみわざ` を追加。
- 生成武器 `シーブスナイフ` を `generated_cards.json` に追加。


## v20 update
- スマホ版デッキ作成画面を本家スクショ寄せに変更。
- 上段: コレクション/検索/絞り込み/2段横スクロールカード一覧。
- 下段: マイデッキ/選択中カード/枚数/保存・決定系操作。
- PC版レイアウトは維持。


## v21 update
- Safari前提で、スマホ縦向き時に「端末を横向きにしてください」オーバーレイを表示。
- タップ開始時にAndroid等では全画面化/横向きロックを試行。失敗しても通常続行。
- スマホ横向きは本家DQRスクショに近い横画面レイアウトへ調整。
- PC版レイアウトは維持。


## v22 update
- スマホ横向きのコレクションを2段表示から1段表示へ変更。
- カード画像を大きく表示し、カード本文が読めるサイズに調整。
- 下段のマイデッキ表示に小さいカード画像サムネを追加。
- PC版は維持。


## v23 update
- ユーザ名入力を必須から任意に変更。
- 初回アクセス時に `localStorage` の `deviceId` を自動生成し、`Player-xxxxxxxx` を自動プレイヤー名にする。
- 開始タップ後はユーザ名入力画面を飛ばしてメニューへ進む。
- メニューから「名前変更」で任意変更可能。
- Firebase匿名ログインのUIDも保存時に利用。


## v24 update
- プレイヤーID仕様を変更。
  - 初回のみ固定プレイヤーIDを必須入力。
  - 日本語ID可。
  - IDは `localStorage` に保存。
  - Firebase保存先は `players/{playerId}/decks`。
- デッキ作成画面の選択済みカードに `−` / `＋` を表示。
- バトル側の下地を追加。
  - 保存済みデッキを横並びで表示。
  - デッキをタップするとモーダルで内容確認。
  - 確定後、相手と決めた合言葉IDで入室。
  - `rooms/{matchId}/players/{playerId}` に参加情報を書き込み。
  - 盤面UI、HP、MP、テンション3段階、テンションスキル使用/リセットの土台を追加。
- 画像ベースライン: 共通001〜163は維持。


## v25 update
- `app.js:324 Uncaught SyntaxError: Unexpected token 'async'` を修正。
- `async async function saveDeck()` を `async function saveDeck()` に変更。
- `node --check js/app.js` で構文確認済み。


## v26 update
- スマホSafariでタイトル画面から進まない可能性を修正。
  - 開始タップ時、画面遷移を先に実行。
  - 全画面化/横向きロックは fire-and-forget で試行し、失敗しても止めない。
- デッキ編成画面に「確認」ボタンを追加。
- 確認ボタンで、画像付きのデッキ一覧モーダルを表示。


## v27 update
- スマホ横向きのカード一覧を CSS Grid から Flex 横並びに変更。
- Safariで発生しやすいカード間の謎の空白・右端切れを軽減。
- 上段のコレクション領域を少し拡大。
- カード表示を1段のまま維持し、カード本文の読みやすさを優先。
- v26のデッキ確認ボタンも維持。


## v28 update
- スマホ横向きのカード一覧を「画像のみ」表示に変更。
- `詳細` / `追加` ボタンはスマホ横向きでは非表示。
- カード自体をタップすると追加。
- 下段マイデッキ表示領域を広げ、選択済みカードを見やすく調整。
- 右側ボタン領域を縮小して、カード一覧とデッキ欄を広く使用。


## v29 update
- スマホ横向きのコレクションとマイデッキから大きな枠を除去。
- コレクションはカード画像のみ横並び表示。
- マイデッキもカード画像のみ横並び表示。
- マイデッキの画像はイラスト上部が見えるよう `object-position: top` に変更。
- 枚数と `−` / `＋` は画像上に小さく重ねて表示。


## v30 update
- スマホ横向きのコレクションカード間隔をさらに圧縮。
- 上下余白を削ってカード画像を大型化。
- マイデッキ側も余白を圧縮し、選択カードを見やすく調整。
- 右側の保存/確認/出力ボタンが見切れにくいよう小型化。


## v31 update
- `JSON出力` ボタンを削除。
- デッキ確認モーダルを、30枚を俯瞰しやすい敷き詰めグリッドに変更。
- Firebase設定を `js/firebase-config.js` に組み込み。
- 画像ベースライン: 共通001〜163は維持。


## v32 update
- バトル基礎エンジンを追加。
- 開始時手札を実装。
  - ヒーローカードは `サマルトリアの王子` 以外、開始時手札に入る。
- ユニット召喚を実装。
- 盤面ユニットの攻撃、反撃、死亡を実装。
- リーダーHP25開始、攻撃でHPが減る処理を実装。
- ターン終了、MP増加、ドローを実装。
- テンション3段階、テンションスキル使用、使用後0リセットを実装。
- 一部テンションスキルの基礎効果を反映。
- カード画像長押しで拡大、周囲タップで閉じる処理を追加。
- 画像ベースライン: 共通001〜163は維持。


## v33 update
- バトル画面を本家風レイアウトに変更。
  - 手札を手前下に表示。
  - ターン終了ボタンを上部中央に大きく表示。
  - 自分/相手の盤面とリーダーを同時表示。
- 手札カードはタップで選択して召喚先をタップ。
- PCでは手札カードをドラッグして自分マスにドロップする操作も可能。
- 合言葉IDのマッチングで `rooms/{matchId}/players` を監視し、相手入室を表示。
- 実際の盤面同期・先攻後攻・相手ターン処理は次フェーズ。


## v34 update
- バトル退出ボタンを追加。退出時は敗北扱いでマッチング前画面に戻る。
- 盤面を本家準拠の12マスへ拡張。
  - 自分6マス、相手6マス。
  - 相手の場には召喚不可。
  - 攻撃対象としては選択可能。
- 自分リーダーは常に左側、相手リーダーは右側表示。
- ターン制御を追加。
  - Firebaseの `rooms/{matchId}/meta/currentTurnPlayerId` で現在ターンを管理。
  - 自分のターンのみ行動可能。
  - ターン終了で相手ターンへ。
- RDB同期の基礎を追加。
  - `rooms/{matchId}/states/{playerId}` にHP/MP/テンション/盤面を同期。
  - 相手の公開盤面を表示。
- ヒーローカード使用後、テンション付近にヒーロースキルボタンを表示。
  - タップで現在レベルのヒーロースキルカード確認。
  - 使用後に次レベルへ進化する土台を追加。
- キーワード処理入口を追加。
  - におうだち、速攻、おうえん、ねらい撃ち、貫通、ステルス、メタルボディ等をflags化。
  - 現時点で実処理済み: 速攻/おうえん/におうだち/ねらい撃ちの対象制限。


## v35 update
- バトル盤面を本家寄せに再調整。
- 中央に相手6マス、自分6マスが向かい合うように配置。
- 相手の場と自分の場の間にスペースを確保。
- 相手ターン中は上部ボタンを赤系の「相手のターン」に変更し、押せないようにした。
- Safariのフルスクリーン強制は不可前提で、表示崩れしにくい横向きレイアウトへ調整。


## v36 update
- Safari横向きタブ内でも見切れにくいよう、バトル画面全体を圧縮。
- 6マスvs6マスが中央で向かい合う本家風レイアウトへ再調整。
- 相手ターン中は「相手のターン」ボタンを赤系表示にする処理を維持。
- バトル前のデッキ確認モーダルを、30枚敷き詰め型へ変更。
- iOSホーム画面追加向けに `apple-mobile-web-app-capable` 等のメタタグを追加。


## v37 update
- PWA用 `manifest.webmanifest` とアイコンを追加。
  - iOSでホーム画面追加する場合、古いホームアイコンを削除して追加し直してください。
- 盤面のマス配置を修正。
  - 相手側: 3列×2段
  - 自分側: 3列×2段
  - 4段×3列になる崩れをCSSで強制修正。
- バトル用デッキ確認モーダルを改善。
  - 確定ボタンを上部中央へ移動。
  - 30枚をスクロールなしグリッド表示へ変更。


## v38 update
- バトル盤面を中央3列×4段に固定。
  - 上2段: 相手の6マス
  - 下2段: 自分の6マス
- HPが0になったら勝利/敗北リザルトを表示。
- リザルト画面をタップするとマッチング前画面へ戻る。


## v39 update
- バトル画面の左右リーダーを修正。
  - 自分リーダーを左
  - 敵リーダーを右
- バトルログを右下へ移動。
- デッキ作成画面上部にデッキ一覧を追加。
  - 先頭に「＋ 新規作成」
  - 既存デッキをタップすると編集状態で読み込み
  - 保存時は編集中デッキを更新


## v40 update
- ヒーロースキル基礎実装を追加。
- 対応ヒーロー: ロトの血を引く者、勇者ソロ、レックス、タバサ、勇者姫アンルシア、大魔王ゾーマ、天空の花嫁フローラ、ローレシアの王子、サマルトリアの王子、ムーンブルクの王女。
- ヒーロースキルは原則1ターン1回まで。自動発動系は条件達成時に自動発動。
- 使用/自動発動回数によるLvアップを実装。
- 対象選択が必要なヒーロースキルは、ボタン使用後に盤面/敵リーダーをタップして発動。
- リーダー攻撃力がある場合、自分リーダーをタップして敵ユニット/敵リーダーへ攻撃できる処理を追加。
- 王女の愛、さあ行こう！、全てを滅ぼす者ゾーマを生成カードとして扱う基礎を追加。


## v41 update
- 効果エンジンを拡張。
  - 召喚時
  - 死亡時
  - におうだち
  - ねらい撃ち
  - 速攻
  - 貫通
  - 超貫通
  - おうえん
  - テンションリンク
  - 消滅
  - パワフルバッジ
  - 建物/耐久値
  - コストブースト
  - 武器装備/リーダー攻撃
- 全カード個別完全再現の前段として、カード効果文から主要キーワードを検出して処理する土台を追加。
- テンションUIを本家風の紫3段階ゲージに変更。


## v42 update
- ローレシアの王子のヒーロースキルを詳細化。
  - Lv1: デッキに特技が無い場合コスト0、使用後Lv2。
  - Lv2: 使用回数に応じてコスト/ダメージ増加、Lv3へ進行。
  - Lv3: 特技以外の手札を使う度ダメージ+1、使用後1ダメージに戻る。
- サマルトリアの王子のヒーロースキルを詳細化。
  - Lv1: テンション+2。
  - Lv2: Lv3進化時に「さあ行こう！」を手札へ。
  - Lv3: くらえベギラマ！/ぼくの生命をかける！/いま助けるよ！をランダム切替。
- 盤面カードにHPバーを追加。
- 攻撃、召喚、ダメージ対象など、選択可能箇所のハイライトを追加。


## v43 update
- 天空の花嫁デボラのヒーロースキルを追加。
  - Lv1: この手に切り札を / BETカードをデッキから手札へ
  - Lv2: アゲていくわよ / 味方BET発動後テンション+1、自動発動
  - Lv3: 小魚への施し / 確率でコイン1〜4枚を手札へ
- 天空の花嫁ビアンカのヒーロースキルを追加。
  - Lv1: わたしのとくいわざ / ユニット1体に2ダメージ
  - Lv2: 大切な友達 / 指定の味方空きマスに速攻4/4ゲレゲレを出す
  - Lv3: 家族との絆 / 以後、自分が手札を使う度敵リーダーに2ダメージ
- 参考.xlsx の概要を `data/reference_links_notes.json` に保存。


## v44 update
- 添付 `参考.xlsx` の分類をもとに、カテゴリ別効果エンジンを拡張。
- 建物/ダンジョン
  - ターン終了時耐久値
  - ドロー/テンション/道具追加/隣接回復/踏破報酬の共通土台
- 占い
  - 効果候補を抽出し、暫定でランダム発動する土台
- 選択
  - 選択モーダルUIを追加
  - 選んだ文章から簡易効果を処理
- さくせん
  - ランダム3候補から選ぶUI
  - 攻撃+1、HP+1、速攻/貫通/におうだち等の基本付与
- コイン/GET/BET
  - コイン仮想カードを追加
  - コイン使用で味方BET効果を発動する土台
  - デボラLv2のBET発動トリガーにも接続
- 交換所
  - 所持コイン数に応じて交換候補を表示
  - 交換後にカードを引く土台
- 武器
  - 耐久値、2回攻撃、反撃ダメージ無効、攻撃後効果、破壊時効果の共通土台
- `data/category_reference_from_excel.json` に参考分類のスニペットを保存。


## v45 update
- v44で崩れたバトル盤面レイアウトを復旧。
- 本家風の3列×4段へ強制固定。
  - 上2段: 相手盤面6マス
  - 下2段: 自分盤面6マス
  - 中央: 相手前列と自分前列の間隔
- 前後関係を `data/battle_board_layout_note.json` に記録。
- 今後のCSS追加で盤面配置を壊さないため、最終上書きブロックとして追加。


## v46 update
- バトル盤面の根本仕様を修正。
- 本家準拠で、上下対面ではなく左右対面に変更。
- 盤面は3行×4列。
  - 1列目: 自分後列
  - 2列目: 自分前列
  - 3列目: 相手前列
  - 4列目: 相手後列
  - 2列目と3列目の間に中央スペース
- 内部座標も `posToCoord`, `coordToPos`, `getBehindPos`, `getFrontPos` として整理。
- 貫通/超貫通の「後ろ」判定もこの座標に合わせて修正。


## v47 update
- v46の左右対面座標は維持したまま、盤面の見た目を調整。
- 盤面全体を白線付近まで上に移動。
- 自分/相手リーダーを左右中央付近へ配置。
- 手札を小型化して、下段マスを隠さないよう調整。


## v48 update
- iPhone横向き時のカメラ/ノッチに隠れにくいよう、左右リーダーを少し内側へ移動。
- `env(safe-area-inset-left/right)` を考慮。
- 盤面座標・前列/後列仕様は変更なし。


## v49 update
- バトル画面左上の「← メニュー」を「退出」ボタンとして扱うよう変更。
- バトル中に左上ボタンを押すと退出確認モーダルを表示。
- 盤面内の別退出ボタンは非表示。
- 自分リーダーが内側すぎたため、ノッチに被らない範囲で少し左へ戻した。


## v50 update
- 伝説の勇者を追加。
  - 送信画像をローカルカード画像として `assets/custom_cards` に保存。
  - 編成用カードを `cards.json` に追加。
  - Lv1: 出会いと別れの酒場 / デッキ上7枚から冒険者1枚を手札へ、残りはデッキ下へ。2回でLv2。
  - Lv2: ダーマの神殿へ / 味方空きマスにダーマの神殿を出す。1回でLv3。
  - Lv3: 魔王討伐 / ユニット1体にダメージ。冒険者カード使用でダメージ増加。1回でLv4。
  - Lv4: そして伝説へ / 敵リーダー25ダメージ。冒険者3回使用ごとにコスト-5、1ドロー。
- ダーマの神殿を仮想建物カードとして追加。
- 勇者レックを追加。
  - 送信画像をローカルカード画像として `assets/custom_cards` に保存。
  - 編成用カードを `cards.json` に追加。
  - Lv1: いつか見た光景 / 手札の熟練度カードを強化。2回でLv2、Lv2時1ドロー。
  - Lv2: 呼び覚まされし記憶 / 熟練度カード使用後テンション+1。2回でLv3。
  - Lv3: 未来を信じて / 1ドロー、手札の熟練度カードを強化。
- 守り人ナインを暫定追加。
  - 編成用カードはDB画像を優先。
  - 効果詳細未提供のため進行回数だけ反映。
- `data/custom_hero_images_note.json` に画像と実装メモを保存。


## v52 update
- マッチング処理を強化。
  - 同じ合言葉IDの部屋に入る。
  - active な参加者が2人いる部屋には3人目が入れない。
  - `rooms/{roomId}/meta.status` を `waiting` / `playing` / `finished` で管理。
  - 古い room listener を解除して、多重購読しないようにした。
- 退出処理を強化。
  - どちらか一方が退出したら、部屋の meta を `finished` に更新。
  - 退出した側は敗北リザルト。
  - 相手側は勝利リザルト。
  - 双方とも一定時間後にマッチング前画面へ戻る。
  - 部屋は数秒後にRDBから削除。
- 画像差し替え。
  - 前回の結合画像からの切り抜きで文字が崩れていたカードを、今回アップロードされた単体PNGに差し替え。
  - 宝の地図、地図ダンジョン8種、レック/伝説の勇者関連画像を再保存。


## v53 update
- 建物/ダンジョンの基本ルールを修正。
  - 建物/ダンジョンは攻撃不可。
  - 建物/ダンジョンは通常の攻撃対象・通常のユニット対象にならない。
  - 守り人ナインLv3など専用対象 `friendlyDungeon` の時だけ味方ダンジョンを選択可能。
- 耐久値処理を整理。
  - 通常建物は説明欄に「ターン終了時」系の記載がある場合だけ耐久値を減らす。
  - ダンジョンはターン終了で勝手に減らない。
  - ダンジョンは説明欄にある「自分のターン開始時/終了時 耐久値+1」などで耐久値が増える。
  - 耐久値が規定値に達したら踏破。
- におうだち/攻撃対象判定から建物を除外。
- 貫通の後ろダメージも建物には入らないよう修正。


## v54 update
- 特殊効果一覧を元に、カード効果エンジンを拡張。
- 新規/補強:
  - 毒
  - 封印
  - 闇の衣
  - 攻撃時
  - 特技ダメージ+
  - 必中モード
  - 超必中モード
  - スキルリンク
  - すべる床 / 宝箱 / バリア床 / 刃の紋章 / 魔法陣 / 祝福の聖域 / しあわせの国 / 天啓の神域
  - 無気力状態
  - 絶好調
  - GET
  - BET表記ゆれ
  - 熟練度の保持
- 占いは必中/超必中モードに対応。
  - 必中: 現状は先頭選択肢を良い方として扱う。
  - 超必中: 選択肢を両方発動。
- 地形は味方マスに簡易配置し、召喚時に効果を処理。
- `data/special_keyword_coverage_v54.json` に実装状況と要確認項目を保存。


## v55 update
- 必殺技を実装。
  - テンション3の時のみ使用可能。
  - 使用後テンション0。
- スキルブーストを実装。
  - ヒーロースキル使用時に手札のスキルブースト値を進める。
  - 場のユニットは説明欄から読める簡易効果を発動。
- シンクロを実装。
  - ヒーローLvがある場合のみ恩恵あり。
  - ヒーローカードなしの場合は不発。
- れんけいを実装。
  - テンション3で手札から召喚/発動した時のみ追加効果。
  - テンションは消費せず3のまま。
- 地形を基本的に選択配置へ変更。
- 無気力状態を補強。
  - ユニット: 攻撃不可。
  - リーダー: 攻撃不可、テンション0固定。
- 闇の衣を補強。
  - 光の玉使用時に解除。


## v56 update
- スキルブーストを修正。
  - 発動トリガーを「ヒーロースキル使用時」から「リーダーのテンションスキル使用時」へ修正。
  - 使用時に説明欄のスキルブースト効果を処理。
- シンクロを修正。
  - カード説明欄の `シンクロ：...` を読み取り、ヒーローレベル回数ぶん適用。
  - 例: `シンクロ：こうげき+1` ならヒーローLv1で+1、Lv2で+2、Lv3で+3。
- 地形を補強。
  - 基本はユーザーが設置場所を選択。
  - 説明欄に `敵ユニットの後ろ` / `相手後列` / `相手前列` / `味方後列` / `味方前列` などがある場合は制約を優先して配置。
  - 相手側地形 `enemyTerrain` を追加。


## v57 update
- マッチング演出を追加。
  - 同じ合言葉IDで相手が見つかるまでは `待機中・・・` ラベル表示。
  - 待機中は操作不可。
  - 2人揃ったら先攻/後攻をランダム決定。
  - `先攻` / `後攻` ラベルを画面中央に横幅いっぱいで約2秒表示。
- ターン遷移演出を追加。
  - ターン終了側に `ターン終了` ラベルを約2秒表示。
  - 手番を受け取った側に `あなたのターン` ラベルを約2秒表示。
  - ラベル表示中は操作不可。
- 退出/切断処理を補強。
  - 退出、タスクキル、ページ離脱を `left` 状態として記録。
  - 残った側は勝利リザルト。
  - 一定時間後にマッチング前へ戻る。
  - 部屋は数秒後にFirebaseから削除。
  - 同じIDで再入室しても待機中から開始。
- 攻撃演出を追加。
  - 攻撃するカード/リーダーが対象へ突進して戻るアニメーション。


## v58 update
- `参考(1).xlsx` の特殊効果一覧を読み込み、プロジェクト内へ反映。
- Excel由来の効果参照を `data/effect_reference_from_excel_v58.json` に保存。
- DB内カードテキストとExcel一覧を照合し、一覧漏れ候補を `data/effect_keyword_missing_from_excel_v58.json` に保存。
- 適用サマリを `data/effect_excel_applied_summary_v58.json` に保存。
- 召喚時の汎用処理を補強。
  - GET
  - ドロー
  - HP条件による自己バフ
  - 地形マス召喚時バフ
  - 上下への同名/指定トークン召喚
  - 対象ダメージ
  - このターン中攻撃力バフ対象選択
- 死亡時の汎用処理を補強。
  - ランダム敵ダメージ
  - ランダム敵毒/封印/死亡/攻撃不能
  - ランダム味方バフ
  - 相手ドロー
  - 手札追加
  - 次ユニットのコスト低下
  - ダンジョン耐久値加算
- シンクロを①②③の段階効果に対応。
- スキルブーストをテンションスキル使用回数ぶん効果量が伸びる形に補強。
- ダンジョン進行条件を補強。
  - テンションリンク
  - コスト1〜8の未使用コスト特技
  - 武闘家カード使用
  - 守りのほこら/ピラミッド/ロンダルキアへの洞くつの踏破時処理。
- Excel内カード数: 961
- ExcelにはあるがアプリDBに見つからなかった名前: オルゴ・デミーラ：第2形態, オルゴ・デミーラ：第3形態


## v59 update
- ユーザー提供URLを `data/card_official_links_v59.json` に保存。
- URL/DB説明を元に個別処理を追加。
  - オルゴ・デミーラ：第2形態/第3形態/第4形態をトークンカードとして追加。
  - 第2形態: 2回攻撃、死亡時に第3形態を手札へ。
  - 第3形態: 召喚時に自身以外の全ユニット2ダメージ、死亡時に第4形態を手札へ。
  - 第4形態: におうだち、攻撃対象の上下にもダメージ。
  - スウィートバッグ: テンションリンクで前の味方に貫通/ねらい撃ち/2回攻撃のいずれか付与。
  - あくまのめだま: 次に場に出る魔王系味方へねらい撃ちと攻撃力+1。
  - 嘆きの霧: 必殺技として敵全体毒、毒ダメージ+1。
  - ポイズンキッス/猛毒の霧系の全体毒を補強。
  - カミュ: 敵リーダー武器奪取。
  - 敵武器破壊系を補強。
  - あくまのきし: 魔王系手札条件で敵1体を行動不能。
  - 突風の剣: BETで敵ユニットを1マス上へ移動。
  - しゃくねつのツメ系: BETで武器耐久力分の全体ダメージ。
- 実装/要確認メモを `data/url_targeted_effects_v59.json` に保存。


## v60 update
- カミュの武器奪取処理を修正。
  - 相手が武器を装備している場合、その時点の攻撃力・耐久値のまま自リーダーに装備。
  - 自リーダーは即使用可能。
  - 相手は武器を失い、攻撃不可になる。
- 追加説明が必要なカード一覧を `data/manual_check_needed_v60.json` に保存。


## v61 update
- ユーザー説明に基づき、残りの要確認カード16種を実装。
- 毒の基本処理を修正。
  - 毒はお互いのターン終了時にHP-1。
  - 敵リーダー毒にも対応。
  - 怪蟲アラグネ/嘆きの霧系で敵側の毒ダメージ増加に対応。
- デビルパピヨン
  - 召喚時GET(1)。
  - BETでランダムな敵ユニット1体を毒。
- 怪蟲アラグネ
  - 召喚時に敵リーダーを毒。
  - すでに毒なら敵ユニット/敵リーダーへの毒ダメージを2へ。
- 卑劣などくやずきん
  - 召喚時に敵1体/敵リーダーへ1ダメージ。
  - 対象が毒なら3ダメージ。
- アイスボンバー
  - 相手の場に氷塊があれば+2/+2。
- 飛翔のガーゴイル
  - 手札に特技があれば自身にさくせん。
- クラウンヘッド
  - BETでHP+1、次の相手ターン終了まで被ダメ-1。
  - 1ターン1回。
- チャゴス王子
  - BETで速攻。
  - 攻撃対象に選ばれた時のみ手札へ戻る。
- レジェンドホーン/メイジポンポコ/プチプリースト
  - シンクロ用効果テキストを更新。
- インプ/ルバンカ/ゴンズ/ゾンビマスター/ぶちスライム/天使の守りを実装。
- 実装メモを `data/manual_effects_v61.json` に保存。


## v62 update
- 手動説明を元に、確定できるGET/BET/れんけい/シンクロ/さくせん挙動を補強。
- BETを「場のBET持ち1体または装備武器を選んでコインを使う」方式へ変更。
  - 以前のように場のBETをまとめて全部発動する挙動を修正。
  - デビルパピヨン/クラウンヘッド/チャゴス王子/インプ/ルバンカ/ぶちスライムは個別BET処理。
  - クラウンヘッド/チャゴス王子/インプは1ターン1回制限。
  - ルバンカ/ぶちスライムは回数制限なし。
- れんけいを補強。
  - テンション3の時だけ追加効果。
  - テンションは消費しない。
  - キーワード/バフ/ドロー/回復などを共通処理。
- シンクロを補強。
  - ①②③をヒーローLvまで順番に適用。
  - 死亡時テキストをユニットへ付与し、死亡時に解決。
  - 召喚コスト-系をコスト計算へ反映。
- スキルブーストを補強。
  - テンションスキル使用回数に応じたコスト-をコスト計算へ反映。
- さくせんを補強。
  - 候補9種類からランダム3種類を提示し、ユーザーが1つ選択。
  - 基本バフ/キーワード/状態付与を追加。
- 確定済み/情報不足メモを `data/effect_certainty_report_v62.json` に保存。


## v63 update
- さくせんのルールを確定。
  - 完全ランダムで3種選出。
  - 発動者がその中から1つ選択。
  - 現在の9種は基本的に発動したユニットへ付与。
  - 相手対象のさくせん名が確定した場合は個別に enemy-target として追加できる土台を追加。
- BET/れんけいの追加説明が必要なカード一覧を作成。
  - `data/manual_needed_bet_renkei_v63.json`
  - BET追加説明候補: 21件
  - れんけい追加説明候補: 18件


## v64 update
- さくせんの登録効果を確認し、相手対象なしの前提を維持。
- BET手動説明のうち、コイン〜レモンキングまでを実装。
  - コイン: 0コスト、使用後手札から消える。
  - ミリオンゼニー: 自分のターン終了時GET(1)、BETで死亡時GET(2)を付与。
  - スペシャルコイン: 味方ユニット全てのBETを発動。
  - この手に切り札を: 山札からBETカードをランダムに1枚手札へ。
  - かっちゅうアリ: 1ターン1回、BETで+1/+1。ターン終了時GET(1)は1度だけ。
  - ウルベア魔神兵: ねらい撃ち、召喚時GET(2)、BETで攻撃力+1〜4。
  - ファイアボール: 召喚時GET(1)、BETでこのターン中リーダー被ダメージ-5。
  - アイラ: 召喚時GET(2)、BETでランダム武器を味方リーダーへ装備。
  - レモンキング: 攻撃時GET(1)、BETでスライム2体を出す。
- 実装メモを `data/bet_manual_batch_v64.json` に保存。


## v65 update
- BET手動説明の続きから追加実装。
- スペシャルコイン
  - マデサゴーラのターン終了時効果でのみ手札に加える特殊カードとして扱う。
  - 使用時は味方ユニット全てのBETを発動。
- レモンキング
  - レモンキング以外のスライム系味方ユニット死亡時、相手リーダーへ1ダメージ。
- クラーゴン
  - BETで未発動の3効果からランダム発動。
  - 同ターン中に全て発動した後は不発。
  - ターン終了で使用済みリセット。
- 少女マリベル
  - 召喚時GET(2)、BETで次に使う特技カードのコスト-2。
- アサシンクロー
  - 召喚時GET(1)、BETで武術カードを手札に加える。
- カンダタこぶん
  - 召喚時GET(1)、BETで次のテンションボタンのコスト0。
- ゴルゴンゾーラ
  - 召喚時GET(1)、BETで自身HP3回復。
- きりかぶおばけ
  - 召喚時GET(1)、BETで1ターン1回、他のランダム味方ユニットHP+2。
- むげんの弓
  - 攻撃時の反撃ダメージなし。
  - BETで耐久力+1。
  - 自分ターン終了時GET(1)。
- 福招きのそろばん
  - 装備時GET(1)。
  - BETで耐久力-1、カードを1枚引く。
  - 耐久0で壊れた時GET(1)。
- ルドマン
  - 召喚時GET(1)。
  - BETで道具カードを手札に加える。
  - 味方BET4回ごとに手札/山札からコスト3以下ユニットを場に出す。
- まだらイチョウは説明が途中で切れているため保留。


## v66 update
- BET共通裁定を整理。
  - BET対象は基本的にユニット/武器。リーダーには使わない。
  - コインは1度使うと手札から消える。
  - 1ターン1回制限があるカードは個別制限を優先。
  - 明記がない効果は永続。
  - ランダム明記ありはランダム、なければ選択。
- まだらイチョウ
  - BETで1/2ブラックタヌーを1体出す。
  - このBETが3回発動する度に、自身以外の全味方ユニット+1/+1。
  - カウントはターンを跨いで継続。
- 賢者ルシェンダ
  - 召喚時GET(1)。
  - BETで山札トップが偶数コストのユニットなら場に出す。
  - 場が埋まっている場合は不発。
  - それ以外なら手札に加える。
- 黄金兵長
  - 召喚時GET(1)。
  - 攻撃時、味方の場のピサロナイト数分、敵リーダーにダメージ。
  - BETでピサロナイトを1体場に出す。
- 実装メモを `data/bet_manual_batch_v66.json` に保存。


## v67 update
- 手動説明に基づき、れんけい候補18件を実装。
- れんけい共通裁定:
  - 召喚時にテンション3なら発動。
  - テンションは維持し、消費しない。
  - ランダム明記がなければ基本選択。
  - れんけいで場に出たユニットは召喚ではないため召喚時は発動しない。
- 実装:
  - コンガオンガ
  - ウルノーガ&ウルナーガ
  - シュプリンガー
  - パピラス
  - ローシュ
  - あくまの書
  - もりもりベス
  - 魅惑のマルティナ
  - 決意の聖賢セーニャ
  - 亡国の先王ロウ
  - ベロベロ
  - ヘルプラネット
  - セレン
  - うずしおキング
  - ぬかどこスライム
  - 笑顔の伝道師シルビア
  - マヤ
  - とうだいタイガー
- 注意:
  - マヤは相手手札の中身を同期していないため、相手手札コピーは暫定でランダムカード取得。
  - セレンはカードイラスト差異の可能性ありとしてメモ。
- 実装メモを `data/renkei_manual_batch_v67.json` に保存。


## v68 update
- 手札同期を追加。
  - Firebaseのpublic battle stateに `handIds` を同期。
  - 相手の `handIds` を `game.enemy.hand` として保持。
- マヤを実装強化。
  - 敵リーダー攻撃後、同期済みの相手手札からランダムに1枚選ぶ。
  - そのカードと同名カードを自分の手札に加える。
- 注意:
  - UIには表示していないが、Firebaseのpublic stateには手札IDが含まれる。
  - 完全に手札を隠したまま厳密に抽選するには、サーバー権威/Cloud Functions等で処理する必要がある。
- 実装メモを `data/hand_sync_maya_v68.json` に保存。


## v69 update
- イベントエンジンの土台を追加。
  - `emitBattleEvent(type, payload)` を追加。
  - `game.events` に内部イベントログを保持。
- 追加イベント:
  - `turnStart`
  - `turnEnd`
  - `cardPlayed`
  - `spellPlayed`
  - `unitSummoned`
  - `unitPutIntoPlay`
  - `afterAttack`
  - `unitDeath`
  - `betActivated`
  - `weaponEquipped`
- 「召喚」と「場に出す」を分離。
  - `summonUnitFromHandToBoard`: 通常召喚。召喚時/れんけい/シンクロなどを発火。
  - `putUnitIntoPlayFromCard`: 効果で場に出す。召喚時は発火しない。
- `summonSelectedCard` をイベント駆動へ整理。
  - 旧処理の重複と未定義参照を解消。
- BET誘発を `betActivated` イベントに集約。
- 攻撃後処理を `afterAttack` に集約。
  - マヤ/ローシュの攻撃後効果をイベント側へ移動。
- 死亡前処理を `unitDeath` イベントへ追加。
- Firebase public stateに `lastEvent` / `eventCount` を追加。
  - 次回以降の actionLog 同期に繋げる土台。
- 実装メモを `data/event_engine_v69.json` に保存。


## v70 update
- Firebase actionLog の土台を追加。
  - `rooms/{roomId}/actions` に主要イベントを push。
  - `subscribeBattleActions(roomId)` で相手actionを受信。
  - 現段階では監査ログ/将来の権威同期用。盤面同期は引き続きpublic stateが主。
- ランダム結果同期の土台を追加。
  - `randomIndex`
  - `chooseRandom`
  - `randomResult` action
  - ランダムで選ばれた値をFirebase actionsへ記録。
- ターンイベントを分離。
  - `ownTurnStart`
  - `ownTurnEnd`
  - `opponentTurnStart`
  - `opponentTurnEnd`
- 武器イベントを追加。
  - `weaponEquipped`
  - `weaponAfterAttack`
  - `weaponBroken`
- 注意:
  - まだ全ランダム箇所を置換しきってはいない。
  - actionLogを受信して即再実行する段階ではない。
  - 二重処理を避けるため、v70ではpublic state同期を主として残している。
- 実装メモを `data/sync_engine_v70.json` に保存。


## v71 update
- remote action replay の第一段階を追加。
  - 相手actionを受信し、`game.remoteActions` に保持。
  - ownTurnStart/ownTurnEndを受信した場合、相手側ではopponentTurnStart/opponentTurnEndとして処理。
  - その他actionは二重処理を避けるため、現段階ではログ/監査用途中心。
- randomResultキューを追加。
  - `game.remoteRandomResults` に相手のランダム結果を保持。
  - remote処理時、kind/contextが一致するrandomResultを再利用可能。
- `shuffle` を `randomIndex` 経由に変更。
  - 山札シャッフル系のランダムもactionLog記録対象に寄せた。
- 主要な `Math.random` 使用を整理。
  - ゲーム効果のランダムは `randomIndex` 経由へ。
  - ID生成は `crypto.randomUUID` へ。
- public stateに `actionReplayReady` / `remoteActionCount` を追加。
- 注意:
  - まだ完全なaction reducerではない。
  - 盤面同期はpublic stateが主。
  - 次は cardPlayed/unitSummoned/BET/attack をpayloadから再実行するreducerが本命。
- 実装メモを `data/action_replay_v71.json` に保存。


## v72 update
- action reducer の基本版を追加。
  - `applyRemoteReducer(action)` を追加。
  - 相手actionを受信した際、基本操作は盤面へ反映する土台を追加。
- reducer対応:
  - `unitSummoned`
  - `unitPutIntoPlay`
  - `cardPlayed`
  - `betActivated`
  - `weaponEquipped`
  - `weaponBroken`
  - `afterAttack`
  - `unitDeath`
  - `ownTurnStart`
  - `ownTurnEnd`
- `actionReducerReady` をpublic stateに追加。
- `appliedActionIds` を追加し、同じactionの二重適用を抑止。
- `cloneEventPayload` を強化。
  - unit/card/weaponの再現用データを増やした。
- public state board と reducer board を `mergeRemoteBoard` で統合。
- 注意:
  - まだ全カード効果の完全replayではない。
  - public stateとの併用中。
  - 次は attack action を明示的に切って、攻撃処理をreducer化するのが本命。
- 実装メモを `data/action_reducer_v72.json` に保存。


## v73 update
- attack action reducer の基本版を追加。
- 新規action:
  - `attackDeclared`
  - `damageApplied`
  - `counterDamage`
  - `attackResolved`
- 攻撃処理を actionLog 上で以下の流れに分割。
  - 攻撃宣言
  - ダメージ適用
  - 反撃ダメージ
  - 攻撃解決
- remote reducer に攻撃actionを追加。
  - 相手の `damageApplied` を受信して自分側盤面/リーダーHPに反映。
  - 相手の `counterDamage` を受信して反撃ダメージを反映。
- `afterAttack` は基本ダメージ反映ではなく、マヤ/ローシュなど攻撃後誘発の区切りとして扱うよう変更。
- 注意:
  - 貫通/上下巻き込み/武器攻撃後などは今後さらに個別action化予定。
  - まだpublic stateとの併用中。
- 実装メモを `data/attack_action_reducer_v73.json` に保存。


## v74 update
- ダメージaction共通化を追加。
- 新規wrapper:
  - `dealDamageToUnit`
  - `dealDamageToLeader`
  - `refForUnit`
- これらのwrapperから `damageApplied` actionを共通発行。
- remote処理中は `damageApplied` を再送信しないガードを追加。
- 主要な直接ダメージをwrapper経由に変更。
  - 毒
  - 貫通/超貫通
  - オルゴ・デミーラ第4形態の巻き込み
  - クラーゴン
  - インプBET
  - 魅惑のマルティナ
  - 武器効果
  - テキストミニ効果
  - 一部ヒーロー効果
- 通常攻撃本体はv73で既に `damageApplied` / `counterDamage` を出しているため維持。
- 実装メモを `data/damage_action_unification_v74.json` に保存。


## v75 update
- 対象選択payloadを追加。
- 新規action:
  - `targetSelected`
- 新規helper:
  - `makeTargetPayload`
  - `makeEmptySlotTargetPayload`
  - `makeEffectTargetPayload`
  - `emitTargetSelected`
  - `emitEmptySlotSelected`
- actionLogに記録する対象:
  - 召喚先スロット
  - 攻撃対象ユニット/リーダー
  - pendingGenericEffectの対象
  - ヒーロースキルの対象
- remote reducerで `targetSelected` を受信し、`game.lastRemoteTarget` に保存。
- public stateに `lastTargetSelected` を追加。
- 注意:
  - v75では対象選択を記録する段階。
  - まだ全効果を `lastRemoteTarget` から完全再実行する段階ではない。
  - 次は choiceSelected payloadで、さくせん/占い/選択/あくまの書/うずしおキングなどの選択肢同期を入れる。
- 実装メモを `data/target_selection_payloads_v75.json` に保存。


## v76 update
- 選択肢payloadを追加。
- 新規action:
  - `choiceSelected`
- 新規helper:
  - `emitChoiceSelected`
- `openChoiceModal` を拡張。
  - すべてのモーダル選択を `choiceSelected` としてactionLogに保存。
- 記録対象:
  - 選択カード
  - さくせん
  - BET対象
  - 交換所
  - あくまの書
  - うずしおキング
  - その他openChoiceModalを使う選択
- 占いもchoiceSelectedとして記録。
  - ランダム占い
  - 必中
  - 超必中/両方発動
- remote reducerで `choiceSelected` を受信し、`game.lastRemoteChoice` に保存。
- public stateに `lastChoiceSelected` を追加。
- 注意:
  - v76では選択結果を記録する段階。
  - 次は `choiceSelected` / `targetSelected` を使って、cardPlayed reducerで効果を再実行する。
- 実装メモを `data/choice_selection_payloads_v76.json` に保存。


## v77 update
- 裁定反映。
- あくまの書:
  - れんけいは召喚時テンションMAXで1回だけ発動。
  - 1回のれんけいで2回選択しないよう修正。
  - 別のあくまの書で同じカードをコピーすることは可能。
- うずしおキング:
  - 上4枚から選択後、選ばなかったカードはランダム順で山札の上に戻す。
- さくせん:
  - 完全ランダム・制限なしとして既存のランダム3択を維持。
- 占い:
  - 必中の「良い方」固定を撤回。
  - 必中は発動する占い効果を選択する処理に変更。
  - 超必中/ヘルプラネットは両方発動。
- 実装メモを `data/ruling_fixes_v77.json` に保存。


## v78 update
- カードDB全体の効果棚卸しレポートを生成。
- 対象カード数: 1582
- 生成ファイル:
  - `data/effect_audit_v78.json`
  - `data/manual_effect_needed_v78.json`
  - `data/implemented_effect_coverage_v78.json`
- 検出結果:
  - app.jsにカード名が登場する個別実装候補: 149
  - 汎用処理で拾えそうなカード: 310
  - 個別説明/裁定が必要そうなカード: 934
    - 優先度A: 155
    - 優先度B: 779
- 注意:
  - `implementedByNameInAppJs` はカード名が `js/app.js` に登場するかで判定する簡易検出。
  - `manualNeeded` は効果裁定が必要になりやすいカードの候補。
  - 完全な正誤判定ではなく、今後の実装優先順位を作るための棚卸し。


## v79 update
- ユーザー裁定を反映。
- あくまのカガミ:
  - 占い師用カードだが占い効果ではない。
  - 召喚時、デッキの5コスト以下の冒険者ユニット1体をランダムに場に出す。
  - このターン中速攻と、ターン終了時にデッキへ混ぜる効果を付与。
- スピニー:
  - 占い師カードだが占い効果ではない。
  - `hasFortuneEffect` を追加し、単なる「占い師」表記を占い効果として扱わないよう修正。
- キラーマシン2:
  - 建物が3つ以上出ていたら、さくせん2回分として3択ではなく全さくせん効果を2回得る。
- フォステイル:
  - スキルリンクでその場から消える。
  - 次の自分のターン開始時、同じ場所を優先して戻る。
  - 埋まっていた場合はランダムな空きマスに戻る。
  - 6マス埋まっていた場合は戻らず消えたまま。
- 棚卸し方針を改善。
  - 説明文で素直に読めるものは原則確認対象から外す。
  - 耐久値条件、戻る場所、山札順、非公開情報、特殊タイミングなど挙動不明点だけを抽出。
- 追加ファイル:
  - `data/manual_effects_v79.json`
  - `data/effect_questions_refined_v79.json`
- refined確認候補:
  - 合計: 217
  - 優先度A: 83
  - 優先度B: 134


## v80 update
- 追記された refined effect questions を元に、実装可能な効果を batch 1 として追加。
- 追加方針:
  - 説明文どおりに読めるものは原則そのまま実装。
  - ランダムは選択不可。
  - デッキは山札内。
  - 手札は手札アクション。
  - 建物は効果を発動しながら耐久値を失い、耐久値0でマスから消える。
  - ダンジョン付き建物は条件で耐久値が増え、指定値到達で踏破してマスから消える。
- 主な追加:
  - 建物/ダンジョン耐久値の汎用補助。
  - 山札上を見る/選ぶ/下へ戻す系の補助。
  - 相手デッキ/手札コピー系の補助。
  - このターン中攻撃力上昇のリセット補助。
  - あくまのカガミのコピー挙動修正。
  - フォステイルは最新追記に合わせ、元のマスが埋まっていたら戻らない扱いに修正。
  - スピニーはメラリザードを出す位置を選択式に修正。
- batch 1 実装/推測反映数: 54
- まだ未実装/保留: 163
- 追加ファイル:
  - `data/manual_effects_v80_batch_1.json`
  - `data/manual_effects_v80_unresolved.json`


## v81 update
- 期限付き効果の基本法則を反映。
  - `このターン中` はターン終了時に効果を失う/上昇値をリセット。
  - `次の自分のターン開始時` は自分ターン開始時に解除。
  - `相手のターン終了まで` は相手ターン終了時に解除。
- DBの系統分類を確認し、○○系ユニット判定helperを追加。
  - `cardTribes`
  - `isTribeCard`
  - `isSlimeCard`
  - `isZombieCard`
  - `isDragonCard`
  - `isAdventurerCard2`
  - `isDemonKingCard`
- DB上の主な系統数:
  - 冒険者: 80
  - ゾンビ: 77
  - ドラゴン: 73
  - スライム: 63
  - 魔王系: 38
- 汎用処理を追加。
  - 自分の場と手札にいる○○系の数だけコストが下がる。
  - 自分の場と手札にいる○○系の数だけ+X/+Y。
  - このユニットを除く○○系の味方ユニット全てを+X/+Y。
- batch 2として、説明文通りに実装できる一部効果を追加。
- 追加ファイル:
  - `data/manual_effects_v81_batch_2.json`
  - `data/manual_effects_v81_unresolved.json`
- batch 2 実装/汎用化: 21
- 残り未実装/保留: 146


## v82 update
- unresolved の意味を修正。
  - `manual_effects_v82_unresolved.json` は、情報不足で実装不能なものだけに変更。
  - 説明文どおり実装できそうなものは `manual_effects_v82_implementation_queue.json` に分離。
  - 既に実装済み/既存汎用で拾えるものは `manual_effects_v82_done_or_existing.json` に分離。
- 結果:
  - 情報不足でユーザー確認が必要: 0
  - 実装待ちだが説明不要: 90
  - 実装済み/既存対応/今回対応: 56
- batch 3追加:
  - グリズリー
  - デュラハンナイト
  - 牢屋
  - 修道院
  - 塔
  - 武器屋
  - 占い小屋
  - ダークプラネット
- 追加ファイル:
  - `data/manual_effects_v82_needs_user_info.json`
  - `data/manual_effects_v82_unresolved.json`
  - `data/manual_effects_v82_implementation_queue.json`
  - `data/manual_effects_v82_done_or_existing.json`


## v83 update
- v82で分離した `implementation_queue` から、説明不要で実装できるものを batch 4 として追加。
- `needs_user_info` / `unresolved` は今回も0件。
  - つまり、現時点でユーザー説明がないと止まるものは無し。
- batch 4 実装:
  - 61件
- 残り実装待ち:
  - 29件
- 追加/更新ファイル:
  - `data/manual_effects_v83_needs_user_info.json`
  - `data/manual_effects_v83_unresolved.json`
  - `data/manual_effects_v83_implementation_queue.json`
  - `data/manual_effects_v83_batch4_done.json`
- 追加した主な効果:
  - このターン中リーダー/ユニット攻撃力上昇
  - 次ターン/相手ターン終了までの被ダメージ軽減
  - BET 1ターン1回系の追加
  - 死亡時/攻撃時/テンションリンクの一部
  - 特技ダメージ増加/MP一時増加
  - 速攻・攻撃不可・一時コントロール系の一部


## v84 update
- v83で残っていた `implementation_queue` 29件を batch 5 として実装/既存汎用対応に整理。
- `needs_user_info` / `unresolved` は引き続き0件。
- `implementation_queue` も0件に更新。
- batch 5対象:
  - デルカダール地下水路、墓所、あくましんかん、うらぎりこぞう、スラリンガル、セクシービーム、テンプテーション、デスマエストロ、ドラゴンソルジャー、ニセたいこう、バラモス、ヒドラ、フライングデス、ベホイミスライム、マジックリップス、ライアン、冥界の霧、分裂のツボ、剣豪の闘志、家族の絆、怪獣プスゴン、暗黒大樹の番人、歌姫のマポレーナ、残響のようじゅつし、百獣の王キングレオ、稽古相手、聖銀のレイピア、覇海軍王ジャコラ、魔王の書
- 追加/更新ファイル:
  - `data/manual_effects_v84_needs_user_info.json`
  - `data/manual_effects_v84_unresolved.json`
  - `data/manual_effects_v84_implementation_queue.json`
  - `data/manual_effects_v84_batch5_done.json`


## v85 update
- ソロ効果テスト部屋を追加。
- AI対戦ではなく、相手をサンドバッグにしてカード効果を確認する一人部屋。
- 機能:
  - 相手HP∞
  - 相手HP25へ戻す
  - MP10
  - テンションMAX
  - 1枚ドロー
  - ログ消去
  - カード検索
  - 選択カードを手札へ追加
  - 選択カードを山札トップへ追加
  - 選択カードを味方盤面へ配置
  - 選択カードを敵盤面へ配置
  - 選択カードを相手手札へ追加
  - 敵全体1ダメージ
- 複雑カードの挙動確認用。
- 追加ファイル:
  - `data/solo_effect_test_v85.json`


## v86 update
- ソロ効果テスト用プリセットデッキを追加。
  - 【テスト】複雑効果まとめ
  - 【テスト】建物・ダンジョン
  - 【テスト】手札・山札干渉
  - 【テスト】BET・コイン
  - 【テスト】系統・期限効果
- バトル用デッキ選択欄に、保存デッキとは別にプリセットが表示される。
- ソロ効果テスト開始時、相手手札を初期セットで用意。
- ソロ効果テスト開始時、相手デッキもテスト用カードで用意。
- ソロパネルに追加:
  - 相手手札リセット
  - 相手手札表示
- ソロ時の相手MP表示に手札枚数を併記。
- 追加ファイル:
  - `data/solo_preset_decks_v86.json`


## v87 update
- 起動画面から動かない可能性がある問題を修正。
- 原因:
  - `VIRTUAL_CARD_DEFS` 内で `強敵メタルキング` と `イブールの本` の間にカンマ抜けがあった。
  - これによりブラウザ側で `app.js` の読み込み/初期化が止まり、タップ開始イベントが付かない可能性があった。
- Firebase/RDB設定は維持。
  - `js/firebase-config.js` に `databaseURL` あり。
- 初期化失敗時に画面上へエラーを出す boot guard を追加。
- 追加ファイル:
  - `data/boot_fix_v87.json`


## v88 update
- 起動画面から進めない問題の追加修正。
- Firebase SDK の外部URL static import をやめ、起動後の dynamic import に変更。
- タイトル画面の「タップして開始」イベントを `loadData` / Firebase 初期化より前に即時バインド。
- Firebase SDK読込に失敗しても、ローカル/ソロモードは起動継続。
- `js/firebase-config.js` と `databaseURL` は維持。
- 追加ファイル:
  - `data/boot_fix_v88.json`


## v89 update
- 起動画面から進めない問題への強制対策。
- `app.js` が実行されなくても動く、HTML直書きの起動ガードを追加。
- タップ開始は `click` / `touchend` / `pointerup` のキャプチャで拾う。
- 左下に `HTML boot ready` / `HTML boot: menu` などの診断表示を追加。
- タイトルカードに `v89 html boot` を表示。
- ユーザーID保存、メニュー、戻るボタンも最低限HTML側でフォールバック。
- 追加ファイル:
  - `data/boot_fix_v89.json`


## v90 update
- 起動画面で完全無反応になる問題を再調査。
- `node --check` は通るため、構文エラーではなくブラウザ実行時のトップレベル例外が疑わしい。
- トップレベルで直接呼んでいた `localStorage` と `crypto.randomUUID()` を安全化。
- `safeGetLocalStorage` / `safeSetLocalStorage` / `safeRandomId` を追加。
- `tap-start` を `click` / `touchend` / `pointerup` で拾うよう強化。
- HTML直書き起動ガードも維持。
- タイトル画面に `v90 safe boot` 表示を追加。
- Firebase/RDB設定は維持。
- 追加ファイル:
  - `data/boot_fix_v90.json`


## v91 update
- v90で「入れるがカードや機能が未読込に見える」問題を修正。
- 原因:
  - HTML直書きfallbackが、`app.js` の `loadData` / `fillControls` / `bindEvents` 完了前でも画面遷移できた。
  - そのため、カードDBやイベントが未準備のままメニューへ入れてしまうことがあった。
- 修正:
  - タイトルタップ後、本体初期化完了まで待機。
  - 初期化完了後に user/menu へ遷移。
  - カードDBが0枚なら明示エラー表示。
  - v86ソロ効果テスト/プリセットデッキ/相手手札機能を維持。
  - v90の安全起動処理も維持。
- 確認:
  - cards.json cards: 1582
  - ソロテスト関数あり
  - プリセットデッキ関数あり
  - Firebase databaseURLあり
- 追加ファイル:
  - `data/boot_fix_v91_restore_features.json`


## v92 update
- v91で残っていた「ready前に入れてしまう」問題を修正。
- HTMLフォールバックの `showRaw` による user/menu/deckbuilder/battle 直接遷移を削除。
- ready前のタップは `v92 loading cards...` 表示のみ。
- `app.js` 初期化完了後だけ `user/menu` へ遷移。
- `show()` 自体にも ready gate を追加。
- `bindEvents` の二重登録を防止。
- ready表示は `v92 ready / cards 1582`。
- カードDBが0枚なら明示エラー。
- v86ソロ効果テスト/プリセット/相手手札機能は維持。
- 追加ファイル:
  - `data/boot_fix_v92_strict_ready_gate.json`


## v93 update
- 起動しない原因として出ていた Console error を修正。
- 修正対象:
  - `Uncaught SyntaxError: Identifier 'isAdventurerCard' has already been declared`
- 原因:
  - `isAdventurerCard` が app.js 内で2回 function 宣言されていた。
  - ES module ではこの時点で app.js 実行前に停止するため、ready gate も動かない。
- 修正:
  - 重複定義を削除し、統一版だけを残した。
  - function宣言名の重複スキャンで0件を確認。
- v92のstrict ready gate、v86ソロテスト/プリセット/相手手札機能は維持。
- 追加ファイル:
  - `data/boot_fix_v93_duplicate_function.json`


## v102 update
- v99-v101のソロUI追加で悪化したため、v93ベースへ戻して最小修正のみ入れ直し。
- 起動画面表示:
  - `v102 / buildable 1465 / total 1582`
- 方針:
  - 巨大な下部/左下ソロ専用手札UIを撤去。
  - 通常の `player-hand` だけを使う。
  - まず「見える・置ける・使える」を優先。
- 修正:
  - 自分手札追加/1枚ドロー/山札トップ追加は直接 `game.player` に反映して即再描画。
  - 敵/味方配置は最初の空きマスへ直接配置。
  - 相手手札は相手HUD横に小さく表示し、タップで一覧。
  - テンションは1ターン1回まで。
  - テンション3からスキル使用可、使用後0。
  - 戦士テンションはリーダー攻撃力+2/攻撃可能として補完。
- 追加ファイル:
  - `data/solo_minimal_fix_v102.json`


## v103 update
- 通常手札/盤面UIが反映されない問題が続いたため、コンパクトなソロ専用カード画像ストリップを追加。
- 起動画面表示:
  - `v103 / buildable 1465 / total 1582`
- 修正:
  - 自分手札と相手手札を下部の小さい画像ストリップで表示。
  - ソロパネルの主要ボタンをv103専用wireで直接game stateに反映。
  - 選択カードを手札へ、1枚ドロー、山札トップ、相手手札へ、敵/味方配置を直接処理。
  - 敵/味方配置は最初の空きマスへ直接配置。
  - テンション3ならテンションボタンでテンションスキルを発動。
  - 戦士テンションはリーダー攻撃力+2/攻撃可能として反映。
- 追加ファイル:
  - `data/solo_debug_strip_v103.json`


## v104 update
- v103のソロ処理が実行されていなかった原因を修正。
- 起動画面表示:
  - `v104 / buildable 1465 / total 1582`
- 原因:
  - v103の関数は存在していたが、`renderBattleArena()` がまだ v102 の関数を呼んでいた。
  - そのため、v103の手札ストリップ/ボタン接続/テンション処理が動いていなかった。
- 修正:
  - `renderBattleArena()` の呼び出し先を v104 系へ統一。
  - 古い v102 呼び出しを削除。
  - ソロ手札ストリップ描画を毎回呼ぶ。
  - ソロボタン接続を毎回呼ぶ。
  - テンション3時の発動先を `soloUseTensionSkillV104()` へ統一。
  - ソロ開始時テンションを0、`tensionUsedThisTurn=false` に固定。
- 追加ファイル:
  - `data/solo_call_fix_v104.json`


## v105 update
- v104でソロUIが動かなかった原因を修正。
- 起動画面表示:
  - `v105 / buildable 1465 / total 1582`
- 原因:
  - `renderEnemyHandVisualV104()` が自分自身を呼ぶ無限再帰になっていた。
  - `renderBattleArena()` の最後で落ち、手札ストリップ描画・ソロボタン接続・テンション処理まで到達していなかった。
- 修正:
  - 無限再帰を削除。
  - `afterRenderSoloV105()` でソロ後処理をtry/catch保護。
  - ソロボタンは毎回 `onclick/ontouchend` を上書きして接続。
  - テンションボタンも毎回 `onclick/ontouchend` を上書き。
  - ソロ開始時はMP1/1、テンション0。
- 追加ファイル:
  - `data/solo_recursion_wire_fix_v105.json`


## v106 update
- v105を細かく監査し、push前に残っていた問題を修正。
- 起動画面表示:
  - `v106 / buildable 1465 / total 1582`
- 監査結果:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `renderEnemyHandVisualV104()` の無限再帰: なし
  - 古い `soloWarriorTensionV102` 参照: 削除済み
- 修正:
  - ソロボタン処理を `soloSafeRunV106()` で包み、例外時にログ表示。
  - 手札追加/ドロー/配置/相手手札/テンション処理で必ず操作ログを出す。
  - ボタン接続は `onclick/ontouchend` を毎回上書き。
  - テンションボタンはテンション3ならスキル発動、それ未満なら通常テンション蓄積。
- 追加ファイル:
  - `data/solo_audited_controls_v106.json`


## v107 update
- v106のConsoleログで判明した未定義関数を修正。
- 起動画面表示:
  - `v107 / buildable 1465 / total 1582`
- 原因:
  - `getEffectiveCost()` と `parseKeywordFlags()` が `getCardText()` を呼んでいたが、v93系ベースでは未定義だった。
  - `soloUseTensionSkillV103()` が `ensureSoloGame()` を呼んでいたが、未定義だった。
  - 古い `addEventListener` で呼ばれる旧ソロ関数も残っており、直接エラーを投げていた。
- 修正:
  - `getCardText(card)` を復活。
  - `ensureSoloGame()` を復活。
  - `makeSoloUnitFromCardSafeV107()` を追加。
  - 旧ソロ関数も `soloSafeRunV106()` で包む安全版へ差し替え。
  - テンションスキル処理を安全版へ差し替え。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - 古い `soloWarriorTensionV102` 参照: なし
- 追加ファイル:
  - `data/solo_missing_helpers_fix_v107.json`


## v108 update
- v107の初期化エラー `can't find variable: startMatch` を修正。
- 起動画面表示:
  - `v108 / buildable 1465 / total 1582`
- 原因:
  - v107で旧ソロ関数を安全版に差し替える際、関数終端検出が甘く、`soloDamageEnemyAll()` の次にあった `startMatch()` まで巻き込んで削除していた。
- 修正:
  - v106から `async function startMatch()` を復元。
  - v107で追加した `getCardText()` / `ensureSoloGame()` は維持。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
  - `subscribeRoomPlayers`: 存在確認済み
  - 古い `soloWarriorTensionV102` 参照: なし
  - `renderEnemyHandVisualV104` 無限再帰: なし
- 追加ファイル:
  - `data/start_match_restore_v108.json`


## v109 update
- v108で機能が動き始めたため、今回は表示位置のみ整理。
- 起動画面表示:
  - `v109 / buildable 1465 / total 1582`
- 修正:
  - 上部の相手手札ミニ表示を非表示化。
  - 下部のソロ手札ストリップを右下寄せ・小型化・半透明化。
  - 自分手札/相手手札カードを小さくして盤面の邪魔を減らした。
  - ソロテストパネルの最大幅/最大高さを制限。
  - `v92 ready` 表示を v109 表示へ更新。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
  - `getCardText`: 存在確認済み
  - `ensureSoloGame`: 存在確認済み
- 追加ファイル:
  - `data/solo_layout_cleanup_v109.json`


## v110 update
- ソロ検証中に見つかったカードルール差分を修正。
- 起動画面表示:
  - `v110 / buildable 1465 / total 1582`
- 修正:
  - 相手手札ストリップのカードをクリック/タップすると相手盤面へ配置。
  - 手札上限10枚を実装。超過分は破棄扱い。
  - 武器カードは盤面配置ではなくリーダー装備。リーダー付近に武器バッジ表示。
  - コインは盤面配置不可。BET対象へ使う。
  - グランマーズの3択ドローで、選んだカードをコスト-2。
  - フォステイルのスキルリンク用に、ソロテンションスキル時も skillUse を発火。
  - スラリンガルの召喚時選択効果を反映。
  - コイン/ピサロナイトの生成専用・編成不可フラグを補強。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
  - `getCardText`: 存在確認済み
  - `ensureSoloGame`: 存在確認済み
- 追加ファイル:
  - `data/solo_rule_fixes_v110.json`


## v111 update
- v110のコインBET/武器/ユニット強化処理を修正。
- 起動画面表示:
  - `v111 / buildable 1465 / total 1582`
- 修正:
  - コインBETは武器優先ではなく、BETを持つ味方武器/味方ユニットから自由選択。
  - 武器装備中に別武器を装備した場合、旧武器を破棄。
  - リーダー攻撃後に武器耐久値-1、0で破壊・破棄。
  - 武器の攻撃後効果/破壊時効果入口を維持。
  - 自分以外の○○系味方ユニット+1/+1系の解析を追加。
  - 味方ユニット全体+X/+Y系の簡易解析を追加。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
- 追加ファイル:
  - `data/bet_weapon_buff_refine_v111.json`


## v112 update
- v111で残っていたコイン/武器の盤面配置扱いと、相手手札クリック不発を修正。
- 起動画面表示:
  - `v112 / buildable 1465 / total 1582`
- 修正:
  - コインは `cardType: ユニット` でも盤面配置不可。
  - 武器は盤面配置不可。
  - 手札クリック時、コイン/武器は召喚先選択ではなく使用処理へ送る。
  - ソロの敵配置/味方配置ボタンでも、コインは配置不可、武器はリーダー装備。
  - 相手手札ストリップのクリック接続を `wireSoloControlsV103()` 全体ごと整理。
  - 相手手札クリック時、ユニット/建物は敵盤面へ、武器は敵リーダー装備、コインは配置不可。
  - ダンジョン踏破時の `source` 未定義バグを修正。
  - ダンジョン踏破報酬ログを追加。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
- 追加ファイル:
  - `data/placement_guard_enemyhand_dungeon_v112.json`


## v113 update
- ソロ効果テストパネルの未使用カード操作UIを削除。
- 起動画面表示:
  - `v113 / buildable 1465 / total 1582`
- 削除:
  - カード検索欄
  - 選択カードを手札へ
  - 山札トップへ
  - 敵盤面へ配置
  - 味方盤面へ配置
  - 相手手札へ
  - 相手手札リセット
  - 相手手札表示
  - 敵全体1ダメ
  - 1枚ドロー
- 残したもの:
  - 相手HP∞
  - 相手HP25
  - MP10
  - テンションMAX
  - ログ消去
- 下部の自分手札/相手手札ストリップ操作は維持。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
- 追加ファイル:
  - `data/remove_solo_card_controls_v113.json`


## v114 update
- ソロ中に1人で両プレイヤーを交互に操作できるように変更。
- 起動画面表示:
  - `v114 / buildable 1465 / total 1582`
- 修正:
  - ソロ中のターン終了を、自分ターン→相手ターン→自分ターンの交互進行に変更。
  - ターン表示に現在操作側（自分/相手）を表示。
  - 相手ターン開始時、相手MPを増やし、相手が1枚ドロー。
  - 相手手札ストリップクリックで、相手側がカードを使用/配置可能。
  - 相手手札クリックをdocument捕捉イベントでも拾う。
  - 相手ターン中、相手ユニットクリックで攻撃対象選択。
  - 相手ユニット選択後、自分ユニット/自分リーダーを攻撃対象にできる。
  - v113で削除したカード操作パネルは削除状態を維持。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
- 追加ファイル:
  - `data/solo_two_side_turns_v114.json`


## v115 update
- v114で相手ターンから戻れない/相手ターン中に操作できない問題を修正。
- 起動画面表示:
  - `v115 / buildable 1465 / total 1582`
- 修正:
  - ソロ中は `isBattleLocked()` が `game.isMyTurn=false` で止まらないように変更。
  - ターン終了はソロ中なら必ず `soloEndTurnV114()` を最初に通す。
  - document捕捉イベントで `#end-turn-top` を拾い、相手ターン中でもターン終了できるようにした。
  - 相手手札クリック時の操作ログを追加。
  - ソロ中だけ通常の下部 `player-hand` を非表示化。
  - 下部のソロ手札ストリップは維持。
  - `startMatch` 復元済み。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
  - `subscribeRoomPlayers`: 存在確認済み
- 追加ファイル:
  - `data/solo_turn_lock_hide_hand_v115.json`


## v116 update
- v115で自分ターン終了すらできない問題を修正。
- 起動画面表示:
  - `v116 / buildable 1465 / total 1582`
- 修正:
  - ソロ中は `isBattleLocked()` が `matchLocked` や `game.isMyTurn=false` で止まらないように変更。
  - ソロ中のターン終了ボタンは常に有効化。
  - ターン終了ボタンの `onclick/ontouchend` を毎回 `soloEndTurnV114()` に直結。
  - document捕捉側でも `#end-turn-top` を `stopImmediatePropagation` 付きで拾う。
  - `soloEndTurnV114()` 実行時に `matchLocked` と `battle-locked` class を強制解除。
  - ソロ中は `game.isMyTurn=true` を維持し、既存処理に止められにくくした。
  - 相手初期手札枚数を自分の初期手札枚数と同じにした。
  - ソロ中だけ通常の下部 `player-hand` 非表示は維持。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
  - カード操作パネル削除状態: 維持
- 追加ファイル:
  - `data/solo_hard_turn_switch_v116.json`


## v117 update
- マヤ/グランマーズ/ソロターン終了を修正。
- 起動画面表示:
  - `v117 / buildable 1465 / total 1582`
- 修正:
  - マヤの「れんけい：2回攻撃を得る」を初期キーワード扱いしないように修正。
  - れんけい発動時だけ2回攻撃を付与する既存処理は維持。
  - グランマーズの3択ドローを、元カードID追加ではなくコスト-2コピー生成に変更。
  - グランマーズで引いたカードのコストが見えるよう、ソロ下部ストリップにコスト表示を追加。
  - 独立したソロ専用ターン切替ボタンを追加。
  - `soloEndTurnV114()` は hard switch 関数へ直結。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
- 追加ファイル:
  - `data/maya_grandmaz_turnfix_v117.json`


## v118 update
- 相手ターン中に相手手札を触れない/配置・特技使用できない問題を修正。
- 起動画面表示:
  - `v118 / buildable 1465 / total 1582`
- 修正:
  - 相手手札クリックを `pointerdown/click/touchend` のdocument捕捉で最優先に拾う。
  - 旧 `soloEnemyPlayCardV114()` は v118 処理へ委譲。
  - 相手手札のユニット/建物は敵盤面へ配置。
  - 相手手札の武器は敵リーダーへ装備。
  - 相手手札の特技は相手が使用できるようにした。
  - 対象が必要な相手特技は、自分ユニット/自分リーダークリックで解決。
  - 相手ターン外でもテスト用に相手手札クリック処理は拾う。
  - 相手手札ストリップのカードに pointer-events と強調CSSを追加。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
  - ソロ専用ターン切替ボタン: 維持
- 追加ファイル:
  - `data/enemy_hand_play_fix_v118.json`


## v119 update
- 中央の後付けソロターン切替ボタン削除、相手手札クリック、怪盗ポイックリン、対象待ち解除を修正。
- 起動画面表示:
  - `v119 / buildable 1465 / total 1582`
- 修正:
  - 中央付近の後付けソロターン切替ボタンを削除。
  - 相手手札ストリップのカードに `onpointerdown/onclick/ontouchend` のインラインハンドラを付与。
  - 相手手札クリック処理を v119 へ統一。
  - 怪盗ポイックリン召喚時に、相手手札からランダムコピーを自分手札へ追加し、その後自分手札1枚を選んで捨てる処理を追加。
  - 対象未選択の相手特技/汎用効果をソロターン終了時に解除。
  - ヒャド等で対象未選択のままターンを跨いでも、次ターンに対象待ちが残らないようにした。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
- 追加ファイル:
  - `data/enemy_hand_inline_poicklin_cleanup_v119.json`


## v120 update
- 相手手札クリック、イブール、残響のようじゅつし、ソロ画面レイアウトを修正。
- 起動画面表示:
  - `v120 / buildable 1465 / total 1582`
- 修正:
  - 相手手札クリックをv120処理へ強化。
  - カード単体のインラインイベントに加え、相手手札エリア親にもイベント委譲を追加。
  - 相手手札エリアに `pointerdown/pointerup/click/touchend` を設定。
  - イブールの召喚時/攻撃時に、イブールの本を相手デッキ一番上へ置く。
  - 残響のようじゅつし召喚時に、対戦中に使用した特技1枚をコピーし、同名特技の手札/デッキ内カードをコスト-1コピーへ置換。
  - 自分リーダーアイコンを左へ移動。
  - ソロ手札表示ウィンドウを左へ寄せ、ログが見えやすいように調整。
  - 中央の後付けターン切替ボタン削除状態を維持。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
- 追加ファイル:
  - `data/enemy_hand_ibuur_zankyo_layout_v120.json`


## v121 update
- 手札カード確認モーダル、相手配置先選択、ドラゴン死亡時、反撃、ホイミスライム、イブールの本、レイアウトを修正。
- 起動画面表示:
  - `v121 / buildable 1465 / total 1582`
- 修正:
  - 手札ストリップのカードタップを即使用ではなくカード確認モーダルに変更。
  - モーダルに「使用」「戻る」を追加。カード外タップでも戻る。
  - 相手手札は相手ターン中だけ使用可能。
  - 相手ユニット/建物は自動配置ではなく配置先マス選択式。
  - 武器/特技/王女の愛は盤面配置不可。
  - ドラゴン死亡時の王女の愛は召喚者から見て相手の手札へ入る。
  - 攻撃時、攻撃対象の攻撃力分の反撃ダメージを追加。
  - ホイミスライムの自分ターン終了時回復効果を追加。
  - イブールの本をコスト0、味方リーダー2ダメージ/敵リーダー2回復/1枚ドローに変更。
  - `assets/custom_cards/イブールの本.png` を追加。
  - 自分リーダーアイコンと手札表示ウィンドウ位置を調整。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
- 追加ファイル:
  - `data/modal_enemy_place_rules_core_v121.json`


## v122 update
- 手札カード確認モーダルを小さくして、使用/戻るボタンを押しやすく調整。
- 起動画面表示:
  - `v122 / buildable 1465 / total 1582`
- 修正:
  - モーダル幅を縮小。
  - カード画像の最大サイズを縮小。
  - 効果テキスト欄を小さくしスクロール可能化。
  - 使用/戻るボタンがモーダル内で見えるように固定。
  - 横画面スマホ向けにさらに小さめのサイズを指定。
  - ボタン/閉じるボタンのタップ判定を明示。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
- 追加ファイル:
  - `data/smaller_hand_preview_modal_v122.json`


## v123 update
- お告げのほこら、武器装備/耐久、反撃ダメージを修正。
- 起動画面表示:
  - `v123 / buildable 1465 / total 1582`
- 修正:
  - お告げのほこらの上/下選択を、選択後にドローする方式へ変更。
  - 「一番下に送る」は山札最下部へ移動する共通処理に整理。
  - 武器判定を強化し、生成武器/武器タグ/代表武器名も武器扱い。
  - こんぼうなど生成武器をcards.json上でも武器に補正。
  - 手札モーダルの使用時、武器はマス選択に入らず即リーダー装備。
  - 武器耐久値は攻撃1回ごとに-1、0で破壊。
  - 反撃ダメージ処理を1本化し、二重反撃の危険を削除。
  - リーダー横の武器表示を調整。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
  - `attackUnit`: 存在確認済み
  - 手札モーダル: 維持
- 追加ファイル:
  - `data/oracle_weapon_counter_fix_v123.json`


## v124 update
- ピサロナイト、分裂のツボ、あくまのカガミ、相手配置、占い師テンションスキルを修正。
- 起動画面表示:
  - `v124 / buildable 1465 / total 1582`
- 修正:
  - ピサロナイトを2コスト/3攻撃/2HPへ補正。
  - 分裂のツボは前ターンまで遡らず、このターン中に直前に使用したカードだけを参照。
  - このターン中に使用したカード記録をターン開始時にリセット。
  - あくまのカガミで出した冒険者に速攻を付けないように変更。
  - 相手ターン中、相手の空マスクリックでも配置先選択が通るように修正。
  - 占い師テンションスキルを「山札から特技カードを1枚引き、そのカードのコスト-1」に修正。
  - v122手札モーダル、v123武器/耐久/反撃修正は維持。
- 監査:
  - `node --check`: OK
  - 重複function宣言: 0件
  - `startMatch`: 存在確認済み
  - `attackUnit`: 存在確認済み
- 追加ファイル:
  - `data/turn_scoped_effects_fortune_tension_v124.json`


## v126 update
- v125の日本語ファイル名によるZIP内文字化けリスクを修正。
- 起動画面表示:
  - `v126 / buildable 1465 / total 1583`
- 修正:
  - `assets/custom_cards/イチゴ爆弾.png` 参照を廃止。
  - `assets/custom_cards/strawberry_bomb.png` に変更。
  - `cards.json` に `イチゴ爆弾` を正式追加。
  - v125の家族の絆/ホイミン/ヒャド/赤文字位置修正は維持。
- 追加ファイル:
  - `assets/custom_cards/strawberry_bomb.png`
  - `data/safe_ascii_assets_strawberry_v126.json`


## v127 update
- ヒャド使用時に敵ユニットを選択できず「相手ターン中だけ配置できます」が出る問題を修正。
- 起動画面表示:
  - `v127 / buildable 1465 / total 1583`
- 修正:
  - 敵ユニット対象効果を相手手札の配置待ちより優先。
  - 相手配置待ちは相手ターン中かつ空マスクリック時だけ反応。
  - 自分手札使用時に古い相手配置待ちをクリア。
  - v126の文字化け回避/イチゴ爆弾画像修正は維持。
- 追加ファイル:
  - `data/hyado_target_priority_fix_v127.json`


## v128 update
- ヒャドや攻撃対象選択で青ハイライトだけ残って進めない問題を修正。
- 起動画面表示:
  - `v128 / buildable 1465 / total 1583`
- 修正:
  - 効果対象/攻撃対象の処理を、古い相手配置待ちより優先。
  - selectedAttacker がある場合、対象ユニットへの攻撃を優先。
  - 対象選択中に空マスを押した場合、選択解除可能にした。
  - 手札ストリップ上に「選択解除」ボタンを追加。
  - 盤面外の無効な場所タップでも対象選択解除。
  - 手札モーダルを開くと古い選択状態をクリア。
- 追加ファイル:
  - `data/selection_recovery_guard_v128.json`


## v129 update
- v128で自分/相手それぞれの手札ユニットをマスに置けなくなった問題を修正。
- 起動画面表示:
  - `v129 / buildable 1465 / total 1583`
- 修正:
  - 空マスクリック時、手札配置待ちを対象選択解除より優先。
  - 自分ターン中、自分手札ユニット/建物を自分空マスへ配置可能に戻した。
  - 相手ターン中、相手手札ユニット/建物を相手空マスへ配置可能に戻した。
  - ヒャド/攻撃などの対象選択解除は、配置待ち処理の後に実行。
  - v128の選択解除機能は維持。
- 追加ファイル:
  - `data/restore_hand_placement_priority_v129.json`


## v130 update
- v129でも自分/相手の手札ユニットを配置できない問題を修正。
- 起動画面表示:
  - `v130 / buildable 1465 / total 1583`
- 修正:
  - 選択解除ガードの有効クリック判定に `.unit-slot` を追加。
  - 空マスクリックが選択解除ガードに横取りされないように修正。
  - 自分ターンの自分手札配置、相手ターンの相手手札配置をdocument captureで直接拾う保険を追加。
  - v129の配置優先順、v128の選択解除、v126の文字化け回避は維持。
- 追加ファイル:
  - `data/unit_slot_capture_fix_v130.json`


## v131 update
- あくまのカガミ、スラリンガル、ロミア表/裏選択、iPhone手札スワイプ誤タップを修正。
- 起動画面表示:
  - `v131 / buildable 1465 / total 1583`
- 修正:
  - あくまのカガミは山札+手札から5コスト以下の冒険者ユニットをランダム選出。
  - 選出元は破棄/死亡済みカードを含まない。元カードは抜かずコピーを場に出す。
  - 出たユニットに速攻を付与し、そのターン終了時にデッキへ戻す。
  - スラリンガルのターン終了時2倍と、召喚ターン中だけのダメージ無効解除をソロでも処理。
  - ロミアの表カードを画像付きで表示、裏カードは非公開表示。
  - 手札スワイプ後の誤タップ選択を移動量判定で抑制。
- 追加ファイル:
  - `data/akumano_slaringal_romia_swipe_v131.json`


## v132 update
- イチゴ爆弾、クイーンスライム、あくまのカガミ、セクシービーム系、黒竜丸、ジュリアンテを修正。
- 起動画面表示:
  - `v132 / buildable 1465 / total 1583`
- 追加ファイル:
  - `data/recruit_fortune_strawberry_fix_v132.json`


## v133 update
- 占い汎用エンジン、○○系ユニット効果、分類/未解釈レポート、iPhone手札スワイプ対策を追加。
- 起動画面表示:
  - `v133 / buildable 1465 / total 1583`
- 追加ファイル:
  - `data/fortune_audit_v133.json`
  - `data/fortune_unresolved_v133.json`
  - `data/tribe_effect_audit_v133.json`
  - `data/tribe_unknown_units_v133.json`


## v134 update
- ユーザー提供ルールを反映。
- 起動画面表示:
  - `v134 / buildable 1465 / total 1583`
- 修正:
  - 「出す」共通ルールを前列上→中→下、後列上→中→下の優先順に統一。
  - 絶好調ステータスを実装。攻撃で消費、再付与可能。
  - 系統エンジンをゾンビ/スライム/ドラゴン/冒険者に絞って補強。
  - 占い発動トリガー（ベルフェゴル/びっくりサタン/ケセランパセラン/ポムポムボム等）を補強。
  - iPhone手札スワイプ誤選択ガードをさらに強化。
- 追加ファイル:
  - `data/user_rule_notes_v134.txt`
  - `data/rules_summary_v134.json`
  - `data/tribe_unknown_units_v134.json`
  - `data/zekkocho_notes_v134.json`


## v135 update
- 系統分類に `魔王系` と `なし` を追加。
- 起動画面表示:
  - `v135 / buildable 1465 / total 1583`
- 修正:
  - cards.jsonの全ユニットに `tribes` / `tribe` / `tags` / `searchText` を補完。
  - 系統判定エンジンを `ゾンビ / スライム / ドラゴン / 冒険者 / 魔王 / なし` に拡張。
  - 分類に迷う候補を `data/tribe_classification_unresolved_v135.json` に出力。
- 追加ファイル:
  - `data/tribe_classification_v135.json`
  - `data/tribe_classification_unresolved_v135.json`
  - `data/rules_summary_v135.json`


## v136 update
- 系統分類を「1ユニット最大1系統」に修正。
- 起動画面表示:
  - `v136 / buildable 1465 / total 1583`
- 修正:
  - cards.json の全ユニット `tribes` を単一配列に統一。
  - `tribe` も単一文字列に統一。
  - 系統効果エンジンは `tribes[0]` を正として判定。
  - 魔王系・なしを含めて分類し直し。
  - 不明候補のみ `data/tribe_classification_unresolved_v136.json` に出力。
- 追加ファイル:
  - `data/tribe_classification_v136.json`
  - `data/tribe_classification_unresolved_v136.json`
  - `data/rules_summary_v136.json`


## v137 update
- v136で「なし」に寄せた分類について、手動確認用ファイルを追加。
- 起動画面表示:
  - `v137 / buildable 1465 / total 1583`
- 追加ファイル:
  - `data/tribe_review_candidates_v137.json`
  - `data/tribe_review_candidates_v137.txt`
  - `data/tribe_review_candidates_v137.csv`
  - `data/tribe_review_quick_v137.json`
- 注意:
  - ゲーム挙動の分類自体はv136から変更していません。
  - ここで確認した回答を元に、次版でcards.jsonへ正式反映します。


## v138 update
- ユーザー回答を反映し、特技/ヒーローカードを系統分類候補から除外。
- 起動画面表示:
  - `v138 / buildable 1460 / total 1583`
- 修正:
  - manualAnswer が特技/とくぎのカードは cardType=特技、系統情報なし。
  - manualAnswer がヒーローカードのカードは cardType=ヒーロー、系統情報なし。
  - manualAnswer がなしのユニットは tribe=なし。
  - 新しい確認候補は cardType=ユニット かつ attack/hp を持つカードのみに限定。
- 追加ファイル:
  - `data/manual_answers_applied_v138.json`
  - `data/tribe_review_candidates_v138.json`
  - `data/tribe_review_candidates_v138.txt`
  - `data/tribe_review_candidates_v138.csv`
  - `data/non_unit_removed_from_tribe_review_v138.json`


## v139 update
- ユーザー提供のゾンビ系・スライム系リストを正式反映。
- 起動画面表示:
  - `v139 / buildable 1460 / total 1583`
- 追加ファイル:
  - `data/manual_tribe_zombie_slime_applied_v139.json`
  - `data/tribe_review_candidates_v139.json`
  - `data/tribe_review_candidates_v139.txt`
  - `data/tribe_review_candidates_v139.csv`
  - `data/tribe_classification_v139.json`


## v140 update
- ユーザー提供のドラゴン系・冒険者・魔王系リストを正式反映。
- 起動画面表示:
  - `v140 / buildable 1460 / total 1583`
- 追加ファイル:
  - `data/manual_tribe_dragon_adventurer_maou_applied_v140.json`
  - `data/tribe_review_candidates_v140.json`
  - `data/tribe_review_candidates_v140.txt`
  - `data/tribe_review_candidates_v140.csv`
  - `data/tribe_classification_v140.json`


## v142 update
- ドランゴ例外処理を保持。
- 起動画面表示:
  - `v142 / buildable 1460 / total 1583`
- 修正:
  - `extraTribes` を系統効果判定で参照。
  - 残り「なし」ユニットを公式DB/カード画像下部確認用の作業リストに整理。
  - 過去の仮分類が混ざる `searchText` からの自動分類は避けた。
- 追加ファイル:
  - `data/drango_extra_tribe_v142.json`
  - `data/official_db_image_check_targets_v142.json`
  - `data/tribe_review_candidates_v142.json`
  - `data/tribe_review_candidates_v142.txt`
  - `data/tribe_review_candidates_v142.csv`
  - `data/tribe_classification_v142.json`


## v143 update
- 公式DB/カード画像確認 batch1。
- 起動画面表示:
  - `v143 / buildable 1460 / total 1583`
- 修正:
  - 公式DB直リンクがある残り候補のうち、10件を画像確認し「なし」維持として監査マーク付け。
  - 画像取得/クリック不安定な6件を未確定として記録。
- 追加ファイル:
  - `data/official_db_image_checked_batch1_v143.json`
  - `data/tribe_review_candidates_v143.json`
  - `data/tribe_review_candidates_v143.txt`


## v144 update
- v143未確定6件をユーザー回答により「なし」で確定。
- 起動画面表示:
  - `v144 / buildable 1460 / total 1583`
- 修正:
  - キラーアーマー / わらいぶくろ / なげきムーン / ツンドラキー / シールドオーガ / レッドアーチャー を「なし確認済み」に監査マーク付け。
  - 今後の画像/DB確認方針を `data/image_db_check_policy_v144.json` に追加。
  - 残り確認候補を再生成。
- 追加ファイル:
  - `data/manual_none_answers_applied_v144.json`
  - `data/image_db_check_policy_v144.json`
  - `data/tribe_review_candidates_v144.json`
  - `data/tribe_review_candidates_v144.txt`
  - `data/tribe_classification_v144.json`


## v145 update
- 公式DB/カード画像確認 batch2。
- 起動画面表示:
  - `v146 / buildable 1460 / total 1583`
- 修正:
  - ドラキー / いたずらもぐら / おばけキャンドル / モーモン / おばけヒトデ / おおくちばし / ゆめにゅうどう を「なし確認済み」に監査マーク付け。
  - 残り確認候補を再生成。
- 追加ファイル:
  - `data/official_db_image_checked_batch2_v145.json`
  - `data/tribe_review_candidates_v145.json`
  - `data/tribe_review_candidates_v145.txt`
  - `data/tribe_classification_v145.json`
