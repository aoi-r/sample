# v285 PvP board mirror / slot content fix

## 目的

- 召喚したユニットが相手画面に出ない問題を、actions/statesとは別経路の盤面ミラーで補強する。
- 横画面で配置済みユニットの表示がマス外へはみ出し、配置後だけマスが巨大化したように見える問題を抑える。

## 実装

- `rooms/{roomId}/boardMirrors/{playerId}` に現在の自分盤面/HP/MP/テンション/武器/手札枚数/山札枚数を書き込む。
- 相手側は `boardMirrors` を購読し、相手playerIdの最新seqだけを `game.enemy.board` に直接反映する。
- render契機では同期しない。状態変化時のみ送信する。
- 横画面では `.unit-slot.has-unit` を空マスと同じ枠サイズに固定し、カード画像/攻撃/HP/補正表示を枠内に収める。

## 検査

- `node --check js/app.js`: OK
- static checks: see `v285_checks.json`
