# v257 priest/martial priority pass9

## Summary
- Base: v256_maiyu_move_counter_slimefever_pass8
- Handled: 39 cards from remaining PENDING queue
- PENDING before: 161
- PENDING after: 122
- node --check js/app.js: OK
- Duplicate function declarations: 0

## Implemented / confirmed cards
- 武闘家の交換所: IMPLEMENTED_OR_CONFIRMED_V257 - コイン1/2/3枚交換モーダルを追加。ちからの指輪/シルバークロー/ほしふるうでわを生成し、その後1ドロー。
- カンダタこぶん: IMPLEMENTED_WITH_REVIEW_V257 - 召喚時GET(1)と「次に使用するテンションカード0コスト」フラグを追加。BET発動経路全体との結合は継続検査対象。
- ブオーン: IMPLEMENTED_WITH_REVIEW_V257 - スキルブースト分コスト低下、移動/手札戻り耐性フラグ、攻撃時の他全敵同時ダメージを追加。既存の全戻し/移動経路がフラグを必ず尊重するかは継続検査。
- 百獣の王キングレオ: IMPLEMENTED_OR_CONFIRMED_V257 - 味方へのさくせん付与回数を加算し、その回数分手札コスト低下する経路を補強。
- パワースナイプ: IMPLEMENTED_OR_CONFIRMED_V257 - 敵ユニット/敵リーダーへ2ダメージ対象選択。
- スカラ: IMPLEMENTED_OR_CONFIRMED_V257 - ユニット1体のHP+3対象選択。
- 皮肉な笑い: IMPLEMENTED_OR_CONFIRMED_V257 - ユニット1体の攻撃力を現在HPと同じ値にする対象選択。
- ふゆうじゅ: IMPLEMENTED_OR_CONFIRMED_V257 - 死亡時、ランダムな味方ユニット1体のHP+1。
- ザラキ: IMPLEMENTED_OR_CONFIRMED_V257 - 選択した敵ユニットと同じ縦一列の敵ユニットを死亡。
- いやしの風: IMPLEMENTED_OR_CONFIRMED_V257 - おうえん後、ダメージを受けているランダムな味方1体を1回復×2。
- 福音の杖: IMPLEMENTED_OR_CONFIRMED_V257 - テンションリンクでダメージを受けているランダムな味方1体を2回復し、武器耐久-1。
- 妖精の祝福: IMPLEMENTED_OR_CONFIRMED_V257 - 対象味方ユニットの横一列を+1/+1後、各HP2回復。
- いやしの雨: IMPLEMENTED_OR_CONFIRMED_V257 - 敵味方全体を2回復。魔道士ウルノーガの回復ダメージ変換にも対応。
- 聖銀のレイピア: IMPLEMENTED_OR_CONFIRMED_V257 - 味方が回復する度、このターン中武器攻撃力+1。ターン終了で戻す。
- 魔道士ウルノーガ: IMPLEMENTED_WITH_REVIEW_V257 - 前列常在として敵の回復をダメージ化。前列にいる場合の敵ユニット死亡時1ドローを追加。敵側クライアントの回復経路は継続検査。
- スクルト: IMPLEMENTED_OR_CONFIRMED_V257 - 選択ユニットと同じ縦一列にいる全ユニットのHP+2。
- しっぷうのレイピア: IMPLEMENTED_OR_CONFIRMED_V257 - 自分の武器が壊れた時、ランダムなドラゴン系ユニットカードを手札に加える。
- 竜のうろこ: IMPLEMENTED_OR_CONFIRMED_V257 - ユニット1体を+1/+2。対象がドラゴン系なら1ドロー。
- せいれいのうた: IMPLEMENTED_OR_CONFIRMED_V257 - 死亡した3コスト以下味方ユニットを3体+スキルブースト分ランダム復活。
- ニードルショット: IMPLEMENTED_OR_CONFIRMED_V257 - 必殺技。攻撃力3以下の敵ユニット1体を死亡。
- ふっかつの杖: IMPLEMENTED_OR_CONFIRMED_V257 - 味方リーダー攻撃後、死亡したランダムな味方ユニット1体を復活。
- ミラクルソード: IMPLEMENTED_OR_CONFIRMED_V257 - ユニット1体に3ダメージ後、ランダムな味方1体を2回復。
- アモールの雨: IMPLEMENTED_OR_CONFIRMED_V257 - 全ての味方ユニットと味方リーダーのHPを2回復。
- シャイニングボウ: IMPLEMENTED_OR_CONFIRMED_V257 - 必殺技。以後、味方ユニット回復時にランダムな敵1体へ1ダメージ。使用時2ドロー。
- はくあいの杖: IMPLEMENTED_OR_CONFIRMED_V257 - 味方リーダー攻撃後、全味方ユニットを1回復。
- 友愛の心: IMPLEMENTED_OR_CONFIRMED_V257 - 敵ユニット1体の攻撃力-3。味方冒険者がいるなら-6。
- バギマ: IMPLEMENTED_OR_CONFIRMED_V257 - 敵ユニット縦一列に1ダメージ。味方冒険者がいるなら3ダメージ。
- 転生の祈り: IMPLEMENTED_WITH_REVIEW_V257 - GET(1)後、手札コイン枚数以下のコストで死亡した敵ユニットの最大コスト候補を復活。v257以降の敵死亡プールを記録。
- 僧侶の交換所: IMPLEMENTED_OR_CONFIRMED_V257 - コイン1/2/3枚交換モーダルを追加。福音の杖/エロスの弓/しんぴのよろいを生成し、その後1ドロー。
- ズッシード: IMPLEMENTED_OR_CONFIRMED_V257 - 全味方ユニットにHP+1と移動/手札戻り耐性フラグを付与。
- マリンフェアリー: IMPLEMENTED_OR_CONFIRMED_V257 - 召喚時、手札コインを1枚捨てた場合、死亡した4コスト以下味方ユニット候補から復活。
- テンペラーソード: IMPLEMENTED_OR_CONFIRMED_V257 - 味方リーダー攻撃後、テンション+1。
- アクバー: IMPLEMENTED_WITH_REVIEW_V257 - 他の味方ユニット死亡時、そのユニットを復活させ、死亡時効果不発の消滅相当フラグを付与。完全な消滅ログ/死亡プール除外は継続検査。
- 共鳴のどんぐりベビー: IMPLEMENTED_OR_CONFIRMED_V257 - 召喚時、味方テンションと同じ攻撃力。死亡時、攻撃力3以上なら1ドロー。
- 執念のひとくいサーベル: IMPLEMENTED_OR_CONFIRMED_V257 - 死亡時、山札からコスト4以下の武器カードをランダムに1枚引く。
- ザオの杖: IMPLEMENTED_OR_CONFIRMED_V257 - 味方リーダー攻撃後、死亡したコスト2以下のランダムな味方ユニット1体を復活。
- スライムジェネラル: IMPLEMENTED_OR_CONFIRMED_V257 - おうえん、召喚時に味方リーダーのテンションスキルを将軍の秘技へ変更。将軍の秘技は味方ユニット+1/+1、スライム系なら+2/+2。
- ザラキーマ: IMPLEMENTED_OR_CONFIRMED_V257 - ランダムな敵ユニット3体を死亡。スキルブースト分コスト低下。
- 怨恨のバラモスゾンビ: IMPLEMENTED_OR_CONFIRMED_V257 - 死亡時、ランダムな敵ユニット1体を死亡、味方テンション+2。復活回数分コスト低下。

## Review notes to keep visible
- カンダタこぶん: 召喚時GET(1)と「次に使用するテンションカード0コスト」フラグを追加。BET発動経路全体との結合は継続検査対象。
- ブオーン: スキルブースト分コスト低下、移動/手札戻り耐性フラグ、攻撃時の他全敵同時ダメージを追加。既存の全戻し/移動経路がフラグを必ず尊重するかは継続検査。
- 魔道士ウルノーガ: 前列常在として敵の回復をダメージ化。前列にいる場合の敵ユニット死亡時1ドローを追加。敵側クライアントの回復経路は継続検査。
- 転生の祈り: GET(1)後、手札コイン枚数以下のコストで死亡した敵ユニットの最大コスト候補を復活。v257以降の敵死亡プールを記録。
- アクバー: 他の味方ユニット死亡時、そのユニットを復活させ、死亡時効果不発の消滅相当フラグを付与。完全な消滅ログ/死亡プール除外は継続検査。

## Emulator/static tests
- v237: 11 passed / 0 failed
- v240: 12 passed / 0 failed
- v248: 14 passed / 0 failed
- v255: 10 passed / 0 failed
- v256: 5 passed / 0 failed
- v257: 5 passed / 0 failed
- v246: 12 passed / 0 failed
