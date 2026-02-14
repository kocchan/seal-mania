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
// ▼▼▼ Yahoo!ショッピング検索 (画像取得) ▼▼▼
// =====================================
async function fetchYahooProduct(keyword) {
    if (!keyword) return null;

    const executeSearch = async (query) => {
        try {
            console.log(`      🔎 Yahoo APIリクエスト: ${query}`);
            const response = await axios.get('https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch', {
                params: {
                    appid: CONFIG.apiKeys.yahooClientId, // 📍 configから取得
                    query: query,
                    results: 1,
                    sort: '-score',
                    image_size: 300
                }
            });

            const hits = response.data.hits;
            if (hits && hits.length > 0) {
                const item = hits[0];
                const imageUrl = item.image && item.image.medium ? item.image.medium : '';
                console.log(`      ✅ 商品発見(Yahoo): ${item.name.substring(0, 15)}...`);
                return {
                    name: item.name,
                    image: imageUrl,
                    price: item.price,
                    url: item.url
                };
            }
            return null;
        } catch (e) {
            console.error(`      ⚠️ APIエラー: ${e.response ? e.response.status : e.message}`);
            return null;
        }
    };

    let result = await executeSearch(keyword);
    if (result) return result;

    const words = keyword.split(/\s+/);
    while (words.length > 1) {
        words.pop();
        const shortKey = words.join(' ');
        result = await executeSearch(shortKey);
        if (result) return result;
    }

    console.log(`      ⚠️ 最終手段: "シール"で検索`);
    return await executeSearch("シール");
}

// =====================================
// ▼▼▼ HTML生成 (Yahoo画像版 + 3ボタンGrid) ▼▼▼
// =====================================
function generatePochippLikeHtml(keyword, productData) {
    if (!keyword) return '';

    const itemName = productData ? productData.name : `${keyword}`;
    const itemImage = (productData && productData.image) ? productData.image : 'https://placehold.jp/300x300.png?text=No%20Image';
    const itemPrice = productData ? `¥${productData.price.toLocaleString()}〜` : '';
    const encKey = encodeURIComponent(keyword);

    // 📍 configからアフィリエイトIDを取得
    const amazonUrl = `https://www.amazon.co.jp/s?k=${encKey}&tag=${CONFIG.affiliateIds.amazon}`;
    const rakutenUrl = `https://hb.afl.rakuten.co.jp/hgc/${CONFIG.affiliateIds.rakuten}/?pc=${encodeURIComponent('https://search.rakuten.co.jp/search/mall/' + keyword)}`;
    const yahooSearchUrl = `https://shopping.yahoo.co.jp/search?p=${encKey}`;
    const mainLinkUrl = productData ? productData.url : yahooSearchUrl;

    return `
    <div class="ai-product-box" style="
        border: 2px solid #f2f2f2 !important;
        border-radius: 4px !important;
        padding: 15px !important;
        margin: 40px 0 !important;
        background: #fff !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 20px !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05) !important;
        width: 100% !important;
        box-sizing: border-box !important;
    ">
        <div style="
            flex: 0 0 120px !important; 
            width: 120px !important;
            min-width: 120px !important;
            display: flex !important; 
            justify-content: center !important; 
            align-items: center !important;
        ">
            <a href="${mainLinkUrl}" target="_blank" rel="nofollow" style="display:block !important; border: none !important; box-shadow: none !important; background: none !important; width: 100% !important;">
                <img src="${itemImage}" alt="${keyword}" style="
                    width: 100% !important; 
                    height: auto !important; 
                    object-fit: contain !important; 
                    max-height: 120px !important;
                    border: none !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    display: block !important;
                ">
            </a>
        </div>

        <div style="
            flex: 1 !important; 
            min-width: 0 !important; 
            display: flex !important; 
            flex-direction: column !important; 
            justify-content: center !important;
        ">
            <div style="margin-bottom: 15px !important;">
                <a href="${mainLinkUrl}" target="_blank" rel="nofollow" style="
                    font-weight: bold !important;
                    color: #333 !important;
                    text-decoration: none !important;
                    font-size: 14px !important;
                    line-height: 1.4 !important;
                    display: block !important;
                    border: none !important;
                    box-shadow: none !important;
                    background: none !important;
                ">${itemName}</a>
                <div style="color: #d32f2f !important; font-size: 13px !important; margin-top: 5px !important;">${itemPrice}</div>
            </div>

            <div style="
                display: grid !important;
                grid-template-columns: 1fr 1fr 1fr !important;
                gap: 10px !important;
                width: 100% !important;
            ">
                <a href="${amazonUrl}" target="_blank" rel="nofollow" style="
                    display: flex !important;
                    justify-content: center !important;
                    align-items: center !important;
                    background: #ff9900 !important;
                    color: #fff !important;
                    font-weight: bold !important;
                    font-size: 11px !important;
                    text-decoration: none !important;
                    border-radius: 4px !important;
                    height: 40px !important;
                    line-height: 1 !important;
                    box-shadow: 0 2px 0 #cc7a00 !important;
                    margin: 0 !important;
                    padding: 0 2px !important;
                    white-space: nowrap !important;
                    width: auto !important;
                ">Amazon</a>

                <a href="${rakutenUrl}" target="_blank" rel="nofollow" style="
                    display: flex !important;
                    justify-content: center !important;
                    align-items: center !important;
                    background: #bf0000 !important;
                    color: #fff !important;
                    font-weight: bold !important;
                    font-size: 11px !important;
                    text-decoration: none !important;
                    border-radius: 4px !important;
                    height: 40px !important;
                    line-height: 1 !important;
                    box-shadow: 0 2px 0 #990000 !important;
                    margin: 0 !important;
                    padding: 0 2px !important;
                    white-space: nowrap !important;
                    width: auto !important;
                ">楽天市場</a>

                <a href="${yahooSearchUrl}" target="_blank" rel="nofollow" style="
                    display: flex !important;
                    justify-content: center !important;
                    align-items: center !important;
                    background: #51a7e8 !important;
                    color: #fff !important;
                    font-weight: bold !important;
                    font-size: 11px !important;
                    text-decoration: none !important;
                    border-radius: 4px !important;
                    height: 40px !important;
                    line-height: 1 !important;
                    box-shadow: 0 2px 0 #2079b0 !important;
                    margin: 0 !important;
                    padding: 0 2px !important;
                    white-space: nowrap !important;
                    width: auto !important;
                ">Yahoo!ｼｮｯﾋﾟﾝｸﾞ</a>
            </div>
        </div>
    </div>

    <style>
        @media (max-width: 600px) {
            .ai-product-box {
                flex-direction: column !important;
                align-items: center !important;
                text-align: center !important;
            }
            .ai-product-box > div:first-child {
                margin-bottom: 15px !important;
                margin-right: 0 !important;
            }
        }
    </style>
    `;
}

// =====================================
// ▼▼▼ 記事本文生成 ▼▼▼
// =====================================
function generateHtmlContent(data, affiliateHtml) {
    const formattedTime = data.sighting_time
        ? data.sighting_time.replace('T', ' ').substring(0, 16)
        : "不明";

    const cleanTweetUrl = data.source_url.split('?')[0].replace('https://x.com', 'https://twitter.com');
    const mapQuery = encodeURIComponent(data.shop_address || data.shop_name);
    const mapEmbedUrl = `https://maps.google.co.jp/maps?output=embed&q=${mapQuery}&t=m&z=15`;

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
    </ul>

    ${affiliateHtml}

    <h3>🔗 情報ソース（現地ポスト）</h3>
    <div style="margin: 20px 0;">
        [embed]${cleanTweetUrl}[/embed]
    </div>

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
     * 指定されたタグ名が存在するか確認し、なければ作成してIDを返す
     */
    async getOrCreateTag(tagName) {
        if (!tagName) return null;
        try {
            const searchRes = await axios.get(`${this.apiUrl}/tags?search=${encodeURIComponent(tagName)}`, {
                headers: { 'Authorization': `Basic ${this.auth}` }
            });
            const existingTag = searchRes.data.find(t => t.name === tagName);
            if (existingTag) return existingTag.id;

            const createRes = await axios.post(`${this.apiUrl}/tags`, { name: tagName }, {
                headers: {
                    'Authorization': `Basic ${this.auth}`,
                    'Content-Type': 'application/json'
                }
            });
            return createRes.data.id;
        } catch (e) {
            console.error(`      ⚠️ タグ「${tagName}」の処理に失敗:`, e.response?.data?.message || e.message);
            return null;
        }
    }

    /**
     * 都道府県名から階層カテゴリーのID配列を生成
     */
    getCategoryIds(prefectureName) {
        // 親: 862 (都道府県別) は確定で入れる
        const ids = [CONFIG.wpCategoryMap["都道府県別"] || 862];
        if (!prefectureName) return ids;

        // 子: 地方(関東など) 📍 configから取得
        const regionId = CONFIG.prefToRegionMap[prefectureName];
        if (regionId) ids.push(regionId);

        // 孫: 都道府県
        const prefId = CONFIG.wpCategoryMap[prefectureName];
        if (prefId) ids.push(prefId);

        return ids;
    }

    /**
     * WordPressへ記事を投稿
     */
    async postArticle(data) {
        // 1. 商品情報（アフィリエイト用）を取得
        const productData = await fetchYahooProduct(data.product_name);
        const affiliateHtml = generatePochippLikeHtml(data.product_name, productData);

        // 2. カテゴリーの特定 (親 -> 子 -> 孫 の配列)
        const categories = this.getCategoryIds(data.prefecture);

        // 3. タグの特定・作成
        const tags = [];
        const tag1 = await this.getOrCreateTag("目撃速報");
        if (tag1) tags.push(tag1);

        if (data.product_name) {
            const tag2 = await this.getOrCreateTag(data.product_name);
            if (tag2) tags.push(tag2);
        }

        const payload = {
            title: `【目撃速報】${data.product_name}｜${data.prefecture || ""}${data.city || ""}（${data.shop_name}）`,
            content: generateHtmlContent(data, affiliateHtml),
            status: 'publish',
            categories: categories,
            tags: tags,
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