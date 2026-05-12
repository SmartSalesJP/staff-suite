# Render 公開手順

## 1. GitHub に登録

1. https://github.com/ を開く
2. アカウントを作成
3. 新しいリポジトリを作成
4. このアプリ一式をアップロード

## 2. Render に登録

1. https://render.com/ を開く
2. GitHub アカウントでサインアップ
3. Render と GitHub を連携

## 3. Web Service を作成

Render の Dashboard で:

- `New +`
- `Web Service`
- GitHub のリポジトリを選択

設定:

- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variable:
  - Key: `DATA_DIR`
  - Value: `/opt/render/project/src/storage/data`

## 4. Persistent Disk を追加

データを消さないために Disk を追加します。

- Mount Path: `/opt/render/project/src/storage`
- Size: 1GB 以上

## 5. 公開後

Render が発行する URL にアクセスします。

公開後は必ず管理者パスワードを変更してください。
