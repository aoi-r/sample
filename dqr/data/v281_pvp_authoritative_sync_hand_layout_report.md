# v281 PvP同期・手札漏れ・横画面被り修正

## 修正目的

v280後の実戦報告に対して、以下を修正する。

- 出したユニットが相手側で見えない/死亡したユニットが相手側に残るなど、PvP盤面同期が弱い。
- ドロー/GETまわりの同期が不自然で、コインが相手手札に入ったように見える。
- スマホ横画面で自分の手札と下段マスがかぶる。

## 原因と対応

### 1. unitDeath action の古い v270 snapshot が死亡同期を巻き戻す

`resolveDeaths()` は `unitDeath` event を emit してからローカル盤面スロットを `null` にする。
一方、v270のaction snapshotは event 発行時点で作られるため、`unitDeath` action に付く snapshot には HP0 の死亡ユニットがまだ残っている。

リモート側では reducer が一度ユニットを消した後、v270 snapshot が後から適用されてHP0ユニットを復活させる可能性があった。

v281では `unitDeath` action だけ stale snapshot を無効化し、reducerの盤面削除を正とする。

### 2. PvP public state の実手札IDを完全無視

v265/v270で手札IDは隠す方針になっていたが、古いsnapshotや古いstateが残っていた場合に `handIds` が流入して、相手手札にコイン等があるように見える可能性がある。

v281では `applyRemoteOpponentState()` に入る前に `handIds: []` へ強制サニタイズし、PvP中の `game.enemy.hand` も空配列に戻す。共有するのは `handCount` のみ。

### 3. ローカル盤面変化後の権威state同期を追加

`resolveDeaths()`、`summonUnitFromHandToBoard()`、`putUnitIntoPlayFromCard()` の後に、PvPかつローカル処理の場合だけdebounceして `syncMyBattleState()` を予約する。

v279で禁止した「renderするだけで同期」は復活させていない。

### 4. 横画面の手札/下段マス被りをCSSで分離

最後尾にv281専用CSSを追加し、スマホ横画面では盤面のbottomを手札/HUD分だけ確保し、手札を最下段、HUDをその上に固定した。

## 検証

- `node --check js/app.js`: OK
- top-level function重複宣言: 0
- Chromium実行検証: 5 passed / 0 failed
- static checks: 6 passed / 0 failed

検証ファイル:

- `data/v281_checks.json`
- `data/v281_pvp_sync_hand_layout_tests.json`
- `tools/v281_pvp_sync_hand_layout_tests.py`
