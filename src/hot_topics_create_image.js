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

// 📍 修正：画像生成モデルの指定（エラーの原因となっていたパラメータを削除し、IMAGEを指定）
const imageModel = genAI.getGenerativeModel({
    model: "gemini-3-pro-image-preview",
    generationConfig: {
        responseModalities: ["IMAGE"]
    }
});

// DynamoDB クライアントの初期化 (リージョンは環境に合わせて変更してください)
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-northeast-1" });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// 地方ごとの枠線カラー設定
const REGION_COLORS = {
    863: "#4FC3F7", // 北海道・東北
    871: "#FF6699", // 関東
    879: "#FF9800", // 中部
    889: "#BA68C8", // 近畿
    897: "#4CAF50", // 中国・四国
    907: "#EF5350", // 九州・沖縄
    default: "#FF6699" // デフォルト（関東）
};

// 都道府県名から地域IDへの簡易マッピング
const PREF_TO_REGION_ID = {
    "北海道": 863, "青森県": 863, "岩手県": 863, "宮城県": 863, "秋田県": 863, "山形県": 863, "福島県": 863,
    "茨城県": 871, "栃木県": 871, "群馬県": 871, "埼玉県": 871, "千葉県": 871, "東京都": 871, "神奈川県": 871,
    "新潟県": 879, "富山県": 879, "石川県": 879, "福井県": 879, "山梨県": 879, "長野県": 879, "岐阜県": 879, "静岡県": 879, "愛知県": 879,
    "三重県": 889, "滋賀県": 889, "京都府": 889, "大阪府": 889, "兵庫県": 889, "奈良県": 889, "和歌山県": 889,
    "鳥取県": 897, "島根県": 897, "岡山県": 897, "広島県": 897, "山口県": 897, "徳島県": 897, "香川県": 897, "愛媛県": 897, "高知県": 897,
    "福岡県": 907, "佐賀県": 907, "長崎県": 907, "熊本県": 907, "大分県": 907, "宮崎県": 907, "鹿児島県": 907, "沖縄県": 907
};

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
    let prefecture = "";
    let city = "";
    let product_name = "商品名不明";

    if (article.tags && Array.isArray(article.tags)) {
        for (const tag of article.tags) {
            if (PREF_TO_REGION_ID[tag]) {
                prefecture = tag;
                break;
            }
        }
        const otherTags = article.tags.filter(t => t !== prefecture && t !== '目撃速報');
        if (otherTags.length > 0) {
            product_name = otherTags[0];
        }
    }

    if (article.prefecture) prefecture = article.prefecture;
    if (article.city) city = article.city;
    if (article.product_name) product_name = article.product_name;

    const prefCity = `${prefecture}${city}`;
    return { prefecture, prefCity, product_name };
}

function getThemeColor(prefecture) {
    const regionId = PREF_TO_REGION_ID[prefecture];
    return REGION_COLORS[regionId] || REGION_COLORS.default;
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
        const { prefecture, prefCity, product_name } = extractMetadata(article);
        const color = getThemeColor(prefecture);
        console.log(`   ℹ️ 設定: ${prefCity} / ${product_name} / Color: ${color}`);

        prompt = `
            You are a precise graphic design rendering engine. Create an image based strictly on the following specifications.

            [Canvas Specification]
            - Aspect Ratio: 16:9
            - Background Color: Solid White (#FFFFFF)

            [Border Specification]
            - Style: Solid line
            - Color: ${color}
            - Thickness: exactly 80px
            - Position: Inner border perfectly aligned with the canvas edge.

            [Typography & Layout Specification]
            - Font Family: "M PLUS Rounded 1c ExtraBold" or "Gen Jyuu Gothic Heavy" (A very thick, rounded, friendly Japanese pop font). No sharp Gothic or Mincho fonts.
            - Text Alignment: Center-aligned both horizontally and vertically.
            - Padding (Space between inner border edge and text block): exactly 120px on all sides (top, bottom, left, right).

            [Text Content & Exact Sizing]
            Render the following three lines of text from top to bottom, forming a single centered text block:

            - Line 1:
              - Text: "【目撃速報】"
              - Font Size: exactly 80px
              - Font Color: Solid Black (#000000)

            - Spacing between Line 1 and Line 2: exactly 60px

            - Line 2:
              - Text: "${prefCity || '地域不明'}"
              - Font Size: exactly 160px
              - Font Color: Solid Black (#000000)

            - Spacing between Line 2 and Line 3: exactly 80px

            - Line 3:
              - Text: "${product_name}"
              - Font Size: exactly 80px
              - Font Color: Solid Black (#000000)

            [Strict Constraints]
            - Do NOT add any illustrations, icons, watermarks, shadows, gradients, or background patterns.
            - The text MUST be rendered exactly as written in perfect Japanese characters without typos or artifacts.
        `;

    } else {
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