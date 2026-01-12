import { chromium } from 'playwright';
import fs from 'fs';

// =====================================
// 設定
// =====================================
const CONFIG = {
    dataDir: './data',
    tweetsFile: './data/tweets.json',
    blacklistFile: './data/blacklist.txt',
    queriesFile: './config/queries.json',
    ngWordsFile: './config/ng_words.json',
    maxSavedTweets: 2000,
    headless: true,
    pageTimeout: 3000,
    queryDelay: 1000
};

// =====================================
// ファイル操作
// =====================================
function ensureDataDir() {
    if (!fs.existsSync(CONFIG.dataDir)) {
        fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    }
}

function loadJSON(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        console.error(`Error loading ${filePath}:`, e.message);
        return filePath.includes('queries') ? [] : {};
    }
}

function loadBlacklist() {
    if (!fs.existsSync(CONFIG.blacklistFile)) return new Set();
    const content = fs.readFileSync(CONFIG.blacklistFile, 'utf-8');
    return new Set(content.split('\n').map(line => line.trim()).filter(Boolean));
}

function appendToBlacklist(userId) {
    fs.appendFileSync(CONFIG.blacklistFile, `${userId}\n`, 'utf-8');
}

function loadSavedTweets() {
    if (!fs.existsSync(CONFIG.tweetsFile)) return [];
    try {
        return JSON.parse(fs.readFileSync(CONFIG.tweetsFile, 'utf-8'));
    } catch (e) {
        console.error('Error loading tweets:', e.message);
        return [];
    }
}

function saveTweets(tweets) {
    fs.writeFileSync(CONFIG.tweetsFile, JSON.stringify(tweets, null, 2), 'utf-8');
}

// =====================================
// フィルタリング
// =====================================
function shouldFilterOut(tweet, context) {
    const { blacklistSet, savedTweetIds, processedTexts, ngConfig } = context;

    // ブラックリストチェック
    if (blacklistSet.has(tweet.userId)) {
        return { filtered: true, reason: 'blacklisted' };
    }

    // ID重複チェック
    if (savedTweetIds.has(tweet.id)) {
        return { filtered: true, reason: 'duplicate_id' };
    }

    // テキスト重複チェック
    const textHash = tweet.text.slice(0, 100);
    if (processedTexts.has(textHash)) {
        return { filtered: true, reason: 'duplicate_text' };
    }
    processedTexts.add(textHash);

    // URL存在チェック
    if (!tweet.url) {
        return { filtered: true, reason: 'no_url' };
    }

    // NGワード/スパムチェック
    const spamCheck = checkForSpam(tweet, ngConfig, blacklistSet);
    if (spamCheck.isSpam) {
        return { filtered: true, reason: 'spam', ...spamCheck };
    }

    return { filtered: false };
}

function checkForSpam(tweet, ngConfig, blacklistSet) {
    const { text, userId } = tweet;

    // テキストNGワードチェック
    for (const ngWord of ngConfig.texts) {
        if (text.includes(ngWord)) {
            autoBan(userId, blacklistSet, `NGワード: ${ngWord}`);
            return { isSpam: true, ngWord };
        }
    }

    // URL NGワードチェック
    const urls = extractURLsFromText(text);
    for (const url of urls) {
        for (const ngUrl of ngConfig.urls) {
            if (url.includes(ngUrl)) {
                autoBan(userId, blacklistSet, `スパムURL: ${ngUrl}`);
                return { isSpam: true, ngUrl };
            }
        }
    }

    return { isSpam: false };
}

function extractURLsFromText(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
}

function autoBan(userId, blacklistSet, reason) {
    if (!blacklistSet.has(userId)) {
        console.log(`🚫 AutoBAN: ${userId} - ${reason}`);
        blacklistSet.add(userId);
        appendToBlacklist(userId);
    }
}

// =====================================
// スクレイピング
// =====================================
async function scrapeYahooRealtime(queries, batchInfo) {
    const browser = await chromium.launch({ headless: CONFIG.headless });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let allResults = [];

    for (const query of queries) {
        try {
            console.log(`🔍 検索中: ${query}`);
            const url = `https://search.yahoo.co.jp/realtime/search?p=${encodeURIComponent(query)}&ei=UTF-8`;

            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(CONFIG.pageTimeout);

            const tweets = await page.evaluate((batchInfo) => {
                const results = [];
                const selectors = [
                    'div[class*="Tweet_body"]',
                    'div[class*="tweet"]',
                    'article'
                ];

                let items = [];
                for (const selector of selectors) {
                    items = document.querySelectorAll(selector);
                    if (items.length > 0) break;
                }

                items.forEach((element, index) => {
                    try {
                        let container = element;
                        if (element.className.includes('Tweet_body')) {
                            container = element.closest('div') || element.parentElement || element;
                        }

                        // テキスト抽出
                        const textElement = container.querySelector('[class*="Tweet_body"]') ||
                            container.querySelector('[class*="text"]') ||
                            container;
                        const text = (textElement.innerText || textElement.textContent || '').trim();

                        if (!text) return;

                        // リンク情報抽出
                        const allLinks = Array.from(container.querySelectorAll('a'));
                        let tweetId = null;
                        let userId = null;
                        let tweetUrl = null;

                        for (const link of allLinks) {
                            const href = link.href;
                            if ((href.includes('twitter.com') || href.includes('x.com')) && href.includes('/status/')) {
                                tweetUrl = href;
                                const urlParts = href.split('/');
                                const statusIndex = urlParts.findIndex(part => part === 'status');
                                if (statusIndex > 0 && statusIndex < urlParts.length - 1) {
                                    userId = urlParts[statusIndex - 1];
                                    tweetId = urlParts[statusIndex + 1].split('?')[0].split('#')[0];
                                }
                                break;
                            }
                        }

                        // フォールバック
                        if (!tweetId) tweetId = `yahoo_${Date.now()}_${index}`;
                        if (!userId) userId = `unknown_${index}`;

                        // 時間情報
                        const timeElements = container.querySelectorAll('time, [class*="time"], [class*="date"]');
                        let postTime = null;
                        for (const el of timeElements) {
                            const text = el.textContent.trim();
                            if (text && (text.includes('分前') || text.includes('時間前') || text.includes('日前') || text.includes(':'))) {
                                postTime = text;
                                break;
                            }
                        }

                        // 画像情報
                        const images = Array.from(container.querySelectorAll('img'))
                            .map(img => ({
                                src: img.src,
                                alt: img.alt || ''
                            }))
                            .filter(img => img.src && !img.src.includes('data:image'));

                        // ハッシュタグ
                        const hashtags = (text.match(/#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g) || []);

                        results.push({
                            id: tweetId,
                            userId: userId,
                            text: text,
                            url: tweetUrl,
                            postTime: postTime,
                            fetchedAt: new Date().toISOString(),
                            batchId: batchInfo.batchId,
                            batchDate: batchInfo.batchDate,
                            images: images,
                            hashtags: hashtags
                        });
                    } catch (err) {
                        console.error(`Error processing item ${index}:`, err.message);
                    }
                });

                return results;
            }, batchInfo);

            console.log(`   ${tweets.length}件のツイートを取得`);
            allResults = allResults.concat(tweets);

            await page.waitForTimeout(CONFIG.queryDelay);
        } catch (error) {
            console.error(`検索エラー (${query}):`, error.message);
        }
    }

    await browser.close();
    return allResults;
}

// =====================================
// メイン処理
// =====================================
async function main() {
    // バッチ情報を生成
    const batchDate = new Date();
    const batchId = batchDate.toISOString().replace(/[:.]/g, '-').split('.')[0]; // 例: 2026-01-12T05-15-24
    const batchInfo = {
        batchId: batchId,
        batchDate: batchDate.toISOString()
    };

    console.log('🚀 スクレイピング開始');
    console.log(`📋 バッチID: ${batchId}`);
    console.log(`📅 実行日時: ${batchInfo.batchDate}`);

    ensureDataDir();

    // 設定とデータの読み込み
    const queries = loadJSON(CONFIG.queriesFile);
    const ngConfig = loadJSON(CONFIG.ngWordsFile);
    const blacklistSet = loadBlacklist();
    const savedTweets = loadSavedTweets();
    const savedTweetIds = new Set(savedTweets.map(t => t.id));

    console.log(`設定読み込み: ブラックリスト=${blacklistSet.size}件, 既存ツイート=${savedTweets.length}件`);

    // スクレイピング実行
    const rawTweets = await scrapeYahooRealtime(queries, batchInfo);
    console.log(`📥 取得: ${rawTweets.length}件`);

    // フィルタリング
    const newTweets = [];
    const processedTexts = new Set();
    const stats = { discarded: 0, banned: 0 };

    const context = { blacklistSet, savedTweetIds, processedTexts, ngConfig };

    for (const tweet of rawTweets) {
        const filterResult = shouldFilterOut(tweet, context);

        if (filterResult.filtered) {
            stats.discarded++;
            if (filterResult.reason === 'spam') stats.banned++;
            continue;
        }

        newTweets.push(tweet);
        savedTweetIds.add(tweet.id);
    }

    console.log(`📊 結果: 新規=${newTweets.length}件, 除外=${stats.discarded}件, 自動BAN=${stats.banned}件`);

    // 保存
    if (newTweets.length > 0) {
        const updatedTweets = [...newTweets, ...savedTweets];
        const trimmedTweets = updatedTweets.slice(0, CONFIG.maxSavedTweets);

        saveTweets(trimmedTweets);
        console.log(`💾 保存完了: ${trimmedTweets.length}件 (上限${CONFIG.maxSavedTweets}件)`);
    } else {
        console.log('💤 新しいツイートなし');
    }

    console.log('✅ 完了');
}

main().catch(error => {
    console.error('❌ エラー発生:', error);
    process.exit(1);
});
