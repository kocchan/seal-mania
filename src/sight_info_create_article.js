import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { ScanCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dbClient } from "./prefecture/utils.js";
import 'dotenv/config';

// =====================================
// 設定
// =====================================
const CONFIG = {
    model: 'gemini-3-flash-preview',
    referenceDate: new Date().toISOString().split('T')[0]
};

// =====================================
// 🛠️ ユーティリティ関数
// =====================================

/**
 * 🇯🇵 現在の日本時間(JST)をISO文字列で返す関数
 */
function getNowJST() {
    const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return jstDate.toISOString().replace('Z', '+09:00');
}

// =====================================
// Gemini API初期化
// =====================================
function initializeGemini() {
    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ エラー: .envファイルにGEMINI_API_KEYを設定してください');
        process.exit(1);
    }
    return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// =====================================
// JSONスキーマ定義
// =====================================
const ARTICLE_SCHEMA = {
    type: SchemaType.ARRAY,
    items: {
        type: SchemaType.OBJECT,
        properties: {
            is_sighting: { type: SchemaType.BOOLEAN },
            prefecture: { type: SchemaType.STRING },
            city: { type: SchemaType.STRING },
            shop_name: { type: SchemaType.STRING },
            shop_address: { type: SchemaType.STRING },
            product_name: { type: SchemaType.STRING },
            sighting_time: { type: SchemaType.STRING },
            status_text: { type: SchemaType.STRING },
            confidence_memo: { type: SchemaType.STRING },
            source_url: { type: SchemaType.STRING },
            source_tweet_id: { type: SchemaType.STRING },
            is_prediction: { type: SchemaType.BOOLEAN },
        },
        required: ["is_sighting", "shop_name", "shop_address", "source_url"]
    }
};

// =====================================
// プロンプト生成
// =====================================
function generatePrompt(tweets) {
    const tweetData = tweets.map(t => ({
        id: t.tweet_id,
        text: t.text,
        url: t.url,
        time: t.post_time
    }));

    return `
あなたは「人気商品の在庫・目撃情報」を収集する敏腕リポーターAIです。
以下のツイートリスト（JSON）を分析し、**「具体的な店舗名（または具体的な施設名）」が含まれる有効な目撃情報のみ**を抽出してください。

### 重要な指示

1. **住所の特定**: 抽出した「店舗名」とツイート内の「地域情報」から、あなたの知識ベースを検索し、**具体的な住所（〒含む）を特定して 'shop_address' に入力してください**。
   - 例: "西尾のイチカワ" -> 愛知県西尾市...の手芸店の住所を探す。
   - 例: "KOKOくろべ" -> 富山県黒部市...の道の駅の住所を探す。
   - 住所が特定できない場合は、is_prediction を true にしてください。

2. **フィルタリング**: 「どこにもない」「欲しい」「ネットで見た」などのツイートは除外し、実際に店舗で「見た」「買った」「入荷していた」という情報だけを抽出してください。

3. **都道府県・市区町村**: 住所から 'prefecture' (都道府県) と 'city' (市区町村) を埋めてください。特定できない場合は 抽出対象ではありません。

4. **日時**: ツイートの 'time' (JST) を考慮し、目撃された具体的な日付・時間帯を 'sighting_time' に記述してください（基準日: ${CONFIG.referenceDate}）。

5. **商品名**: ツイート内容から商品名を抽出してください（例: "ぷっくりシール"、"ボンボンドロップシール"など）。

6. **在庫状況**: ツイート内容から在庫状況を 'status_text' に要約してください（例: "在庫あり"、"少量在庫"、"完売"など）。

7. **信頼性メモ**: 不確定な情報や注意点を 'confidence_memo' に記述してください。

8. **情報源URL**: ツイートの 'url' フィールドを 'source_url' にそのまま設定してください。

9. **ソースID**: **必ず** 元のツイートの 'id' を 'source_tweet_id' に転記してください。

10. **is_prediction**: 店舗名や住所をAIが推測した場合は true、確実な情報の場合は false にしてください。

### 対象ツイートデータ
${JSON.stringify(tweetData, null, 2)}
`;
}

// =====================================
// DynamoDB操作
// =====================================

async function fetchUnprocessedTweets() {
    try {
        const result = await dbClient.send(new ScanCommand({
            TableName: "RawTweets",
            FilterExpression: "is_processed = :falseVal",
            ExpressionAttributeValues: {
                ":falseVal": false
            }
        }));
        return result.Items || [];
    } catch (e) {
        console.error("❌ ツイート取得エラー:", e.message);
        return [];
    }
}

async function markAsProcessed(tweetIds) {
    if (tweetIds.length === 0) return;

    console.log(`📝 ${tweetIds.length}件のツイートを処理済みに更新中...`);

    for (const id of tweetIds) {
        try {
            await dbClient.send(new UpdateCommand({
                TableName: "RawTweets",
                Key: { tweet_id: id },
                UpdateExpression: "set is_processed = :trueVal",
                ExpressionAttributeValues: { ":trueVal": true }
            }));
        } catch (e) {
            console.error(`⚠️ 更新失敗 (${id}):`, e.message);
        }
    }
}

async function saveArticles(articles) {
    if (articles.length === 0) return;

    // ▼ 追加: 都道府県(prefecture) や 市区町村(city) が null のデータは除外する
    const validArticlesToSave = articles.filter(article =>
        article.prefecture && article.city
    );

    const discardedCount = articles.length - validArticlesToSave.length;
    if (discardedCount > 0) {
        console.log(`🗑️ 住所不明のため ${discardedCount} 件を破棄しました。`);
    }

    if (validArticlesToSave.length === 0) {
        console.log("⚠️ 保存対象の記事はありませんでした。");
        return;
    }

    console.log(`💾 ${validArticlesToSave.length}件の記事データをDBに保存中...`);

    for (const article of validArticlesToSave) {
        try {
            await dbClient.send(new PutCommand({
                TableName: "Articles",
                Item: {
                    source_url: article.source_url,
                    ...article,
                    created_at: getNowJST(), // 日本時間
                    is_posted: false
                },
                ConditionExpression: "attribute_not_exists(source_url)"
            }));
        } catch (e) {
            if (e.name !== 'ConditionalCheckFailedException') {
                console.error(`❌ 記事保存エラー:`, e.message);
            }
        }
    }
}

// =====================================
// メイン処理
// =====================================
async function main() {
    console.log('🚀 記事生成ジョブを開始します...');

    const tweets = await fetchUnprocessedTweets();
    console.log(`📥 未処理ツイート: ${tweets.length}件`);

    if (tweets.length === 0) {
        console.log("💤 新しいツイートがないため終了します。");
        return;
    }

    const BATCH_SIZE = 20;
    const genAI = initializeGemini();
    const model = genAI.getGenerativeModel({
        model: CONFIG.model,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: ARTICLE_SCHEMA
        }
    });

    let processedTweetIds = [];

    for (let i = 0; i < tweets.length; i += BATCH_SIZE) {
        const batch = tweets.slice(i, i + BATCH_SIZE);
        console.log(`🤖 Gemini解析中... (${i + 1} ~ ${Math.min(i + BATCH_SIZE, tweets.length)}件目)`);

        try {
            const prompt = generatePrompt(batch);
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            const sightings = JSON.parse(responseText);
            const validArticles = sightings.filter(item => item.is_sighting === true);

            console.log(`   ✨ 有効な情報: ${validArticles.length}件`);

            await saveArticles(validArticles);
            batch.forEach(t => processedTweetIds.push(t.tweet_id));

        } catch (e) {
            console.error("❌ Gemini APIエラー (バッチスキップ):", e.message);
        }
    }

    await markAsProcessed(processedTweetIds);

    console.log("✅ 全処理完了！");
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('❌ 致命的なエラー:', error);
        process.exit(1);
    });
}