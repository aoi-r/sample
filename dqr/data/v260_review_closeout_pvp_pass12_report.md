# v260 review closeout / PvP pass12

ベース: `v259_remaining_priority_pass11`

## 目的

v259でREVIEW扱いに残していた `運命の分岐点` / `ブラッドナイフ` / `妖精サンディ` と、ユーザー確認対象の `トーマ王子` を、対戦エミュレータで検査できる状態まで固める。

## 実装・修正

### トーマ王子

- 召喚時4択を v260側で明示的に処理。
- `虚無の剣`: 正面（同じ行の敵前列・後列）を封印し、それぞれ2ダメージ。
- `無我の心`: 使用者のテンション+3。
- `鉄壁の盾`: トーマ王子自身を除く味方ユニットに、次に受けるダメージ-2相当の軽減を付与。
- `追憶の呪縛`: 正面の敵ユニットを攻撃不可にし、敵リーダーも次ターン攻撃不可。カードを1枚引く。
- `tohmaChoiceV260` actionで相手側クライアントにも状態を同期。

### 運命の分岐点

- v259では最初の空き地形に自動配置されていたため、v260でモーダル選択に変更。
- 味方空きマス6箇所から選択し、選んだマスを `天啓の神域` に変更。
- `terrainSetV260` actionで対戦相手側の `enemyTerrain` に同期。

### ブラッドナイフ

- 装備時に `counterDamageReduction=1` を武器へ付与。
- 敵ユニットを攻撃した後、この武器の攻撃力+1。
- 攻撃力上昇は `weaponUpdateV260` actionで相手側へ同期。
- 反撃ダメージ-1と攻撃後強化の両方を対戦検査。

### 妖精サンディ

- `手札から捨てた時` に場へ出す経路を補強。
- 死亡時の耐久+1対象を **ダンジョンのみ** に限定。
- 通常の建物は耐久+1しない。
- ダンジョン耐久+1と踏破時サンディ追加フラグを `sandyDungeonBuffV260` actionで同期。

## 検査結果

- v260 review closeout PvP/emulator tests: **20 passed / 0 failed**
- node --check js/app.js: **OK**
- function重複宣言: **0件**
- v259 remaining priority browser tests: **11 passed / 0 failed**
- v258 counter/kandakobun/merchant PvP tests: **10 passed / 0 failed**
- v256 maiyu/slimefever PvP tests: **5 passed / 0 failed**
- v255 combat/dolmages PvP tests: **10 passed / 0 failed**
- v248 2クライアント疑似対戦: **14 passed / 0 failed**

## 結論

v259のREVIEW対象はv260で全てclose。PENDING/REVIEW扱いのカードは残していない。

実Firebase本番に別IPで接続した検査ではなく、2つのChromium/CDPクライアントを使った対戦エミュレータ/action replay検査で確認した。
