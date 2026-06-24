# v231 公式DB突合 第1段階監査

## 目的

既存デッキからランダムで「場に出る」「手札に加わる」可能性がある3プール（コスト2ユニット、コスト3ユニット、ドラゴン系ユニット）を、公式DB由来のカード名/コスト/ステータス/効果文/公式URLと、現在の実装証跡に照合した第1段階の台帳。

この版ではコード修正は行わず、可能な限り広い範囲を一括で棚卸しすることを優先。

## 件数

|項目|件数|
|---|---:|
|監査行数（プール重複込み）|500|
|cost2_unit_random_pool|215|
|cost3_unit_random_pool|208|
|dragon_unit_random_pool|77|

## 公式DB参照状態

|状態|件数|
|---|---:|
|official_detail_url_present_in_cards_json|491|
|official_detail_url_missing|9|

## 優先度別

|優先度|件数|意味|
|---|---:|---|
|D_LOW_RISK_EVIDENCE_OK|214|効果なし/基本キーワード/既実装証跡あり。低リスク。|
|A_COMPLEX_NAME_ONLY|118|複合効果だが、現状は名前出現のみ。最優先で公式文面と実装を確認。|
|B_NAME_ONLY_RECHECK|80|名前出現はあるが実装レポート追跡なし。中優先で確認。|
|B_RECENTLY_FIXED_RECHECK|38|直近修正済み。公式文面どおりか再テスト。|
|C_COMPLEX_BUT_HAS_EVIDENCE|28|実装証跡はあるが複合効果なので実機確認推奨。|
|A_NEEDS_EFFECT_REVIEW|13|v230時点で明示的に効果レビューが必要。|
|A_OFFICIAL_URL_MISSING|9|公式DB詳細URL未付与。名前検索で公式ID確認が先。|

## プール別 優先度内訳

### cost2_unit_random_pool
|優先度|件数|
|---|---:|
|A_COMPLEX_NAME_ONLY|75|
|D_LOW_RISK_EVIDENCE_OK|67|
|B_NAME_ONLY_RECHECK|46|
|B_RECENTLY_FIXED_RECHECK|16|
|C_COMPLEX_BUT_HAS_EVIDENCE|9|
|A_OFFICIAL_URL_MISSING|2|

### cost3_unit_random_pool
|優先度|件数|
|---|---:|
|D_LOW_RISK_EVIDENCE_OK|135|
|C_COMPLEX_BUT_HAS_EVIDENCE|19|
|A_COMPLEX_NAME_ONLY|17|
|B_RECENTLY_FIXED_RECHECK|15|
|A_NEEDS_EFFECT_REVIEW|12|
|B_NAME_ONLY_RECHECK|9|
|A_OFFICIAL_URL_MISSING|1|

### dragon_unit_random_pool
|優先度|件数|
|---|---:|
|A_COMPLEX_NAME_ONLY|26|
|B_NAME_ONLY_RECHECK|25|
|D_LOW_RISK_EVIDENCE_OK|12|
|B_RECENTLY_FIXED_RECHECK|7|
|A_OFFICIAL_URL_MISSING|6|
|A_NEEDS_EFFECT_REVIEW|1|

## 最優先A例

### A_COMPLEX_NAME_ONLY
|pool|name|effect|next|
|---|---|---|---|
|cost2_unit_random_pool|あくましんかん|占い：(1)「死亡時：この場所に復活する」を得る(2)におうだちHP+1|通常/必中/超必中、占い(1)/(2)誘発リスナーを確認。|
|cost2_unit_random_pool|あくまの書|れんけい：自分の手札のコスト2以下のユニットカードを2枚選び、そのコピーを手札に加える。ターン終了時、この効果で加えたカードが手札にあれば破棄する。|テンション3条件のみ・テンション非消費・対象/場に出す/召喚時不発を確認。|
|cost2_unit_random_pool|あばれザル|絶好調、死亡時：このユニットが絶好調状態ならカードを1枚引く|死亡時のみ。消滅/変身/手札戻しでは発動しないことを確認。|
|cost2_unit_random_pool|あばれ足鳥|占い:(1)速攻と貫通を得る、(2)+1/+1|通常/必中/超必中、占い(1)/(2)誘発リスナーを確認。|
|cost2_unit_random_pool|おおきづち|テンションリンク：このターン中攻撃力+2|公式文面どおり個別実装の有無を確認。|
|cost2_unit_random_pool|おおにわとり|召喚時：ランダムなコスト2以下の味方建物1つの耐久値+1、味方建物がないなら自分のデッキからコスト2以下の建物カードを1枚引く|手札から召喚時のみ発動。ランダムで場に出た場合に発動しないことを確認。|
|cost2_unit_random_pool|おにびドングリ|召喚時:このターン中ユニットが死亡しているなら魔力開放1枚を手札に加える|手札から召喚時のみ発動。ランダムで場に出た場合に発動しないことを確認。|
|cost2_unit_random_pool|かくれんぼう|ステルス、れんけい：カードを1枚引く|テンション3条件のみ・テンション非消費・対象/場に出す/召喚時不発を確認。|
|cost2_unit_random_pool|きめんどうし|召喚時：自分のデッキの上からカードを2枚見る。1枚をデッキの上に戻し残りをデッキの下に戻す。|手札から召喚時のみ発動。ランダムで場に出た場合に発動しないことを確認。|
|cost2_unit_random_pool|きりかぶおばけ|召喚時：GET(1)。BET：1ターンに1回のみ、他のランダムな味方ユニットのHP+2。|GET/BET入口、1ターン1回制限、累積カウント、コイン消費時誘発を確認。|
|cost2_unit_random_pool|しましまキャット|召喚時&死亡時：しあわせのたね1枚を手札に加える|手札から召喚時のみ発動。ランダムで場に出た場合に発動しないことを確認。|
|cost2_unit_random_pool|とらおとこ|召喚時:地形マスに召喚された場合+1/+1|手札から召喚時のみ発動。ランダムで場に出た場合に発動しないことを確認。|

### A_NEEDS_EFFECT_REVIEW
|pool|name|effect|next|
|---|---|---|---|
|cost3_unit_random_pool|からくりエッグ|パワフルバッジ：メタルボディもしくはハードメタルボディを持つ味方ユニットと武器の攻撃力+1|常在/バッジ再計算、後出し反映、場を離れた時の解除を確認。|
|cost3_unit_random_pool|ごうけつぐま|絶好調、このユニットが絶好調状態なら攻撃力+2と「敵リーダーを攻撃できない」を得る|公式文面どおり個別実装の有無を確認。|
|cost3_unit_random_pool|てつのさそり|パワフルバッジ：スライム系の味方ユニットのHP+1|常在/バッジ再計算、後出し反映、場を離れた時の解除を確認。|
|cost3_unit_random_pool|オーガー|天啓の神域の効果によってデッキから手札にこのカードが加わった場合、ランダムな敵ユニットに3ダメージ|公式文面どおり個別実装の有無を確認。|
|cost3_unit_random_pool|ガスト|パワフルバッジ：ゾンビ系の味方ユニットのHP+1|常在/バッジ再計算、後出し反映、場を離れた時の解除を確認。|
|cost3_unit_random_pool|グレムリン|味方が回復する度攻撃力+1|公式文面どおり個別実装の有無を確認。|
|cost3_unit_random_pool|ケムケムベス|絶好調、このユニットは絶好調状態ではない場合攻撃できない|公式文面どおり個別実装の有無を確認。|
|cost3_unit_random_pool|ストーンビースト|絶好調、このユニットが絶好調状態なら攻撃力+2とにおうだちを得る|公式文面どおり個別実装の有無を確認。|
|cost3_unit_random_pool|ダックスビル|パワフルバッジ：ドラゴン系の味方ユニットのHP+1|常在/バッジ再計算、後出し反映、場を離れた時の解除を確認。|
|cost3_unit_random_pool|デビルウィザード|パワフルバッジ：ゾンビ系の味方ユニットの攻撃力+1|常在/バッジ再計算、後出し反映、場を離れた時の解除を確認。|
|cost3_unit_random_pool|ビッグボック|占い:(1)味方リーダーのテンション+1、このユニットのHP+1、(2)味方リーダーのテンション+2|通常/必中/超必中、占い(1)/(2)誘発リスナーを確認。|
|cost3_unit_random_pool|ライノソルジャー|スキルブースト：HP+1|公式文面どおり個別実装の有無を確認。|

### A_OFFICIAL_URL_MISSING
|pool|name|effect|next|
|---|---|---|---|
|cost2_unit_random_pool|とさかヘビ|召喚時：自分のデッキの上からカード4枚を見る。ドラゴン系のカードを1枚選びそれを引く。残りをデッキの下に戻す。|公式DB詳細URLの再取得が先。名前検索で公式IDを確認してから実装照合。|
|cost2_unit_random_pool|リザードキッズ|攻撃時：このターン中攻撃力-3。|公式DB詳細URLの再取得が先。名前検索で公式IDを確認してから実装照合。|
|cost3_unit_random_pool|サウルスロード|選択：・特技ダメージ+1を得る ・武器ダメージ+1を得る|公式DB詳細URLの再取得が先。名前検索で公式IDを確認してから実装照合。|
|dragon_unit_random_pool|とさかヘビ|召喚時：自分のデッキの上からカード4枚を見る。ドラゴン系のカードを1枚選びそれを引く。残りをデッキの下に戻す。|公式DB詳細URLの再取得が先。名前検索で公式IDを確認してから実装照合。|
|dragon_unit_random_pool|リザードキッズ|攻撃時：このターン中攻撃力-3。|公式DB詳細URLの再取得が先。名前検索で公式IDを確認してから実装照合。|
|dragon_unit_random_pool|サウルスロード|選択：・特技ダメージ+1を得る ・武器ダメージ+1を得る|公式DB詳細URLの再取得が先。名前検索で公式IDを確認してから実装照合。|
|dragon_unit_random_pool|ギガントドラゴン|召喚時：敵の前列か後列を選び、縦一列の全ての敵ユニットに1ダメージ。味方の場か手札に攻撃力4以上の自身を除いたドラゴン系ユニットがいるなら、代わりに2ダメージ。|公式DB詳細URLの再取得が先。名前検索で公式IDを確認してから実装照合。|
|dragon_unit_random_pool|ガメゴンロード|におうだち。召喚時：自分の場か手札に攻撃力4以上の他のドラゴン系がいるなら特技：メラミを1枚手札に加える。|公式DB詳細URLの再取得が先。名前検索で公式IDを確認してから実装照合。|
|dragon_unit_random_pool|ドラゴンブッシュ|特技ダメージ+1。召喚時：自分の場か手札に攻撃力4以上の他のドラゴン系がいるなら特技ダメージ+1を得る。|公式DB詳細URLの再取得が先。名前検索で公式IDを確認してから実装照合。|

## 次の作業単位

1. `A_OFFICIAL_URL_MISSING` 9行を公式DB名前検索で補完。

2. `A_COMPLEX_NAME_ONLY` と `A_NEEDS_EFFECT_REVIEW` を、コスト2→コスト3→ドラゴン系の順で潰す。

3. 捨てる系、場に出す/召喚時、常在/パワフルバッジ、占い/れんけい/BET/GETは、特に実装取り違えが起きやすいので個別テストを必須にする。

## 出力ファイル

- `data/v231_official_pool_crosscheck_pass1.csv` : 全500行の監査台帳

- `data/v231_priority_fix_queue.csv` : A優先＋直近修正再確認キュー

- `data/v231_official_pool_crosscheck_pass1.json` : 機械処理用
