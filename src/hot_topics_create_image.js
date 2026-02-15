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

// 地方ごとのメインカラー設定
const REGION_COLORS = {
    "北海道・東北": "Light Blue (#4FC3F7)",
    "関東": "Pop Pink (#FF6699)",
    "中部": "Vivid Orange (#FF9800)",
    "近畿": "Light Purple (#BA68C8)",
    "中国・四国": "Flat Green (#4CAF50)",
    "九州・沖縄": "Bright Red (#EF5350)",
    "default": "Pop Pink (#FF6699)"
};

// 都道府県のリスト（カテゴリから抽出するため）
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

function extractMetadata(article) {
    let prefecture = "地域不明";
    let region = "default";
    let product_name = "ボンボンドロップシール"; // 📍 商品名は固定

    // categories（文字列の配列）から都道府県を探す
    if (article.categories && Array.isArray(article.categories)) {
        for (const cat of article.categories) {
            // "愛知" などの県名に完全一致するかチェック
            if (PREFECTURES.includes(cat)) {
                prefecture = cat;
            }
            // "中部" などの地方名が含まれていればカラー用に保存
            if (REGION_COLORS[cat]) {
                region = cat;
            }
        }
    }

    return { prefecture, region, product_name };
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

    let prompt = "";

    if (articleType.includes("【A】")) {
        // 📍 修正：Type A (目撃情報) をB-Fと同じポップなイラスト調に変更
        const { prefecture, region, product_name } = extractMetadata(article);
        const color = getThemeColor(region);
        console.log(`   ℹ️ 設定: ${prefecture} / ${product_name} / Color: ${color}`);

        prompt = `
            You are a professional illustrator creating an "Eye-Catching Image" for a pop-culture web article.
            Create a "Cute, Impactful, Hand-Drawn Style Illustration" that conveys a breaking news report about finding popular stickers.

            **[Design Configuration]**
            * **Aspect Ratio**: 16:9
            * **Touch**: Hand-drawn style using colored pencils, markers, or crayons. Warm with clear, bold outlines. Texture of paper is slightly visible.
            * **Main Color Theme**: The overall illustration (background accents, text borders, etc.) MUST heavily feature the color: ${color}.
            * **Composition**: Center a cute, puffy sticker package or a happy, surprised mascot holding stickers.

            **[Text Content (Must be included)]**
            Draw the following Japanese text prominently and stylishly as part of the hand-drawn illustration (like a pop-up sign or stamp):
            1. "目撃速報" (Breaking News) - Make it look like a flashy news stamp.
            2. "${prefecture}" - Draw it large and clearly.
            3. "${product_name}" - Draw it playfully.

            **[Absolute Rules]**
            * Remove detailed explanations and complex backgrounds. Use negative space effectively so the text and main subject pop out.
            * The Japanese text must be drawn exactly as written, with no typos.
            * Make it look cute, exciting, and appealing to kids and young moms (Yume-Kawaii atmosphere).
        `;

    } else {
        // Type B-F: その他 (手書き風イラスト指示)
        const articleTitle = article.title || "No Title";
        const contentSummary = article.content ? article.content.substring(0, 100) : articleTitle;
        console.log(`   ℹ️ 設定: 手書き風イラスト / Title: ${articleTitle.substring(0, 20)}...`);

        prompt = `
            You are a professional illustrator creating an "Eye-Catching Image" for a web article.
            Create a "Simple, Impactful, Hand-Drawn Style Illustration" that conveys the conclusion at a glance.

            **[Absolute Rules for Simplification]**
            1. **One Message, One Visual**: Pick ONE shocking "conclusion" or "number" related to the title/content and draw it big in the center.
            2. **Declutter**: Remove detailed explanations, complex backgrounds, and unnecessary decorations. Use negative space effectively.
            3. **Minimal Text**: Use very little text (e.g., just the main keywords from the title, or a stamp like "Sold Out!", "New!", "Attention!").
            4. **Aspect Ratio**: 16:9

            **[Design Configuration]**
            * **Touch**: Hand-drawn style using colored pencils or crayons. Warm but with clear outlines. Texture of paper is visible.
            * **Composition**: Center the main subject.
            * **Atmosphere**: Cute, "Yume-Kawaii" (dreamy cute), pastel colors.

            **[Article Context]**
            * **Title**: ${articleTitle}
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