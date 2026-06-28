# DQR v280 puchi metal / PvP death sync fix

- ぷちメタルGETと通常ドローの同時発生に見える挙動を修正
- 通常ドローは自分のターンが戻った時に実行
- PvPリモート側のHP0ユニット残りを死亡処理で掃除
- 選択待ち12秒自動解除を無効化

# DQR Rebuild v279 PvP sync loop fix

This package is based on the restored v273 project and fixes the PvP-only hand flicker/dead-control issue.

The root cause was the v270 authoritative sync wrapper that synced Firebase state on every `renderBattleArena()` call.  In PvP, remote state application renders the arena, which caused a new local state write, which caused the other client to render and write back.  This loop rebuilt the hand DOM repeatedly and made visible buttons/cards effectively unclickable.

v279 removes render-triggered sync, keeps sync after real actions/turn-end, ignores duplicate v270 remote `stateSeq` snapshots, and adds cache busters for `app.js` and `style.css`.

See:
- `data/v279_pvp_sync_loop_fix_report.md`
- `data/v279_checks.json`
- `tools/v279_pvp_sync_loop_static_tests.py`


## v296
対戦環境スコープ全体監査・公開状態ガードを追加。


## v299
シーゴーレム等におうだち/通常ユニットのPvPターン開始後攻撃可能状態を、古いopponentView同期で戻されないよう補正。キースドラゴン占いを専用安全処理化。


## v300
キースドラゴン専用処理が旧汎用占い分岐と重複しないよう、実際の召喚経路 `applyTabasaFortuneCardV187` を先に横取りして専用処理で return true するガードを追加。


## v302
効果入口二重発火の統合ガードを追加。召喚時/死亡時/場に出す/カード使用/BET/攻撃後/ターン開始終了/武器装備などを同一イベントで二重実行しないよう補強。
