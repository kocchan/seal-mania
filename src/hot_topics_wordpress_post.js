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

        if (checkData.is_approved) {
            return { is_approved: true, content: draft.content };
        }

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
            return { is_approved: true, content: fixData.fixed_content };
        } else {
            return { is_approved: false, reason: fixData.reason };
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
    "product_name": "商品名（例: ボンボンドロップシール）。※アフィリエイト検索用に使用するため、店舗名ではなく必ずシール等の商品名を記載してください。",
    "status_text": "販売状況の簡潔な説明（例: レジ横で行列ができています！）",
    "confidence_memo": "読者への注意点（例: 在庫切れの可能性が高いので朝イチ推奨）",
    "tweet_url": "下書き内にある参考XのURLを1つ抽出"
}
`;
    try {
        const res = await jsonModel.generateContent(prompt);
        const jsonStr = res.response.text().replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
        const data = JSON.parse(jsonStr);

        let cleanTweetUrl = data.tweet_url || "";
        if (cleanTweetUrl.includes("?")) {
            cleanTweetUrl = cleanTweetUrl.split("?")[0];
        }
        cleanTweetUrl = cleanTweetUrl.replace(/https:\/\/x\.com/g, "[https://twitter.com](https://twitter.com)");

        const mapQuery = encodeURIComponent(data.shop_address || data.shop_name);
        const mapEmbedUrl = `https://maps.google.co.jp/maps?output=embed&q=${mapQuery}&t=m&z=15`;

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
            product_name: data.product_name,
            title: `【目撃速報】${data.product_name}｜${data.prefecture || ""}${data.city || ""}（${data.shop_name}）`
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
あなたはプロのWebライターです。以下の【元の下書き】に対し、【追加の関連ツイート】の情報を加味して、記事の内容に深みを増すように再編集し、指定されたJSONフォーマットでパーツごとに出力してください。
※趣旨と違う無関係なノイズ情報は無視してください。

【タイトル生成ルール】
現在の記事タイプは「${draft.article_type}」です。
このタイプに応じて、以下の対応するカッコ書きをタイトルの先頭に必ず付けてください。
* 【B】入荷・抽選情報（今月の新作）の場合：「【今月の新作】」
* 【C】入荷・抽選情報（抽選・予約情報）の場合：「【抽選・予約情報】」
* 【D】入荷・抽選情報（オンライン通販）の場合：「【オンライン通販】」
* 【E】キャラクターシールの場合：「【キャラクターシール】」
* 【F】店舗攻略情報 / 一般ガイドの場合：「【店舗攻略情報】」 または 「【一般ガイド】」

タイトルの後半は、記事の内容に合わせて以下のいずれかの形式で作成してください。（全体で30〜40文字程度）
1. 店舗が関係する内容の場合： 商品名｜都道府県市区町村（店舗名）
   （例：【抽選・予約情報】ボンボンドロップシール｜東京都渋谷区（キデイランド原宿店））
2. 店舗が関係しない内容の場合： 商品名｜記事の要約（キャッチーなフレーズ）
   （例：【オンライン通販】ボンボンドロップシール｜Amazonでの争奪戦を勝ち抜くコツ）
   （例：【キャラクターシール】お文具さん｜SNSで話題沸騰！交換レート高騰の理由）

【執筆・HTMLコーディングルール】
* ターゲットは「熱烈にシールを集めている小学生の女の子」と「一緒にシールを探すお母さん」です。
* ニュース記事のような硬い口調（〜である、〜だ、〜にあります、〜してください 等）はやめてください。
* 「です」「ます」の普通のテンションのブログでの口調にしてください。
* 誰が書いても同じになる一般論ではなく、マニアックな視点を入れてください。
* 固有名詞や数字は正確に記載してください。
* **各項目の本文(conclusion_html, analysis_html, tips_html, summary_html)は、Markdownを使わずにHTMLタグ（<p>, <strong>, <ul>, <li>など）のみを使って記述してください。** （見出しの<h2>等はプログラム側で付与するので含めないでください）

【構成フォーマット（以下の流れでHTMLを作成）】
1. 簡単な結論（3秒でわかる！この記事の結論）※ 元の結論部分を要約し、**必ず一文（ワンセンテンス）**にまとめてください。リスト(<ul>, <li>)は使用せず、<p>タグを使用してください。
2. ファクトとしての現場の声
3. 詳細な解説と考察
4. 攻略方法やTips（なければ省略可）
5. まとめ（締めの言葉）

【元の下書き】
${draft.content}

【追加の関連ツイート情報】
${extraInfo}

必ず以下のJSONスキーマに従って出力してください。Markdownのコードブロック(json)は不要です。直接JSONのみを出力してください。
{
    "title": "ルールに従って生成したタイトル",
    "product_name": "記事内で扱っているメインの商品名（例: ボンボンドロップシール）。※店舗名や話題ではなく、アフィリエイト検索用に使用する具体的な「商品名」を記載してください。商品名がない場合は空文字",
    "conclusion_html": "さらに要約した一文のみの結論（<p>タグを使用。見出し不要）",
    "voices": [
        {
            "quote": "引用する口コミのテキスト（改変しないこと）",
            "tweet_url": "対象のX(Twitter)URL（Markdownのカッコやテキストは含めず、Xのhttps://...から始まる純粋なURL文字列のみを出力すること）"
        }
    ],
    "analysis_html": "詳細分析と独自の考察の本文（<p>タグ等を使用。見出し不要）",
    "tips_html": "読者へのアドバイス・攻略法の本文（<p>タグ等を使用。見出し不要。ない場合は空文字）",
    "summary_html": "まとめの本文（<p>タグ等を使用。見出し不要）"
}
`;
    try {
        const res = await jsonModel.generateContent(prompt);
        const jsonStr = res.response.text().replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
        const data = JSON.parse(jsonStr);

        let templateHtml = `<h2>💡 この記事のポイント</h2>\n${data.conclusion_html || ""}\n\n`;

        templateHtml += `<h2>💬 みんなの声</h2>\n`;
        (data.voices || []).forEach(v => {
            let cleanUrl = v.tweet_url || "";
            const urlMatchB = cleanUrl.match(/https?:\/\/(?:twitter\.com|x\.com)\/[^\s)"\]]+/);
            if (urlMatchB) {
                cleanUrl = urlMatchB[0];
            }

            if (cleanUrl.includes("?")) cleanUrl = cleanUrl.split("?")[0];
            cleanUrl = cleanUrl.replace(/https:\/\/x\.com/g, "https://twitter.com");

            // 📍 修正：テキストの引用文(<blockquote>)を削除し、Xの埋め込みのみを表示する
            if (cleanUrl) {
                templateHtml += `<figure class="wp-block-embed is-type-rich is-provider-twitter wp-block-embed-twitter">\n    <div class="wp-block-embed__wrapper">\n        ${cleanUrl}\n    </div>\n</figure>\n\n`;
            }
        });

        templateHtml += `<h2>🤔 なぜこんな状況なの？（くわしい解説）</h2>\n${data.analysis_html || ""}\n\n`;

        if (data.tips_html && data.tips_html.trim() !== "") {
            templateHtml += `<h2>📝 失敗しないためのアドバイス</h2>\n${data.tips_html}\n\n`;
        }

        templateHtml += `<h2>🌟 まとめ</h2>\n${data.summary_html || ""}\n`;

        return {
            html_content: templateHtml,
            product_name: data.product_name,
            title: data.title
        };

    } catch (e) {
        console.error("Type B-F Enhancement Error:", e);
        return null;
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
    const defaultKeyword = "ボンボンドロップ";
    if (!keyword || keyword.trim() === "") {
        keyword = defaultKeyword;
    }

    const executeSearch = async (query) => {
        try {
            const response = await axios.get('https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch', {
                params: { appid: YAHOO_CLIENT_ID, query: query, results: 1, sort: '-score', image_size: 300 }
            });
            const hits = response.data.hits;
            if (hits && hits.length > 0) {
                const item = hits[0];
                return { name: item.name, image: item.image?.medium || '', price: item.price, url: item.url };
            }
            return null;
        } catch (e) { return null; }
    };

    let result = await executeSearch(keyword);
    if (result) return { data: result, keyword: keyword };

    console.log(`      ⚠️ Yahoo検索ヒットなし: "${keyword}" -> 最終手段: "${defaultKeyword}"で検索`);
    result = await executeSearch(defaultKeyword);
    return { data: result, keyword: defaultKeyword };
}

function generatePochippLikeHtml(keyword, productData) {
    if (!keyword) keyword = 'ボンボンドロップ';
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
                draft.title = enhancedData.title;
                draft.tags = draft.tags || [];
                if (!draft.tags.includes("目撃速報")) {
                    draft.tags.push("目撃速報");
                }
            } else {
                finalHtmlContent = draft.content;
            }
        } else {
            const extraTweets = await fetchRawTweetsByWord(draft.word);
            const enhancedData = await enhanceTypeBtoF(draft, extraTweets);
            if (enhancedData) {
                finalHtmlContent = enhancedData.html_content;
                searchKeyword = enhancedData.product_name || draft.word;
                draft.title = enhancedData.title || draft.title;
            } else {
                finalHtmlContent = draft.content;
            }
        }

        // 4. アフィリエイト準備
        const yahooResult = await fetchYahooProduct(searchKeyword);
        const productData = yahooResult.data;
        const finalKeyword = yahooResult.keyword;

        const adHtml = generatePochippLikeHtml(finalKeyword, productData);

        // 📍 修正：アフィリエイトの挿入（冒頭、実際の声の直下、一番下）
        let contentBody = `${adHtml}\n\n` + finalHtmlContent;

        if (draft.article_type && draft.article_type.includes("【A】")) {
            // Aパターンの場合：2つ目の見出し(<h3>)の前に挿入
            const h3Tags = contentBody.match(/<h3/g);
            if (h3Tags && h3Tags.length >= 2) {
                let splitIndex = contentBody.indexOf('<h3'); // 1つ目
                splitIndex = contentBody.indexOf('<h3', splitIndex + 1); // 2つ目
                contentBody = contentBody.slice(0, splitIndex) + `${adHtml}\n\n` + contentBody.slice(splitIndex);
            }
        } else {
            // B〜Fパターンの場合：みんなの声の直下（＝「🤔 なぜこんな状況なの？」の前）に挿入
            const targetHeader = '<h2>🤔 なぜこんな状況なの？（くわしい解説）</h2>';
            if (contentBody.includes(targetHeader)) {
                contentBody = contentBody.replace(targetHeader, `${adHtml}\n\n${targetHeader}`);
            } else {
                // 万が一見出しが見つからない場合のフォールバック（3つ目の<h2>の前）
                const h2Tags = contentBody.match(/<h2/g);
                if (h2Tags && h2Tags.length >= 3) {
                    let splitIndex = contentBody.indexOf('<h2');
                    splitIndex = contentBody.indexOf('<h2', splitIndex + 1);
                    splitIndex = contentBody.indexOf('<h2', splitIndex + 1);
                    contentBody = contentBody.slice(0, splitIndex) + `${adHtml}\n\n` + contentBody.slice(splitIndex);
                }
            }
        }

        contentBody += `\n<hr>\n${adHtml}`;

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