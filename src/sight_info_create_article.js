import { GoogleGenerativeAI } from '@google/generative-ai';
import { ScanCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dbClient, getNowJST } from "./utils.js";
import 'dotenv/config';

const CONFIG = {
    model: 'gemini-3-pro-preview',
    tableNameRaw: "RawTweets",
    tableNameArticles: "Articles",
    batchSize: 20,
    referenceDate: new Date().toISOString().split('T')[0]
};

// =====================================
// 🤖 Gemini 関連の責務 (Analyzerクラス)
// =====================================
class ArticleAnalyzer {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY is missing');

        const genAI = new GoogleGenerativeAI(apiKey);
        this.model = genAI.getGenerativeModel({
            model: CONFIG.model,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: this.getSchema()
            }
        });
    }

    getSchema() {
        return {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    is_sighting: { type: "BOOLEAN" },
                    prefecture: { type: "STRING" },
                    city: { type: "STRING" },
                    shop_name: { type: "STRING" },
                    shop_address: { type: "STRING" },
                    product_name: { type: "STRING" },
                    sighting_time: { type: "STRING" },
                    status_text: { type: "STRING" },
                    confidence_memo: { type: "STRING" },
                    source_url: { type: "STRING" },
                    source_tweet_id: { type: "STRING" },
                    is_prediction: { type: "BOOLEAN" },
                },
                required: ["is_sighting", "shop_name", "shop_address", "source_url"]
            }
        };
    }

    generatePrompt(tweets) {
        const tweetData = tweets.map(t => ({ id: t.tweet_id, text: t.text, url: t.url, time: t.post_time }));

        return `
あなたは「人気商品の在庫・目撃情報」を収集するリポーターAIです。
以下のツイートリストを分析し、**具体的な店舗名が含まれる有効な目撃情報のみ**を抽出してください。

### 🚨 重要な指示 (Strict Instructions)
1. **住所の特定**: 抽出した「店舗名」とツイート内の「地域情報」から、具体的な住所（〒含む）を特定して 'shop_address' に入力してください。住所が特定できない場合は、is_prediction を true にしてください。
2. **フィルタリング**: 「どこにもない」「欲しい」等のツイートは除外し、実際に店舗で「見た」「買った」「入荷していた」という情報だけを抽出してください。
3. **都道府県・市区町村**: 住所から 'prefecture' と 'city' を埋めてください。特定できない場合は抽出対象外です。
4. **日時**: ツイートの 'time' を考慮し、目撃された具体的な日時を 'sighting_time' に記述してください（基準日: ${CONFIG.referenceDate}）。
5. **商品名**: ツイート内容から商品名を抽出してください。
6. **在庫状況**: 在庫状況を 'status_text' に要約してください（例: 在庫あり、完売など）。
7. **信頼性メモ**: 不確定な情報や注意点を 'confidence_memo' に記述してください。
8. **情報源URL**: ツイートの 'url' フィールドを 'source_url' にそのまま設定してください。
9. **ソースID**: **必ず** 元のツイートの 'id' を 'source_tweet_id' に転記してください。
10. **is_prediction**: 店舗名や住所をAIが推測した場合は true、確実な情報の場合は false にしてください。

### 対象ツイートデータ
${JSON.stringify(tweetData)}
`;
    }

    async analyzeBatch(batch) {
        const prompt = this.generatePrompt(batch);
        const result = await this.model.generateContent(prompt);
        return JSON.parse(result.response.text());
    }
}

// =====================================
// 💾 DynamoDB 関連の責務 (DBServiceオブジェクト)
// =====================================
const DBService = {
    async fetchUnprocessed() {
        const result = await dbClient.send(new ScanCommand({
            TableName: CONFIG.tableNameRaw,
            FilterExpression: "is_processed = :falseVal",
            ExpressionAttributeValues: { ":falseVal": false }
        }));
        return result.Items || [];
    },

    async saveArticles(articles) {
        const validArticles = articles.filter(a => a.is_sighting && a.prefecture && a.city);
        for (const article of validArticles) {
            try {
                await dbClient.send(new PutCommand({
                    TableName: CONFIG.tableNameArticles,
                    Item: {
                        ...article,
                        created_at: getNowJST(),
                        is_posted: false
                    },
                    ConditionExpression: "attribute_not_exists(source_url)"
                }));
            } catch (e) {
                if (e.name !== 'ConditionalCheckFailedException') console.error("❌ 記事保存失敗", e.message);
            }
        }
    },

    async markProcessed(tweetIds) {
        for (const id of tweetIds) {
            await dbClient.send(new UpdateCommand({
                TableName: CONFIG.tableNameRaw,
                Key: { tweet_id: id },
                UpdateExpression: "set is_processed = :trueVal",
                ExpressionAttributeValues: { ":trueVal": true }
            }));
        }
    }
};

// =====================================
// 🏁 メイン実行処理
// =====================================
async function main() {
    console.log('🚀 記事生成ジョブ開始');
    const tweets = await DBService.fetchUnprocessed();
    if (tweets.length === 0) return console.log("💤 未処理ツイートなし");

    const analyzer = new ArticleAnalyzer();
    const processedIds = [];

    for (let i = 0; i < tweets.length; i += CONFIG.batchSize) {
        const batch = tweets.slice(i, i + CONFIG.batchSize);
        try {
            const sightings = await analyzer.analyzeBatch(batch);
            await DBService.saveArticles(sightings);
            batch.forEach(t => processedIds.push(t.tweet_id));
        } catch (e) {
            console.error("❌ バッチ処理エラー", e.message);
        }
    }
    await DBService.markProcessed(processedIds);
    console.log(`✅ 完了: ${processedIds.length}件を処理`);
}

main().catch(console.error);