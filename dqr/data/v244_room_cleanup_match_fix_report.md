# v244 room cleanup & match start fix

## 修正対象

対戦を再利用した時に発生した以下を修正。

1. 前の部屋のユニットが残る
2. 後から入ったプレイヤーが `待機中・・・` のまま解除されない

## 原因

### 1. 古い states/actions の混入

同じ合言葉IDを再利用した時、Firebase の `rooms/{roomId}/states` や `actions` が残っていると、古い相手盤面を新しい対戦に読んでしまう可能性があった。

さらに `mergeRemoteBoard` が空マスを正として扱わず、`remote || current` で現在盤面を残していたため、相手側の空盤面が届いても古いユニットが消えない可能性があった。

### 2. 後入り側の待機ロック上書き

後から入ったプレイヤーは `startMatch()` 内で部屋を `playing` に更新できていたが、その後の末尾で常に `showWaitingForOpponent()` を呼んでいた。

Firebase購読側で `playing` を受け取っても、ローカル側の `showWaitingForOpponent()` が後から走ると、無期限の待機バナーと `matchLocked=true` で上書きされるレースがあった。

## v244での修正

- room/meta, players, states に `sessionId` を持たせる
- 古いセッションの states を無視する
- 終了済み、または新鮮な active player がいない古い部屋は新規入室前に削除する
- 新規待機開始時は古い `states` / `actions` を削除する
- 後入りで即 `playing` になった場合は `showWaitingForOpponent()` を呼ばない
- `mergeRemoteBoard` は remote snapshot を盤面全体の正として扱い、空マスも反映する

## 動作期待

- 同じ合言葉IDを使い回しても、前回の盤面が残らない
- 先に入った側は相手待ち、後から入った時点で両者が playing になる
- 先攻側は開始バナー後に操作可能
- 後攻側は相手ターンとしてロック
- ターン終了後、後攻側に操作権が移る
