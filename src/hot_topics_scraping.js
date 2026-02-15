import { chromium } from 'playwright';
import { PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dbClient, getNowJST, getJSTISOString } from "./utils.js";
import { CONFIG } from "./config.js";

// 📍 保存先の新しいDynamoDBテーブル名
const TARGET_TABLE_NAME = "TrendKeywords_RawTweets";

// ==========================================
// ユーティリティ・DB操作関連
// ==========================================

// タイムゾーン・日時 設定
function parsePostTime(timeStr) {
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    if (!timeStr) return getJSTISOString(nowJST);

    try {
        const minMatch = timeStr.match(/(\d+)分前/);
        if (minMatch) nowJST.setUTCMinutes(nowJST.getUTCMinutes() - parseInt(minMatch[1], 10));

        const hourMatch = timeStr.match(/(\d+)時間前/);
        if (hourMatch) nowJST.setUTCHours(nowJST.getUTCHours() - parseInt(hourMatch[1], 10));

        const dateMatch = timeStr.match(/(\d+)月(\d+)日/);
        if (dateMatch) {
            nowJST.setUTCMonth(parseInt(dateMatch[1], 10) - 1, parseInt(dateMatch[2], 10));
            const realNowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
            if (nowJST > realNowJST) nowJST.setUTCFullYear(nowJST.getUTCFullYear() - 1);
        }
    } catch (e) {
        console.warn(`⚠️ 時間変換エラー: ${timeStr}`);
    }
    return getJSTISOString(nowJST);
}

// ブラックリスト読み込み
async function loadBlacklist() {
    try {
        const result = await dbClient.send(new ScanCommand({
            TableName: "Blacklist",
            ProjectionExpression: "user_id"
        }));
        return new Set(result.Items.map(item => item.user_id));
    } catch (e) {
        console.error("⚠️ ブラックリスト取得失敗:", e.message);
        return new Set();
    }
}

// フィルタリング関数 & 自動BAN
async function autoBanUser(userId, reason) {
    console.log(`🚫 AutoBAN: ${userId} (理由: ${reason})`);
    try {
        await dbClient.send(new PutCommand({
            TableName: "Blacklist",
            Item: {
                user_id: userId,
                reason: reason,
                created_at: getNowJST()
            }
        }));
    } catch (e) {
        console.error(`❌ BAN失敗:`, e.message);
    }
}

function shouldFilterOut(tweet, blacklist, officialSet) {
    if (officialSet.has(tweet.userId) || blacklist.has(tweet.userId)) return 'exclude';

    const ngWord = CONFIG.ngWords.find(word => tweet.text.includes(word));
    if (ngWord) return { action: 'ban', reason: `NGワード: ${ngWord}` };

    const ngUrl = CONFIG.ngUrls.find(url => tweet.text.includes(url));
    if (ngUrl) return { action: 'ban', reason: `NG URL: ${ngUrl}` };

    return 'pass';
}

// 📍 指定されたスキーマでDBに保存する関数
async function saveTweet(tweet, queryUsed, targetWord) {
    const calculatedTime = parsePostTime(tweet.postTime);
    try {
        await dbClient.send(new PutCommand({
            TableName: TARGET_TABLE_NAME,
            Item: {
                tweet_id: tweet.id,
                fetched_at: getNowJST(),
                images: tweet.images,
                is_processed: false,         // 初期値false
                search_query: queryUsed,     // 検索クエリ
                word: targetWord,            // 処理したトレンドワード
                post_time: calculatedTime,
                post_time_str: tweet.postTime,
                text: tweet.text,
                url: tweet.url,
                user_id: tweet.userId
            },
            // 📍 重複排除: 既に同じtweet_idが存在する場合は保存しない
            ConditionExpression: "attribute_not_exists(tweet_id)"
        }));
        return true;
    } catch (e) {
        if (e.name !== 'ConditionalCheckFailedException') {
            console.error(`❌ 保存エラー:`, e.message);
        }
        return false;
    }
}

// ==========================================
// トレンドキーワード取得とフラグ更新
// ==========================================

async function getTrendKeywords() {
    try {
        console.log(`📚 DynamoDB (${CONFIG.aws.dynamoTableTrend}) から未処理のトレンドキーワードを取得中...`);
        const result = await dbClient.send(new ScanCommand({
            TableName: CONFIG.aws.dynamoTableTrend,
            // 📍 is_processed が false のものだけを取得
            FilterExpression: "is_processed = :falseVal",
            ExpressionAttributeValues: { ":falseVal": false }
        }));

        const words = result.Items.map(item => ({ id: item.id, word: item.word }));
        console.log(`✅ ${words.length} 件の未処理トレンドキーワードを取得しました。`);
        return words;
    } catch (e) {
        console.error("⚠️ トレンドキーワード取得失敗:", e.message);
        return [];
    }
}

async function markTrendKeywordAsProcessed(keywordId) {
    try {
        await dbClient.send(new UpdateCommand({
            TableName: CONFIG.aws.dynamoTableTrend,
            Key: { id: keywordId },
            UpdateExpression: "set is_processed = :trueVal, processed_at = :now",
            ExpressionAttributeValues: {
                ":trueVal": true,
                ":now": getNowJST()
            }
        }));
        console.log(`      💾 トレンドワードを処理済み(true)に更新しました (ID: ${keywordId})`);
    } catch (e) {
        console.error(`      ⚠️ トレンドワード更新失敗:`, e.message);
    }
}

// ==========================================
// スクレイピング実行関数
// ==========================================
async function fetchTweetsFromYahoo(page, query) {
    const url = `https://search.yahoo.co.jp/realtime/search?p=${encodeURIComponent(query)}&ei=UTF-8`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    return await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('article, div[class*="Tweet_body"]').forEach(el => {
            const container = el.closest('div[class*="Tweet_"]') || el;
            const text = (container.querySelector('[class*="Tweet_body"]')?.innerText || "").trim();
            const tweetLink = Array.from(container.querySelectorAll('a')).find(a => a.href.includes('/status/'));

            if (text && tweetLink) {
                const parts = tweetLink.href.split('/');
                results.push({
                    id: parts.pop().split('?')[0],
                    userId: parts[parts.length - 2],
                    text: text,
                    url: tweetLink.href,
                    images: Array.from(container.querySelectorAll('img')).map(i => i.src).filter(s => s && !s.includes('icon')),
                    postTime: container.querySelector('time, [class*="time"]')?.innerText || ""
                });
            }
        });
        return results;
    });
}

// ==========================================
// メイン処理
// ==========================================
async function main() {
    console.log('🚀 トレンド掛け合わせスクレイピング処理開始');

    const trendWords = await getTrendKeywords();
    if (trendWords.length === 0) {
        console.log('💤 処理すべきトレンドキーワードがありません。終了します。');
        return;
    }

    const blacklist = await loadBlacklist();
    const officialSet = new Set(CONFIG.officialAccounts);

    const browser = await chromium.launch({ headless: CONFIG.scraping.headless });
    const page = await (await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' })).newPage();

    let metrics = { saved: 0, banned: 0 };

    // 📍 変更: 単語ごとにループを回す
    for (const tw of trendWords) {
        console.log(`\n============================================`);
        console.log(`▶️ トレンドワード [ ${tw.word} ] の処理を開始します`);
        console.log(`============================================`);

        // 単語に対して、CONFIG.trend_queries のクエリを1つずつ実行
        for (const baseQuery of CONFIG.trend_queries) {
            // 例: '"ボンボンドロップ" -PR...' -> '"しずくちゃん ボンボンドロップ" -PR...'
            const query = baseQuery.replace(/^"([^"]+)"/, `"${tw.word} $1"`);

            console.log(`\n🔎 検索実行: ${query}`);
            const tweets = await fetchTweetsFromYahoo(page, query);
            console.log(`   └ 取得件数: ${tweets.length} 件`);

            for (const tweet of tweets) {
                const filterResult = shouldFilterOut(tweet, blacklist, officialSet);

                if (filterResult === 'exclude') continue;

                if (filterResult.action === 'ban') {
                    await autoBanUser(tweet.userId, filterResult.reason);
                    blacklist.add(tweet.userId);
                    metrics.banned++;
                    continue;
                }

                // 📍 ツイート保存 (重複は自動でスキップされる)
                if (await saveTweet(tweet, query, tw.word)) {
                    metrics.saved++;
                    process.stdout.write("⭐"); // 保存成功
                } else {
                    process.stdout.write("."); // 重複スキップ
                }
            }
            console.log(""); // 改行

            // クエリ間の待機
            await page.waitForTimeout(CONFIG.scraping.queryDelay);
        }

        // 📍 1つの単語に対するすべてのクエリ(3つ)が終わったら、フラグを true に更新
        await markTrendKeywordAsProcessed(tw.id);
    }

    await browser.close();

    console.log(`\n✅ 全トレンドキーワードの処理が完了しました`);
    console.log(`📊 結果: 新規保存 ${metrics.saved}件 / BAN ${metrics.banned}件`);
}

main();