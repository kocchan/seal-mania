# Seal App (シールマニア 完全自動メディア運用システム)

Yahoo!リアルタイム検索からの口コミ収集と、Google Gemini AIによる高度なテキスト処理を組み合わせ、WordPressサイト（シールマニア）への記事投稿を完全自動化するNode.jsアプリケーションです。

本システムは、AWS ECS (Fargate) 上でコンテナとしてスケジュール実行されることを前提に設計されています。

## 主な機能 (2つのコアシステム)

本システムには、役割の異なる2つの自動化パイプラインが実装されています。

### 1. 目撃情報・在庫速報システム (フロー情報)

SNSの「買えた」「売ってた」というリアルタイムな口コミを収集し、AIが「店舗名」と「住所」を推論して構造化。WordPressに「在庫速報」として自動投稿します。

* **特徴:** 鮮度重視。スパムを自動排除し、事実（ファクト）のみを抽出して地図アプリ等とも連携可能なデータを生成します。

### 2. トレンド記事自動生成システム (ストック情報)

Googleトレンド等の検索クエリデータ（CSV）を起点に「検索需要（ホットワード）」を抽出し、そのワードに関する口コミを収集。AIが「速報・攻略・考察」など異なる切り口の長文記事を複数生成し、アフィリエイトリンクを付与して自動公開します。

* **特徴:** SEO重視。検索需要とリアルな声を掛け合わせ、収益化（アフィリエイト）までを完全自動化します。

---

## ディレクトリ構成

```text
.
├── src/
│   ├── prefecture/                   # 目撃情報・在庫速報システム
│   │   ├── scraping.js               # スクレイピング・フィルタリング処理
│   │   ├── article_generator.js      # 目撃情報のAI解析・住所推論
│   │   ├── wordpressup.js            # 目撃情報のWP自動投稿
│   │   ├── config.js                 # 設定情報
│   │   └── utils.js                  # 共通ユーティリティ
│   └── other_article/                # トレンド記事自動生成システム
│       ├── fetch_related_word.js     # ① トレンドワード抽出
│       ├── create_article.js         # ② AIドラフト記事生成
│       ├── auto_post.js              # ③ アフィリエイト付与＆WP公開
│       └── config.js                 # 設定情報
├── data/
│   ├── related_data/input/           # トレンド用CSV配置ディレクトリ
│   └── ...                           # 各種出力JSON、ログ等
├── Dockerfile                        # ECSデプロイ用イメージ定義
├── entrypoint.sh                     # コンテナ起動時の実行スクリプト
├── package.json
└── .env                              # 環境変数 (Git管理外)

```

---

## 環境設定 (.env)

プロジェクトルートに `.env` ファイルを作成し、以下の変数を設定してください。

```ini
# --- AI・WordPress設定 ---
GEMINI_API_KEY=your_gemini_api_key
WP_API_URL=https://www.seal-search.com/wp-json/wp/v2
WP_USER=seal-mania
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx

# --- AWS連携 (ローカル実行時のみ) ---
AWS_REGION=ap-northeast-1

```

---

## 実行方法 (ローカル開発環境)

モジュールのインストール後、用途に合わせてスクリプトを実行します。

```bash
npm install
npx playwright install --with-deps chromium

```

### パターンA：目撃情報システムを実行する

スクレイピングからWP下書き投稿までを順次実行します。

```bash
# シェルスクリプト等で一括実行する場合
bash run.sh

# または個別実行
node src/prefecture/scraping.js
node src/prefecture/article_generator.js
node src/prefecture/wordpressup.js

```

### パターンB：トレンド記事システムを実行する

※事前に `data/related_data/input/` にGoogleトレンドのCSV（`relatedQueries.csv` 等）を配置してください。

以下の順序でステップごとに実行します。

```bash
# 1. CSVからホットワードを抽出しJSONを作成
node src/other_article/fetch_related_word.js

# 2. 口コミを収集し、複数パターンの記事ドラフトを生成
node src/other_article/create_article.js

# 3. Yahoo!ショッピングAPI等で商品情報を取得し、WPへ公開
node src/other_article/auto_post.js

```

---

## AWS ECS (Fargate) での実行・デプロイ

本番環境ではDockerコンテナとしてAWS上で実行されます。
コードを修正した場合は、以下のコマンドでAWS ECRへイメージをプッシュするだけでデプロイが完了します。

```bash
# 1. ビルド
docker build --no-cache -t seal-app .

# 2. ECRログイン (AWS CLI)
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin 390403878175.dkr.ecr.ap-northeast-1.amazonaws.com

# 3. タグ付け & プッシュ
docker tag seal-app:latest 390403878175.dkr.ecr.ap-northeast-1.amazonaws.com/seal-app:latest
docker push 390403878175.dkr.ecr.ap-northeast-1.amazonaws.com/seal-app:latest

```

以降は、Amazon EventBridgeのスケジュール設定に従って自動的に最新のコードで実行されます。即時実行したい場合は、ECSコンソールからタスクの手動実行を行ってください。