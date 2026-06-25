# v247 emulator duplicate-trigger hardening

## 目的
v246 で入れた二重発動ガードを、実ブラウザ系の headless Chromium/CDP エミュレータ上でも検査した。
特に、以下の両立を確認する。

1. 同一イベントの二重処理は止める。
2. 同名カード・同じダメージ/回復/ドローが、正規に2回発生した場合は止めない。

## 追加修正

### 1. v246EventGuard のキーを修正
v246 の guard は `turn + card.id + card.name + side` などの内容ベースだったため、同じターン中に同じカードを2回使う正規ケースまで止める危険があった。

v247 では以下に変更した。

- `emitBattleEvent` 経由のイベントには `_eventId` を付与
- guard は `_eventId` を優先
- 直呼びpayloadは非列挙の `_v247GuardId` を付与
- ターン終了など「1ターン1回であるべき処理」だけ `_dedupeKey` を明示使用

これで、同一イベントの重複は止めつつ、別アクションとしての同名カード再使用は通る。

### 2. turnEnd 系の dedupe を明示化
`v166ApplyEndTurn`、`triggerPowerfulBadgeTurnEndV157`、`addSpecialCoinAtTurnEndIfMadesagora` は、`side|turn` をキーにして二重処理を止める。

### 3. かいぞくウーパー死亡時の残骸を修正
過去実装に残っていた死亡時ドロー経路を止めた。
かいぞくウーパーは「召喚時 & 手札から捨てた時」であり、死亡時には発動しない。

### 4. CDPテスト用フックを追加
通常プレイには影響しない `window.__DQR_TEST__` を追加。
headless Chromium/CDP から battle state と主要処理を呼べるようにした。

## Chromium/CDP エミュレータ検査
通常URL読み込みはこの実行環境のブラウザポリシーで `chrome-error://chromewebdata/` へ飛ばされるため、`Page.setDocumentContent` で index/app/data をインライン化して検査した。

結果: 10 passed / 0 failed

検査内容:

- アプリ起動・カードDB1607件ロード
- タイトルタップで `screen-user` へ遷移
- 同一カードを正規に2回使用した場合、2回分カウントされる
- 同じ `_eventId` の二重 `cardPlayed` は1回だけ処理される
- ダメージ2回は2回分入る
- 回復2回は2回分入る
- ドロー2回は指定枚数通り入る
- 同じ `turnEnd` event id は1回だけ処理される
- かいぞくウーパー死亡時はドローしない
- 「場に出す」は `unitPutIntoPlay` のみで、召喚時は発動しない。ただし基本キーワードは保持する

詳細JSON:
`data/v247_inline_chromium_emulator_tests.json`

## 静的テスト
v237〜v246 の既存テストも再実行済み。

- node --check js/app.js: OK
- v237_static_emulator_tests: OK
- v238_static_cost67_tests: OK
- v239_static_cost67_existing43_tests: OK
- v240_static_pool_tests: OK
- v241_static_cost45_pass2_tests: OK
- v242_static_cost45_closeout_tests: OK
- v243_static_eggchikira_tests: OK
- v244_static_room_match_tests: OK
- v245_static_boot_module_tests: OK
- v246_duplicate_trigger_audit_tests: OK

## 注意
実際の Firebase マルチ同期を2ブラウザインスタンスで完全再現するところまでは、この環境ではURLロードポリシー制限のため未実施。
ただし、エフェクト二重発動に関わるローカル処理・イベントガード・直接処理の境界は Chromium runtime 上で検査済み。
