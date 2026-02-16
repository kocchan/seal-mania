#!/bin/bash
set -e  # エラーが発生した時点でスクリプトを中断する

echo "========================================"
echo "🔥 トレンド記事 自動投稿バッチを開始します"
echo "========================================"

# 1. 関連ワード取得
echo "🔍 [Step 1] トレンド・関連ワードの抽出中..."
node src/hot_topics_fetch_related_word.js

# 2. スクレイピング
echo "🤖 [Step 2] 詳細情報のスクレイピング開始..."
node src/hot_topics_scraping.js

# 3. 記事下書き生成
echo "📝 [Step 3] 記事（下書き）の生成開始..."
node src/hot_topics_create_draft_article.js

# 4. 画像生成
echo "🎨 [Step 4] アイキャッチ画像の生成開始..."
node src/hot_topics_create_image.js

# 5. WordPress投稿
echo "🚀 [Step 5] WordPressへの自動投稿（公開/下書き）開始..."
node src/hot_topics_wordpress_post.js

echo "========================================"
echo "✅ 全てのトレンド記事投稿プロセスが完了しました！"
echo "========================================"