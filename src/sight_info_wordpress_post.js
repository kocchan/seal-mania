import 'dotenv/config';
import axios from 'axios';
import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dbClient, getNowJST } from "./utils.js";
import { CONFIG } from "./config.js";
import { fileURLToPath } from 'url';

const APP_CONFIG = {
    tableName: "Articles",
    waitMs: 2000
};

// =====================================
// HTML本文生成
// =====================================
function generateHtmlContent(data) {
    // 1. 時刻フォーマットを "YYYY-MM-DD HH:mm" に整形
    const formattedTime = data.sighting_time
        ? data.sighting_time.replace('T', ' ').substring(0, 16)
        : "不明";

    // 2. X(Twitter)のURLクリーンアップとカード化対策
    const cleanTweetUrl = data.source_url.split('?')[0].replace('https://x.com', 'https://twitter.com');

    // 3. Googleマップ埋め込み用URL生成 (APIキー不要の完全無料版)
    const mapQuery = encodeURIComponent(data.shop_address || data.shop_name);
    const mapEmbedUrl = `https://maps.google.com/maps?q=${mapQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`;

    return `
    <p>
        ${data.prefecture || "エリア不明"}${data.city ? data.city : ""}の「${data.shop_name}」にて、${data.product_name}の目撃情報があります！<br>
        ${data.status_text} お近くの方はチェックしてみる価値がありそうです。
    </p>

    <p><strong>📅 目撃・入荷時期</strong> ${formattedTime}</p>

    <h3>📦 販売状況・詳細</h3>
    <ul>
        <li><strong>内容:</strong> ${data.product_name}が販売されていたとの報告あり。</li>
        <li><strong>注意:</strong> ${data.confidence_memo}</li>
        <li>
            <div style="margin: 20px 0;">
                [embed]${cleanTweetUrl}[/embed]
            </div>
        </li>
    </ul>



    <h3>📍 店舗情報</h3>
    <ul>
        <li><strong>店舗名:</strong> ${data.shop_name}</li>
        <li><strong>住所:</strong> ${data.shop_address}</li>
    </ul>

    <div style="width: 100%; height: 350px; margin-top: 20px;">
        <iframe 
            width="100%" 
            height="100%" 
            frameborder="0" 
            style="border:0; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" 
            src="${mapEmbedUrl}" 
            allowfullscreen>
        </iframe>
    </div>
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
        // 都道府県名からカテゴリーIDを取得
        const categoryId = CONFIG.wpCategoryMap[data.prefecture] || 2;

        const payload = {
            // タイトル指定: 【目撃速報】商品名｜エリア（店舗名）
            title: `【目撃速報】${data.product_name}｜${data.prefecture || ""}${data.city || ""}（${data.shop_name}）`,
            content: generateHtmlContent(data),
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