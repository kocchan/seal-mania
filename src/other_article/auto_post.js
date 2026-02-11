import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import axios from 'axios';
import { CONFIG } from './config.js'; // 👈 追加: config.jsをインポート

dotenv.config();

// =====================================
// 設定・定数
// =====================================
const DATA_DIR = path.resolve(process.cwd(), 'data/article_contents/output');

// デフォルトカテゴリID（もしJSONにカテゴリがなく、マップにもない場合に使用）
// 環境に合わせて適切なID（例: 未分類=1, シール情報ガイド=97など）を指定してください
const DEFAULT_CATEGORY_ID = 97;

// 環境変数
const GEN_AI_KEY = process.env.GEMINI_API_KEY;
const WP_API_URL = process.env.WP_API_URL;
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

// Gemini初期化
const genAI = new GoogleGenerativeAI(GEN_AI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

// キャッシュ用（同じタグを何度もAPIで問い合わせないようにする）
const termCache = { categories: {}, tags: {} };

// =====================================
// ヘルパー: カテゴリ・タグのID取得（Config参照 -> 検索 -> 作成）
// =====================================
async function getTermId(taxonomy, termName) {
    if (!termName) return null;

    // 1. Configファイル(wpCategoryMap)を確認 (カテゴリの場合)
    // APIを叩く前に、手動設定されたマッピングを確認して高速化
    if (taxonomy === 'categories') {
        // 完全一致チェック
        if (CONFIG.wpCategoryMap[termName]) {
            return CONFIG.wpCategoryMap[termName];
        }

        // 部分一致チェック（例: JSONが「東京都」でもConfigの「東京」をヒットさせる）
        // キー（東京）が termName（東京都）に含まれているかチェック
        const foundKey = Object.keys(CONFIG.wpCategoryMap).find(key => termName.includes(key));
        if (foundKey) {
            return CONFIG.wpCategoryMap[foundKey];
        }
    }

    // --- 以下、APIを使った検索・作成ロジック ---

    // 2. キャッシュチェック
    if (termCache[taxonomy][termName]) {
        return termCache[taxonomy][termName];
    }

    const authHeader = {
        'Authorization': `Basic ${Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/json'
    };

    try {
        // 3. 既存のタームをAPIで検索
        const searchRes = await axios.get(`${WP_API_URL}/${taxonomy}?search=${encodeURIComponent(termName)}`, {
            headers: authHeader
        });

        // 完全一致するものを探す
        const existingTerm = searchRes.data.find(t => t.name.toLowerCase() === termName.toLowerCase());

        if (existingTerm) {
            termCache[taxonomy][termName] = existingTerm.id;
            return existingTerm.id;
        }

        // 4. 存在しなければ新規作成 (タグの場合のみ推奨)
        // カテゴリは勝手に増やすと管理が大変なので、ConfigにもAPIにもない場合はnullを返す（＝デフォルトカテゴリへ）
        if (taxonomy === 'tags') {
            console.log(`🆕 新しいタグを作成中: ${termName}`);
            const createRes = await axios.post(`${WP_API_URL}/${taxonomy}`, {
                name: termName
            }, { headers: authHeader });

            const newId = createRes.data.id;
            termCache[taxonomy][termName] = newId;
            return newId;
        }

        return null;

    } catch (error) {
        console.error(`⚠️ ターム処理エラー (${taxonomy}: ${termName}): ${error.message}`);
        return null;
    }
}

// =====================================
// ヘルパー: 最新のJSONファイルを取得
// =====================================
async function getLatestJsonFile() {
    try {
        const files = await fs.readdir(DATA_DIR);
        // .jsonで終わり、かつ done_ で始まらないファイルを抽出
        const targetFiles = files
            .filter(f => f.endsWith('.json') && !f.startsWith('done_'))
            .sort()
            .reverse();

        if (targetFiles.length === 0) return null;
        return path.join(DATA_DIR, targetFiles[0]);
    } catch (error) {
        console.error(`❌ ディレクトリ読み込みエラー: ${error.message}`);
        return null;
    }
}

// =====================================
// Gemini プロンプト生成 (Webライター風)
// =====================================
function createPrompt(article) {
    return `
あなたは「Web検索のプロ」兼「親しみやすい人気ブロガー」です。
以下の情報を元に、読者（主に小学生の子供を持つ親世代）にとって有益で読みやすいブログ記事を作成してください。

## 元の記事データ
タイトル: ${article.title}
本文: ${article.content}

## 執筆方針（厳守）
1. **トーン＆マナー:**
   - 「〜だよ！」「〜だね！」といった子供っぽすぎる言葉遣いは禁止です。
   - 「〜です」「〜ます」調の、丁寧かつ明るい標準的なWebメディアの文体にしてください。
   - ターゲットは「シールを探している小学生」もしくは「子供のために情報を探している親御さん」です。

2. **構成:**
   - **タイトル:** ここで生成するJSONの"title"には含めますが、**"html_content"の中には絶対にタイトル（h1タグや記事名）を含めないでください。** WordPress側で自動表示されます。
   - **見出し:** 読みやすいように h2, h3 タグを使用してください。
   - **検索誘導:** 記事内に直接外部リンク（aタグ）は貼らないでください。代わりに記事の最後に「公式情報を調べるための検索ワード」を提案するボックスを作成してください。

3. **内容:**
   - 入手困難な状況でも、「まだチャンスはあります」「ここをチェックしておきましょう」と前向きに提案する内容にしてください。
   - 記事の後半に <hr> で区切り、「【コラム】なぜ今ブームなのか？」という短いセクションを設け、大人の視点（平成レトロ、所有欲など）で分析を入れてください。

## 出力フォーマット (JSON形式のみ)
Markdownのコードブロック( \`\`\`json )は含めず、純粋なJSON文字列のみを出力してください。

{
  "title": "（クリックしたくなるキャッチーなタイトル）",
  "search_keyword": "（公式サイトにたどり着くための検索ワード。例: クーリア しずくちゃん 公式）",
  "html_content": "（記事本文のHTML。h1タグ禁止。aタグ禁止。）"
}
`;
}

// =====================================
// WordPress 投稿処理
// =====================================
async function postToWordPress(aiData, originalSlug, categoryIds, tagIds) {
    const credentials = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');

    let contentBody = aiData.html_content;
    const searchWord = aiData.search_keyword || "ボンボンドロップシール 公式";

    // 検索誘導ボックスの追加
    contentBody += `
    <div style="margin-top: 40px; padding: 20px; background-color: #f7f7f7; border: 2px dashed #ccc; border-radius: 8px; text-align: center;">
        <p style="margin-bottom: 10px; font-weight: bold; color: #555;">👇 詳細や最新情報は公式ページで検索！</p>
        <div style="background: #fff; padding: 10px; border: 1px solid #ddd; display: inline-block; border-radius: 4px;">
            <span style="font-size: 1.2em; font-weight: bold; color: #333;">🔍 ${searchWord}</span>
        </div>
        <p style="margin-top: 10px; font-size: 0.85em; color: #888;">※詐欺サイトにご注意ください。公式サイトでの確認をおすすめします。</p>
    </div>`;

    // カテゴリIDが空ならデフォルトを使用
    const finalCategories = categoryIds.length > 0 ? categoryIds : [DEFAULT_CATEGORY_ID];

    const payload = {
        title: aiData.title,
        content: contentBody,
        status: 'publish',
        categories: finalCategories,
        tags: tagIds, // タグIDの配列を追加
        slug: originalSlug,
    };

    try {
        const response = await axios.post(`${WP_API_URL}/posts`, payload, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ WP投稿成功: ID ${response.data.id} - ${aiData.title}`);
        console.log(`   └ カテゴリID: [${finalCategories.join(', ')}], タグID: [${tagIds.join(', ')}]`);
        return true;
    } catch (error) {
        console.error(`❌ WP投稿エラー:`);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Msg: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(`   ${error.message}`);
        }
        return false;
    }
}

// =====================================
// メイン処理
// =====================================
async function main() {
    // 1. 対象ファイルの特定
    const targetFilePath = await getLatestJsonFile();
    if (!targetFilePath) {
        console.log("📂 処理対象のJSONファイルが見つかりませんでした。");
        return;
    }
    console.log(`📂 対象ファイル: ${path.basename(targetFilePath)} を読み込みます...`);

    // 2. ファイル読み込み
    let articles = [];
    try {
        const rawData = await fs.readFile(targetFilePath, 'utf-8');
        articles = JSON.parse(rawData);
    } catch (error) {
        console.error(`❌ ファイル読み込みエラー: ${error.message}`);
        return;
    }

    let processedCount = 0;
    let errorCount = 0;

    // 3. 記事ループ処理
    for (let i = 0; i < articles.length; i++) {
        const article = articles[i];

        if (article.done === true) continue;

        console.log(`\n---------------------------------------------------`);
        console.log(`🤖 処理開始 (${i + 1}/${articles.length}): ${article.title}`);

        try {
            // --- A. カテゴリ・タグのID解決 ---
            console.log(`🔍 カテゴリ・タグをWordPressと照合中...`);

            // カテゴリIDの取得（並列処理）
            const catPromises = (article.categories || []).map(name => getTermId('categories', name));
            const categoryIds = (await Promise.all(catPromises)).filter(id => id !== null);

            // タグIDの取得（並列処理）
            const tagPromises = (article.tags || []).map(name => getTermId('tags', name));
            const tagIds = (await Promise.all(tagPromises)).filter(id => id !== null);

            // --- B. Gemini執筆 ---
            console.log(`✍️  AI執筆中...`);
            const prompt = createPrompt(article);
            const result = await model.generateContent(prompt);
            const response = await result.response;
            let text = response.text();

            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const aiData = JSON.parse(text);

            // --- C. WordPress投稿 ---
            const isSuccess = await postToWordPress(aiData, article.slug, categoryIds, tagIds);

            if (isSuccess) {
                articles[i].done = true;
                processedCount++;
                await fs.writeFile(targetFilePath, JSON.stringify(articles, null, 2), 'utf-8');
            } else {
                errorCount++;
            }

            // API制限対策
            await new Promise(resolve => setTimeout(resolve, 3000));

        } catch (err) {
            console.error(`❌ エラー発生 (${article.title}):`, err.message);
            errorCount++;
        }
    }

    // 4. 完了判定とリネーム
    const allDone = articles.every(a => a.done === true);

    console.log(`\n🎉 処理終了 (成功: ${processedCount}, エラー: ${errorCount})`);

    if (allDone && articles.length > 0) {
        const dir = path.dirname(targetFilePath);
        const filename = path.basename(targetFilePath);
        const newFilePath = path.join(dir, `done_${filename}`);

        try {
            await fs.rename(targetFilePath, newFilePath);
            console.log(`✅ ファイル名を変更しました: ${path.basename(newFilePath)}`);
        } catch (err) {
            console.error(`⚠️ リネーム失敗: ${err.message}`);
        }
    }
}

main();