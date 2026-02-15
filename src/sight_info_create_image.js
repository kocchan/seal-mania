import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dbClient } from "./utils.js";
import { CONFIG } from "./config.js";
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from 'url';

// =====================================
// ⚙️ 設定
// =====================================
const APP_CONFIG = {
    tableName: "Articles",
    outputDir: "./data",
    waitMs: 3000 // レートリミット対策の待機時間
};

// 地方（親カテゴリーID）ごとの枠線カラー設定
// ※ config.js の prefToRegionMap のIDに対応させています
const REGION_COLORS = {
    863: "LightBlue", // 北海道・東北
    871: "Pink",      // 関東
    879: "Orange",    // 中部
    889: "Purple",    // 近畿
    897: "Green",     // 中国・四国
    907: "Red",       // 九州・沖縄
};

// =====================================
// 💾 DynamoDB 関連の操作
// =====================================
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

// =====================================
// 🎨 画像生成クラス
// =====================================
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
        if (!prefectureName) return "Black"; // 不明な場合は黒

        const cleanPref = prefectureName.replace(/[都府県]$/, '');
        const regionId = CONFIG.prefToRegionMap[cleanPref];

        return REGION_COLORS[regionId] || "Black";
    }

    /**
     * Gemini APIを呼び出して画像を生成・保存
     */
    async generateAndSaveImage(article) {
        const color = this.getThemeColor(article.prefecture);
        const prefCity = `${article.prefecture || ""}${article.city || ""}`;

        // 画像生成プロンプト (レイアウト指示は英語の方が精度が高いため英語で指定)
        const prompt = `
            Create a simple, minimalist graphic banner.
            Background: Solid white.
            Border: Thick solid ${color} border around the entire image.
            Center text layout (arranged vertically with good spacing):
            Line 1: '【目撃速報】' in bold black font.
            Line 2: '${prefCity}' in very large, extra bold black font.
            Line 3: '${article.product_name}' in bold black font.
            
            Crucial Instruction: The text MUST be exactly as provided, written perfectly in Japanese. Ensure high-fidelity text rendering. Do not add any extra illustrations, shadows, or decorations.
        `;

        try {
            console.log(`🎨 画像生成中: ${prefCity} - ${article.product_name} (Color: ${color})`);

            const response = await this.ai.models.generateContent({
                model: "gemini-2.5-flash-image",
                contents: prompt,
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