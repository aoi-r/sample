# v259 remaining priority pass11

Base: v258_kandakobun_merchant_priority_pass10

## Summary

- v258 PENDING at start: 55
- DONE in v259: 52
- REVIEW/partial in v259: 3
- remaining PENDING after v259: 0
- node --check js/app.js: OK
- duplicate function declaration check: OK

## Main implementations

- トーマ王子: 虚無の剣 / 無我の心 / 鉄壁の盾 / 追憶の呪縛
- さんぞくのカシラ: さんぞく兵 / さんぞくマージ / さんぞく / エテポンゲ creation + strategy assignment
- 不思議のダンジョン and しあわせの箱
- 二刀の心得・壱 / 二刀の心得・弐
- 竜の胎動 / 竜の逆鱗 / ドラゴンプッシュ alias
- メタルのそろばん / メタルキングの剣 / しあわせのそろばん
- デスストーカー / ヘラクライザー / 亡国の先王ロウ / ルドマン
- 占い師系: 天変地異, タロットシャッフル, 運命の導き, タロットフリング, 占い師の交換所 etc.
- 盗賊系: カイロスハント, 心眼一閃, 王家のナイフ, あくまのツボ, おたからさがし etc.
- イル＆ルカ系たまご: スライム/ゾンビ/ドラゴン/魔王/英雄/冒険者

## Browser/emulator tests

- v259: 11 passed / 0 failed / exceptions 0
- v258: 10 passed / 0 failed / exceptions 0
- v256: 5 passed / 0 failed / exceptions 0
- v255: 10 passed / 0 failed / exceptions 0
- v248: 14 passed / 0 failed / exceptions 0
- v237: 11 passed / 0 failed
- v240: 12 passed / 0 failed
- v246: 12 passed / 0 failed

## REVIEW items

- 運命の分岐点: 天啓の神域を空き地形に配置。対象指定UIは継続改善対象。
- ブラッドナイフ: 敵ユニット攻撃後、武器攻撃力+1。反撃ダメージ-1は継続検査。
- 妖精サンディ: ステルス、死亡時に味方ダンジョン耐久+1と踏破報酬付与。手札破棄時召喚は継続。

## DONE cards

- せいぎのそろばん
- メタルのそろばん
- ルドマン
- 亡国の先王ロウ
- しあわせのそろばん
- 不思議のダンジョン
- 悪夢の訪れ
- 天変地異
- つむじかぜ
- タロットシャッフル
- メイジドラキー
- 戦車のタロット
- 幸運の導き手
- 竜の胎動
- 竜の逆鱗
- 力のタロット
- 運命の導き
- まほうおばば
- 占い師の交換所
- いのりのゆびわ
- インプ
- にじくじゃく
- ルバンカ
- タロットフリング
- 賢者ルシェンダ
- イブール
- ヘラクライザー
- ドラゴビショップ
- 邪悪な衝撃波
- デスストーカー
- 魔界からの侵攻
- 帝王の一閃
- メタルキングの剣
- アンデッドガーデン
- トーマ王子
- カイロスハント
- 無影のゴースト
- しきりなおし
- 心眼一閃
- ヘルクラッシャー
- 王家のナイフ
- あくまのツボ
- 二刀の心得・壱
- さんぞくのカシラ
- おたからさがし
- スライム系のたまご
- ゾンビ系のたまご
- ドラゴン系のたまご
- 魔王系のたまご
- 英雄系のたまご
- ドラゴンプッシュ
- 冒険者系のたまご
