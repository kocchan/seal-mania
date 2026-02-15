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
        const color = this.getThemeColor(article.prefecture);
        const prefCity = `${article.prefecture || ""}${article.city || ""}`;

        // 論理解像度(1920x1080)を基準にした定量的な仕様書形式
        const prompt = `
            You are a precise graphic design rendering engine. Create an image based strictly on the following specifications.

            [Canvas Specification]
            - Aspect Ratio: 16:9
            - Logical Resolution: 1920px (width) x 1080px (height)
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
              - Text: "${prefCity}"
              - Font Size: exactly 160px
              - Font Color: Solid Black (#000000)

            - Spacing between Line 2 and Line 3: exactly 80px

            - Line 3:
              - Text: "${article.product_name}"
              - Font Size: exactly 80px
              - Font Color: Solid Black (#000000)

            [Strict Constraints]
            - The specified pixel values for border thickness (80px), padding (120px), font sizes (80px, 180px, 100px), and line spacing (60px, 80px) are absolute and MANDATORY instructions. They must be rendered precisely as specified without any deviation.
            - Do NOT add any illustrations, icons, watermarks, shadows, gradients, or background patterns.
            - The text MUST be rendered exactly as written in perfect Japanese characters without typos or artifacts.
        `;

        try {
            console.log(`🎨 画像生成中: ${prefCity} - ${article.product_name} (Color: ${color})`);

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