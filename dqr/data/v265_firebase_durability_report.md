# v265 Firebase耐久・公開状態ガード

## 目的

v264を基準に、Firebase本番で起きやすい以下の問題を潰すための耐久ゲートを追加した。

- `states/{playerId}` の公開状態に手札IDが含まれて相手へ漏れる問題
- 再接続/再購読時に古いFirebase snapshotが届き、action replay後の盤面を巻き戻す問題
- 同一actionが再配送され、ダメージ/弱体/召喚後patchが二重適用される問題
- ターン遷移・召喚・対象効果が連続した長期戦でミラー同期が崩れる問題

## 本番Firebase接続について

この実行環境では外部DNS解決ができず、Firebase SDK/CDNとRDBへの実接続は失敗した。
そのため、本番RDB直結のsoakではなく、Firebaseで発生する順序ズレ・古いsnapshot・同一action再配送・再購読を2台相当Chromium上で再現する耐久試験を実施した。

接続プローブ結果:

```json
[
  {
    "url": "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js",
    "ok": false,
    "error": "URLError: <urlopen error [Errno -3] Temporary failure in name resolution>",
    "seconds": 0.013
  },
  {
    "url": "https://dqr-sample-default-rtdb.firebaseio.com/.json",
    "ok": false,
    "error": "URLError: <urlopen error [Errno -3] Temporary failure in name resolution>",
    "seconds": 5.002
  }
]
```

## 変更内容

### 1. PvP公開状態の手札非公開化

`syncMyBattleState()` をv265でラップし、PvPの公開状態では以下のようにする。

- `handIds: []`
- `handRedactedV265: true`
- `handCount` は維持

これにより、UIを隠すだけでなくFirebase上の公開stateにも実カードIDを載せない。

### 2. stateSeq / clientUpdatedAt の追加

公開状態に以下を追加。

- `stateSeq`
- `clientUpdatedAt`
- `v265PublicState: true`

受信側はプレイヤーごとのwatermarkを持ち、古い `stateSeq` のsnapshotを破棄する。

### 3. 旧クライアント由来のhandIdsも受信側で破棄

古いクライアントが誤って `handIds` を公開していても、v265受信側は `enemy.hand` に取り込まない。
`enemy.handCount` だけ利用する。

### 4. action payloadにclientActionSeqを付与

`makeActionPayload()` をラップし、actionに以下を追加。

- `clientActionSeq`
- `clientCreatedAt`
- `v265ActionPayload: true`

既存のv264 action ID二重適用ガードと併用する。

## v265検査結果

- v265 Firebase耐久エミュレータ: 6 passed / 0 failed
- soak steps: 360
- Runtime exception: 0
- v248 2クライアント対戦: 14 passed / 0 failed
- v237 static: 11 passed / 0 failed
- v240 static: 12 passed / 0 failed
- v246 duplicate trigger: 12 passed / 0 failed
- `node --check js/app.js`: OK

## v265で通した主な検査

1. PvP公開状態では、手札に `メラ / シーゴーレム / 妖精サンディ` があっても `handIds` は空になる。
2. 古いクライアントが `handIds` を公開しても、受信側は取り込まず `handCount` のみ使う。
3. `stateSeq=5` の盤面を受信後、`stateSeq=4` の古い空盤面snapshotが来ても破棄する。
4. シーゴーレム召喚actionを重複配送し、さらに古い空盤面snapshotを注入しても、相手側でシーゴーレムは消えず、HP+2/におうだちも維持される。
5. 8試合 x 45手 = 360手のFirebase風soakで、召喚/ダメージ/弱体/攻撃/ターンイベント/重複action/古いsnapshotを混ぜてもミラー同期が崩れない。

## 残る次工程

この環境では実Firebaseに接続できなかったため、ユーザー環境/デプロイ後に以下を実施する。

1. GitHub Pagesへv265を配置
2. スマホ2台またはスマホ+PCで同じ合言葉部屋へ入室
3. シーゴーレム召喚 → 即ターン終了 → 相手側で残るか確認
4. 手札表示がPvPで見えないことを確認
5. 再読み込み/戻る/再入室後に古い盤面へ巻き戻らないことを確認

