# v249 全カード挙動監査 pass1
## 目的
全1607カードを対象に、効果文・既存app.js内の名前出現・汎用エンジン対象を横断して、未接続/再確認優先候補を抽出した。
## 集計
- 総カード数: 1607
- MEDIUM_IMPLEMENTED_NAME_PRESENT: 1399
- LOW_NO_EFFECT_OR_BASIC: 149
- MEDIUM_GENERIC_ENGINE_ONLY: 28
- MEDIUM_COMPLEX_IMPLEMENTED_RECHECK: 18
- HIGH_COMPLEX_NO_EXPLICIT_NAME: 10
- HIGH_NO_NAME_NO_GENERIC: 3

優先確認キュー: 31件

## 種別
- ユニット: 1081
- 特技: 369
- 武器: 57
- トークン: 45
- 建物: 27
- ヒーロー: 23
- ヒーロースキル: 4
- テンションスキル: 1

## 注意
このpass1は「全カードの完全実機確認」ではなく、全カードを機械的に棚卸しして危険箇所を明確にする段階。次passで priority queue を上から公式DB/効果文ベースで個別修正する。

## 生成ファイル
- v249_full_card_behavior_audit.csv/json
- v249_full_card_behavior_priority_queue.csv
- v249_duplicate_function_declarations.json
- v249_many_app_occurrences.csv
