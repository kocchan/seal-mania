import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dbClient } from "./utils.js";
import { CONFIG } from "./config.js";
import { GoogleGenAI } from "@google/genai";

// 設定
const APP_CONFIG = {
    tableName: "Articles",
    outputDir: "./data",
    waitMs: 3000
};

// 地方ごとの枠線カラー設定
const REGION_COLORS = {
    863: "#4FC3F7", // 北海道・東北 (明るい水色)
    871: "#FF6699", // 関東 (ポップなピンク)
    879: "#FF9800", // 中部 (鮮やかなオレンジ)
    889: "#BA68C8", // 近畿 (少し明るめの紫)
    897: "#4CAF50", // 中国・四国 (フラットな緑)
    907: "#EF5350", // 九州・沖縄 (明るい赤)
};

// DynamoDBの操作
const DBService = {
    async fetchUnprocessed() {
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
    }
};

// 画像生成クラス
class ImageGenerator {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('❌ エラー: .envに GEMINI_API_KEY が不足しています');
        }
        this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        // 保存先ディレクトリが存在しない場合は作成
        if (!fs.existsSync(APP_CONFIG.outputDir)) {
            fs.mkdirSync(APP_CONFIG.outputDir, { recursive: true });
        }
    }

    /**
     * 都道府県からテーマカラーを決定する
     */
    getThemeColor(prefectureName) {
        if (!prefectureName) return "#000000"; // 不明な場合は黒

        const cleanPref = prefectureName.replace(/[都府県]$/, '');
        const regionId = CONFIG.prefToRegionMap[cleanPref];

        return REGION_COLORS[regionId] || "#000000";
    }

    /**
     * Gemini APIを呼び出して画像を生成・保存
     */
    async generateAndSaveImage(article) {
        // プロンプトに埋め込むための変数を準備
        const color = this.getThemeColor(article.prefecture);
        const product_name = article.product_name || "ボンボンドロップシール";
        const prefecture = article.prefecture || "";
        const cityName = article.city || "";
        const prefCity = `${prefecture}${cityName}`;

        const prompt = `
            You are a professional illustrator creating a **well-balanced, pop-style hand-drawn illustration** for a web article.
            The image conveys a "Breaking News" report about finding a popular item. It should be playful and cute, but NOT overly cluttered.

            **[Design Configuration]**
            * **Aspect Ratio**: 16:9
            * **Style**: Clean hand-drawn style with colored pencils or markers. A good balance of negative space and cute elements.
            * **Background**: A **pale, light shade** based on the color ${color}. You may use a very subtle, soft pattern (like faint polka dots or a light grid), but keep it unobtrusive.
            * **Composition**: Center a cute illustration of the product package ("${product_name}", which is a pack of **stickers**, not candy).

            **[Text Elements (Mandatory)]**
            1.  **"目撃速報" Stamp**:
                * Text: "目撃速報" (Breaking News)
                * Style: Red rubber stamp, tilted diagonally in the **Top Right corner**.
            2.  **Location Name**:
                * Text: "${prefecture}" (Large)
                * ${cityName ? `Text: "${cityName}" (Smaller, below prefecture)` : ""}
                * Position: Prominently placed near the center or beside the product.
                * Style: Fun, bold, hand-drawn font with a soft outline to make it readable.

            **[Absolute Rules]**
            * Keep the overall design "just right" — neither too empty nor too noisy.
            * The product is **STICKERS**, not candy.
            * Ensure the Japanese text is rendered exactly as written.
        `;

        try {
            console.log(`🎨 画像生成中: ${prefCity} - ${product_name} (Color: ${color})`);

            const response = await this.ai.models.generateContent({
                model: "gemini-3-pro-image-preview",
                contents: prompt,
                config: {
                    aspectRatio: "16:9",
                    outputMimeType: "image/png"
                }
            });

            // Base64データを抽出してファイルに保存
            const part = response.candidates[0].content.parts.find(p => p.inlineData);
            if (part && part.inlineData) {
                const imageData = part.inlineData.data;
                const buffer = Buffer.from(imageData, "base64");

                const fileName = `${article.source_tweet_id}.png`;
                const filePath = path.join(APP_CONFIG.outputDir, fileName);

                fs.writeFileSync(filePath, buffer);
                console.log(`   ✅ 保存完了: ${filePath}`);
                return true;
            } else {
                console.warn(`   ⚠️ 画像データが見つかりませんでした (${article.source_tweet_id})`);
                return false;
            }

        } catch (error) {
            console.error(`   ❌ 画像生成エラー (${article.source_tweet_id}):`, error.message);
            return false;
        }
    }
}

// =====================================
// 🏁 メイン処理
// =====================================
async function main() {
    console.log('🚀 画像生成ジョブを開始します...');

    const articles = await DBService.fetchUnprocessed();
    console.log(`📥 対象データ: ${articles.length}件`);

    if (articles.length === 0) {
        console.log("💤 生成対象のデータがないため終了します。");
        return;
    }

    const generator = new ImageGenerator();

    for (let i = 0; i < articles.length; i++) {
        const article = articles[i];

        // ツイートIDがないデータはスキップ
        if (!article.source_tweet_id) {
            console.log(`⚠️ source_tweet_id が無いためスキップ: ${article.source_url}`);
            continue;
        }

        // 既に画像が存在する場合はスキップ（再実行時の時短用）
        const expectedFilePath = path.join(APP_CONFIG.outputDir, `${article.source_tweet_id}.png`);
        if (fs.existsSync(expectedFilePath)) {
            console.log(`⏩ 既に画像が存在するためスキップ: ${expectedFilePath}`);
            continue;
        }

        console.log(`\n[${i + 1}/${articles.length}] 処理中...`);
        await generator.generateAndSaveImage(article);

        // APIのレートリミット対策の待機時間
        await new Promise(res => setTimeout(res, APP_CONFIG.waitMs));
    }

    console.log("\n✅ 全ての画像生成が完了しました！");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(console.error);
}