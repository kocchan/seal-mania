import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import axios from 'axios';
import { CONFIG } from './config.js';

dotenv.config();

// =====================================
// 設定・定数
// =====================================
const DATA_DIR = path.resolve(process.cwd(), 'data/article_contents/output');
const DEFAULT_CATEGORY_ID = 97;

// 環境変数
const GEN_AI_KEY = process.env.GEMINI_API_KEY;
const WP_API_URL = process.env.WP_API_URL;
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

// ▼▼▼ API・アフィリエイト設定 ▼▼▼
// Yahoo Client ID (ユーザー提示)
const YAHOO_CLIENT_ID = 'dmVyPTIwMjUwNyZpZD1GRlZOZDRrQ0JwJmhhc2g9TmpnME4yUmxNbUZtT1RWak1XVTVaQQ';

const AFFILIATE_ID_AMAZON = 'sealmania-22';
const AFFILIATE_ID_RAKUTEN = '50f17d50.13213066.50f17d51.fed7b043';

// Gemini初期化
const genAI = new GoogleGenerativeAI(GEN_AI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

// キャッシュ用
const termCache = { categories: {}, tags: {} };

// =====================================
// ヘルパー: カテゴリ・タグのID取得
// =====================================
async function getTermId(taxonomy, termName) {
    if (!termName) return null;
    if (taxonomy === 'categories') {
        if (CONFIG.wpCategoryMap[termName]) return CONFIG.wpCategoryMap[termName];
        const foundKey = Object.keys(CONFIG.wpCategoryMap).find(key => termName.includes(key));
        if (foundKey) return CONFIG.wpCategoryMap[foundKey];
    }
    if (termCache[taxonomy][termName]) return termCache[taxonomy][termName];

    const authHeader = {
        'Authorization': `Basic ${Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/json'
    };
    try {
        const searchRes = await axios.get(`${WP_API_URL}/${taxonomy}?search=${encodeURIComponent(termName)}`, { headers: authHeader });
        const existingTerm = searchRes.data.find(t => t.name.toLowerCase() === termName.toLowerCase());
        if (existingTerm) {
            termCache[taxonomy][termName] = existingTerm.id;
            return existingTerm.id;
        }
        if (taxonomy === 'tags') {
            const createRes = await axios.post(`${WP_API_URL}/${taxonomy}`, { name: termName }, { headers: authHeader });
            const newId = createRes.data.id;
            termCache[taxonomy][termName] = newId;
            return newId;
        }
        return null;
    } catch (error) { return null; }
}

async function getLatestJsonFile() {
    try {
        const files = await fs.readdir(DATA_DIR);
        const targetFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('done_')).sort().reverse();
        if (targetFiles.length === 0) return null;
        return path.join(DATA_DIR, targetFiles[0]);
    } catch (error) { return null; }
}

// =====================================
// ▼▼▼ Yahoo!ショッピング検索 (画像取得) ▼▼▼
// =====================================
async function fetchYahooProduct(keyword) {
    if (!keyword) return null;

    const executeSearch = async (query) => {
        try {
            console.log(`      🔎 Yahoo APIリクエスト: ${query}`);

            // Yahooショッピング API V3
            const response = await axios.get('https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch', {
                params: {
                    appid: YAHOO_CLIENT_ID,
                    query: query,
                    results: 1, // 1件だけ取得
                    sort: '-score', // おすすめ順
                    image_size: 300
                }
            });

            const hits = response.data.hits;

            if (hits && hits.length > 0) {
                const item = hits[0];

                // 画像URLの取得 (Yahooは image.medium / image.small を返す)
                const imageUrl = item.image && item.image.medium ? item.image.medium : '';

                console.log(`      ✅ 商品発見(Yahoo): ${item.name.substring(0, 15)}...`);

                return {
                    name: item.name,
                    image: imageUrl,
                    price: item.price,
                    url: item.url // Yahooの商品ページURL
                };
            }
            return null;
        } catch (e) {
            console.error(`      ⚠️ APIエラー: ${e.response ? e.response.status : e.message}`);
            return null;
        }
    };

    // 1. そのまま検索
    let result = await executeSearch(keyword);
    if (result) return result;

    // 2. 単語を減らして検索
    const words = keyword.split(/\s+/);
    while (words.length > 1) {
        words.pop();
        const shortKey = words.join(' ');
        result = await executeSearch(shortKey);
        if (result) return result;
    }

    // 3. 最終手段：「シール」で検索
    console.log(`      ⚠️ 最終手段: "シール"で検索`);
    return await executeSearch("シール");
}

// =====================================
// ▼▼▼ HTML生成 (Yahoo画像版 + 3ボタンGrid) ▼▼▼
// =====================================
function generatePochippLikeHtml(keyword, productData) {
    if (!keyword) return '';

    // データがない場合のフォールバック
    const itemName = productData ? productData.name : `${keyword}`;
    const itemImage = (productData && productData.image) ? productData.image : 'https://placehold.jp/300x300.png?text=No%20Image';
    const itemPrice = productData ? `¥${productData.price.toLocaleString()}〜` : '';

    // URLエンコード
    const encKey = encodeURIComponent(keyword);

    // リンク先設定
    // Amazon: 検索結果
    const amazonUrl = `https://www.amazon.co.jp/s?k=${encKey}&tag=${AFFILIATE_ID_AMAZON}`;

    // 楽天: 検索結果 (アフィリエイトIDがある場合)
    const rakutenUrl = `https://hb.afl.rakuten.co.jp/hgc/${AFFILIATE_ID_RAKUTEN}/?pc=${encodeURIComponent('https://search.rakuten.co.jp/search/mall/' + keyword)}`;

    // Yahoo: 検索結果
    const yahooSearchUrl = `https://shopping.yahoo.co.jp/search?p=${encKey}`;

    // メインの画像・タイトルリンク先 (取得できた場合はその商品の直リンク、なければ検索結果)
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
                    font-size: 11px !important; /* 文字数が多い場合に備えて少し小さく */
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
                    background: #51a7e8 !important; /* Yahooっぽい青色 */
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
// Gemini プロンプト (変更なし)
// =====================================
function createPrompt(article) {
    return `
あなたは「Web検索のプロ」兼「親しみやすい人気ブロガー」です。
読者（小学生の子供を持つ親世代）にとって有益なブログ記事を作成してください。

## 元の記事データ
タイトル: ${article.title}
本文: ${article.content}

## 執筆方針
1. **トーン＆マナー:** 「〜です」「〜ます」調の、丁寧かつ明るい文体。
2. **構成:**
   - **JSON出力のみ:** Markdownブロック( \`\`\`json )は含めないでください。
   - 本文HTMLにはタイトル(h1)を含めない。
   - 記事内に外部リンク(aタグ)は含めない。
   - 適度に h2, h3 タグで見出しを作る。

## 広告用データ
記事の内容に基づき、**Amazonや楽天、Yahoo!ショッピングで検索して確実に商品がヒットしそうな「商品キーワード」**を1つだけ選定してください。
**絶対に具体的な型番などは入れず、一般的な名称にしてください。**
（悪い例: "ハンギョドン S8812128"）
（良い例: "ハンギョドン シール", "サンリオ シール"）

## 出力フォーマット (JSON形式のみ)
{
  "title": "記事タイトル",
  "search_keyword": "公式サイト検索ワード",
  "ad_product_keyword": "商品検索用キーワード",
  "html_content": "記事本文のHTML"
}
`;
}

// =====================================
// WordPress 投稿処理 (変更なし)
// =====================================
async function postToWordPress(aiData, originalSlug, categoryIds, tagIds, productData) {
    const credentials = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');

    const adHtml = generatePochippLikeHtml(aiData.ad_product_keyword, productData);
    let contentBody = aiData.html_content;

    // 上
    contentBody = `<p>👇 <strong>この記事で紹介しているアイテム</strong></p>${adHtml}` + contentBody;

    // 中
    const h2Tags = contentBody.match(/<h2/g);
    if (h2Tags && h2Tags.length >= 2) {
        let splitIndex = contentBody.indexOf('<h2', contentBody.indexOf('<h2') + 1);
        contentBody = contentBody.slice(0, splitIndex) + `<p>👇 <strong>気になったら在庫をチェック！</strong></p>${adHtml}` + contentBody.slice(splitIndex);
    } else {
        const middleIndex = Math.floor(contentBody.length / 2);
        const punctIndex = contentBody.indexOf('。', middleIndex);
        if (punctIndex !== -1) {
            contentBody = contentBody.slice(0, punctIndex + 1) + `<p>👇 <strong>気になったら在庫をチェック！</strong></p>${adHtml}` + contentBody.slice(punctIndex + 1);
        }
    }

    // 下
    contentBody += `<hr><p>👇 <strong>売り切れる前にチェック！</strong></p>${adHtml}`;

    // 検索ボックス
    const searchWord = aiData.search_keyword || "公式情報";
    contentBody += `
    <div style="margin-top: 40px; padding: 20px; background-color: #f7f7f7; border: 2px dashed #ccc; border-radius: 8px; text-align: center;">
        <p style="margin-bottom: 10px; font-weight: bold; color: #555;">👇 詳細や最新情報は公式ページで検索！</p>
        <div style="background: #fff; padding: 10px; border: 1px solid #ddd; display: inline-block; border-radius: 4px;">
            <span style="font-size: 1.2em; font-weight: bold; color: #333;">🔍 ${searchWord}</span>
        </div>
    </div>`;

    const finalCategories = categoryIds.length > 0 ? categoryIds : [DEFAULT_CATEGORY_ID];
    const payload = {
        title: aiData.title,
        content: contentBody,
        status: 'publish',
        categories: finalCategories,
        tags: tagIds,
        slug: originalSlug,
    };

    try {
        const response = await axios.post(`${WP_API_URL}/posts`, payload, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ WP投稿成功: ID ${response.data.id} - ${aiData.title}`);
        return true;
    } catch (error) {
        console.error(`❌ WP投稿エラー: ${error.message}`);
        return false;
    }
}

// =====================================
// メイン処理
// =====================================
async function main() {
    const targetFilePath = await getLatestJsonFile();
    if (!targetFilePath) {
        console.log("📂 処理対象ファイルなし");
        return;
    }
    console.log(`📂 対象ファイル: ${path.basename(targetFilePath)}`);

    let articles = [];
    try {
        articles = JSON.parse(await fs.readFile(targetFilePath, 'utf-8'));
    } catch (error) {
        console.error(`❌ 読込エラー: ${error.message}`);
        return;
    }

    let processedCount = 0;

    for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        if (article.done === true) continue;

        console.log(`\n🤖 開始 (${i + 1}/${articles.length}): ${article.title}`);

        try {
            const categoryIds = (await Promise.all((article.categories || []).map(n => getTermId('categories', n)))).filter(id => id !== null);
            const tagIds = (await Promise.all((article.tags || []).map(n => getTermId('tags', n)))).filter(id => id !== null);

            console.log(`✍️  AI執筆中...`);
            const prompt = createPrompt(article);
            const result = await model.generateContent(prompt);
            const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            const aiData = JSON.parse(text);

            console.log(`🛍️  商品情報を検索中(Yahoo): ${aiData.ad_product_keyword}`);

            // ▼▼▼ ここでYahoo検索関数を呼び出す ▼▼▼
            const productData = await fetchYahooProduct(aiData.ad_product_keyword);

            if (productData) {
                console.log(`   └ 商品発見: ${productData.name.substring(0, 20)}...`);
            } else {
                console.log(`   └ 商品が見つかりませんでした (NoImage)`);
            }

            const isSuccess = await postToWordPress(aiData, article.slug, categoryIds, tagIds, productData);

            if (isSuccess) {
                articles[i].done = true;
                processedCount++;
                await fs.writeFile(targetFilePath, JSON.stringify(articles, null, 2), 'utf-8');
            }
            await new Promise(r => setTimeout(r, 3000));

        } catch (err) {
            console.error(`❌ エラー:`, err.message);
        }
    }

    const allDone = articles.every(a => a.done === true);
    if (allDone && articles.length > 0) {
        const dir = path.dirname(targetFilePath);
        const newFilePath = path.join(dir, `done_${path.basename(targetFilePath)}`);
        await fs.rename(targetFilePath, newFilePath);
        console.log(`✅ 完了`);
    }
}

main();