import 'dotenv/config';
import axios from 'axios';
import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"; // 📍追加: S3操作用
import { dbClient, s3Client, getNowJST } from "./utils.js"; // 📍変更: s3Clientを追加
import { CONFIG } from "./config.js";
import { fileURLToPath } from 'url';

// 📍変更: ローカルディレクトリ設定を削除し、S3設定を追加
const APP_CONFIG = {
    tableName: "Articles",
    waitMs: 2000,
    s3BucketName: process.env.S3_BUCKET_NAME || "seal-mania",
    s3Prefix: "sight-info-image/"
};

// =====================================
// 📍 都道府県のローマ字マッピング（スラッグ用）
// =====================================
const PREF_ROMAJI_MAP = {
    "北海道": "hokkaido", "青森": "aomori", "青森県": "aomori", "岩手": "iwate", "岩手県": "iwate", "宮城": "miyagi", "宮城県": "miyagi", "秋田": "akita", "秋田県": "akita", "山形": "yamagata", "山形県": "yamagata", "福島": "fukushima", "福島県": "fukushima",
    "茨城": "ibaraki", "茨城県": "ibaraki", "栃木": "tochigi", "栃木県": "tochigi", "群馬": "gunma", "群馬県": "gunma", "埼玉": "saitama", "埼玉県": "saitama", "千葉": "chiba", "千葉県": "chiba", "東京": "tokyo", "東京都": "tokyo", "神奈川": "kanagawa", "神奈川県": "kanagawa",
    "新潟": "niigata", "新潟県": "niigata", "富山": "toyama", "富山県": "toyama", "石川": "ishikawa", "石川県": "ishikawa", "福井": "fukui", "福井県": "fukui", "山梨": "yamanashi", "山梨県": "yamanashi", "長野": "nagano", "長野県": "nagano", "岐阜": "gifu", "岐阜県": "gifu", "静岡": "shizuoka", "静岡県": "shizuoka", "愛知": "aichi", "愛知県": "aichi",
    "三重": "mie", "三重県": "mie", "滋賀": "shiga", "滋賀県": "shiga", "京都": "kyoto", "京都府": "kyoto", "大阪": "osaka", "大阪府": "osaka", "兵庫": "hyogo", "兵庫県": "hyogo", "奈良": "nara", "奈良県": "nara", "和歌山": "wakayama", "和歌山県": "wakayama",
    "鳥取": "tottori", "鳥取県": "tottori", "島根": "shimane", "島根県": "shimane", "岡山": "okayama", "岡山県": "okayama", "広島": "hiroshima", "広島県": "hiroshima", "山口": "yamaguchi", "山口県": "yamaguchi",
    "徳島": "tokushima", "徳島県": "tokushima", "香川": "kagawa", "香川県": "kagawa", "愛媛": "ehime", "愛媛県": "ehime", "高知": "kochi", "高知県": "kochi",
    "福岡": "fukuoka", "福岡県": "fukuoka", "佐賀": "saga", "佐賀県": "saga", "長崎": "nagasaki", "長崎県": "nagasaki", "熊本": "kumamoto", "熊本県": "kumamoto", "大分": "oita", "大分県": "oita", "宮崎": "miyazaki", "宮崎県": "miyazaki", "鹿児島": "kagoshima", "鹿児島県": "kagoshima", "沖縄": "okinawa", "沖縄県": "okinawa"
};

// =====================================
// ▼▼▼ 市区町村の英語（ローマ字）化 API ▼▼▼
// =====================================
async function getEnglishCityName(cityStr) {
    if (!cityStr || cityStr === "unknown") return "unknown";
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&q=${encodeURIComponent(cityStr)}`;
        const res = await axios.get(url);
        let englishName = res.data[0][0][0];

        englishName = englishName.toLowerCase()
            .replace(/\b(city|ward|town|village|prefecture)\b/g, '')
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        return englishName || "unknown";
    } catch (error) {
        console.error(`      ⚠️ 市区町村の英語化失敗 (${cityStr}):`, error.message);
        return "unknown";
    }
}

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
                    appid: CONFIG.apiKeys.yahooClientId,
                    query: query,
                    results: 1,
                    sort: '-score',
                    image_size: 300
                }
            });
            const hits = response.data.hits;
            if (hits && hits.length > 0) {
                const item = hits[0];
                return { name: item.name, image: item.image?.medium || '', price: item.price, url: item.url };
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
        result = await executeSearch(words.join(' '));
        if (result) return result;
    }
    return await executeSearch("シール");
}

// =====================================
// ▼▼▼ HTML生成 (アフィリエイト部分) ▼▼▼
// =====================================
function generatePochippLikeHtml(keyword, productData) {
    if (!keyword) return '';
    const itemName = productData ? productData.name : `${keyword}`;
    const itemImage = (productData && productData.image) ? productData.image : 'https://placehold.jp/300x300.png?text=No%20Image';
    const itemPrice = productData ? `¥${productData.price.toLocaleString()}〜` : '';
    const encKey = encodeURIComponent(keyword);
    const amazonUrl = `https://www.amazon.co.jp/s?k=${encKey}&tag=${CONFIG.affiliateIds.amazon}`;
    const rakutenUrl = `https://hb.afl.rakuten.co.jp/hgc/${CONFIG.affiliateIds.rakuten}/?pc=${encodeURIComponent('https://search.rakuten.co.jp/search/mall/' + keyword)}`;
    const yahooSearchUrl = `https://shopping.yahoo.co.jp/search?p=${encKey}`;
    const mainLinkUrl = productData ? productData.url : yahooSearchUrl;

    return `
    <div style="border: 2px solid #f2f2f2; border-radius: 4px; padding: 15px; margin: 20px 0 40px; background: #fff; display: flex; flex-wrap: wrap; align-items: center; gap: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); width: 100%; box-sizing: border-box;">
        
        <div style="flex: 0 0 120px; width: 120px; display: flex; justify-content: center; align-items: center; margin: 0 auto;">
            <a href="${mainLinkUrl}" target="_blank" rel="nofollow" style="display:block; border: none; box-shadow: none; background: none;">
                <img src="${itemImage}" alt="${keyword}" style="width: 100%; height: auto; max-height: 120px; object-fit: contain; border: none; margin: 0; padding: 0;">
            </a>
        </div>

        <div style="flex: 1 1 250px; min-width: 0; display: flex; flex-direction: column; justify-content: center;">
            <div style="margin-bottom: 15px; text-align: left;">
                <a href="${mainLinkUrl}" target="_blank" rel="nofollow" style="font-weight: bold; color: #333; text-decoration: none; font-size: 14px; line-height: 1.4; display: block; border: none;">${itemName}</a>
                <div style="color: #d32f2f; font-size: 13px; margin-top: 5px;">${itemPrice}</div>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 10px; width: 100%;">
                <a href="${amazonUrl}" target="_blank" rel="nofollow" style="flex: 1 1 200px; display: flex; justify-content: center; align-items: center; background: #ff9900; color: #fff; font-weight: bold; font-size: 13px; text-decoration: none; border-radius: 4px; height: 42px; box-shadow: 0 2px 0 #cc7a00; box-sizing: border-box;">Amazon</a>
                <a href="${rakutenUrl}" target="_blank" rel="nofollow" style="flex: 1 1 200px; display: flex; justify-content: center; align-items: center; background: #bf0000; color: #fff; font-weight: bold; font-size: 13px; text-decoration: none; border-radius: 4px; height: 42px; box-shadow: 0 2px 0 #990000; box-sizing: border-box;">楽天市場</a>
                <a href="${yahooSearchUrl}" target="_blank" rel="nofollow" style="flex: 1 1 200px; display: flex; justify-content: center; align-items: center; background: #51a7e8; color: #fff; font-weight: bold; font-size: 13px; text-decoration: none; border-radius: 4px; height: 42px; box-shadow: 0 2px 0 #2079b0; box-sizing: border-box;">Yahoo!ｼｮｯﾋﾟﾝｸﾞ</a>
            </div>
        </div>

    </div>
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

    <h3>🔗 情報ソース（現地ポスト）</h3>
    <figure class="wp-block-embed is-type-rich is-provider-twitter wp-block-embed-twitter">
        <div class="wp-block-embed__wrapper">
            ${cleanTweetUrl}
        </div>
    </figure>

    <h3>📍 店舗情報</h3>
    <ul>
        <li><strong>店舗名:</strong> ${data.shop_name}</li>
        <li><strong>住所:</strong> ${data.shop_address}</li>
    </ul>

    <div style="width: 100%; height: 350px; margin-top: 20px; margin-bottom: 40px;">
        <iframe 
            width="100%" 
            height="100%" 
            frameborder="0" 
            style="border:0; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" 
            src="${mapEmbedUrl}" 
            allowfullscreen>
        </iframe>
    </div>

    <p style="font-weight: bold; font-size: 1.1em; margin-bottom: 10px; text-align: center;"> ✨オンラインからも購入できます✨ </p>
    ${affiliateHtml}
    `;
}


// =====================================
// 📝 WordPress 操作クラス
// =====================================
class WordPressService {
    constructor() {
        const { WP_API_URL, WP_USER, WP_APP_PASSWORD } = process.env;
        if (!WP_API_URL || !WP_USER || !WP_APP_PASSWORD) throw new Error('❌ エラー: .env設定不足');
        this.apiUrl = WP_API_URL;
        this.auth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');
    }

    // 📍変更: S3から画像を直接取得してWPへアップロード
    async uploadImage(tweetId) {
        if (!tweetId) return null;
        const s3Key = `${APP_CONFIG.s3Prefix}${tweetId}.png`;

        try {
            console.log(`      📥 S3から画像取得中: s3://${APP_CONFIG.s3BucketName}/${s3Key}`);

            // S3からオブジェクトを取得
            const response = await s3Client.send(new GetObjectCommand({
                Bucket: APP_CONFIG.s3BucketName,
                Key: s3Key
            }));

            // AWS SDK v3のストリームをBufferに変換
            const imageBuffer = Buffer.from(await response.Body.transformToByteArray());

            console.log(`      🖼️ WPへ画像アップロード中: ${tweetId}.png`);
            // Bufferを使ってWordPressにアップロード
            const wpResponse = await axios.post(`${this.apiUrl}/media`, imageBuffer, {
                headers: {
                    'Authorization': `Basic ${this.auth}`,
                    'Content-Type': 'image/png',
                    'Content-Disposition': `attachment; filename="${tweetId}.png"`
                }
            });
            return wpResponse.data.id;

        } catch (error) {
            // S3に画像がない場合のエラーハンドリング
            if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
                console.log(`      ⚠️ S3に画像が存在しません (${s3Key})`);
            } else {
                console.error(`      ❌ 画像アップロード失敗: ${error.message}`);
            }
            return null;
        }
    }

    // 📍変更: ローカル削除ではなくS3上の画像を削除
    async deleteS3Image(tweetId) {
        if (!tweetId) return;
        const s3Key = `${APP_CONFIG.s3Prefix}${tweetId}.png`;
        try {
            await s3Client.send(new DeleteObjectCommand({
                Bucket: APP_CONFIG.s3BucketName,
                Key: s3Key
            }));
            console.log(`      🗑️ S3画像を削除しました: ${s3Key}`);
        } catch (err) {
            console.error(`      ⚠️ S3画像削除失敗: ${err.message}`);
        }
    }

    async getOrCreateTag(tagName) {
        if (!tagName) return null;
        try {
            const searchRes = await axios.get(`${this.apiUrl}/tags?search=${encodeURIComponent(tagName)}`, { headers: { 'Authorization': `Basic ${this.auth}` } });
            const existingTag = searchRes.data.find(t => t.name === tagName);
            if (existingTag) return existingTag.id;
            const createRes = await axios.post(`${this.apiUrl}/tags`, { name: tagName }, { headers: { 'Authorization': `Basic ${this.auth}`, 'Content-Type': 'application/json' } });
            return createRes.data.id;
        } catch (e) { return null; }
    }

    getCategoryIds(prefectureName) {
        const ids = [CONFIG.wpCategoryMap["都道府県別"] || 862];
        if (!prefectureName) return ids;
        const cleanPref = prefectureName.replace(/[都府県]$/, '');
        const regionId = CONFIG.prefToRegionMap[cleanPref];
        if (regionId) ids.push(regionId);
        const prefId = CONFIG.wpCategoryMap[cleanPref];
        if (prefId) ids.push(prefId);
        return [...new Set(ids.filter(id => id != null))];
    }

    async postArticle(data) {
        const mediaId = await this.uploadImage(data.source_tweet_id);
        const productData = await fetchYahooProduct(data.product_name);
        const affiliateHtml = generatePochippLikeHtml(data.product_name, productData);
        const categories = this.getCategoryIds(data.prefecture);
        const tags = [];
        const tag1 = await this.getOrCreateTag("目撃速報"); if (tag1) tags.push(tag1);
        if (data.product_name) { const tag2 = await this.getOrCreateTag(data.product_name); if (tag2) tags.push(tag2); }

        const prefRomaji = PREF_ROMAJI_MAP[data.prefecture] || "unknown";
        const englishCityStr = await getEnglishCityName(data.city);
        const dateStr = data.sighting_time ? data.sighting_time.substring(0, 10) : "unknown-date";
        const customSlug = `sight-info-${prefRomaji}-${englishCityStr}-${dateStr}`;

        const payload = {
            title: `【目撃速報】${data.product_name}｜${data.prefecture || ""}${data.city || ""}（${data.shop_name}）`,
            content: generateHtmlContent(data, affiliateHtml),
            status: 'publish',
            slug: customSlug,
            categories: categories,
            tags: tags,
            acf: { shop_name: data.shop_name, shop_address: data.shop_address || "", location_name: data.city || "", source_url: data.source_url }
        };
        if (mediaId) payload.featured_media = mediaId;

        try {
            console.log(`🚀 WP投稿中: ${payload.title} (Slug: ${customSlug})`);
            const response = await axios.post(`${this.apiUrl}/posts`, payload, { headers: { 'Authorization': `Basic ${this.auth}`, 'Content-Type': 'application/json' } });
            return response.data;
        } catch (error) {
            console.error(`❌ WP投稿失敗: ${error.response?.data?.message || error.message}`);
            return null;
        }
    }
}

// =====================================
// 💾 DynamoDB 関連の操作 (DBService)
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
                ExpressionAttributeValues: { ":trueVal": true, ":wpId": wpPostId, ":now": getNowJST() }
            }));
            console.log(`      💾 DBステータス更新完了: ${sourceUrl}`);
        } catch (e) { console.error(`      ⚠️ DB更新失敗:`, e.message); }
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

            // 📍変更: S3の画像を削除するメソッドを呼び出す
            await wpService.deleteS3Image(article.source_tweet_id);
        }
        await new Promise(res => setTimeout(res, APP_CONFIG.waitMs));
    }
    console.log("✅ 全処理完了");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(console.error);
}