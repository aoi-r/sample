# v246 duplicate trigger guard and effect fallthrough fix

## 目的

これまで実装したカード全体を対象に、以下のような二重発動を抑止するための基盤修正を入れた。

- 特技ダメージが2回入る
- ドローが2倍になる
- 回復が2倍になる
- 召喚時GETやターン終了時効果が複数経路から重複する
- 占い/選択効果を処理した後、汎用テキストパーサーにも落ちて同じ効果が再実行される

## 見つけた主な二重発動リスク

### 1. 歴代patchのイベントハンドラ多重ラップ

v232〜v242で `handleCardPlayedEvent` / `handleSpellPlayedEvent` / `handleUnitSummonedEvent` などが何度もラップされている。通常は拡張として正しいが、同じイベントが再投入された場合、古いbase handlerだけがskipしても、新しいwatcherが後段で走る可能性があった。

対策として、全patch適用後の最終段に `installV246FinalDuplicateGuards()` を置き、以下のhandler全体をevent-levelでidempotentにした。

- cardPlayed
- spellPlayed
- unitSummoned
- unitPutIntoPlay
- unitDeath
- betActivated
- damageApplied
- afterAttack
- turnStart / turnEnd
- ownTurnStart / ownTurnEnd

### 2. カード使用時の占い/選択後の汎用パーサー落ち

`applyGenericCardUseEffect()` では、`hasFortuneEffect(card)` や `text.includes('選択')` で専用処理した後も、下の武器/GET/ダメージ/ドロー/回復の汎用処理に進める構造だった。

これにより、占いカードや選択カードで専用処理後に効果文が再解釈され、追加のダメージ/ドロー/回復が発生する危険があった。

v246では、占い/選択を専用処理した時点で `return` するように修正。

### 3. 召喚時の占い/選択 + 召喚時テキスト処理の重複

`applySummonKeywords()` では、`flags.choice` / `flags.fortune` を処理した後、さらに `flags.summon` で `applySummonTextEffect()` へ進む可能性があった。

v246では、召喚時の選択/占いを処理した場合は、同じ召喚時テキストを広域パーサーで再処理しないようにした。

### 4. 個別実装済み召喚時効果 + 汎用テキストパーサー

`applySummonTextEffect()` 内で、個別カード名に対する処理を行った後、最後に必ず `applyTextMiniEffect()` が走る構造だった。

`applyTextMiniEffect()` は広域で、カードを引く/HP回復/敵リーダーダメージ/ランダムダメージ/トークン生成などを拾うため、個別実装済みカードでは二重発動の危険が高い。

v246では、個別召喚実装済みカードを `V246_EXPLICIT_SUMMON_TEXT_CARDS` に登録し、個別処理後は汎用mini parserへ落とさないようにした。

### 5. 召喚時GETの重複

召喚時 `GET(n)` は、個別実装・BET系・汎用召喚処理のどこかと重なるとコイン取得数が倍になる危険がある。

v246では、召喚処理内で `unit._v246SummonGetApplied` を使い、同一ユニットのGET汎用取得は1回だけにした。

### 6. ターン終了時主要フックの重複

`endTurn()` 系・`ownTurnEnd` event・歴代wrapperの都合で、ターン終了処理は二重になりやすい。

v246では、以下のコア処理にturn/side単位のguardを追加した。

- `v166ApplyEndTurn(side)`
- `triggerPowerfulBadgeTurnEndV157(side)`
- `addSpecialCoinAtTurnEndIfMadesagora(side)`

## まだ実戦で見たいところ

この修正は「二重発火の通路」を塞ぐもの。全カードの効果値が完全に正しいことを保証するものではない。

特に実戦で見たいのは以下。

- 占いカード使用時に占い効果だけが1回発動するか
- 選択カード使用後にドロー/ダメージが追加で走っていないか
- 召喚時GET(1)が1枚だけか
- ターン終了時GET/パワフルバッジ/マデサゴーラ系が1回だけか
- 特技ダメージが対象選択後に1回だけ入るか
- 回復特技が1回だけ回復するか

## テスト

- node --check js/app.js: OK
- v237〜v245の既存静的テスト: OK
- v246_duplicate_trigger_audit_tests: 12 passed / 0 failed
