# v264 duplicate effect / mobile hand leak / long PvP verification

Base: v263_soak_pvp_summon_state_guard  
Version: v264_duplicate_effect_soak_hand_guard

## 修正内容

- 非ソロPvPでは、スマホ表示で残る可能性があったソロモード用の相手手札UIを強制的に空化・非表示化。
  - enemy-hand-visual
  - enemy-hand-list-pop
  - solo-debug-strip
  - solo-debug-hand
  - solo-debug-enemy-hand
  - solo-test-panel
  - solo-test-toggle
- remote action replayにIDガードを追加。同一action IDが再配送されても2回目以降は破棄する。
- 対象選択で解決するユニットへのダメージ/弱体/状態変化について、解決後のユニット状態を `unitStatePatchV264` として送信。
  - 相手側で弱体やHP変化が見えない問題を防ぐ。
  - patchは加算式ではなく最終状態の上書きなので、再配送されても二重弱体になりにくい。

## v264新規検査

- 2台相当のChromium/CDPクライアント
- スマホ横向き相当: 844x390 / deviceScaleFactor 3 / mobile true
- 結果: 7 passed / 0 failed
- 長期soak: 960 steps
- Runtime exception: 0

### 通した内容

1. 2クライアント起動とv264/v264b hook確認
2. PvPスマホ表示で相手手札/ソロデバッグ手札が見えないこと
3. 同一IDのdamageApplied再配送でダメージが二重適用されないこと
4. ゼルドラド系の同一eventId二重召喚時処理で、全体バフ/デバフが二重にならないこと
5. ブラックマンティス系の対象弱体が、ローカル二重呼び出し・remote patch再配送でも二重にならないこと
6. ブラックルーン + メラミが +2 だけで、+4にならず、相手側にも1回分として同期されること
7. 12試合×80手の長期PvP soakで、召喚/弱体/特技ダメージ/攻撃/ターン/サンディ捨て/重複action注入後もミラー同期が崩れないこと

## 既存回帰検査

- v237_static_emulator_tests: 11 passed / 0 failed
- v240_static_pool_tests: 12 passed / 0 failed
- v246_duplicate_trigger_audit_tests: 12 passed / 0 failed
- v248_chappy_pvp_emulator_tests: 14 passed / 0 failed
- v255_combat_dolmages_pvp_tests: 10 passed / 0 failed
- v256_maiyu_slimefever_pvp_tests: 5 passed / 0 failed
- v258_counter_kandakobun_merchant_pvp_tests: 10 passed / 0 failed
- v260_review_closeout_pvp_tests: 20 passed / 0 failed
- v264_duplicate_effect_soak_and_hand_leak_tests: 7 passed / 0 failed

## 注意

v263旧soakハーネスはv264の `unitStatePatchV264` 導入後に旧比較器と衝突するため、今回のv264後継soakを正として採用。  
シーゴーレム単体の「相手ターンで消えない/HP+2が相手側にも出る」検査はv263で通過済み。

今回は実ブラウザ2台相当のCDP検査。Firebase本番RDBへの実接続・スマホ実機Safariの再接続耐久は別ゲートで確認する。
