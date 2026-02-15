import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// 環境変数の読み込み
dotenv.config();

// ==========================================
// 設定・定数定義
// ==========================================
const TABLE_NAME = "TrendKeywords_DraftArticle";
const OUTPUT_DIR = path.join(process.cwd(), 'data'); // 画像保存先ディレクトリ

// Gemini API クライアントの初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 画像生成モデルの指定（IMAGEモード）
const imageModel = genAI.getGenerativeModel({
    model: "gemini-3-pro-image-preview",
    generationConfig: {
        responseModalities: ["IMAGE"]
    }
});

// DynamoDB クライアントの初期化
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-northeast-1" });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// 地方ごとのカラー設定（背景色として淡く使うための基準色）
const REGION_COLORS = {
    "北海道・東北": "#4FC3F7", // Light Blue
    "関東": "#FF6699", // Pop Pink
    "中部": "#FF9800", // Vivid Orange
    "近畿": "#BA68C8", // Light Purple
    "中国・四国": "#4CAF50", // Flat Green
    "九州・沖縄": "#EF5350", // Bright Red
    "default": "#FF6699" // Default
};

// 都道府県のリスト
const PREFECTURES = [
    "北海道", "青森", "岩手", "宮城", "秋田", "山形", "福島",
    "茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川",
    "新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜", "静岡", "愛知",
    "三重", "滋賀", "京都", "大阪", "兵庫", "奈良", "和歌山",
    "鳥取", "島根", "岡山", "広島", "山口", "徳島", "香川", "愛媛", "高知",
    "福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島", "沖縄"
];

// ==========================================
// ヘルパー関数
// ==========================================

function ensureDirectoryExistence(filePath) {
    if (fs.existsSync(filePath)) {
        return true;
    }
    fs.mkdirSync(filePath, { recursive: true });
}

// 📍 メタデータ抽出を強化（市名も取得）
function extractMetadata(article) {
    let prefecture = "";
    let cityName = "";
    let region = "default";
    const product_name = "ボンボンドロップシール"; // 商品名は固定
    let extra_keywords = [];

    // tagsから情報を抽出
    if (article.tags && Array.isArray(article.tags)) {
        for (const tag of article.tags) {
            if (PREFECTURES.includes(tag)) {
                if (!prefecture) prefecture = tag;
            } else if (tag !== '目撃速報') {
                // 都道府県でも目撃速報でもないタグを、市名の候補とする
                if (!cityName) {
                    cityName = tag;
                } else {
                    extra_keywords.push(tag);
                }
            }
        }
    }

    // categoriesから都道府県と地域を特定（tagsになかった場合）
    if (article.categories && Array.isArray(article.categories)) {
        for (const cat of article.categories) {
            if (PREFECTURES.includes(cat)) {
                if (!prefecture) prefecture = cat;
            }
            if (REGION_COLORS[cat]) {
                region = cat;
            }
        }
    }

    // 表示用の地域名を作成
    let displayLocation = prefecture || "地域不明";
    if (cityName) {
        displayLocation = `${prefecture}${cityName}`;
    }

    return { displayLocation, prefecture, cityName, region, product_name, extra_keywords };
}

function getThemeColor(region) {
    return REGION_COLORS[region] || REGION_COLORS.default;
}

// ==========================================
// メイン処理関数
// ==========================================

async function fetchTargetDrafts() {
    const params = {
        TableName: TABLE_NAME,
        FilterExpression: "is_processed = :is_proc AND evaluation_score >= :min_score",
        ExpressionAttributeValues: {
            ":is_proc": false,
            ":min_score": 7
        }
    };

    try {
        const data = await docClient.send(new ScanCommand(params));
        console.log(`📋 対象データ取得成功: ${data.Items.length}件`);
        return data.Items;
    } catch (err) {
        console.error("❌ DynamoDB fetch error:", err);
        return [];
    }
}

async function generateAndSaveImage(article) {
    const draftId = article.draft_id;
    const articleType = article.article_type || "";
    const fileName = `${draftId}.png`;
    const filePath = path.join(OUTPUT_DIR, fileName);

    console.log(`\n🎨 画像生成開始 [ID: ${draftId}] [Type: ${articleType}]`);

    // 📍 共通のメタデータを抽出
    const { displayLocation, prefecture, cityName, region, product_name, extra_keywords } = extractMetadata(article);
    let prompt = "";

    if (articleType.includes("【A】")) {
        // 📍 Type A: 目撃情報（リッチでポップ、市名あり）
        const color = getThemeColor(region);
        console.log(`   ℹ️ 設定[A]: ${displayLocation} / Color: ${color}`);

        prompt = `
            You are a professional illustrator creating a **rich, detailed, pop-style hand-drawn illustration** for a web article.
            The image conveys a "Breaking News" report about finding a popular item.

            **[Design Configuration]**
            * **Aspect Ratio**: 16:9
            * **Style**: Hand-drawn with colored pencils/markers. **Not simple.** Full of fun details, patterns, and decorations (sparkles, stars, dots).
            * **Background**: A **pale, light shade** based on the color ${color}, with a fun pattern like polka dots or stripes.
            * **Composition**: Center a cute, stylized illustration of the product package ("${product_name}", which is a pack of **stickers**, not candy). Surround it with fun doodles.

            **[Text Elements (Mandatory)]**
            1.  **"目撃速報" Stamp**:
                * Text: "目撃速報"
                * Style: Red rubber stamp, tilted diagonally in the **Top Right corner**.
            2.  **Location Name**:
                * Text: "${prefecture}" (Large)
                * ${cityName ? `Text: "${cityName}" (Smaller, below prefecture)` : ""}
                * Position: Prominently placed near the center.
                * Style: Fun, bold, hand-drawn font with an outline.

            **[Absolute Rules]**
            * Make it look lively, exciting, and full of "Yume-Kawaii" pop energy.
            * The product is **STICKERS**.
            * Render Japanese text precisely.
        `;

    } else {
        // 📍 Type B-F: その他（リッチでポップ、キーワード追加）
        const articleTitle = article.title || "No Title";
        const contentSummary = article.content ? article.content.substring(0, 100) : articleTitle;
        const keywordsStr = extra_keywords.length > 0 ? extra_keywords.join(", ") : "なし";
        console.log(`   ℹ️ 設定[B-F]: Title: ${articleTitle.substring(0, 20)}... / Keywords: ${keywordsStr}`);

        prompt = `
            You are a professional illustrator creating a **rich, detailed, pop-style hand-drawn illustration** for a web article.
            Create an impactful visual that conveys the main point at a glance.

            **[Absolute Rules]**
            1. **One Main Visual**: Pick ONE main point and draw it big in the center.
            2. **Rich Details**: Add fun patterns, decorations, and background elements to make it lively. **Not simple.**
            3. **Minimal Text**: Use very little text (main keywords only).

            **[Design Configuration]**
            * **Aspect Ratio**: 16:9
            * **Touch**: Hand-drawn style (colored pencils, crayons). Warm, cute, "Yume-Kawaii" pop atmosphere with pastel colors.
            * **Background**: Fun patterns (dots, stars) using pastel colors.

            **[Article Context]**
            * **Subject**: "${product_name}" refers to popular **puffy stickers**.
            * **Title**: ${articleTitle}
            * **Important Keywords**: ${keywordsStr} (Incorporate these visually if possible).
            * **Content Summary**: ${contentSummary}...
        `;
    }

    try {
        const result = await imageModel.generateContent(prompt);
        const response = await result.response;

        const part = response.candidates[0].content.parts.find(p => p.inlineData);

        if (part && part.inlineData && part.inlineData.data) {
            const buffer = Buffer.from(part.inlineData.data, "base64");
            fs.writeFileSync(filePath, buffer);
            console.log(`   ✅ 保存完了: ${fileName}`);
            return true;
        } else {
            console.warn(`   ⚠️ Geminiからの有効な画像データがありませんでした。`);
            return false;
        }

    } catch (error) {
        console.error(`   ❌ 画像生成エラー [ID: ${draftId}]:`, error.message);
        if (error.message.includes("429")) {
            console.warn("   ⏳ APIレート制限の可能性があります。少し待機します...");
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        return false;
    }
}

async function run() {
    console.log("🚀 画像生成バッチ処理を開始します...");
    ensureDirectoryExistence(OUTPUT_DIR);

    const drafts = await fetchTargetDrafts();

    if (drafts.length === 0) {
        console.log("終了: 処理対象の記事がありませんでした。");
        return;
    }

    console.log(`合計 ${drafts.length} 件の画像生成を開始します。\n`);

    for (const draft of drafts) {
        if (!draft.draft_id) {
            console.warn("⚠️ draft_idが存在しないデータをスキップします。");
            continue;
        }
        await generateAndSaveImage(draft);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("\n🎉 すべての処理が完了しました。");
}

run();