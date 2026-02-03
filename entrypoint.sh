#!/bin/bash
set -e  # エラーが出たら即停止

echo "========================================"
echo "🎬 自動投稿バッチ処理を開始します"
echo "========================================"

# 1. スクレイピング
echo "🤖 [Step 1] スクレイピング開始..."
node src/scraping.js

# 2. 記事生成 (Gemini)
echo "📝 [Step 2] 記事生成・解析開始..."
node src/article_generator.js

# 3. WordPress投稿
echo "🚀 [Step 3] WordPress投稿開始..."
node src/wordpressup.js

echo "========================================"
echo "✅ 全ての処理が完了しました！お疲れ様でした。"
echo "========================================"