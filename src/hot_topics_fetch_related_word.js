import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import crypto from 'crypto';

// 共通モジュールの読み込み
import { CONFIG } from './config.js';
import { s3Client, dbClient, formatDate, formatRenameDate, streamToString } from './utils.js';

// ==========================================
// 初期化
// ==========================================
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = ai.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" }
});

// ==========================================
// サブ処理群
// ==========================================

/**
 * S3から入力ファイル群を読み込み、テキストとして結合する
 */
async function fetchInputFilesFromS3() {
    let combinedContent = '';
    let filesFound = false;
    const { s3BucketName, s3InputPrefix, s3InputFiles } = CONFIG.aws;

    for (const fileName of s3InputFiles) {
        const objectKey = `${s3InputPrefix}${fileName}`;
        try {
            const command = new GetObjectCommand({ Bucket: s3BucketName, Key: objectKey });
            const response = await s3Client.send(command);
            const content = await streamToString(response.Body);

            combinedContent += `\n--- FILE: ${fileName} ---\n${content}`;
            filesFound = true;
            console.log(`☁️ S3読み込み成功: ${objectKey}`);
        } catch (err) {
            if (err.name === 'NoSuchKey') {
                console.log(`☁️ S3ファイルが存在しません: ${objectKey}`);
            } else {
                console.error(`☁️ S3読み込みエラー: ${objectKey}`, err.message);
            }
        }
    }
    return { combinedContent, filesFound };
}

/**
 * Geminiにプロンプトを投げてJSONパース済みの配列を受け取る
 */
async function analyzeKeywordsWithGemini(combinedCsvContent) {
    console.log('🤖 Gemini APIに問い合わせ中...');

    // プロンプトは変更せずそのまま使用
    const prompt = `
# Role
あなたはWebメディアの優秀なトレンド分析官です。
与えられた「Googleトレンドの検索クエリリスト（CSV）」を分析し、記事のトピックとして価値のある「関連キーワード」のみを抽出してください。

# Main Subject
分析対象のメイン商材： **${CONFIG.app.mainSubject}**

# Tasks
1. 提供されたCSVデータから検索クエリを読み取る。
2. 各クエリから「メイン商材名（${CONFIG.app.mainSubject}、ボンボン、ドロップ、シール）」を取り除く。
3. 残った言葉の中から、以下の「除外ルール」に基づき、不要な単語を削除する。
4. **キーワードの整形・結合**:
   * **固有名詞の結合**: 「なかがわ 水 遊園」→「なかがわ水遊園」、「しずく ちゃん」→「しずくちゃん」のように、本来一つの言葉である固有名詞の中に含まれる不要なスペースは削除し、ひと単語として扱ってください。
   * **トピックのセット化**: キャラクター名やブランド名が含まれる場合は、単体ではなく、**「キャラクター名 ＋ 関連語（例：しずくちゃん 抽選）」**のように、検索意図がわかるセットで抽出してください。
   * **例外処理**: 「抽選」「通販」「どこ」などの除外ルールに該当する単語であっても、キャラクター名や店舗名と組み合わさることで具体的なトピックになる場合は、例外的に残してセットで出力してください。

5. **リストの精査と重複排除（最重要 - 今回の修正点）**:
   * **表記ゆれの統一**: 同じ対象を指す言葉（例：「バースデイ」と「バースデー」）は、一般的な表記に統一してください。
   * **包含関係の処理（具体性優先）**: リスト内に「単体キーワード（A）」と、それを含む「複合キーワード（B）」が両方存在する場合、**より情報量の多い「複合キーワード（B）」のみを残し、単体のキーワード（A）は削除**してください。
     * 例: ["しまむら", "しまむら オンライン"] → **["しまむら オンライン"]** のみを残す。
     * 例: ["バースデイ", "バースデイ オンライン"] → **["バースデイ オンライン"]** のみを残す。

# Exclusion Rules (除外ルール - 単体、または汎用的な組み合わせの場合は削除)
以下のカテゴリーに当てはまる単語は、原則として削除してください。
* **商材名そのもの:** ボンボン, ドロップ, シール, ステッカー, グミ, キャンディ
* **ECサイト・フリマアプリ:** メルカリ, Amazon, 楽天, ラクマ, PayPayフリマ, 通販, オンライン
* **購買意図・状態:** 在庫, 入荷, 再販, 売り切れ, 売ってる場所, どこ, 値段, 価格, 発売日, いつ, 予約, 抽選
* **汎用的な修飾語:** 人気, 新作, 種類, 一覧, 画像, サイズ, JAN, とは, なぜ, おすすめ, ランキング, 作り方, 手作り

# Inclusion Criteria (抽出対象 - これらは優先的に残す)
以下のカテゴリーに当てはまる単語は、具体的なトピックとして抽出してください。
* **具体的なキャラクター名 + 関連語:** (例: しずくちゃん 抽選, たまごっち 種類, お文具さん グッズ, etc.)
* **地名・施設名:** (例: なかがわ水遊園, 新宿, 原宿, 梅田, 関東, etc.)
* **具体的なデザイン・柄:** (例: チョコミント, ソーダ, 喫茶店, etc.)
* **具体的な店舗名:** (例: ハンズ, ロフト, ヴィレヴァン, オリンピア, しまむら, アベイル, シャンブル, ダイソー, ドンキ, etc.)
* **コラボ先・メーカー名:** (例: クーリア, 藤本電業, etc.)

# Input Data (CSV Content)
${combinedCsvContent}

# Output Format
* 結果は重複を除いた「キーワードのリスト」で出力すること。
* 余計な説明は不要。キーワードのみを列挙する。
* JSON形式の配列で出力してください。
  例: ["しずくちゃん 抽選", "なかがわ水遊園", "しまむら 再販", "クーリア 新作", ...]
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    try {
        const jsonStr = text.replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('JSONパースエラー。Response Text:', text);
        throw e;
    }
}

/**
 * 抽出されたキーワードをDynamoDBに保存する
 */
async function saveToDynamoDB(keywords, now) {
    console.log('💾 DynamoDBへのデータ保存を開始します...');
    const formattedNow = formatDate(now);
    const tableName = CONFIG.aws.dynamoTableTrend;

    for (const word of keywords) {
        try {
            await dbClient.send(new PutCommand({
                TableName: tableName,
                Item: {
                    id: crypto.randomUUID(),
                    word: word,
                    created_date: formattedNow,
                    fetch_date: formattedNow,
                    is_processed: false // 📍 追加：処理済みフラグをfalseで登録
                }
            }));
        } catch (err) {
            console.error(`❌ DynamoDB書き込みエラー (${word}):`, err.message);
        }
    }
    console.log(`✅ DynamoDBへの保存が完了しました。`);
}

/**
 * 処理が完了したファイルをS3内で processed/ に移動する
 */
async function moveFilesToProcessed(now) {
    console.log('📦 S3のファイルを処理済みフォルダへ移動します...');
    const renameSuffix = formatRenameDate(now);
    const { s3BucketName, s3InputPrefix, s3ProcessedPrefix, s3InputFiles } = CONFIG.aws;

    for (const fileName of s3InputFiles) {
        const oldKey = `${s3InputPrefix}${fileName}`;
        const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '';
        const baseName = fileName.replace(ext, '');
        const newKey = `${s3ProcessedPrefix}${baseName}_${renameSuffix}${ext}`;

        try {
            await s3Client.send(new CopyObjectCommand({
                Bucket: s3BucketName,
                CopySource: `${s3BucketName}/${oldKey}`,
                Key: newKey
            }));
            await s3Client.send(new DeleteObjectCommand({
                Bucket: s3BucketName,
                Key: oldKey
            }));
            console.log(`   移動完了: ${oldKey} -> ${newKey}`);
        } catch (err) {
            if (err.name !== 'NoSuchKey') {
                console.error(`   ⚠️ ファイル移動エラー (${fileName}):`, err.message);
            }
        }
    }
}

// ==========================================
// メイン処理パイプライン
// ==========================================
async function main() {
    try {
        console.log('--- トレンドキーワード抽出処理を開始します (AWS版) ---');
        console.log(`参照バケット: s3://${CONFIG.aws.s3BucketName}/${CONFIG.aws.s3InputPrefix}`);

        // 1. データ取得
        const { combinedContent, filesFound } = await fetchInputFilesFromS3();
        if (!filesFound) {
            console.log('処理対象のファイルが見つかりませんでした。終了します。');
            return;
        }

        // 2. AI分析
        const keywords = await analyzeKeywordsWithGemini(combinedContent);
        console.log(`抽出されたキーワード数: ${keywords.length}`);

        if (keywords.length > 0) {
            const now = new Date();
            // 3. データ保存
            await saveToDynamoDB(keywords, now);
            // 4. ファイル移動
            await moveFilesToProcessed(now);
        } else {
            console.log('抽出されたキーワードがありませんでした。');
        }

        console.log('--- 全ての処理が正常に完了しました ---');
    } catch (error) {
        console.error('予期せぬエラーが発生しました:', error);
    }
}

main();