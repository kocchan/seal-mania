import 'dotenv/config';
import fs from 'fs';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// =====================================
// 設定
// =====================================
const CONFIG = {
    inputFile: './data/tweets.json',
    outputFile: './data/wordpressup_file/generated_articles.json',
    model: 'gemini-3-flash-preview',
    referenceDate: new Date().toISOString().split('T')[0] // 今日の日付
};

// =====================================
// Gemini APIクライアント初期化
// =====================================
function initializeGemini() {
    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ エラー: .envファイルにGEMINI_API_KEYを設定してください');
        console.error('   取得方法: https://aistudio.google.com/');
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
            is_prediction: { type: SchemaType.BOOLEAN },
        },
        required: ["is_sighting", "shop_name", "shop_address", "source_url"]
    }
};

// =====================================
// プロンプト生成
// =====================================
function generatePrompt(tweets, referenceDate) {
    return `
あなたは「人気商品の在庫・目撃情報」を収集する敏腕リポーターAIです。
以下のツイートリスト（JSON）を分析し、**「具体的な店舗名（または具体的な施設名）」が含まれる有効な目撃情報のみ**を抽出してください。

### 重要な指示

1. **住所の特定**: 抽出した「店舗名」とツイート内の「地域情報」から、あなたの知識ベースを検索し、**具体的な住所（〒含む）を特定して 'shop_address' に入力してください**。
   - 例: "西尾のイチカワ" -> 愛知県西尾市...の手芸店の住所を探す。
   - 例: "KOKOくろべ" -> 富山県黒部市...の道の駅の住所を探す。
   - 住所が特定できない場合は、is_prediction を true にしてください。

2. **フィルタリング**: 「どこにもない」「欲しい」「ネットで見た」などのツイートは除外し、実際に店舗で「見た」「買った」「入荷していた」という情報だけを抽出してください。

3. **都道府県・市区町村**: 住所から 'prefecture' (都道府県) と 'city' (市区町村) を埋めてください。

4. **日時**: ツイートの 'fetchedAt' や 'postTime' ('x分前'など) を考慮し、目撃された具体的な日付・時間帯を 'sighting_time' に記述してください（基準日: ${referenceDate}）。

5. **商品名**: ツイート内容から商品名を抽出してください（例: "ぷっくりシール"、"ボンボンドロップシール"など）。

6. **在庫状況**: ツイート内容から在庫状況を 'status_text' に要約してください（例: "在庫あり"、"少量在庫"、"完売"など）。

7. **信頼性メモ**: 不確定な情報や注意点を 'confidence_memo' に記述してください。

8. **情報源URL**: ツイートの 'url' フィールドを 'source_url' にそのまま設定してください。

9. **is_prediction**: 店舗名や住所をAIが推測した場合は true、確実な情報の場合は false にしてください。

### 対象ツイートデータ
${JSON.stringify(tweets, null, 2)}
`;
}

// =====================================
// 記事生成メイン処理
// =====================================
async function generateArticles(inputFile = CONFIG.inputFile, outputFile = CONFIG.outputFile) {
    console.log('🚀 記事生成開始');
    console.log(`📄 入力ファイル: ${inputFile}`);

    // ツイートデータ読み込み
    let tweets;
    try {
        const rawData = fs.readFileSync(inputFile, 'utf-8');
        tweets = JSON.parse(rawData);
        console.log(`📥 ${tweets.length}件のツイートを読み込みました`);
    } catch (error) {
        console.error(`❌ ファイル読み込みエラー: ${error.message}`);
        return null;
    }

    // Gemini APIクライアント初期化
    const genAI = initializeGemini();
    const model = genAI.getGenerativeModel({
        model: CONFIG.model,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: ARTICLE_SCHEMA
        }
    });

    // プロンプト生成
    const prompt = generatePrompt(tweets, CONFIG.referenceDate);

    try {
        console.log('🤖 Gemini AIに解析と住所特定を依頼中...');
        console.log(`   使用モデル: ${CONFIG.model}`);

        const result = await model.generateContent(prompt);
        const response = result.response;
        const jsonOutput = response.text();

        // 結果のパース
        const sightings = JSON.parse(jsonOutput);

        // is_sightingがtrueのものだけをフィルタリング
        const validSightings = sightings.filter(item => item.is_sighting === true);

        // アップロード管理用のカラムを追加
        const articlesWithManagement = validSightings.map(article => ({
            ...article,
            uploaded: false,
            wp_post_id: null,
            uploaded_at: null
        }));

        console.log(`✅ 解析完了: ${articlesWithManagement.length}件の有効な目撃情報を抽出しました`);

        // 統計情報を表示
        const predictionCount = articlesWithManagement.filter(item => item.is_prediction).length;
        console.log(`   確実な情報: ${articlesWithManagement.length - predictionCount}件`);
        console.log(`   AI推測情報: ${predictionCount}件`);

        // 出力ディレクトリの確保
        const outputDir = outputFile.split('/').slice(0, -1).join('/');
        if (outputDir && !fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 結果をファイルに保存
        fs.writeFileSync(outputFile, JSON.stringify(articlesWithManagement, null, 2), 'utf-8');
        console.log(`💾 保存完了: ${outputFile}`);

        // サンプル表示
        if (articlesWithManagement.length > 0) {
            console.log('\n📋 生成された記事サンプル (最初の1件):');
            console.log(JSON.stringify(articlesWithManagement[0], null, 2));
        }

        return articlesWithManagement;

    } catch (error) {
        console.error('❌ Gemini APIエラー:', error.message);
        if (error.response) {
            console.error('   詳細:', error.response);
        }
        return null;
    }
}

// =====================================
// メイン処理
// =====================================
async function main() {
    // コマンドライン引数から入力ファイルを取得
    const inputFile = process.argv[2] || CONFIG.inputFile;
    const outputFile = process.argv[3] || CONFIG.outputFile;

    console.log('🚀 記事自動生成ツール起動');
    console.log(`📅 基準日: ${CONFIG.referenceDate}\n`);

    const articles = await generateArticles(inputFile, outputFile);

    if (articles && articles.length > 0) {
        console.log('\n✅ 処理完了');
        console.log(`\n次のステップ: 生成された記事をWordPressに投稿`);
        console.log(`  npm run wp ${outputFile}`);
    } else {
        console.log('\n💤 有効な目撃情報が見つかりませんでした');
    }
}

// スクリプトとして直接実行された場合のみmainを実行
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('❌ エラー発生:', error);
        process.exit(1);
    });
}

// モジュールとしてエクスポート
export { generateArticles };
