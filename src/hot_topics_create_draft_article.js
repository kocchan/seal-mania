import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ScanCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import crypto from 'crypto';
import { dbClient, getNowJST } from './utils.js';
import { CONFIG } from './config.js';

// ==========================================
// ⚙️ 設定・定数
// ==========================================
const SOURCE_TABLE = "TrendKeywords_RawTweets";
const TARGET_TABLE = "TrendKeywords_DraftArticle";

// 記事執筆用（高精度モデル）を指定
// ※現在のAPIで利用可能な推論能力の高いProモデルを使用
const WRITER_MODEL_NAME = "gemini-3-pro-preview";

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const writerModel = ai.getGenerativeModel({
    model: WRITER_MODEL_NAME,
    generationConfig: {
        responseMimeType: "application/json" // 確実にJSONで返させる
    }
});

// ==========================================
// 🗄️ DynamoDB 操作関数
// ==========================================

/**
 * 未処理のRawTweetsを取得する
 */
async function fetchUnprocessedTweets() {
    try {
        console.log(`📚 DynamoDB (${SOURCE_TABLE}) から未処理のツイートを取得中...`);
        const result = await dbClient.send(new ScanCommand({
            TableName: SOURCE_TABLE,
            FilterExpression: "is_processed = :falseVal",
            ExpressionAttributeValues: { ":falseVal": false }
        }));
        console.log(`✅ ${result.Items.length} 件の未処理ツイートを取得しました。`);
        return result.Items || [];
    } catch (e) {
        console.error("⚠️ ツイート取得失敗:", e.message);
        return [];
    }
}

/**
 * 下書きをDBに保存する
 */
async function saveDraftArticle(draftData, targetWord) {
    try {
        const draftId = crypto.randomUUID();
        await dbClient.send(new PutCommand({
            TableName: TARGET_TABLE,
            Item: {
                draft_id: draftId,
                word: targetWord,
                title: draftData.title,
                content: draftData.content,
                categories: draftData.categories,
                tags: draftData.tags,
                slug: draftData.slug,
                reference_urls: draftData.reference_urls || [],
                is_processed: false,   // WordPress投稿用のフラグ（初期値）
                is_rejected: false,    // 添削NGフラグ（初期値）
                created_at: getNowJST()
            }
        }));
        console.log(`      💾 下書き保存完了: ${draftData.title} (Word: ${targetWord})`);
        return true;
    } catch (e) {
        console.error(`      ❌ 下書き保存エラー:`, e.message);
        return false;
    }
}

/**
 * 使用したツイートを処理済みに更新する
 */
async function markTweetsAsProcessed(tweetIds) {
    console.log(`      🔄 ${tweetIds.length} 件の元ツイートを処理済みに更新中...`);
    for (const id of tweetIds) {
        try {
            await dbClient.send(new UpdateCommand({
                TableName: SOURCE_TABLE,
                Key: { tweet_id: id },
                UpdateExpression: "set is_processed = :trueVal",
                ExpressionAttributeValues: { ":trueVal": true }
            }));
        } catch (e) {
            console.error(`      ⚠️ ツイート更新失敗 (${id}):`, e.message);
        }
    }
}

// ==========================================
// 🤖 AI 記事生成処理
// ==========================================

async function generateDraftArticle(word, tweets) {
    console.log(`🤖 Gemini APIで「${word}」の記事を下書き中...`);

    // ツイートデータから必要な情報だけを抽出して軽量化（トークン節約）
    const simplifiedTweets = tweets.map(t => ({
        text: t.text,
        url: t.url,
        time: t.post_time_str
    }));

    const prompt = `
# 役割
あなたは「シールマニア」の編集長であり、最新のSEO（E-E-A-T、情報密度）に精通したプロのWebライターです。提供されたX（旧Twitter）の投稿データ（JSON）を分析し、ユーザーの検索意図を満たす高品質なブログ記事を作成してください。
今回のターゲットキーワードは「${word}」です。

# ターゲット読者
推しのキャラクターシールや、最新のシール（ボンボンドロップ等）を本気で探しているファンや、その親御さん。

# 重要：データ処理とSEOの厳守ルール（E-E-A-T対応）
現在の検索アルゴリズムで高く評価されるため、以下のルールを「絶対条件」として執筆してください。

1. **ノイズの完全排除（超重要）**
   提供されたデータには「ヤフーショッピング」「在庫復活」「見つけた時が確保のタイミングです」といった定型文をつぶやくアフィリエイトbotや業者の投稿が混ざっています。**これらの投稿は一切無視し、絶対に記事に引用しないでください。**
2. **生の口コミの絶対引用（Experience）**
   業者の投稿を除外した後、残った「人間味のある生の投稿（例：買った、ない、可愛い、嬉しい、悲しい等）」を**一言一句改変せずに、引用符（>）を用いて2〜3つ必ず掲載**してください。これが記事の一次情報（Experience）となります。
3. **結論の先出し（TL;DR / Information Density）**
   冗長な挨拶は排除し、記事の冒頭（導入文の直前）に必ず「3秒でわかる！この記事の結論」を箇条書きで配置してください。

# 記事のテーマとカテゴリーの自動判別
入力データを分析し、以下の【A】〜【F】のどれに該当するかを一つ選び、そのテーマに沿った記事を作成してください。各テーマには、必ず以下の「独自の視点（情報利得）」を付加すること。

* **【A】目撃情報**（データが「昨日〜今日」の具体的な店舗での発見報告の場合）
  * 読者が今すぐ買いに行けるよう、場所と時間を簡潔に伝える。
  * **【独自視点の付加】**あなたの知識ベースを活用し、「イオンなら食玩より文具コーナー、ドンキならレジ前」など、その店舗系列における**具体的な陳列場所の傾向**や、**競争率（ライバルの多さ）の予測**を加えること。

* **【B】入荷・抽選情報（今月の新作）**（新作の発売情報や、ラインナップに関する話題の場合）
  * **【独自視点の付加】**シールの材質（ホログラム、ぷっくり感など）の物理的な魅力や、過去の同メーカーの傾向から推測される**コンプリート難易度（箱買いの必要性やレアの封入率）**についてマニアックに考察すること。

* **【C】入荷・抽選情報（抽選・予約情報）**（事前予約や抽選に関する話題の場合）
  * **【独自視点の付加】**LivePocket等の「システム攻略の事前準備（クレカ登録必須など）」や、落選者へ向けた「発売日後の**店頭キャンセル枠（敗者復活戦）の傾向**」といった行動アドバイスを記載すること。

* **【D】入荷・抽選情報（オンライン通販）**（ECサイトでの争奪戦や販売予告の場合）
  * **【独自視点の付加】**「カートに入れただけでは確保されない」などの**ECサイト特有の決済仕様の警告**や、効率よく買うための「**送料無料ラインの攻略ハック**（ついで買いの提案）」を盛り込むこと。

* **【E】キャラクターシール**（「譲」「求」など特定のキャラへの熱狂や枯渇に関する話題の場合）
  * **【独自視点の付加】**SNS界隈での**トレード（交換）レートの高騰ぶり**を考察したり、入手したシールをスマホケースに挟むなどの**推し活アレンジ（ユースケース）の提案**を行うこと。

* **【F】店舗攻略情報 / 一般ガイド**（全体のトレンド分析の場合）
  * **【独自視点の付加】**店員さんへのスムーズな在庫確認の仕方（マナー）や、100均アイテムを使った「**シンデレラフィットする収納術**」など、コレクターの検索需要が高い周辺知識を網羅すること。

# 記事構成フォーマット（厳守）
Markdownの構文（## や > など）を用いて、以下の流れで執筆すること。

## 【3秒でわかる！この記事の結論】
* 🎯 結論1：{最も重要なファクト}
* 💡 結論2：{読者が取るべきアクション}

## {見出し1：現場のリアルな声と現状}
{冗長な挨拶は不要。すぐに本題に入り、抽出した「人間味のある」生の口コミをそのまま引用（>）して、現状を整理・分析する。botの引用は厳禁。}

## {見出し2：詳細分析と独自の考察（情報利得）}
{引用した声や状況をもとに深く考察し、必ず指定された「独自視点」を盛り込むこと。}

## {見出し3：読者へのアドバイス・攻略法（Enabling）}
{読者が次に取るべき具体的な行動（何時に行くべきか、どう探すかなど）。}

## まとめ
{ポジティブで読者の背中を押す締めくくり}

# 入力データ (対象ワード: ${word})
${JSON.stringify(simplifiedTweets, null, 2)}

# 出力フォーマット指示
必ず以下のJSONスキーマに従って出力してください。Markdownのコードブロック(json)は不要です。直接JSONのみを出力してください。
{
  "title": "SEOを意識したクリックしたくなる30文字程度のタイトル",
  "content": "記事本文(Markdown形式。見出しは##を使用。上で指定した構成フォーマットに従う)",
  "categories": ["親カテゴリ", "子カテゴリ", "孫カテゴリ"],
  "tags": ["関連タグ1", "関連タグ2", "関連タグ3"],
  "slug": "unique-slug-example-in-english",
  "reference_urls": ["引用・参考にしたXのURLの配列"]
}
`;

    try {
        const result = await writerModel.generateContent(prompt);
        const text = result.response.text();

        // JSONパースの安全確保
        const jsonStr = text.replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error(`❌ Gemini APIエラー または JSONパース失敗 (${word}):`, e.message);
        return null;
    }
}

// ==========================================
// メイン処理パイプライン
// ==========================================
async function main() {
    console.log('🚀 記事下書き作成処理を開始します');

    // 1. 未処理のツイートを取得
    const rawTweets = await fetchUnprocessedTweets();
    if (rawTweets.length === 0) {
        console.log('💤 処理すべきデータがありません。終了します。');
        return;
    }

    // 2. ツイートをワード（word）ごとにグループ化する
    const groupedTweets = {};
    for (const tweet of rawTweets) {
        const word = tweet.word || 'その他';
        if (!groupedTweets[word]) groupedTweets[word] = [];
        groupedTweets[word].push(tweet);
    }

    const words = Object.keys(groupedTweets);
    console.log(`📊 ${words.length} 種類のワードが検出されました。`);

    // 3. ワードごとにループして処理
    for (const [index, word] of words.entries()) {
        console.log(`\n============================================`);
        console.log(`▶️ [${index + 1}/${words.length}] ワード: 「${word}」の処理を開始します`);
        const targetTweets = groupedTweets[word];
        console.log(`   └ 関連ツイート数: ${targetTweets.length}件`);

        // ツイートが少なすぎる場合（例: 2件以下）は質の高い記事にならないためスキップするロジックを入れることも可能です
        if (targetTweets.length < 1) {
            console.log(`   ⚠️ ツイートが少なすぎるためスキップします`);
            continue;
        }

        // AIで記事を下書き
        const draftData = await generateDraftArticle(word, targetTweets);

        if (draftData) {
            // 参考URLとして対象ツイートのURLをすべて挿入（AIが抽出しきれなかった場合の保険）
            draftData.reference_urls = targetTweets.map(t => t.url);

            // DBに下書きを保存
            const isSaved = await saveDraftArticle(draftData, word);

            // 保存に成功したら、使用したツイートを処理済みにする
            if (isSaved) {
                const tweetIds = targetTweets.map(t => t.tweet_id);
                await markTweetsAsProcessed(tweetIds);
            }
        }

        // APIレートリミット対策の待機時間
        await new Promise(res => setTimeout(res, 5000));
    }

    console.log(`\n✅ 全ての下書き作成処理が完了しました`);
}

main();