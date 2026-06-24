# v230 target pool coverage audit

目的: 既存デッキ・ランダム効果から場に出る/手札に入る可能性があるプールを固定し、効果実装の網羅状況を確認する。

対象: コスト2ユニット、コスト3ユニット、ドラゴン系ユニット。

重要: `name_in_app_js=yes` は「コードに名前が出る」だけで、公式挙動完全一致を保証しない。次フェーズでは公式DB本文と1枚ずつ照合する。

## Summary

### cost2_unit_random_pool: 215件

- REVIEW_NAME_MENTIONED_ONLY: 125

- OK_TRACKED_IMPLEMENTED: 78

- OK_GENERIC_BASIC_KEYWORD: 9

- OK_EFFECT_NONE: 3

### cost3_unit_random_pool: 208件

- OK_TRACKED_IMPLEMENTED: 153

- REVIEW_NAME_MENTIONED_ONLY: 28

- NEEDS_EFFECT_REVIEW: 12

- OK_GENERIC_BASIC_KEYWORD: 10

- OK_EFFECT_NONE: 5

### dragon_unit_random_pool: 77件

- REVIEW_NAME_MENTIONED_ONLY: 58

- OK_TRACKED_IMPLEMENTED: 11

- OK_EFFECT_NONE: 7

- NEEDS_EFFECT_REVIEW: 1


## 優先レビュー候補

- [cost2_unit_random_pool] あくましんかん / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=占い：(1)「死亡時：この場所に復活する」を得る(2)におうだちHP+1 / official=https://gameconductor.com/dqrivals/c/d/1003

- [cost2_unit_random_pool] あくまのめだま / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：次に場に出る魔王系の味方ユニットにねらい撃ちと攻撃力+1を付与する / official=https://gameconductor.com/dqrivals/c/d/1080

- [cost2_unit_random_pool] あくまの書 / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=れんけい：自分の手札のコスト2以下のユニットカードを2枚選び、そのコピーを手札に加える。ターン終了時、この効果で加えたカードが手札にあれば破棄する。 / official=https://gameconductor.com/dqrivals/c/d/1256

- [cost2_unit_random_pool] あばれザル / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=絶好調、死亡時：このユニットが絶好調状態ならカードを1枚引く / official=https://gameconductor.com/dqrivals/c/d/873

- [cost2_unit_random_pool] あばれ足鳥 / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=占い:(1)速攻と貫通を得る、(2)+1/+1 / official=https://gameconductor.com/dqrivals/c/d/1293

- [cost2_unit_random_pool] おおがらす / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=死亡時：カードを1枚引く / official=https://gameconductor.com/dqrivals/c/d/354

- [cost2_unit_random_pool] おおきづち / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=テンションリンク：このターン中攻撃力+2 / official=https://gameconductor.com/dqrivals/c/d/54

- [cost2_unit_random_pool] おおにわとり / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：ランダムなコスト2以下の味方建物1つの耐久値+1、味方建物がないなら自分のデッキからコスト2以下の建物カードを1枚引く / official=https://gameconductor.com/dqrivals/c/d/1362

- [cost2_unit_random_pool] おおめだま / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時:全てのユニットのステルスを解除する。解除した数分+1/+2を得る。 / official=https://gameconductor.com/dqrivals/c/d/788

- [cost2_unit_random_pool] おおドラキー / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=ねらい撃ち、召喚時：味方ヒーローがいる場合2/1のドラキーを1体出す / official=https://gameconductor.com/dqrivals/c/d/844

- [cost2_unit_random_pool] おにびドングリ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時:このターン中ユニットが死亡しているなら魔力開放1枚を手札に加える / official=https://gameconductor.com/dqrivals/c/d/1300

- [cost2_unit_random_pool] かくれんぼう / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=ステルス、れんけい：カードを1枚引く / official=https://gameconductor.com/dqrivals/c/d/1329

- [cost2_unit_random_pool] きめんどうし / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：自分のデッキの上からカードを2枚見る。1枚をデッキの上に戻し残りをデッキの下に戻す。 / official=https://gameconductor.com/dqrivals/c/d/319

- [cost2_unit_random_pool] きりかぶおばけ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：GET(1)。BET：1ターンに1回のみ、他のランダムな味方ユニットのHP+2。 / official=https://gameconductor.com/dqrivals/c/d/1124

- [cost2_unit_random_pool] くらやみハーピー / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：ユニット1体のHPを攻撃力と同じ値にする / official=https://gameconductor.com/dqrivals/c/d/1027

- [cost2_unit_random_pool] しましまキャット / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時&死亡時：しあわせのたね1枚を手札に加える / official=https://gameconductor.com/dqrivals/c/d/1522

- [cost2_unit_random_pool] たけやりへい / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：このターン中ユニット1体の攻撃力+2 / official=https://gameconductor.com/dqrivals/c/d/51

- [cost2_unit_random_pool] つむりんママ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=このユニットを除くスライム系の味方ユニットの攻撃力+1 / official=https://gameconductor.com/dqrivals/c/d/1173

- [cost2_unit_random_pool] とうろうへい / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：このターン中味方リーダーの攻撃力+1 / official=https://gameconductor.com/dqrivals/c/d/169

- [cost2_unit_random_pool] とさかヘビ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：自分のデッキの上からカード4枚を見る。ドラゴン系のカードを1枚選びそれを引く。残りをデッキの下に戻す。 / official=

- [cost2_unit_random_pool] とらおとこ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時:地形マスに召喚された場合+1/+1 / official=https://gameconductor.com/dqrivals/c/d/509

- [cost2_unit_random_pool] どくどくゾンビ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：ゾンビ系の味方ユニット1体を+1/+1 / official=https://gameconductor.com/dqrivals/c/d/602

- [cost2_unit_random_pool] どくろあらい / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=攻撃対象が敵リーダーの場合このターン中攻撃力+2 / official=https://gameconductor.com/dqrivals/c/d/235

- [cost2_unit_random_pool] はえおとこ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=死亡時：相手リーダーのテンション+1 / official=https://gameconductor.com/dqrivals/c/d/380

- [cost2_unit_random_pool] はなカワセミ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=パワフルバッジ：スライム系のユニットカードを使う度味方リーダーのHPを1回復 / official=https://gameconductor.com/dqrivals/c/d/577

- [cost2_unit_random_pool] ぷちメタル / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=メタルボディ、BET:1ターンに1回のみ攻撃力+1と速攻を得る、自分のターン終了時GET(1)、この効果は一度しか発動しない / official=https://gameconductor.com/dqrivals/c/d/1200

- [cost2_unit_random_pool] ほしふるうでわ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=ユニット1体に「攻撃力が4以下の間速攻と2回攻撃を得る」を付与する / official=https://gameconductor.com/dqrivals/c/d/1151

- [cost2_unit_random_pool] まおうのかめん / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=このカードは場と手札にある間魔王系としても扱う。 召喚時:自分の手札に魔王系カードがあるならステルスを得る / official=https://gameconductor.com/dqrivals/c/d/1459

- [cost2_unit_random_pool] まおうのたまご / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=死亡時：自分のデッキから本来のコストが5以上の魔王系のユニットカードをランダムに1枚手札に加える / official=https://gameconductor.com/dqrivals/c/d/1030

- [cost2_unit_random_pool] まどうし / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=攻撃時：このターン中特技ダメージ+1を得る / official=https://gameconductor.com/dqrivals/c/d/990

- [cost2_unit_random_pool] むつでエビ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時:相手の手札が3枚以下の場合HP+1とにおうだちを得る / official=https://gameconductor.com/dqrivals/c/d/424

- [cost2_unit_random_pool] もりもりベス / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=れんけい：味方の1マスを選択し、2/1のスライムベスを1体出す。 / official=https://gameconductor.com/dqrivals/c/d/1266

- [cost2_unit_random_pool] やみのとうぞく / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時:相手のデッキのランダムなカードと同じカード1枚を手札に加える / official=https://gameconductor.com/dqrivals/c/d/1427

- [cost2_unit_random_pool] よるのていおう / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=テンションリンク：後列にいるランダムな敵ユニット1体を前列のランダムな空きマスに移動させる / official=https://gameconductor.com/dqrivals/c/d/62

- [cost2_unit_random_pool] わたぼう / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=ターンを終了したプレイヤーはカードを1枚引く / official=https://gameconductor.com/dqrivals/c/d/145

- [cost2_unit_random_pool] わらいぶくろ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：カードを1枚引く / official=https://gameconductor.com/dqrivals/c/d/20

- [cost2_unit_random_pool] アルゴリザード / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=速攻、れんけい：敵ユニット1体に2ダメージ / official=https://gameconductor.com/dqrivals/c/d/1246

- [cost2_unit_random_pool] イエローシックル / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=正面にいるユニットと戦闘をする場合このターン中攻撃力+2 / official=https://gameconductor.com/dqrivals/c/d/61

- [cost2_unit_random_pool] インプ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：GET(1)。BET：デッキの一番上が偶数コストなら敵リーダーに2ダメージ。このユニットへのBETは1ターン1回 / official=https://gameconductor.com/dqrivals/c/d/1162

- [cost2_unit_random_pool] エビルポット / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=熟練度(0)、おうえん、死亡時:自分のデッキの上7枚から熟練度を持つカードを1枚引く。残りをデッキの下に戻す。(2)攻撃力+1 / official=https://gameconductor.com/dqrivals/c/d/1582

- [cost2_unit_random_pool] エマ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時:次の相手のターン終了時までステルスを得る。味方リーダーが攻撃した後やくそうを手札に加え味方リーダーのMPを1回復 / official=https://gameconductor.com/dqrivals/c/d/1311

- [cost2_unit_random_pool] オコボルト / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=におうだち、召喚時：敵リーダーがパワフルバッジを持つ場合+2/+2 / official=https://gameconductor.com/dqrivals/c/d/761

- [cost2_unit_random_pool] カンダタこぶん / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：GET(1)。BET：このターン中、次に使用するテンションカードのコストが0になる。 / official=https://gameconductor.com/dqrivals/c/d/1149

- [cost2_unit_random_pool] キラーG / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=貫通、ステルス、死亡時：味方建物があるならカードを1枚引く / official=https://gameconductor.com/dqrivals/c/d/1341

- [cost2_unit_random_pool] キラーグース / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=おうえん、召喚時：相手は50%の確率でカードを1枚引く / official=https://gameconductor.com/dqrivals/c/d/397

- [cost2_unit_random_pool] ギズモ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：GET(1) BET:正面にいる全ての敵ユニットに1ダメージ / official=https://gameconductor.com/dqrivals/c/d/1099

- [cost2_unit_random_pool] クックルー / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=死亡時：道具カード1枚を手札に加える / official=https://gameconductor.com/dqrivals/c/d/295

- [cost2_unit_random_pool] クロウズ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時:味方リーダーは必中モードになる。攻撃時:デッキの1番上のカードを見てデッキの一番下に移動させることができる。 / official=https://gameconductor.com/dqrivals/c/d/829

- [cost2_unit_random_pool] グリズリー / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時:味方リーダーのテンションの数以下の攻撃力を持つ前列の味方ユニット1体を相手の手札に戻す。 / official=https://gameconductor.com/dqrivals/c/d/519

- [cost2_unit_random_pool] ケダモン / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=速攻、召喚時:このターン中味方リーダーが攻撃力+1を得る / official=https://gameconductor.com/dqrivals/c/d/929

- [cost2_unit_random_pool] サタンパピー / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時:このターン中ユニットが死亡しているなら敵ユニット1体を-2/-2 / official=https://gameconductor.com/dqrivals/c/d/1542

- [cost2_unit_random_pool] ザイル / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=死亡時&手札から捨てた時:はるかぜのフルートを1枚手札に加える / official=https://gameconductor.com/dqrivals/c/d/1408

- [cost2_unit_random_pool] ジュエルン / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：自分のデッキからコスト3以下の建物カードを1枚引く。そのカードのコストを-1 / official=https://gameconductor.com/dqrivals/c/d/1368

- [cost2_unit_random_pool] スノーム / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=ステルス、召喚時：スノームを1体出す / official=https://gameconductor.com/dqrivals/c/d/1553

- [cost2_unit_random_pool] スノーモン / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=死亡時：敵のランダムな空きマスに氷塊を1つ出す / official=https://gameconductor.com/dqrivals/c/d/451

- [cost2_unit_random_pool] スピンサタン / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時:自分が次に使用する占いカードは発動する効果を選べる 味方リーダーが必中モードの場合手札のこのカードのコスト-1 / official=https://gameconductor.com/dqrivals/c/d/1292

- [cost2_unit_random_pool] スライムスノー / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：自分のデッキにメラ系の特技カードが無いならこのユニットは特技ダメージ+1を得る。その後カードを1枚引く / official=https://gameconductor.com/dqrivals/c/d/1255

- [cost2_unit_random_pool] ソードファントム / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=シンクロ:①ステルス、②死亡時:全てのユニットに1ダメージ、③攻撃力+2 / official=https://gameconductor.com/dqrivals/c/d/963

- [cost2_unit_random_pool] タイプG / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=スキルブースト:+1/+1、自身の攻撃力にあわせて場にいる間、以下の効果を得る。 攻撃力3以上:貫通、攻撃力5以上:ねらい撃ち、攻撃力10以上:2回攻撃 / official=https://gameconductor.com/dqrivals/c/d/1283

- [cost2_unit_random_pool] ダンスニードル / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=貫通、貫通を持つ他の全ての味方ユニットの攻撃力+1 / official=https://gameconductor.com/dqrivals/c/d/948

- [cost2_unit_random_pool] ダークプラネット / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=選択：・ダンジョンではない敵建物１つの耐久値を2にする。・ダンジョンではない敵建物1つの耐久値を-2 / official=https://gameconductor.com/dqrivals/c/d/1460

- [cost2_unit_random_pool] ダークホビット / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=熟練度(0)、(3)におうだち+1/+1 / official=https://gameconductor.com/dqrivals/c/d/1580

- [cost2_unit_random_pool] チャゴス王子 / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：GET(1)。BET：速攻を得る。このユニットが攻撃対象として選択された時、手札に戻る / official=https://gameconductor.com/dqrivals/c/d/1182

- [cost2_unit_random_pool] チョコタワー / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：自分の手札から1枚選んで捨てた後カードを1枚引く / official=https://gameconductor.com/dqrivals/c/d/1328

- [cost2_unit_random_pool] デスフラッター / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：自分のデッキの上からカード4枚を見る。ユニットカード以外のカードを1枚選び、それを引く。残りをデッキの下に戻す / official=https://gameconductor.com/dqrivals/c/d/1350

- [cost2_unit_random_pool] デッドペッカー / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=絶好調、速攻、このユニットが絶好調状態なら攻撃力+1を得る / official=https://gameconductor.com/dqrivals/c/d/914

- [cost2_unit_random_pool] デビルパピヨン / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：GET(1)。BET：ランダムな敵ユニット1体を毒にする / official=https://gameconductor.com/dqrivals/c/d/1134

- [cost2_unit_random_pool] トンネラー / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=におうだち、れんけい：+1/+1 / official=https://gameconductor.com/dqrivals/c/d/1234

- [cost2_unit_random_pool] ニセたいこう / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：次に場に出る魔王系の味方ユニットににおうだちを付与する / official=https://gameconductor.com/dqrivals/c/d/1022

- [cost2_unit_random_pool] ヒートギズモ / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=前列召喚時：正面にいる敵ユニットに2ダメージ、後列召喚時：味方リーダーのテンション+1 / official=https://gameconductor.com/dqrivals/c/d/1396

- [cost2_unit_random_pool] ビッグスロース / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=自分がコスト1以下の手札を使う度+1/+1 / official=https://gameconductor.com/dqrivals/c/d/236

- [cost2_unit_random_pool] ピサロのてさき / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=絶好調、死亡時：このユニットが絶好調状態ならこの場所にピサロナイトを出す / official=https://gameconductor.com/dqrivals/c/d/887

- [cost2_unit_random_pool] ピンクモーモン / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=このユニットの攻撃で与えたダメージ分味方リーダーのHPを回復する / official=https://gameconductor.com/dqrivals/c/d/266

- [cost2_unit_random_pool] フーセンドラゴン / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=におうだち / official=https://gameconductor.com/dqrivals/c/d/1424

- [cost2_unit_random_pool] ブラックマンティス / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=におうだち、召喚時：敵ユニット1体の攻撃力-1 / official=https://gameconductor.com/dqrivals/c/d/1087

- [cost2_unit_random_pool] ブラッドソード / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=死亡時：味方ヒーローがいる場合自分のデッキからコスト2以下の武器を装備する。 / official=https://gameconductor.com/dqrivals/c/d/794

- [cost2_unit_random_pool] プオーン / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=召喚時：自分のデッキからコストが最も高い武闘家のカードを手札に1枚加える / official=https://gameconductor.com/dqrivals/c/d/902

- [cost2_unit_random_pool] プチヒーロー / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=シンクロ:①HP+1、②攻撃力+1、③HP+1 / official=https://gameconductor.com/dqrivals/c/d/912

- [cost2_unit_random_pool] プテラノドン / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=死亡時：自分のデッキからコストが4以下の冒険者カードをランダムに1枚手札に加える / official=https://gameconductor.com/dqrivals/c/d/978

- [cost2_unit_random_pool] プヨンターゲット / status=REVIEW_NAME_MENTIONED_ONLY / cost=2 / text=におうだち / official=https://gameconductor.com/dqrivals/c/d/813
