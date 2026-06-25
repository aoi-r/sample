# v258 Kandakobun + Merchant Priority Pass10

## Summary
- Base: v257_priest_martial_priority_pass9
- v257 PENDING: 122
- v258 implemented/confirmed from pending: 31
- v258 PENDING remaining: 55
- node --check js/app.js: OK
- duplicate function declarations: 0

## User correction applied
### カンダタこぶん
BET effect is now limited to: **during the current turn only, the next action that charges tension by +1 costs 0 instead of 1.**
It does not apply to tension skill usage, because tension skill use is already 0 cost once tension is full. If the zero-cost charge is not used before turn end, it is cleared.

## Previously noted behaviors verified
- ブオーン: attack splash to all other enemies and enemy leader.
- 魔道士ウルノーガ: enemy healing is converted into damage while he is in the front row.
- 転生の祈り: adds GET(1), then revives an enemy-death-pool unit whose cost is within current coin count.
- アクバー: when another friendly unit dies, it is revived and receives a vanish-on-death flag.

## Merchant pending batch implemented
- つちわらし: ターン終了時に前後へ自身コピーを出すフラグを実装。
- しあわせの巻物: 対象ユニット+1/+1後、道具カード1枚を手札に追加。
- 変化の杖: 対象ユニットをコスト-1のランダムユニットへ変身。召喚時は発動しない。
- 商人のそろばん: 味方リーダーがこの武器攻撃で敵ユニットを倒した後、道具カード1枚追加。
- 封印の杖: 対象ユニットを封印。
- かなしばりの杖: 敵縦一列を次ターン攻撃不能にする処理を追加。
- バロンジャッカル: 手札6枚以上なら実効コスト-2。
- キラーマジンガ: 2回攻撃と、手札6枚以上時のランダム敵2ダメージ×4を実装。
- たたかいのドラム: 全味方ユニット攻撃力+1、スキルブースト分追加。
- しあわせの杖: 味方ユニット1体をコスト+2のランダムユニットへ変身。
- たからのにおい: 選択した横一列の地形を宝箱へ変更。
- てんばつの杖: 対象ユニットに味方ユニット数分ダメージ。
- まほうのそろばん: 味方ユニットが敵リーダーを攻撃した後、そのユニットをコスト+1ランダム変身、武器耐久-1。
- メタルの巻物: メタルボディ/ハードメタルボディ持ちランダムカードを手札に追加。
- 祈りの巻物: 味方縦一列を+1/+1。
- 超しあわせの杖: 必殺技。全味方ユニットをコスト+2ランダム変身。
- 大砲の壺: 敵ユニット1体に2ダメージ後、道具カード1枚追加。
- てっきゅうまじん: 場と手札の冒険者数だけ実効コスト低下。
- 豪商のそろばん: 場と手札の冒険者数だけ実効コスト低下。
- いやしのうでわ: 味方ユニット1体へ攻撃時リーダー4回復を付与。
- おたからさがしのすず: 道具カード3枚を手札に追加。
- さつじんえい: 死亡時に道具カード1枚を手札へ追加。
- スタミナのたね: 味方ユニット1体を+2/+2後、HP2回復。
- かなしばりの巻物: 敵ユニット1体を封印し、次ターン終了時まで攻撃不能。
- ドラゴメタル: メタルボディ基礎キーワード確認。
- きせきのきのみ: 対象ユニットの攻撃力とHPを2倍。
- 炎のメイジドラキー: 死亡時、正面の敵ユニットへ自身の攻撃力分ダメージ。
- さくせんがえ: 味方縦一列にさくせんを出す処理を追加。
- 魔神機キラーマジンガ: 2回攻撃、ターン終了時2点×2、手札6枚以上時に自身追加を実装。
- 打ち出のそろばん: この武器で攻撃後、ランダムな商人特技を手札に追加。
- モンスターハウスだ!: 自分側に4〜6、相手側に2〜4のランダム非冒険者ユニットを最大6体ずつ場に出す。


## Tests
- v258_counter_kandakobun_merchant_pvp_tests.py: 10 passed / 0 failed
- v257_priest_priority_browser_tests.py: passed
- v256_maiyu_slimefever_pvp_tests.py: passed
- v255_combat_dolmages_pvp_tests.py: passed
- v248_chappy_pvp_emulator_tests.py: passed
- v237_static_emulator_tests.mjs: passed
- v240_static_pool_tests.mjs: passed
- v246_duplicate_trigger_audit_tests.mjs: passed

## Remaining caution / not implemented in this pass
- しあわせのそろばん: needs correct hook for “friendly unit enters play”, not attack. Left pending.
- ルドマン: BET count trigger and hand/deck summon needs a dedicated BET counter check.
- 亡国の先王ロウ: requires tracking cost>=1 spell usage and same-cost random unit put-into-play.
- 不思議のダンジョン: dungeon durability progress and completion reward should be integrated with building/dungeon engine.
- メタルのそろばん: leader metal-body timing needs combat damage-reduction path confirmation.


## Demon swordsman v258b additions
- 闇の束縛: ユニット1体を-2/-2。
- 闇への供物: 味方ユニット1体を死亡させ、1ドローと最大MP+1。
- いてつくはどう: 全敵ユニットを封印。
- 魔王の眼光: ユニット1体の攻撃力-4。
- シュバルツシュルト: 召喚時、他の味方ユニット数だけドロー。
- 魔界の雷: 敵ユニット1体に2ダメージ、死亡した場合ピサロナイト3体。
- デスゴーゴン: このユニットの攻撃で敵ユニット死亡時、HPを超えた分を敵リーダーへ。
- ダークマター: 全ユニットを死亡させる。
- 進化の秘法: デスピサロ進化フラグと味方リーダー8回復。
- ゼルドラド: 召喚時、自身以外の味方攻撃力+2、敵ユニット攻撃力-2。
- 増幅する闇: ユニット1体を+4/+4。スキルブースト側コスト減は既存コスト計算に委ねる。
- ぐんたいアリ: 死亡時、アイアンアントをこのマスに出す処理を確認。
- ソウルイーター: 味方ユニット1体を死亡させ、その攻撃力分リーダー回復し1ドロー。
- 死への誘い: 攻撃力1以下+スキルブースト分のユニットを死亡させる。
- 亡者の執念: 全味方ユニットに死亡時1/2アンデッドマン召喚を付与。
- 冥府の門: 1/2アンデッドマンを2体出す。
- 終焉の波動: 全ユニットを-2/-2、スキルブースト分さらに-1/-1。
- スパイクヘッド: 召喚時、相手が1ドロー。
- 魔力の継承: 横一列の全ユニットに死亡時1ドローを付与。
- 闇の咆哮: ランダム敵ユニット-3/-3、全味方ユニットを絶好調に戻す。
- プチターク: 召喚時攻撃力8ユニットサーチ、死亡時全リーダー/ユニットに1ダメージ。
- 地獄への生贄: 味方ユニット1体を死亡させ3ドロー。
- どくあおむし: 召喚時、敵ユニット1体を毒にする対象選択を設定。
- 激昂の犠牲: 味方ユニット1体を死亡させ、テンション+3。
- エビルプリースト: 究極生物進化フラグ、魔王デッキ化フラグ、テンション-3。
- 魔王への生贄: ユニット1体を消滅。
- ジゴデイン: 横一列の敵ユニットと敵リーダーに5ダメージ。
- 絶望の再来: 死亡した味方魔王系ユニットをランダムに2枚まで手札へ。
- 魔剣士の交換所: コイン消費景品と1ドロー処理を追加。
- 雫の洗礼: ユニット1体を封印し1ダメージ。
- どくどくビンゴ: GET(1)後、手札コイン数分ランダム敵ユニットを毒。
- 黄金兵長: 召喚時GET(1)。攻撃時効果は既存実装を確認。
- 悪夢招来: 7コスト以上ランダムユニットを2体出す。
- 邪竜軍王ガリンガ: 死亡味方ユニット数によるコスト低下と超過ダメージ処理。
- プチさまようよろい: 死亡時、ピサロナイトを手札に加える。
- 魔元帥ゼルドラド: 召喚時全敵毒、敵ユニット攻撃力-1、毒ダメージ+1フラグ。

## v258b test note
After the v258b additions, node --check js/app.js, v258 browser/PvP tests, v246 duplicate tests, and the existing v248/v255/v256/v257 suites were rerun and passed.
