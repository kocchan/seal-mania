import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ==========================================
// 設定・定数
// ==========================================
// ES Module環境で __dirname を再現する設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.GEMINI_API_KEY;

// スクリプトの場所 (src/other_article/) から見てプロジェクトルート (../../) のdataフォルダを参照
const INPUT_DIR = path.join(__dirname, '../../data/related_data/input');
const OUTPUT_DIR = path.join(__dirname, '../../data/related_data/output');
const INPUT_FILES = ['relatedQueries.csv', 'relatedEntities.csv'];

// メイン商材（プロンプト内で使用）
const MAIN_SUBJECT = 'ボンボンドロップシール';

// Geminiモデル設定
// JSONモードを利用するため gemini-1.5-pro または flash を推奨
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    generationConfig: {
        responseMimeType: "application/json", // JSON出力を強制
    }
});

// ==========================================
// ユーティリティ関数
// ==========================================

// 日時フォーマット (YYYY/MM/DD HH:MM)
const formatDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
};

// ファイル名用日時フォーマット (yyyy_mm_dd_hh)
const formatFileNameDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    return `${yyyy}_${mm}_${dd}_${hh}`;
};

// ==========================================
// メイン処理
// ==========================================

async function main() {
    try {
        console.log('--- トレンドキーワード抽出処理を開始します ---');
        console.log(`参照ディレクトリ: ${INPUT_DIR}`);

        // 1. 入力ファイルの読み込み
        let combinedCsvContent = '';
        let filesFound = false;

        // 入力ディレクトリの存在確認（なければ作成して終了）
        try {
            await fs.access(INPUT_DIR);
        } catch {
            console.log(`入力ディレクトリが見つかりません: ${INPUT_DIR}`);
            console.log('パスを確認してください。');
            // 必要であれば再帰的に作成（ただし今回はデータがある前提なので警告のみにするか、作成するか）
            // await fs.mkdir(INPUT_DIR, { recursive: true });
            return;
        }

        for (const fileName of INPUT_FILES) {
            const filePath = path.join(INPUT_DIR, fileName);
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                combinedCsvContent += `\n--- FILE: ${fileName} ---\n${content}`;
                filesFound = true;
                console.log(`読み込み成功: ${fileName}`);
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    console.error(`読み込みエラー: ${fileName}`, err);
                } else {
                    console.log(`ファイルが見つかりません: ${filePath}`);
                }
            }
        }

        if (!filesFound) {
            console.log('処理対象のファイルが見つかりませんでした。終了します。');
            return;
        }

        // 2. プロンプトの構築
        const prompt = `
# Role
あなたはWebメディアの優秀なトレンド分析官です。
与えられた「Googleトレンドの検索クエリリスト（CSV）」を分析し、記事のトピックとして価値のある「関連キーワード」のみを抽出してください。

# Main Subject
分析対象のメイン商材： **${MAIN_SUBJECT}**

# Tasks
1. 提供されたCSVデータから検索クエリを読み取る。
2. 各クエリから「メイン商材名（${MAIN_SUBJECT}、ボンボン、ドロップ、シール）」を取り除く。
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

        // 3. Gemini APIへリクエスト
        console.log('Gemini APIに問い合わせ中...');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // 4. JSONパース
        let keywords = [];
        try {
            // ```json ... ``` のようなMarkdown記法が含まれていても除去してパースする
            const jsonStr = text.replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
            keywords = JSON.parse(jsonStr);
            console.log(`抽出されたキーワード数: ${keywords.length}`);
        } catch (e) {
            console.error('GeminiからのレスポンスをJSONとしてパースできませんでした。');
            console.error('Response Text:', text);
            throw e;
        }

        // 5. 出力データの整形
        const now = new Date();
        const formattedData = keywords.map(word => ({
            created_data: formatDate(now),
            word: word,
            fetch_data: formatDate(now) // データの取得日時は処理日時として設定（CSVメタデータがないため）
        }));

        // 6. JSONファイル保存
        await fs.mkdir(OUTPUT_DIR, { recursive: true });

        const outputFileName = `related_word_${formatFileNameDate(now)}.json`;
        const outputPath = path.join(OUTPUT_DIR, outputFileName);

        await fs.writeFile(outputPath, JSON.stringify(formattedData, null, 2), 'utf-8');
        console.log(`ファイル保存完了: ${outputPath}`);

        // 7. 後処理 (入力ファイルの削除)
        console.log('入力ファイルを削除します...');
        for (const fileName of INPUT_FILES) {
            const filePath = path.join(INPUT_DIR, fileName);
            try {
                await fs.unlink(filePath);
                console.log(`削除完了: ${fileName}`);
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    console.error(`削除失敗: ${fileName}`, err);
                }
            }
        }

        console.log('--- 全ての処理が正常に完了しました ---');

    } catch (error) {
        console.error('予期せぬエラーが発生しました:', error);
    }
}

main();