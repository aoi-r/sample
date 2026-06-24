# v234 ランダム全体プール照合 pass1
## 方針
- 既存デッキから直接、または既存デッキのランダム候補から派生して「全カードプール/職業プール/系統プール」を参照する効果を対象にした。
- 「場に出す」と「召喚」は別物として維持。ランダムで場に出たユニットの召喚時効果は発動しない。
- デッキ編成不可、ヒーロー進化専用、`notRandomPool` / `excludeFromRandomGeneration` はランダム候補から除外。

## v234で修正した要点
- **パピラス**: 職業不明時の全職業フォールバックを廃止し、自分の職業だけ参照（候補32件）
- **プチマージ**: addRandomClassSpellToHandV166を公式DB文面どおりの職業特技プールに統一（候補57件）
- **コンガオンガ**: randomUnitCardByCost/addRandomUnitCardToEnemyHandByCostを共通除外込みに統一（候補1031件）
- **かみかぜ**: v233で公式DB突合・残り25件処理済み（候補215件）
- **逆転への兆し**: v233で公式DB突合・残り25件処理済み（候補208件）
- **イル＆ルカのたまご**: ドラゴン系はv233で一巡済み（候補77件）
- **スノードラゴン**: 提示候補を共通の公式DB対象プールに統一（候補77件）
- **まじょ**: 職業特技共有helperを使用（候補57件）
- **ルイーダ**: 既存の二重追加を修正し1ターン1枚だけに統一（候補86件）
- **変貌のくものきょじん**: 変身先にも共通除外条件を適用。召喚時は発動しない（候補1031件）
- **たんすミミック**: 変身先にも共通除外条件を適用。召喚時は発動しない（候補1031件）
- **ひぐらしそう**: 山札優先ではなく公式DB文面どおり全体ランダムプール参照へ修正（候補155件）
- **ヤンガス**: cost3SummonRandomUnitByCostV225の参照先を共通プールに統一（候補1031件）
- **亡国の先王ロウ**: 特技・ユニット双方を共通プールへ統一（候補1342件）
- **フォステイル**: 生成/専用除外を含む全占いカードプールに統一（候補57件）

## 追加確認が必要なもの
- 今回はプール参照の土台・直接出る候補を優先。次は **全コスト4以上ユニット** と **全特技コスト4/5/6** の効果精査を進めると、コンガオンガ/ヤンガス/ロウ/スノードラゴン派生がさらに安全になる。
- パピラスは現行デッキでは魔法使い。別職業デッキで使う場合も自分の職業を参照するようにしたが、職業名が未設定のテスト環境では不発ログを出す。

## 対象一覧
| source | direct/recursive | pool | count | status |
|---|---|---|---:|---|
| パピラス | direct deck | 魔法使いデッキでは魔法使いコスト1〜3特技 | 32 | patched |
| プチマージ | direct deck | 魔法使い特技全体 | 57 | patched shared helper |
| コンガオンガ | direct deck | 消滅対象と同じコストの全ユニット | 1031 | patched shared helper |
| かみかぜ | direct deck | 全コスト2ユニット | 215 | already completed in v233 |
| 逆転への兆し | direct deck | 全コスト3ユニット | 208 | already completed in v233 |
| イル＆ルカのたまご | direct deck | ドラゴン系ユニット | 77 | already completed in v233 |
| スノードラゴン | recursive from dragon pool | 全コスト4/5/6特技 | 77 | patched |
| まじょ | recursive from cost2 pool | 魔法使い特技全体 | 57 | patched shared helper |
| ルイーダ | recursive from cost2 pool | 全冒険者ユニット | 86 | patched bugfix |
| 変貌のくものきょじん | recursive from cost2 pool | 対象+1コストの全ユニット | 1031 | patched shared helper |
| たんすミミック | recursive from cost2 pool | 対象-1コストの全ユニット | 1031 | patched shared helper |
| ひぐらしそう | recursive from cost3 pool | 全コスト1ユニット / 全コスト3特技 | 155 | patched bugfix |
| ヤンガス | recursive from cost3 pool | 全コストNユニット | 1031 | patched shared helper |
| 亡国の先王ロウ | recursive from cost3 pool | 全コスト1以上特技 / 全同コストユニット | 1342 | patched shared helper |
| フォステイル | recursive from cost3 pool | 全占いカード | 57 | patched |
