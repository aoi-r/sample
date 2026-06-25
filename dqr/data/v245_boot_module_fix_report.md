# v245 boot module duplicate fix

## 問題

タイトル画面でタップしても進まない原因は、app.js が module として読み込まれる前段階で止まっていたこと。

見つかった停止要因:

1. `v242EggraChikiraSummon` の重複宣言
2. `v242ResolveEggraChikiraGuesses` の重複宣言
3. `async` だけの単独トークンが top-level で実行され、ReferenceError になる問題

通常の `node --check js/app.js` だと CommonJS 寄りの構文チェックになるため、module としての重複宣言を見逃すことがありました。

## 修正

- 古いローカル専用のエッグラ&チキーラ関数を削除
- v243 のリモート予想モーダル版を正規経路として残す
- 単独 `async` トークンを削除
- module として `node --check` が通ることを確認

## テスト

- `node --check` as module: OK
- `tools/v237_static_emulator_tests.mjs`: OK
- `tools/v238_static_cost67_tests.mjs`: OK
- `tools/v239_static_cost67_existing43_tests.mjs`: OK
- `tools/v240_static_pool_tests.mjs`: OK
- `tools/v241_static_cost45_pass2_tests.mjs`: OK
- `tools/v242_static_cost45_closeout_tests.mjs`: OK
- `tools/v243_static_eggchikira_tests.mjs`: OK
- `tools/v244_static_room_match_tests.mjs`: OK

