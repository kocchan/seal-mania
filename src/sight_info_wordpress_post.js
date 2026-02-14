// src/wordpressup.js
import 'dotenv/config';
import axios from 'axios';
import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dbClient } from "./utils.js";
import { CONFIG } from "./prefecture/config.js";
import { fileURLToPath } from 'url';

// =====================================
// 🛠️ ユーティリティ関数
// =====================================

/**
 * 🇯🇵 現在の日本時間(JST)をISO文字列で返す関数
 */
function getNowJST() {
    const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return jstDate.toISOString().replace('Z', '+09:00');
}

/**
 * 📦 DynamoDBから未投稿の記事を取得
 */
async function fetchUnpostedArticles() {
    try {
        const result = await dbClient.send(new ScanCommand({
            TableName: "Articles",
            FilterExpression: "is_posted = :falseVal",
            ExpressionAttributeValues: {
                ":falseVal": false
            }
        }));
        return result.Items || [];
    } catch (e) {
        console.error("❌ 記事取得エラー:", e.message);
        return [];
    }
}

/**
 * 📝 DynamoDBの投稿済みフラグを更新
 */
async function markAsPosted(sourceUrl, wpPostId) {
    try {
        await dbClient.send(new UpdateCommand({
            TableName: "Articles",
            Key: { source_url: sourceUrl },
            UpdateExpression: "set is_posted = :trueVal, wp_post_id = :wpId, uploaded_at = :now",
            ExpressionAttributeValues: {
                ":trueVal": true,
                ":wpId": wpPostId,
                ":now": getNowJST()
            }
        }));
        console.log(`💾 DB更新完了: ${sourceUrl}`);
    } catch (e) {
        console.error(`⚠️ DB更新失敗 (${sourceUrl}):`, e.message);
    }
}

// =====================================
// HTML本文生成
// =====================================
function generateHtmlContent(data) {
    let predictionNote = "";

    if (data.is_prediction) {
        predictionNote = `
        <p style="background:#fff3cd; padding:10px; border-radius:5px; font-size:0.9rem; border:1px solid #ffeeba; color:#856404;">
        ⚠️ <strong>注意:</strong> 店舗名と住所はツイート内容からAIが推定しました。<br>
        確実な情報は情報ソースのリンク先をご確認ください。
        </p>`;
    }

    return `
    <p>
        ${data.prefecture || "エリア不明"}${data.city ? data.city : ""}の「${data.shop_name}」にて、${data.product_name}の目撃情報が寄せられています。<br>
        ${data.status_text} お近くの方はチェックしてみる価値がありそうです。
    </p>

    ${predictionNote}

    <p><strong>📅 目撃・入荷時期</strong> ${data.sighting_time}</p>

    <h3>📦 販売状況・詳細</h3>
    <ul>
        <li><strong>内容:</strong> ${data.product_name}が販売されていたとの報告あり。</li>
        <li><strong>注意:</strong> ${data.confidence_memo}</li>
    </ul>

    <h3>📍 店舗情報</h3>
    <ul>
        <li><strong>店舗名:</strong> ${data.shop_name}</li>
        <li><strong>住所:</strong> ${data.shop_address}</li>
    </ul>

    <p>🔗 <strong>情報ソース</strong><br>
    <a href="${data.source_url}" target="_blank" rel="noopener">${data.source_url}</a>
    </p>
    `;
}
// =====================================
// WordPressへ投稿
// =====================================
async function postToWordPress(data) {
    // 環境変数チェック
    if (!process.env.WP_API_URL || !process.env.WP_USER || !process.env.WP_APP_PASSWORD) {
        console.error('❌ エラー: .envファイルにWP設定がありません');
        return null;
    }

    // 認証ヘッダーの作成
    const credentials = Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');

    // カテゴリーIDの取得 (config.jsから参照)
    const categoryId = CONFIG.wpCategoryMap[data.prefecture] || 2; // デフォルト: 目撃情報

    const payload = {
        title: `【${data.prefecture || "不明"}/${data.city || ""}】${data.shop_name}にて${data.product_name}の目撃情報`,
        content: generateHtmlContent(data),
        status: 'publish', // 公開投稿
        categories: [categoryId],
        acf: {
            shop_name: data.shop_name,
            shop_address: data.shop_address || "",
            location_name: data.city || "",
            source_url: data.source_url
        }
    };

    try {
        console.log(`🚀 WP投稿中: ${payload.title} (CatID: ${categoryId})`);

        const response = await axios.post(`${process.env.WP_API_URL}/posts`, payload, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ 投稿成功! ID:', response.data.id);
        return response.data;

    } catch (error) {
        console.error('❌ WP投稿エラー:');
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Msg: ${JSON.stringify(error.response.data.message)}`);
        } else {
            console.error(`   ${error.message}`);
        }
        return null;
    }
}

// =====================================
// メイン処理
// =====================================
async function main() {
    console.log('🚀 記事自動投稿ジョブを開始します...');

    // 1. 未投稿記事の取得
    const articles = await fetchUnpostedArticles();
    console.log(`📥 未投稿の記事: ${articles.length}件`);

    if (articles.length === 0) {
        console.log("💤 新しい記事がないため終了します。");
        return;
    }

    // 2. 順次投稿
    for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        console.log(`\n[${i + 1}/${articles.length}] 処理中...`);

        // WPへ投稿
        const result = await postToWordPress(article);

        // 成功したらDB更新
        if (result && result.id) {
            await markAsPosted(article.source_url, result.id);
        }

        // サーバー負荷軽減のため少し待機
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log("\n✅ 全処理完了！");
}

// ESモジュールでのスクリプト直接実行判定
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error('❌ 致命的なエラー:', error);
        process.exit(1);
    });
}