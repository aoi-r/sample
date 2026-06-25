# dqr_full_project_v245_boot_module_duplicate_fix

v244の部屋掃除・マッチ開始修正をベースに、タイトル画面でタップしても進めない原因になっていた app.js の module 起動停止要因を修正した版です。

## 修正

- `v242EggraChikiraSummon` の重複宣言を解消
- `v242ResolveEggraChikiraGuesses` の重複宣言を解消
- top-level に残っていた単独 `async` トークンを削除
- v243のエッグラ&チキーラ remote guess modal 実装を正規経路として維持

## 確認

- app.js を module として構文チェック
- v237〜v244の既存静的テスト
- v245 boot module test

