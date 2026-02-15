import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import axios from 'axios';
import crypto from 'crypto';
import { ScanCommand, UpdateCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { CONFIG } from './config.js';
import { dbClient, getNowJST } from './utils.js';

dotenv.config();

// =====================================
// ⚙️ 設定・定数
// =====================================
const DRAFT_TABLE = "TrendKeywords_DraftArticle";
const RAW_TWEETS_TABLE = "TrendKeywords_RawTweets";
const ARTICLE_TABLE = "TrendKeywords_article";
const DEFAULT_CATEGORY_ID = 97;

const GEN_AI_KEY = process.env.GEMINI_API_KEY;
const WP_API_URL = process.env.WP_API_URL;
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

const YAHOO_CLIENT_ID = 'dmVyPTIwMjUwNyZpZD1GRlZOZDRrQ0JwJmhhc2g9TmpnME4yUmxNbUZtT1RWak1XVTVaQQ';
const AFFILIATE_ID_AMAZON = 'sealmania-22';
const AFFILIATE_ID_RAKUTEN = '50f17d50.13213066.50f17d51.fed7b043';

// Gemini初期化
const genAI = new GoogleGenerativeAI(GEN_AI_KEY);
const jsonModel = genAI.getGenerativeModel({
    model: "gemini-3-pro-preview",
    generationConfig: { responseMimeType: "application/json" }
});
// 執筆用
const writerModel = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

const termCache = { categories: {}, tags: {} };

// =====================================
// 🗄️ DynamoDB データ取得・更新
// =====================================

async function fetchUnprocessedDrafts() {
    try {
        console.log(`📚 DynamoDB (${DRAFT_TABLE}) から未処理の下書きを取得中...`);
        const result = await dbClient.send(new ScanCommand({
            TableName: DRAFT_TABLE,
            FilterExpression: "is_processed = :falseVal",
            ExpressionAttributeValues: { ":falseVal": false }
        }));
        return result.Items || [];
    } catch (e) {
        console.error("⚠️ 下書き取得失敗:", e.message);
        return [];
    }
}

async function fetchRawTweetsByWord(word) {
    try {
        const result = await dbClient.send(new ScanCommand({
            TableName: RAW_TWEETS_TABLE,
            FilterExpression: "word = :w",
            ExpressionAttributeValues: { ":w": word }
        }));
        return result.Items || [];
    } catch (e) {
        return [];
    }
}

async function updateDraftStatus(draftId, isProcessed, isRejected) {
    try {
        await dbClient.send(new UpdateCommand({
            TableName: DRAFT_TABLE,
            Key: { draft_id: draftId },
            UpdateExpression: "set is_processed = :p, is_rejected = :r, updated_at = :now",
            ExpressionAttributeValues: {
                ":p": isProcessed,
                ":r": isRejected,
                ":now": getNowJST()
            }
        }));
    } catch (e) {
        console.error(`⚠️ 下書きステータス更新失敗 (${draftId}):`, e.message);
    }
}

async function savePublishedArticle(articleData) {
    try {
        await dbClient.send(new PutCommand({
            TableName: ARTICLE_TABLE,
            Item: {
                article_id: crypto.randomUUID(),
                ...articleData,
                published_at: getNowJST()
            }
        }));
        console.log(`      💾 投稿済み記事をDBに保存しました。`);
    } catch (e) {
        console.error(`      ❌ 記事DB保存エラー:`, e.message);
    }
}

// =====================================
// 🤖 AI 処理関連
// =====================================

// 1. 検閲関数（記事の質を評価し、NGなら修正を試みる）
async function censorDraft(draft) {
    console.log(`   🕵️‍♂️ 記事の質を検閲中...`);
    const checkPrompt = `
あなたはターゲット読者（熱烈にシールを欲しがっているお子さんやその母親）の目線を持つ厳しい編集長です。
以下の記事下書きを読み、読者にとって本当に有益か判定してください。

【リジェクト（却下）基準】
* 答えになっていない、有益な情報がない。
* 単なる個人の感想の羅列になっている。
* 面白みがない、何か言っているようで行っていない（薄っぺらい内容）。

【記事下書き】
タイトル: ${draft.title}
本文:
${draft.content}

以下のJSON形式で出力してください。
{
    "is_approved": trueまたはfalse,
    "reason": "判定理由（簡潔に）"
}
`;
    try {
        const checkRes = await jsonModel.generateContent(checkPrompt);
        const checkJsonStr = checkRes.response.text().replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
        const checkData = JSON.parse(checkJsonStr);

        // 1発でOKの場合
        if (checkData.is_approved) {
            return { is_approved: true, content: draft.content };
        }

        // NGの場合、修正・加筆を試みる
        console.log(`   ⚠️ 検閲NG（理由: ${checkData.reason}）。記事の修正を試みます...`);
        const fixPrompt = `
あなたはプロのWebライターです。
以下の【記事下書き】は、編集長から以下の【NG理由】で差し戻されました。
NG理由を解消し、読者にとって有益で深みのある記事になるよう修正・加筆を行ってください。

ただし、与えられた元の情報だけではどうしても要件を満たせない（情報が決定的に不足しており、推測で補うこともできない）場合は、修正不可能としてください。（事実の捏造は厳禁です）

【NG理由】
${checkData.reason}

【記事下書き】
タイトル: ${draft.title}
本文:
${draft.content}

以下のJSON形式で出力してください。
{
    "can_fix": trueまたはfalse（修正できたかどうか）,
    "fixed_content": "修正後の記事本文（Markdown形式。修正できない場合は空文字でOK）",
    "reason": "修正したポイント、または修正できなかった理由"
}
`;
        const fixRes = await jsonModel.generateContent(fixPrompt);
        const fixJsonStr = fixRes.response.text().replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
        const fixData = JSON.parse(fixJsonStr);

        if (fixData.can_fix) {
            console.log(`   🛠️ 修正成功: ${fixData.reason}`);
            return { is_approved: true, content: fixData.fixed_content }; // 修正できた場合はtrueと新しい本文を返す
        } else {
            return { is_approved: false, reason: fixData.reason }; // 修正不可能な場合のみ最終NG
        }

    } catch (e) {
        return { is_approved: false, reason: "AI判定・修正エラー" };
    }
}

// 2. 【A】目撃情報用のHTMLデータ生成
async function enhanceTypeA(draft) {
    console.log(`   ✍️ 【A】目撃情報として記事を整形・住所検索中...`);
    const prompt = `
あなたはプロのWebライターです。以下の記事下書きと設定をもとに、指定されたJSONフォーマットでデータを出力してください。
記事のトピックとなっている「店舗」の実際の住所をGoogle検索等で推測・特定し、記載してください。

【執筆ルール】
* 固有名詞や数字はファクトチェックした体で正確に記載してください。

【記事下書き】
${draft.content}

【出力JSONフォーマット】
{
    "prefecture": "都道府県名",
    "city": "市区町村名",
    "shop_name": "店舗名（例: バースデイ長浜店）",
    "shop_address": "店舗の実際の住所（ネットで推測して記載）",
    "product_name": "商品名（例: ボンボンドロップシール）",
    "status_text": "販売状況の簡潔な説明（例: レジ横で行列ができています！）",
    "confidence_memo": "読者への注意点（例: 在庫切れの可能性が高いので朝イチ推奨）",
    "tweet_url": "下書き内にある参考XのURLを1つ抽出"
}
`;
    try {
        const res = await jsonModel.generateContent(prompt);
        const jsonStr = res.response.text().replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
        const data = JSON.parse(jsonStr);

        // URLをクリーンにする
        let cleanTweetUrl = data.tweet_url || "";
        if (cleanTweetUrl.includes("?")) {
            cleanTweetUrl = cleanTweetUrl.split("?")[0];
        }
        cleanTweetUrl = cleanTweetUrl.replace("[https://x.com](https://x.com)", "[https://twitter.com](https://twitter.com)");

        const mapQuery = encodeURIComponent(data.shop_address || data.shop_name);
        const mapEmbedUrl = `https://maps.google.co.jp/maps?output=embed&q=${mapQuery}&t=m&z=15`;

        // WordPressの標準的なTwitter埋め込みブロック構造にする
        const templateHtml = `
<p>${data.prefecture || "エリア不明"}${data.city || ""}の「${data.shop_name}」にて、${data.product_name}の目撃情報があります！<br>
${data.status_text} お近くの方はチェックしてみる価値がありそうです。</p>

<p><strong>📅 目撃・入荷時期</strong> 本日〜昨近</p>

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
    <iframe width="100%" height="100%" frameborder="0" style="border:0; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" src="${mapEmbedUrl}" allowfullscreen></iframe>
</div>
`;

        return {
            html_content: templateHtml,
            product_name: data.product_name
        };
    } catch (e) {
        console.error("Type A Enhancement Error:", e);
        return null;
    }
}

// 3. 【B】〜【F】用の記事肉付け・強化・HTML化
async function enhanceTypeBtoF(draft, extraTweets) {
    console.log(`   ✍️ 【B〜F】関連ツイートを元に記事を肉付け・強化・HTML化中...`);
    const extraInfo = extraTweets.map(t => t.text).join('\n');

    const prompt = `
あなたはプロのWebライターです。以下の【元の下書き】に対し、【追加の関連ツイート】の情報を加味して、記事の内容に深みを増すように再編集し、WordPressにそのまま投稿できるHTML形式で出力してください。
※趣旨と違う無関係なノイズ情報は無視してください。

【執筆・HTMLコーディングルール】
* 「この記事を書いた人の顔（個性）が浮かぶか？」と自問してください。
* 誰が書いても同じになる一般論ではなく、マニアックな視点を入れてください。
* 不自然な接続詞（また、さらに等）の連続を避け、文末のリズム感を整えてください。
* 固有名詞や数字は正確に。
* **出力はMarkdownではなく、すべてHTMLタグ（<h2>, <h3>, <p>, <ul>, <li>, <blockquote>など）を使用してください。**
* X（Twitter）のURLを記載する際は、単なるテキストリンク（<a href="...">）ではなく、必ず以下のWordPress埋め込み用HTMLフォーマットを使用してください。（URLの ? 以降のパラメータは削除したクリーンなURLを入れてください）
  <figure class="wp-block-embed is-type-rich is-provider-twitter wp-block-embed-twitter">
      <div class="wp-block-embed__wrapper">
          [https://twitter.com/xxxx/status/123456789](https://twitter.com/xxxx/status/123456789)
      </div>
  </figure>

【構成フォーマット（以下の流れでHTMLを作成）】
1. 簡単な結論を一文で※ <ul> と <li> を使用
2. 現場の声（<blockquote> と 上記のX埋め込みフォーマットを使用）
3. 詳細な解説と考察（<h2> と <p> を使用）
4. 攻略方法やTipsや補足情報（なければ省略可）
5. まとめ（締めの言葉）

【元の下書き】
${draft.content}

【追加の関連ツイート情報】
${extraInfo}

必ず以下のJSONスキーマに従って出力してください。Markdownのコードブロック(json)は不要です。直接JSONのみを出力してください。
{
    "html_content": "完成したHTML形式の記事本文"
}
`;
    try {
        const res = await jsonModel.generateContent(prompt);
        const jsonStr = res.response.text().replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
        const data = JSON.parse(jsonStr);
        return data.html_content;
    } catch (e) {
        console.error("Type B-F Enhancement Error:", e);
        return draft.content;
    }
}

// =====================================
// ヘルパー・アフィリエイト・WP
// =====================================

async function getTermId(taxonomy, termName) {
    if (!termName) return null;
    if (taxonomy === 'categories' && CONFIG.wpCategoryMap) {
        if (CONFIG.wpCategoryMap[termName]) return CONFIG.wpCategoryMap[termName];
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

async function fetchYahooProduct(keyword) {
    if (!keyword) return null;
    try {
        const response = await axios.get('https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch', {
            params: { appid: YAHOO_CLIENT_ID, query: keyword, results: 1, sort: '-score', image_size: 300 }
        });
        const hits = response.data.hits;
        if (hits && hits.length > 0) {
            const item = hits[0];
            return { name: item.name, image: item.image?.medium || '', price: item.price, url: item.url };
        }
        return null;
    } catch (e) { return null; }
}

function generatePochippLikeHtml(keyword, productData) {
    if (!keyword) return '';
    const itemName = productData ? productData.name : `${keyword}`;
    const itemImage = (productData && productData.image) ? productData.image : 'https://placehold.jp/300x300.png?text=No%20Image';
    const itemPrice = productData ? `¥${productData.price.toLocaleString()}〜` : '';
    const encKey = encodeURIComponent(keyword);
    const amazonUrl = `https://www.amazon.co.jp/s?k=${encKey}&tag=${AFFILIATE_ID_AMAZON}`;
    const rakutenUrl = `https://hb.afl.rakuten.co.jp/hgc/${AFFILIATE_ID_RAKUTEN}/?pc=${encodeURIComponent('https://search.rakuten.co.jp/search/mall/' + keyword)}`;
    const yahooSearchUrl = `https://shopping.yahoo.co.jp/search?p=${encKey}`;
    const mainLinkUrl = productData ? productData.url : yahooSearchUrl;

    return `
    <div style="border: 2px solid #f2f2f2; border-radius: 4px; padding: 15px; margin: 40px 0; background: #fff; display: flex; flex-wrap: wrap; align-items: center; gap: 20px; width: 100%; box-sizing: border-box;">
        <div style="flex: 0 0 120px; width: 120px; margin: 0 auto; text-align: center;">
            <a href="${mainLinkUrl}" target="_blank" rel="nofollow"><img src="${itemImage}" alt="${keyword}" style="max-width: 100%; max-height: 120px;"></a>
        </div>
        <div style="flex: 1; min-width: 200px;">
            <div style="margin-bottom: 15px;"><a href="${mainLinkUrl}" target="_blank" rel="nofollow" style="font-weight: bold; color: #333; text-decoration: none;">${itemName}</a><div style="color: #d32f2f; font-size: 13px; margin-top: 5px;">${itemPrice}</div></div>
            <div style="display: flex; gap: 10px;">
                <a href="${amazonUrl}" target="_blank" rel="nofollow" style="flex: 1; text-align: center; background: #ff9900; color: #fff; padding: 10px 0; font-weight: bold; border-radius: 4px; text-decoration: none; font-size: 12px;">Amazon</a>
                <a href="${rakutenUrl}" target="_blank" rel="nofollow" style="flex: 1; text-align: center; background: #bf0000; color: #fff; padding: 10px 0; font-weight: bold; border-radius: 4px; text-decoration: none; font-size: 12px;">楽天市場</a>
                <a href="${yahooSearchUrl}" target="_blank" rel="nofollow" style="flex: 1; text-align: center; background: #51a7e8; color: #fff; padding: 10px 0; font-weight: bold; border-radius: 4px; text-decoration: none; font-size: 12px;">Yahoo!</a>
            </div>
        </div>
    </div>`;
}

// =====================================
// 🚀 メインパイプライン
// =====================================

async function main() {
    console.log('🚀 記事の検閲・強化・投稿プロセスを開始します');

    const drafts = await fetchUnprocessedDrafts();
    if (drafts.length === 0) {
        console.log('💤 処理すべき下書きがありません。');
        return;
    }

    for (const draft of drafts) {
        console.log(`\n================================`);
        console.log(`📄 対象: ${draft.title} (Score: ${draft.evaluation_score})`);

        // 1. スコアによる足切り
        if (draft.evaluation_score < 7) {
            console.log(`   🚫 スコア不足のため却下 (is_rejected = true に更新)`);
            await updateDraftStatus(draft.draft_id, true, true);
            continue;
        }

        // 2. AIによる検閲（修正込み）
        const censorResult = await censorDraft(draft);
        if (!censorResult.is_approved) {
            console.log(`   🚫 検閲により最終却下: ${censorResult.reason}`);
            await updateDraftStatus(draft.draft_id, true, true);
            continue;
        }
        // 検閲（修正）をクリアした本文で上書き
        draft.content = censorResult.content;
        console.log(`   ✅ 検閲クリア！`);

        // 3. 記事の強化・肉付け
        let finalHtmlContent = "";
        let searchKeyword = draft.word;

        if (draft.article_type && draft.article_type.includes("【A】")) {
            const enhancedData = await enhanceTypeA(draft);
            if (enhancedData) {
                finalHtmlContent = enhancedData.html_content;
                searchKeyword = enhancedData.product_name || draft.word;
            } else {
                finalHtmlContent = draft.content;
            }
        } else {
            const extraTweets = await fetchRawTweetsByWord(draft.word);
            finalHtmlContent = await enhanceTypeBtoF(draft, extraTweets);
        }

        // 4. アフィリエイト準備
        const productData = await fetchYahooProduct(searchKeyword);
        const adHtml = generatePochippLikeHtml(searchKeyword, productData);

        // 5. アフィリエイトの挿入（上・中・下）
        let contentBody = `<p>👇 <strong>この記事で紹介しているアイテム</strong></p>${adHtml}` + finalHtmlContent;

        const h2Tags = contentBody.match(/<h2/g) || contentBody.match(/## /g);
        if (h2Tags && h2Tags.length >= 2) {
            const splitTag = contentBody.includes('<h2') ? '<h2' : '## ';
            let splitIndex = contentBody.indexOf(splitTag, contentBody.indexOf(splitTag) + 1);
            contentBody = contentBody.slice(0, splitIndex) + `\n<p>👇 <strong>気になったら在庫をチェック！</strong></p>\n${adHtml}\n` + contentBody.slice(splitIndex);
        }
        contentBody += `\n<hr>\n<p>👇 <strong>売り切れる前にチェック！</strong></p>\n${adHtml}`;

        // 6. カテゴリ・タグのID化
        const categoryIds = [];
        for (const catName of (draft.categories || [])) {
            const id = await getTermId('categories', catName);
            if (id) categoryIds.push(id);
        }
        if (categoryIds.length === 0) categoryIds.push(DEFAULT_CATEGORY_ID);

        const tagIds = [];
        for (const tagName of (draft.tags || [])) {
            const id = await getTermId('tags', tagName);
            if (id) tagIds.push(id);
        }

        // 7. WordPressへ投稿
        const payload = {
            title: draft.title,
            content: contentBody,
            status: 'publish',
            categories: categoryIds,
            tags: tagIds,
            slug: draft.slug
        };

        const credentials = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');
        try {
            const response = await axios.post(`${WP_API_URL}/posts`, payload, {
                headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' }
            });
            console.log(`   ✅ WP投稿成功: ID ${response.data.id}`);

            // 8. 投稿データをDynamoDB に保存
            const articleDataToSave = {
                word: draft.word,
                wp_post_id: response.data.id,
                title: payload.title,
                content: payload.content,
                categories: draft.categories,
                tags: draft.tags,
                slug: payload.slug,
                reference_urls: draft.reference_urls,
                tweet_ids: draft.tweet_id,
                tweet_post_dates: draft.tweetpostdata
            };
            await savePublishedArticle(articleDataToSave);

            // 9. 下書きを処理済みに更新
            await updateDraftStatus(draft.draft_id, true, false);

        } catch (error) {
            console.error(`   ❌ WP投稿エラー: ${error.response?.data?.message || error.message}`);
        }

        await new Promise(res => setTimeout(res, 5000));
    }

    console.log(`\n🎉 全ての処理が完了しました`);
}

main();