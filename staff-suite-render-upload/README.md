# 人材管理アプリ Phase 1

外部パッケージなしで動作する Phase 1 MVP です。Node.js 標準機能だけで API、画面、JSON データストア、権限検証、監査ログを実装しています。

## 起動

一番確実な方法:

1. `1-start-server.cmd` をダブルクリックする
2. 黒い画面を閉じずに、`2-open-app.url` を開く

コマンドで起動する場合:

```powershell
node server.js
```

ブラウザで開く:

```text
http://localhost:3000
```

## サンプルログイン

管理者:

```text
admin@example.com / password
```

一般ユーザー:

```text
sato@example.com / password
```

## 実装済み

- ログイン / ログアウト
- 管理者と一般ユーザーのロール分岐
- 親子階層の閲覧制御
- 単価可視性ルールの分離
- 現場マスタの登録 / 承認待ち登録
- シフト作成
- 管理者のシフト一括登録
- 管理者の一括論理削除と 30 秒 Undo
- 希望休申請と管理者承認 / 却下
- 出勤 / 退勤時刻の保存
- 監査ログ
- モバイル向け表示

## テスト

```powershell
node --test tests/*.test.js
```

## データ

初回起動時に `data/db.json` が作成されます。やり直したい場合はサーバー停止後にこのファイルを削除して再起動してください。

## Phase 2 以降に送るもの

- 位置情報必須化
- LINE 通知
- 12:00 / 18:00 リマインダー
- 経費申請
- 給与計算
- 請求書 Excel / PDF 生成

## 注意

この実装は依存関係を使えない環境で動かすための MVP です。本番化では `docs/phase-1-design.md` に沿って Next.js、PostgreSQL、Prisma、認証基盤へ移行してください。
