import { chromium } from 'playwright';
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dbClient } from "./utils.js";
import { CONFIG } from "./config.js";


// タイムゾーン・日時 設定
const getJSTNow = () => new Date(Date.now() + 9 * 60 * 60 * 1000);

function getJSTISOString(dateObj) {
    const s = (n) => String(n).padStart(2, '0');
    return `${dateObj.getUTCFullYear()}-${s(dateObj.getUTCMonth() + 1)}-${s(dateObj.getUTCDate())}T${s(dateObj.getUTCHours())}:${s(dateObj.getUTCMinutes())}:${s(dateObj.getUTCSeconds())}.${String(dateObj.getUTCMilliseconds()).padStart(3, '0')}+09:00`;
}

function parsePostTime(timeStr) {
    const nowJST = getJSTNow();
    if (!timeStr) return getJSTISOString(nowJST);

    try {
        const minMatch = timeStr.match(/(\d+)分前/);
        if (minMatch) nowJST.setUTCMinutes(nowJST.getUTCMinutes() - parseInt(minMatch[1]));

        const hourMatch = timeStr.match(/(\d+)時間前/);
        if (hourMatch) nowJST.setUTCHours(nowJST.getUTCHours() - parseInt(hourMatch[1]));

        const dateMatch = timeStr.match(/(\d+)月(\d+)日/);
        if (dateMatch) {
            nowJST.setUTCMonth(parseInt(dateMatch[1]) - 1, parseInt(dateMatch[2]));
            if (nowJST > getJSTNow()) nowJST.setUTCFullYear(nowJST.getUTCFullYear() - 1);
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
                created_at: getJSTISOString(getJSTNow())
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

// DB保存関数
async function saveTweet(tweet) {
    const calculatedTime = parsePostTime(tweet.postTime);
    try {
        await dbClient.send(new PutCommand({
            TableName: "RawTweets",
            Item: {
                tweet_id: tweet.id,
                text: tweet.text,
                user_id: tweet.userId,
                url: tweet.url,
                post_time: calculatedTime,
                post_time_str: tweet.postTime,
                images: tweet.images,
                hashtags: tweet.hashtags,
                fetched_at: getJSTISOString(getJSTNow()),
                is_processed: false,
                expire_at: Math.floor(Date.now() / 1000) + CONFIG.ttl
            },
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

// スクレイピング実行関数
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
    console.log('🚀 処理開始');
    const blacklist = await loadBlacklist();
    const officialSet = new Set(CONFIG.officialAccounts);

    const browser = await chromium.launch({ headless: CONFIG.scraping.headless });
    const page = await (await browser.newContext({ userAgent: 'Mozilla/5.0...' })).newPage();

    let metrics = { saved: 0, banned: 0 };

    for (const query of CONFIG.queries) {
        console.log(`🔍 検索: ${query}`);
        const tweets = await fetchTweetsFromYahoo(page, query);

        for (const tweet of tweets) {
            const filterResult = shouldFilterOut(tweet, blacklist, officialSet);

            if (filterResult === 'exclude') continue;

            if (filterResult.action === 'ban') {
                await autoBanUser(tweet.userId, filterResult.reason);
                blacklist.add(tweet.userId);
                metrics.banned++;
                continue;
            }

            if (await saveTweet(tweet)) {
                metrics.saved++;
                process.stdout.write(".");
            }
        }
        await page.waitForTimeout(CONFIG.scraping.queryDelay);
    }

    await browser.close();
    console.log(`\n✅ 完了: 保存 ${metrics.saved}件 / BAN ${metrics.banned}件`);
}

main();