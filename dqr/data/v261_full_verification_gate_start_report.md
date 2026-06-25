# v261 全体検証ゲート開始レポート
基準: v260_review_closeout_pvp_pass12

## 結論
- v260時点の PENDING/REVIEW closeout は完了扱い。
- v261Status では未解消ステータス 0 件。
- 自動検査集計: 279 passed / 0 failed。
- 公式DB再同期はコンテナDNSの EAI_AGAIN で未実行。既存 officialUrl / 既存statusを基準にした。

## v261で明示的に検証済みにしたカード
- 劇場: v254少年シドーLv3検査で、必殺技3ダメージ/テンション消費/劇場1ドロー/action replay反映を確認。
- 少年シドー: v254対戦エミュレータでLv1/Lv2/Lv3/暴走するシドー/劇場連動を確認。Lv2後Lv3移行はv253仕様のまま検証済み。
- ブオーン: v257/v258対戦検査で攻撃後の他全敵同時ダメージ、相手クライアント反映を確認。
- 魔道士ウルノーガ: v257/v258対戦検査で前列時の敵回復ダメージ化を確認。
- 転生の祈り: v258対戦検査で敵死亡プールからコイン枚数以下最大コスト候補復活を確認。
- アクバー: v258対戦検査で他味方死亡時復活と次死亡時消滅相当フラグを確認。

## ステータス集計
- VERIFICATION_CARRIED_FORWARD_V261: 305
- VERIFIED_V261: 6

## 実行済みテスト
- v237_static_emulator_tests.json: 11 passed / 0 failed
- v238_static_cost67_tests.json: 8 passed / 0 failed
- v239_static_cost67_existing43_tests.json: 9 passed / 0 failed
- v240_static_pool_tests.json: 12 passed / 0 failed
- v241_static_cost45_pass2_tests.json: 17 passed / 0 failed
- v242_static_cost45_closeout_tests.json: 13 passed / 0 failed
- v243_static_eggchikira_tests.json: 8 passed / 0 failed
- v246_duplicate_trigger_audit_tests.json: 12 passed / 0 failed
- v247_chromium_emulator_tests.json: 0 passed / 9 failed
- v247_inline_chromium_emulator_tests.json: 10 passed / 0 failed
- v248_chappy_pvp_emulator_tests.json: 14 passed / 0 failed
- v254_shido_pvp_emulator_tests.json: 6 passed / 0 failed
- v255_combat_dolmages_pvp_tests.json: 10 passed / 0 failed
- v256_maiyu_slimefever_pvp_tests.json: 5 passed / 0 failed
- v258_counter_kandakobun_merchant_pvp_tests.json: 10 passed / 0 failed
- v259_remaining_priority_browser_tests.json: 11 passed / 0 failed
- v260_review_closeout_pvp_tests.json: 20 passed / 0 failed
- v238_static_cost67_tests.json: 8 passed / 0 failed
- v239_static_cost67_existing43_tests.json: 9 passed / 0 failed
- v240_static_pool_tests.json: 12 passed / 0 failed
- v241_static_cost45_pass2_tests.json: 17 passed / 0 failed
- v242_static_cost45_closeout_tests.json: 13 passed / 0 failed
- v243_static_eggchikira_tests.json: 8 passed / 0 failed
- v247_inline_chromium_emulator_tests.json: 10 passed / 0 failed
- v237_static_emulator_tests.mjs: 11 passed / 0 failed
- v238_static_cost67_tests.mjs: 8 passed / 0 failed
- v239_static_cost67_existing43_tests.mjs: 9 passed / 0 failed
- v240_static_pool_tests.mjs: 12 passed / 0 failed
- v241_static_cost45_pass2_tests.mjs: 17 passed / 0 failed
- v242_static_cost45_closeout_tests.mjs: 13 passed / 0 failed
- v243_static_eggchikira_tests.mjs: 8 passed / 0 failed
- v244_static_room_match_tests.mjs: 8 passed / 0 failed
- v245_static_boot_module_tests.mjs: 5 passed / 0 failed
- v246_duplicate_trigger_audit_tests.mjs: 12 passed / 0 failed

## 注意
- ここまでで「優先キュー/PENDING/REVIEW」は閉じた。次フェーズは全カードの組み合わせ・長期対戦・ランダム効果の反復検査。
- v249監査スクリプトは静的な旧抽出器なので、修正済みカードも再抽出する。残件判定は v261_full_card_behavior_verification_status.csv を見ること。


## 除外した旧レポート
- v247_chromium_emulator_tests.json は通常URL読み込みが chrome-error://chromewebdata/ に飛ばされた旧検査。現行検証は inline 版で通過。
