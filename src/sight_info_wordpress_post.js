import 'dotenv/config';
import axios from 'axios';
import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dbClient, getNowJST } from "./utils.js"; // 📍共通関数をインポート
import { CONFIG } from "./config.js";
import { fileURLToPath } from 'url';

const APP_CONFIG = {
    tableName: "Articles",
    waitMs: 2000
};

// =====================================
// HTML本文生成 (一切変更なし)
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
// 📝 WordPress 操作クラス
// =====================================
class WordPressService {
    constructor() {
        const { WP_API_URL, WP_USER, WP_APP_PASSWORD } = process.env;
        if (!WP_API_URL || !WP_USER || !WP_APP_PASSWORD) {
            throw new Error('❌ エラー: .envにWordPressの接続情報が不足しています');
        }
        this.apiUrl = WP_API_URL;
        this.auth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');
    }

    /**
     * WordPressへ記事を投稿
     */
    async postArticle(data) {
        // カテゴリーIDの取得
        const categoryId = CONFIG.wpCategoryMap[data.prefecture] || 2;

        const payload = {
            title: `【${data.prefecture || "不明"}/${data.city || ""}】${data.shop_name}にて${data.product_name}の目撃情報`,
            content: generateHtmlContent(data), // 📍指定の関数をそのまま呼び出し
            status: 'publish',
            categories: [categoryId],
            acf: {
                shop_name: data.shop_name,
                shop_address: data.shop_address || "",
                location_name: data.city || "",
                source_url: data.source_url
            }
        };

        try {
            console.log(`🚀 WP投稿中: ${payload.title}`);
            const response = await axios.post(`${this.apiUrl}/posts`, payload, {
                headers: {
                    'Authorization': `Basic ${this.auth}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message;
            console.error(`❌ WP投稿失敗: ${errorMsg}`);
            return null;
        }
    }
}

// =====================================
// 💾 DynamoDB 関連の操作
// =====================================
const DBService = {
    async fetchUnposted() {
        try {
            const result = await dbClient.send(new ScanCommand({
                TableName: APP_CONFIG.tableName,
                FilterExpression: "is_posted = :falseVal",
                ExpressionAttributeValues: { ":falseVal": false }
            }));
            return result.Items || [];
        } catch (e) {
            console.error("❌ 記事取得失敗:", e.message);
            return [];
        }
    },

    async markAsPosted(sourceUrl, wpPostId) {
        try {
            await dbClient.send(new UpdateCommand({
                TableName: APP_CONFIG.tableName,
                Key: { source_url: sourceUrl },
                UpdateExpression: "set is_posted = :trueVal, wp_post_id = :wpId, uploaded_at = :now",
                ExpressionAttributeValues: {
                    ":trueVal": true,
                    ":wpId": wpPostId,
                    ":now": getNowJST()
                }
            }));
            console.log(`💾 DBステータス更新完了: ${sourceUrl}`);
        } catch (e) {
            console.error(`⚠️ DB更新失敗:`, e.message);
        }
    }
};

// =====================================
// 🏁 メイン処理
// =====================================
async function main() {
    console.log('🚀 記事自動投稿開始');

    const articles = await DBService.fetchUnposted();
    if (articles.length === 0) return console.log("💤 投稿対象なし");

    const wpService = new WordPressService();

    for (const article of articles) {
        const result = await wpService.postArticle(article);

        if (result?.id) {
            await DBService.markAsPosted(article.source_url, result.id);
        }

        await new Promise(res => setTimeout(res, APP_CONFIG.waitMs));
    }

    console.log("✅ 全処理完了");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(console.error);
}