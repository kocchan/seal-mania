import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

// ==========================================
// ⚙️ 設定・定数
// ==========================================
const API_KEY = process.env.GEMINI_API_KEY;

// 通常処理用（フィルタリング、JSON整形など）
const GEN_AI_MODEL = "gemini-3-flash-preview";

// 記事執筆用（高精度モデル）
// ※現在利用可能な最上位モデルを指定
const WRITER_MODEL_NAME = "gemini-3-pro-preview";

const BASE_DIR = process.cwd();
const PATHS = {
    RELATED_DATA: path.join(BASE_DIR, 'data/related_data/output'),
    TWEET_OUTPUT: path.join(BASE_DIR, 'data/tweet_row_data/output'),
    ARTICLE_OUTPUT: path.join(BASE_DIR, 'data/article_contents/output')
};

// ==========================================
// 🗺️ サイト構成図定義
// ==========================================
const SITE_MAP_DEF = `
HOME (トップページ)
│
├── 都道府県別 (slug: prefecture)
│   │
│   ├── 北海道・東北(slug: prefecture/tohoku)
│   │   ├── 北海道 (slug: prefecture/tohoku/hokkaido)
│   │   │   ├──記事(【北海道/xx市周辺】ボンボンドロップシール買えた店舗まとめ|xxxx)(この都道府県での目撃情報をまとめて記載する。店舗名のハッシュタグつける) 
│   │   └── 宮城 (slug: prefecture/tohoku/miyagi) ...
│   │
│   ├── 関東(slug: prefecture/kanto)
│   │   ├── 東京 (slug: prefecture/kanto/tokyo)
│   │   │   ├──記事(【東京都/xx区周辺】ボンボンドロップシール買えた店舗まとめ|xxxx)(この都道府県での目撃情報をまとめて記載する。店舗名のハッシュタグつける)
│   │   │   ├──記事(【東京都/xx区/〇〇店】ボンボンドロップシール販売情報まとめ|xxxx)(この店舗はやたらとデータが多いとなったら店舗のページを特設する。店舗名のハッシュタグつける)
│   │   │   ├──記事(【東京都/xx区/〇〇店】ボンボンドロップシール店舗傾向解説|整理券・抽選のルールと過去の傾向)(この店舗はやたらとデータが多いとなったら店舗のページを特設する。店舗名のハッシュタグつける)  
│   │   ├── 神奈川 (slug: prefecture/kanto/kanagawa)...
│   │
│   └── 近畿 (親)
│       ├── 大阪 (子カテゴリー) ...
│
├── 入荷・抽選情報 (slug: news)
│   ├── 今月の新作 (slug: news/new-item)
│   ├── 抽選・予約情報 (slug: news/reservation)
│   └── オンライン通販 (slug: news/online)
│
├── 店舗攻略情報 (slug: store)
│   ├── ドンキ (slug: store/donki)
│   ├── LOFT (slug: store/loft)
│   └── ハンズ (slug: store/hanzu)
│   └── コンビニ (slug: store/convini)
│   └── ヴィレッジヴァンガード (slug: store/viragevanguard)
│   └── TSUTAYA (slug: store/tsutaya)
│   └── その他 (slug: store/other)
│
├── キャラクターシール (slug: character)（キャラクターごとの最新情報/店舗情報/オンライン在庫情報）
│   ├── ディズニー(slug:character/disney)
│   │   ├──記事(【ディズニー/ズートピア】ボンボンドロップシール最新情報|xxxx)(こういうシールが新発売/大手店舗で取り扱う予定)
│   ├── サンリオ(slug:character/sanrio)
│   ├── たまごっち(slug:character/tamagocchi)
│   ├── しずくちゃん(slug:character/sizukuchan)
│   ├── ちいかわ(slug:character/chiikawa)
│   ├── その他(slug:character/other)
│
├── 一般ガイド (カテゴリー: guide)
│   ├── 記事：「ボンボンドロップシールとは？なぜ人気？」(検索需要あり)
│   ├── 記事：「オリジナルシールの作り方」
│   └── 記事：「抽選販売の勝ち方（ライブポケットの使い方）」
`;

// ==========================================
// 🤖 AIモデル初期化
// ==========================================
const genAI = new GoogleGenerativeAI(API_KEY);

// 1. 汎用・整形用 (Flash)
const normalModel = genAI.getGenerativeModel({
    model: GEN_AI_MODEL,
    generationConfig: { responseMimeType: "application/json" }
});

// 2. 執筆用 (Pro) - テキスト出力
const writerModel = genAI.getGenerativeModel({
    model: WRITER_MODEL_NAME
});

// ==========================================
// 🛠️ ユーティリティ関数
// ==========================================
const getJSTDate = () => {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return now.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
};

const getYYYYMMDDHH = () => {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const h = String(now.getUTCHours()).padStart(2, '0');
    return `${y}_${m}_${d}_${h}`;
};

async function ensureDir(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

async function fileExists(path) {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

// ==========================================
// 🧠 Gemini ロジック
// ==========================================

async function generateDraftArticle(tweetsData, themeWord) {
    const prompt = `
# 役割
あなたは「ボンボンドロップシール」の熱狂的なファンであり、かつSEOに精通したプロブロガーです。
提供されたX（旧Twitter）の投稿データを分析し、指定されたキーワード「**${themeWord}**」に関連する濃厚なブログ記事を作成してください。

# 入力データ
**ターゲットキーワード：** ${themeWord}
**Xの投稿データ:**
${JSON.stringify(tweetsData)}

# 重要：データ処理の注意点
提供されたデータには「楽天で買えた [PR]」のようなアフィリエイト目的のbot投稿が含まれています。
**これらのbot投稿（PRタグや定型文）は「在庫がある店舗のヒント」としてのみ扱い、記事の「ファンの声」としては引用しないでください。**
人間の感情が含まれる投稿（「当たった！」「可愛い！」「外れた…」など）を優先的に分析・引用してください。

# 記事作成オーダー
以下の条件で、**必ず3〜4本の異なる切り口の記事**を作成してください。

1.  **記事ごとの文字数**: **各2000文字以上**を目指してください。
    * 内容を薄めず、背景知識、過去の傾向、ファンの心理分析、具体的なアクションプラン、注意点などを網羅して肉付けしてください。
2.  **切り口の分散**:
    * 入荷・抽選速報、店舗攻略（地域・店舗別）、感情・トレンド考察など、入力データに基づいて最適な切り口を選んでください。

# 記事構成フォーマット（厳守）
各記事は以下のMD形式で出力してください。

---
### 記事タイトル：{SEOとクリック率を意識した30文字程度のタイトル}

**■ サイト掲載情報**
* **カテゴリ:** {後述のサイト構成図から適切な親・子カテゴリを選択}
* **スラッグ:** {サイト構成図に基づくスラッグ}
* **ターゲット:** {誰に向けた記事か}

**【実際の声】**
> 「{人間味のある投稿を引用}」

#### {見出し1：導入・フック}
{読者の感情に寄り添う導入。現状の整理。}

#### {見出し2：詳細分析・深掘り}
{なぜそれが起きているのか？過去と比較してどうなのか？}

#### {見出し3：攻略・解決策}
{読者が次に取るべき行動。具体的な店舗名や時間帯など。}

#### {見出し4：補足情報・注意点}
{見落としがちなルールや、類似品への注意など細かい情報。}

#### まとめ
{ポジティブな締めくくり}
---

# サイト構成図（カテゴリ選定用）
以下のツリー構造から最も適切な配置場所を選定してください。
${SITE_MAP_DEF}
    `;

    try {
        const result = await writerModel.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        console.error(`❌ ドラフト生成エラー (${themeWord}):`, e.message);
        return "";
    }
}

async function refineAndFormatArticle(draftText, pastArticleInfo) {
    if (!draftText) return "[]";

    const prompt = `
あなたは敏腕編集者です。
入力された「ブログ記事の原稿（Markdown）」を、WordPress投稿用のJSONデータに変換してください。
記事の内容が薄い場合は、適宜補足して充実させてください。

## 過去の記事情報（重複回避用）
${JSON.stringify(pastArticleInfo)}
※これらと完全に同じ内容の記事は除外してください。

## サイト構成図（カテゴリ確認用）
${SITE_MAP_DEF}

## 変換ルール
1. **AI特有の言い回しの修正**: 「〜しましょう」「〜と言えるでしょう」の多用を避け、断定や体言止めを使い、人間味のあるリズムに修正してください。
2. **カテゴリ設定**: 記事の内容に最も合致するカテゴリを上記サイト構成図から選び、配列で設定してください（例: ["都道府県別", "関東", "東京"]）。
3. **JSON形式**: 必ず以下の形式の配列で出力してください。

[
  {
    "title": "記事タイトル",
    "content": "記事本文(Markdown形式。見出しは##を使用)",
    "categories": ["親カテゴリ", "子カテゴリ", "孫カテゴリ"],
    "tags": ["タグ1", "タグ2", "タグ3"],
    "slug": "unique-slug-example"
  },
  ...
]

## 入力原稿
${draftText}
    `;

    try {
        const result = await normalModel.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        console.error("❌ 推敲・JSON化エラー:", e.message);
        return "[]";
    }
}

// ==========================================
// 🕸️ スクレイピング (簡易版)
// ==========================================
async function scrapeYahooRealtime(keyword) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    const results = [];

    try {
        const searchWord = `ボンボンドロップシール ${keyword}`;
        console.log(`🔍 Scraping: ${searchWord}`);
        const url = `https://search.yahoo.co.jp/realtime/search?p=${encodeURIComponent(searchWord)}&ei=UTF-8`;

        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        const tweets = await page.evaluate(() => {
            const items = document.querySelectorAll('div[class*="Tweet_body"], div[class*="tweet"], article');
            const data = [];
            items.forEach(element => {
                let container = element;
                if (element.className.includes('Tweet_body')) {
                    container = element.closest('div') || element.parentElement || element;
                }
                const textEl = container.querySelector('[class*="Tweet_body"]') || container.querySelector('[class*="text"]');
                const text = textEl ? (textEl.innerText || textEl.textContent || '').trim() : '';

                const timeEl = container.querySelector('time, [class*="time"], [class*="date"]');
                const timeStr = timeEl ? (timeEl.innerText || timeEl.textContent).trim() : '';

                if (text) {
                    data.push({ text, postTime: timeStr, fetchedAt: new Date().toISOString() });
                }
            });
            return data;
        });
        results.push(...tweets);

    } catch (e) {
        console.error(`❌ Error scraping ${keyword}:`, e.message);
    } finally {
        await browser.close();
    }
    return results;
}

// ==========================================
// 🚀 メイン処理
// ==========================================
async function main() {
    await ensureDir(PATHS.TWEET_OUTPUT);
    await ensureDir(PATHS.ARTICLE_OUTPUT);

    // 1. ファイル特定
    const files = await fs.readdir(PATHS.RELATED_DATA);
    const targetFile = files.find(f => f.startsWith('related_word_') && !f.startsWith('done_'));

    if (!targetFile) {
        console.log("🏁 処理対象なし");
        return;
    }

    console.log(`📂 Target: ${targetFile}`);
    const rawData = JSON.parse(await fs.readFile(path.join(PATHS.RELATED_DATA, targetFile), 'utf-8'));

    // 2. 過去記事情報取得
    const articleFiles = await fs.readdir(PATHS.ARTICLE_OUTPUT);
    const doneArticleFiles = articleFiles.filter(f => f.startsWith('done_'));
    let pastArticleInfo = [];
    for (const af of doneArticleFiles) {
        try {
            const content = JSON.parse(await fs.readFile(path.join(PATHS.ARTICLE_OUTPUT, af), 'utf-8'));
            if (Array.isArray(content)) {
                pastArticleInfo.push(...content.map(c => ({ title: c.title, slug: c.slug })));
            }
        } catch (e) { }
    }

    // ★ 出力ファイル名を先に決定し、空ファイルを作成しておく
    const articleFileName = `${getYYYYMMDDHH()}.json`;
    const articleFilePath = path.join(PATHS.ARTICLE_OUTPUT, articleFileName);

    const tweetJsonName = `tweet_row_${getJSTDate()}.json`;
    const tweetFilePath = path.join(PATHS.TWEET_OUTPUT, tweetJsonName);

    if (!await fileExists(articleFilePath)) {
        await fs.writeFile(articleFilePath, JSON.stringify([], null, 2));
    }
    if (!await fileExists(tweetFilePath)) {
        await fs.writeFile(tweetFilePath, JSON.stringify([], null, 2));
    }

    const filteredWords = rawData.map(d => d.word);

    // 3. ループ処理開始
    for (const word of filteredWords) {
        console.log(`\n🔍 Processing word: "${word}"`);

        // A. スクレイピング
        let tweets = await scrapeYahooRealtime(word);

        if (!tweets || tweets.length === 0) {
            console.log(`   ⚠️ No tweets found for ${word}`);
            continue;
        }

        // ★ ツイートデータ：都度保存 (読み込み -> 追加 -> 保存)
        try {
            const currentRaw = JSON.parse(await fs.readFile(tweetFilePath, 'utf-8'));
            currentRaw.push({ word, tweets });
            await fs.writeFile(tweetFilePath, JSON.stringify(currentRaw, null, 2));
        } catch (e) {
            console.error(`   ❌ Failed to save raw tweets:`, e.message);
        }

        // B. 記事ドラフト生成
        console.log(`   📝 Generating drafts for "${word}"...`);
        const inputTweets = tweets.slice(0, 50);
        const draftText = await generateDraftArticle(inputTweets, word);

        // C. 記事整形
        if (draftText) {
            console.log(`   🎨 Refining articles for "${word}"...`);
            const refinedJson = await refineAndFormatArticle(draftText, pastArticleInfo);
            try {
                const newArticles = JSON.parse(refinedJson);
                console.log(`   ✅ Generated ${newArticles.length} articles for "${word}"`);

                // ★ 記事データ：都度保存 (読み込み -> 追加 -> 保存)
                const currentArticles = JSON.parse(await fs.readFile(articleFilePath, 'utf-8'));
                currentArticles.push(...newArticles);
                await fs.writeFile(articleFilePath, JSON.stringify(currentArticles, null, 2));

                console.log(`   💾 Saved progress to ${articleFileName}`);

                // 重複排除リストも更新
                pastArticleInfo.push(...newArticles.map(c => ({ title: c.title, slug: c.slug })));

            } catch (e) {
                console.error(`   ❌ JSON Parse/Save Error for "${word}":`, e.message);
            }
        }

        // 必要に応じて待機時間を入れる
        // await new Promise(r => setTimeout(r, 2000));
    }

    // 4. 元ファイルのリネーム
    const newTargetName = `done_${targetFile}`;
    await fs.rename(path.join(PATHS.RELATED_DATA, targetFile), path.join(PATHS.RELATED_DATA, newTargetName));
    console.log(`\n🔒 Renamed target file to ${newTargetName}`);
    console.log(`🎉 All done. Check ${articleFileName}`);
}

main().catch(console.error);