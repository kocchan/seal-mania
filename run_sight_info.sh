#!/bin/bash
set -e  # エラーが発生した時点でスクリプトを中断する

echo "========================================"
echo "🏞️  目撃情報 自動投稿バッチを開始します"
echo "========================================"

# 1. スクレイピング
echo "🔍 [Step 1] 目撃情報のスクレイピング開始..."
node src/sight_info_scraping.js

# 2. 記事生成
echo "📝 [Step 2] 記事コンテンツの生成開始..."
node src/sight_info_create_article.js

# 3. 画像生成
echo "🎨 [Step 3] アイキャッチ・挿入画像の生成開始..."
node src/sight_info_create_image.js

# 4. WordPress投稿
echo "🚀 [Step 4] WordPressへの自動投稿開始..."
node src/sight_info_wordpress_post.js

echo "========================================"
echo "✅ 全ての観光情報投稿プロセスが完了しました！"
echo "========================================"