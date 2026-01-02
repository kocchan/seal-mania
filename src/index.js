import { loadConfig, loadBlacklist, loadSavedTweets, saveTweets } from './fileManager.js';
import { scrapeYahooRealtime } from './scraper.js';
import { isBlacklisted, isDuplicate, checkNGAndBan } from './filters.js';

async function main() {
    console.log('🚀 Job Started');

    // 1. ファイル・設定のロード
    const queries = loadConfig('./config/queries.json');
    const ngConfig = loadConfig('./config/ng_words.json');
    const officialAccounts = loadConfig('./config/official_accounts.json');
    const blacklistSet = loadBlacklist(); // Set<string>

    // 既存データをロードし、IDのSetを作成 (重複チェック用)
    const savedTweets = loadSavedTweets();
    const savedTweetIds = new Set(savedTweets.map(t => t.id));

    console.log(`Loaded: BL size=${blacklistSet.size}, SavedTweets=${savedTweets.length}`);

    // 2. スクレイピング実行
    const rawTweets = await scrapeYahooRealtime(queries);

    // 3. フィルタリングループ
    const newTweets = [];
    const processedTexts = new Set(); // テキスト重複チェック用
    let discardedCount = 0;
    let banCount = 0;

    for (const tweet of rawTweets) {
        // Step 0: 公式アカウントのみフィルター
        if (!officialAccounts.includes(tweet.userId)) {
            discardedCount++;
            continue;
        }

        // Step 1: ブラックリストチェック
        if (isBlacklisted(tweet.userId, blacklistSet)) {
            discardedCount++;
            continue;
        }

        // Step 2: ID重複チェック
        if (isDuplicate(tweet.id, savedTweetIds)) {
            discardedCount++;
            continue;
        }

        // Step 2.5: テキスト重複チェック (同じ内容の投稿を除外)
        const textHash = tweet.text.slice(0, 100); // 先頭100文字で判定
        if (processedTexts.has(textHash)) {
            discardedCount++;
            continue;
        }
        processedTexts.add(textHash);

        // Step 4: URL存在チェック (一時的に無効化してデータ確認)
        if (tweet.url === null || (Array.isArray(tweet.urls) && tweet.urls.length === 0)) {
            discardedCount++;
            continue;
        }

        // Step 3: NGワード/スパムチェック & 自動BAN
        if (checkNGAndBan(tweet, ngConfig, blacklistSet)) {
            banCount++; // この中でblacklistへの追記は行われている
            discardedCount++;
            continue;
        }


        // Keep: 合格
        newTweets.push(tweet);
        savedTweetIds.add(tweet.id); // 同じ実行回での重複を防ぐためSetに追加
    }

    console.log(`📊 Result: Scraped=${rawTweets.length}, New=${newTweets.length}, Discarded=${discardedCount}, AutoBan=${banCount}`);

    // 4. 保存 (新しいものを上に追加)
    if (newTweets.length > 0) {
        const updatedTweets = [...newTweets, ...savedTweets];

        // 保存数制限 (例: 最新2000件のみ保持)
        const MAX_SAVE = 2000;
        const trimmedTweets = updatedTweets.slice(0, MAX_SAVE);

        saveTweets(trimmedTweets);
        console.log(`💾 Saved ${trimmedTweets.length} tweets to data/tweets.json`);
    } else {
        console.log('💤 No new tweets to save.');
    }
}

main().catch(console.error);