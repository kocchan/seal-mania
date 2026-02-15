import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dbClient } from "./utils.js";
import { CONFIG } from "./config.js";
import { GoogleGenAI } from "@google/genai";

// =====================================
// ⚙️ 設定
// =====================================
const APP_CONFIG = {
    tableName: "Articles",
    outputDir: "./data",
    waitMs: 3000 // レートリミット対策の待機時間
};

// 地方（親カテゴリーID）ごとの枠線カラー設定
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

        // 📍 画像生成プロンプトを日本語＆文字描画重視に最適化（フォント・余白調整版）
        const prompt = `
            背景は真っ白のシンプルなグラフィックバナーを作成してください。
            画像全体を囲むように、太い実線の枠線（色: ${color}）を描画してください。
            枠線の内側に、十分な余白（パディング）を空けて、中央に以下の日本語テキストを配置してください。
            テキストは、親しみやすく、楽しく、ポップな印象の手書き風丸文字フォントを使用してください。

            ・1行目: 黒色で、中くらいのサイズの「【目撃速報】」
            ・2行目: 黒色で、1行目より少しだけ大きいサイズの「${prefCity}」
            ・3行目: 黒色で、中くらいのサイズの「${article.product_name}」

            各行の間にも適度な間隔を空け、全体的に窮屈にならないようにバランスよく配置してください。
            イラストや影、余計な装飾は一切追加しないでください。
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