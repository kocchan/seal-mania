# Seal App (自動投稿ボット) 🦭

Yahoo!リアルタイム検索から商品情報をスクレイピングし、Gemini AIで記事を生成してWordPressに自動投稿するシステムです。
AWS ECS (Fargate) 上でスケジュール実行されています。

## 📂 プロジェクト構成

```text
.
├── src/
│   ├── scraper.js           # スクレイピング処理 (Playwright)
│   ├── article_generator.js # AI記事生成 (Gemini)
│   ├── wordpressup.js       # WordPress投稿
│   ├── config.js            # 設定 (検索クエリ、カテゴリIDなど)
│   └── utils/               # DB接続などのユーティリティ
├── Dockerfile               # Dockerイメージ定義
├── entrypoint.sh            # 一括実行スクリプト
└── package.json

```

---

## 🚀 コードの更新・デプロイ手順

ローカルでコードを修正した後、以下の手順でAWS本番環境へ反映させます。
ECSは `latest` タグのイメージを参照しているため、**ECRへのPushだけで更新が完了します。**

### 1. Dockerイメージの再ビルド

キャッシュを使わずにクリーンビルドを行います。

```bash
docker build --no-cache -t seal-app .

```

### 2. AWS ECRへログイン

AWSへのアップロード権限を取得します。

```bash
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin 390403878175.dkr.ecr.ap-northeast-1.amazonaws.com

```

> **確認:** `Login Succeeded` と表示されればOKです。

### 3. イメージのタグ付け & プッシュ (アップロード)

新しいイメージをAWSの倉庫（ECR）に上書き保存します。

```bash
# タグ付け
docker tag seal-app:latest [390403878175.dkr.ecr.ap-northeast-1.amazonaws.com/seal-app:latest](https://390403878175.dkr.ecr.ap-northeast-1.amazonaws.com/seal-app:latest)

# アップロード
docker push [390403878175.dkr.ecr.ap-northeast-1.amazonaws.com/seal-app:latest](https://390403878175.dkr.ecr.ap-northeast-1.amazonaws.com/seal-app:latest)

```

✅ **これだけで完了です。**
次回のスケジュール実行時（9:00, 12:00...）から、自動的に新しいコードが使用されます。

---

## ⚡️ 手動での即時実行 (テスト)

更新後すぐに動作確認をしたい場合は、AWSコンソールから手動実行します。

1. **AWSコンソール** > **ECS** > クラスター **`SealCluster`** を開く。
2. **「タスク」** タブ > **「新しいタスクの実行」** をクリック。
3. 以下の設定で実行:
* **起動タイプ**: `Fargate`
* **タスク定義**: `SealTask` (リビジョン: `latest`)
* **タスク数**: `1`
* **ネットワーキング (重要⚠️)**:
* サブネット: リストから適当に選択
* パブリックIP: **ENABLED (有効)** ← これを忘れると動きません




4. **「タスクの実行」** をクリック。

---

## 💻 ローカル開発での実行

開発中にローカルPCで動作確認をするコマンドです。

```bash
# .envファイルを読み込んで実行
docker run --env-file .env seal-app

```

## 🛠 必須環境変数 (.env / ECS設定)

* `GEMINI_API_KEY`: Gemini APIキー
* `WP_API_URL`: WordPress REST APIのエンドポイント
* `WP_USER`: WordPress ユーザー名
* `WP_APP_PASSWORD`: WordPress アプリケーションパスワード
* `AWS_REGION`: `ap-northeast-1`
* `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`: (ローカル実行時のみ必要。ECSではIAMロールを使用)

```