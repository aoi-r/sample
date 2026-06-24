# v239 cost6/7 existing-runtime bucket closeout

## 目的
v238で「既存実装あり・実動作確認待ち」だった43件を、公式DB/カードテキストに照らして再分類し、怪しかったものを補強。

## 修正
- マルティナ: 召喚時、敵前列/後列のいずれか1列をランダム選択し、その列のランダムなマスへ1ダメージを7回割り振る。空マスは不発。
- ヒドラ: 対戦中に自分の手札から捨てたカード枚数を再評価し、2枚以上=貫通、4枚以上=速攻、6枚以上=2回攻撃を得る。召喚時だけでなく捨てるたび/常在更新でも再評価。

## 結果
- v238の43件 runtime-check bucket は 0 件へ。
- ブラウザUI検査はv238のポリシーブロックを受け、v239でも複数URL方式で再試行しログ化。

## 43件一覧
- テラノライナー: basic_keyword_or_no_effect_confirmed / 速攻
- おにこんぼう: basic_keyword_or_no_effect_confirmed / 効果なし
- ガメゴン: basic_keyword_or_no_effect_confirmed / におうだち
- ドラゴンゾンビ: existing_code_path_confirmed / 死亡時：正面にいる全ての敵ユニットに3ダメージ
- ドラゴンガイア: existing_code_path_confirmed / 召喚時：次の相手のターン終了時まで全ての味方は相手の特技ダメージを受けない
- やまたのおろち: existing_code_path_confirmed / 召喚時：味方ユニット1体を死亡させる そのユニットのコスト分攻撃力とHPが上がる
- ハーゴン: existing_code_path_confirmed / 召喚時：冒険者ユニット1体を1/1の犬に変える
- マルティナ: v239_hardened / 召喚時：合計7ダメージを縦1列のランダムなマスに割り振る
- りゅうおう: existing_code_path_confirmed / 死亡時：正体をあらわす
- デンデン竜: basic_keyword_or_no_effect_confirmed / におうだち、おうえん
- ブラックドラゴン: existing_code_path_confirmed / 召喚時:ランダムな敵ユニット1体に1ダメージ。このカードを除く自分の場と手札にいるドラゴン系の数の3倍分与えるダメージが増える。
- ドラゴンロード: existing_code_path_confirmed / 場に出ている間、このユニットを除くドラゴン系の味方ユニット全てを+1/+1。場に出ている間、自分の手札にあるドラゴン系ユニットカードの使用コスト-1。
- 覇海軍王ジャコラ: existing_code_path_confirmed / におうだち、召喚時：このターン中すべてのユニットが受ける戦闘ダメージが2倍になる
- 全てを滅ぼす者ゾーマ: basic_keyword_or_no_effect_confirmed / 超貫通
- ミリオンゼニー: existing_code_path_confirmed / 自分のターン終了時にGET(1)。この効果は毎ターン発動する。BET：死亡時にGET(2)をこのユニットに付与する。このBET効果は重複しない。
- グレイトマムー: existing_code_path_confirmed / れんけい：敵ユニット1体に5ダメージ
- ウルノーガ&ウルナーガ: existing_code_path_confirmed / れんけい：前列に召喚した場合、正面にいるランダムな敵ユニット1体を消滅させる。後列に召喚した場合、攻撃力6以上の他ユニット全てを死亡させる。
- エルギオス: existing_code_path_confirmed / ねらい撃ち、召喚時：このユニットに4回さくせんを出す
- アトラス: existing_code_path_confirmed / 攻撃時：このターン中味方リーダーの攻撃力分攻撃力が上がる
- まかいファイター: existing_code_path_confirmed / 召喚時：GET(1)、BET：このターン中味方リーダーの攻撃力+1、このBETが4回発動する度まかいファイターを1体だす
- アイラ: existing_code_path_confirmed / 召喚時：GET(2)。BET：ランダムな武器を味方リーダーに装備する。
- オリハルゴン: existing_code_path_confirmed / 自分のターン中味方リーダーは攻撃力+3を得る。前列にいる場合味方リーダーが受けるダメージ-2
- ようじゅつし: existing_code_path_confirmed / 自分が特技を使う度ランダムな敵1体に2ダメージ
- バーバラ: existing_code_path_confirmed / 召喚時:残りMPを全て消費する。 全ての敵に消費したMPの数分ダメージを与える。
- アークマージ: existing_code_path_confirmed / この対戦の間ヒーロースキルが発動した回数分攻撃力+1を得る。このユニットの攻撃力が5以上の場合さらに特技ダメージ+2を得る。
- クラーゴン: existing_code_path_confirmed / BET：このターン中に未発動の効果からランダムに1つ発動する。①全ての敵に1ダメージ ②ランダムな敵1体に2ダメージ ③敵リーダーに3ダメージ。全て発動済みなら何も起こらない。
- ドルマドン: existing_code_path_confirmed / 敵1体に10ダメージ
- 竜将ドラゴンガイア: existing_code_path_confirmed / 召喚時：手札にコスト3以上の特技カードがあるなら縦一列にいる全ての敵ユニットに2ダメージ、それらのユニットを次のターン終了時まで攻撃不能にする
- ドラゴンバゲージ: existing_code_path_confirmed / におうだち、自分のターン終了時味方リーダーのテンション+1
- グレイナル: existing_code_path_confirmed / 召喚時：竜戦士の装具を手札に加える。ドラゴン系の味方ユニットが攻撃して敵ユニットを倒す度味方リーダーのテンション+1
- ガメゴンレジェンド: existing_code_path_confirmed / におうだち、召喚時：ランダムな敵1体に1ダメージ。これを3回繰り返す。スキルブースト：繰り返す回数+1
- まだらイチョウ: existing_code_path_confirmed / BET：1/2のブラックタヌーを1体場に出す。このBETが3回発動する度に、このユニットを除く全ての味方ユニットを+1/+1する。カウントはターンを跨いで継続する。
- スラリンガル: existing_code_path_confirmed / 貫通、選択:+1/+1と速攻とこのターン中「敵リーダーを攻撃できずダメージを受けない」を得る。・このターンの終了時攻撃力とHPが2倍になる
- ジュリアンテ: existing_code_path_confirmed / 占い：(1)他の全ての味方ユニット+2/+2、(2)ランダムな敵3体を次のターン攻撃不能にする
- マーニャ: existing_code_path_confirmed / 召喚時:デッキの1版上のカードのコストが4以上ならドラゴラムを使う。 4以下ならそのカードのコストを0にして手札に加える。
- ダースドラゴン: basic_keyword_or_no_effect_confirmed / 効果なし
- あくまのカガミ: existing_code_path_confirmed / 召喚時：自分のデッキにある5コスト以下の冒険者と同じユニット1体ヲバに出しこのターン中速攻と「ターン終了時にこのユニットを自分のデッキに混ぜる」を付与する
- キラーマシン2: existing_code_path_confirmed / 2回攻撃、召喚時:このユニットにさくせんを出す。耐戦中に味方建物が3つ以上出ていたら、代わりに2回さくせんを出し、出たさくせんの効果全てを得る
- ホメロス: existing_code_path_confirmed / 召喚時:HPが2以下の敵ユニット1体を味方にする
- 黄金兵長: existing_code_path_confirmed / 召喚時：GET(1)。攻撃時：敵リーダーに味方の場のピサロナイトの数と同じダメージ。BET：ピサロナイトを1体場に出す。
- ワイバーンドッグ: existing_code_path_confirmed / 召喚時：ダメージを受けている全ての敵ユニットに3ダメージ、れんけい：さらにダメージを受けていない全てのユニットに1ダメージ
- ヒドラ: v239_hardened / このユニットは子の耐戦中に自分の手札から捨てたカードの枚数により以下の効果を得る。2枚以上:貫通、4枚以上:速攻、6枚以上:2回攻撃
- ドラゴンブッシュ: existing_code_path_confirmed / 特技ダメージ+1。召喚時：自分の場か手札に攻撃力4以上の他のドラゴン系がいるなら特技ダメージ+1を得る。
## 検査結果
- `node --check js/app.js`: OK
- `node tools/v237_static_emulator_tests.mjs`: 11 passed / 0 failed
- `node tools/v238_static_cost67_tests.mjs`: 8 passed / 0 failed
- `node tools/v239_static_cost67_existing43_tests.mjs`: 9 passed / 0 failed

## ブラウザ再試行
`tools/v239_browser_retry_matrix.py` で file / 127.0.0.1 / localhost / data URL の4方式を試行。
すべて Chromium の管理ポリシーでブロックされ、JS実行以前に `chrome-error://chromewebdata/` へ遷移した。
このため、ブラウザUI検査は環境制限で未到達。詳細は `data/v239_browser_retry_matrix.json`。
