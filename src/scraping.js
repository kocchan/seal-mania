import { chromium } from 'playwright';
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dbClient } from "./utils.js";
import { CONFIG } from "./config.js";

// ==========================================
// 🛠️ ユーティリティ関数
// ==========================================

async function loadBlacklist() {
    try {
        const result = await dbClient.send(new ScanCommand({
            TableName: "Blacklist",
            ProjectionExpression: "user_id"
        }));
        const set = new Set(result.Items.map(item => item.user_id));
        console.log(`📋 ブラックリスト読み込み: ${set.size}件`);
        return set;
    } catch (e) {
        console.error("⚠️ ブラックリスト取得失敗:", e.message);
        return new Set();
    }
}

/**
 * 🕒 正確な日本時間(JST)のISO文字列を生成する関数
 * 環境(PC/Cloud)のタイムゾーンに依存しないよう、UTCタイムスタンプから計算します。
 */
function getJSTISOString(dateObj) {
    // 渡されたDateオブジェクト(UTC相当)から、JSTの日時成分を取り出す
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    const h = String(dateObj.getUTCHours()).padStart(2, '0');
    const min = String(dateObj.getUTCMinutes()).padStart(2, '0');
    const s = String(dateObj.getUTCSeconds()).padStart(2, '0');
    const ms = String(dateObj.getUTCMilliseconds()).padStart(3, '0');

    return `${y}-${m}-${d}T${h}:${min}:${s}.${ms}+09:00`;
}

/**
 * 🕒 日本語の日時表記を解析してJST文字列を返す
 */
function parsePostTime(timeStr) {
    // 1. 現在時刻(UTC)を取得し、強制的に9時間足す
    // これにより、Dateオブジェクトの中身(UTCメソッドの結果)が「日本時間」になる
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);

    if (!timeStr) return getJSTISOString(nowJST);

    try {
        // パターン1: "XX分前"
        const minMatch = timeStr.match(/(\d+)分前/);
        if (minMatch) {
            const mins = parseInt(minMatch[1], 10);
            nowJST.setUTCMinutes(nowJST.getUTCMinutes() - mins);
            return getJSTISOString(nowJST);
        }

        // パターン2: "XX時間前"
        const hourMatch = timeStr.match(/(\d+)時間前/);
        if (hourMatch) {
            const hours = parseInt(hourMatch[1], 10);
            nowJST.setUTCHours(nowJST.getUTCHours() - hours);
            return getJSTISOString(nowJST);
        }

        // パターン3: "XX秒前"
        const secMatch = timeStr.match(/(\d+)秒前/);
        if (secMatch) {
            const secs = parseInt(secMatch[1], 10);
            nowJST.setUTCSeconds(nowJST.getUTCSeconds() - secs);
            return getJSTISOString(nowJST);
        }

        // パターン4: "HH:mm" (例: 17:22)
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1], 10);
            const mins = parseInt(timeMatch[2], 10);

            // JSTとして時間をセット
            const targetDate = new Date(nowJST.getTime());
            targetDate.setUTCHours(hours, mins, 0, 0);

            // 未来の時間になってしまったら「昨日」と判定
            if (targetDate.getTime() > nowJST.getTime()) {
                targetDate.setUTCDate(targetDate.getUTCDate() - 1);
            }
            return getJSTISOString(targetDate);
        }

        // パターン5: "M月D日" (例: 2月3日)
        const dateMatch = timeStr.match(/(\d+)月(\d+)日/);
        if (dateMatch) {
            const month = parseInt(dateMatch[1], 10) - 1;
            const day = parseInt(dateMatch[2], 10);

            const targetDate = new Date(nowJST.getTime());
            targetDate.setUTCMonth(month, day);

            // 未来の日付なら去年のことと判定
            if (targetDate.getTime() > nowJST.getTime()) {
                targetDate.setUTCFullYear(targetDate.getUTCFullYear() - 1);
            }
            return getJSTISOString(targetDate);
        }

    } catch (e) {
        console.warn(`⚠️ 時間変換エラー: ${timeStr}`);
    }

    return getJSTISOString(nowJST);
}

/**
 * 🚫 ユーザーを自動BANする関数
 */
async function autoBanUser(userId, reason) {
    try {
        console.log(`🚫 AutoBAN: ${userId} (理由: ${reason})`);
        const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);

        await dbClient.send(new PutCommand({
            TableName: "Blacklist",
            Item: {
                user_id: userId,
                reason: reason,
                created_at: getJSTISOString(nowJST)
            }
        }));
        return true;
    } catch (e) {
        console.error(`❌ BAN失敗 (${userId}):`, e.message);
        return false;
    }
}

async function saveTweet(tweet, calculatedTime) {
    try {
        const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);

        await dbClient.send(new PutCommand({
            TableName: "RawTweets",
            Item: {
                tweet_id: tweet.id,
                text: tweet.text,
                user_id: tweet.userId,
                url: tweet.url,
                post_time: calculatedTime,  // 計算済みの正確なJST
                post_time_str: tweet.postTime || "",
                images: tweet.images || [],
                hashtags: tweet.hashtags || [],
                fetched_at: getJSTISOString(nowJST), // 実行時刻もJST
                is_processed: false,
                expire_at: Math.floor(Date.now() / 1000) + CONFIG.ttl
            },
            ConditionExpression: "attribute_not_exists(tweet_id)"
        }));
        return true;
    } catch (e) {
        if (e.name === 'ConditionalCheckFailedException') {
            return false;
        }
        console.error(`❌ 保存エラー (${tweet.id}):`, e.message);
        return false;
    }
}

// ==========================================
// 🤖 メイン処理
// ==========================================
async function scrapeYahooRealtime() {
    console.log('🚀 スクレイピング開始 (完全JST対応版)');

    const blacklist = await loadBlacklist();
    const officialSet = new Set(CONFIG.officialAccounts);

    const browser = await chromium.launch({ headless: CONFIG.scraping.headless });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let totalSaved = 0;
    let totalBanned = 0;

    for (const query of CONFIG.queries) {
        try {
            console.log(`\n🔍 検索中: "${query}"`);
            const url = `https://search.yahoo.co.jp/realtime/search?p=${encodeURIComponent(query)}&ei=UTF-8`;

            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);

            const tweets = await page.evaluate(() => {
                const items = document.querySelectorAll('div[class*="Tweet_body"], div[class*="tweet"], article');
                const results = [];

                items.forEach(element => {
                    let container = element;
                    if (element.className.includes('Tweet_body')) {
                        container = element.closest('div') || element.parentElement || element;
                    }

                    const textElement = container.querySelector('[class*="Tweet_body"]') ||
                        container.querySelector('[class*="text"]') ||
                        container;
                    const text = (textElement.innerText || textElement.textContent || '').trim();

                    if (!text) return;

                    const links = Array.from(container.querySelectorAll('a'));
                    let id = "", userId = "", url = "";

                    for (const link of links) {
                        if (link.href.includes('/status/')) {
                            url = link.href;
                            const parts = link.href.split('/');
                            id = parts[parts.length - 1].split('?')[0];
                            userId = parts[parts.length - 3];
                            break;
                        }
                    }

                    const timeElements = container.querySelectorAll('time, [class*="time"], [class*="date"], span, a');
                    let postTime = "";
                    for (const el of timeElements) {
                        const t = (el.innerText || el.textContent || "").trim();
                        if (t.match(/(\d+[分時日秒]前|\d{1,2}:\d{2}|[昨今]日)/)) {
                            postTime = t;
                            break;
                        }
                    }

                    const images = Array.from(container.querySelectorAll('img'))
                        .map(img => img.src)
                        .filter(src => src && !src.includes('data:image') && !src.includes('icon'));

                    const hashtags = (text.match(/#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g) || []);

                    if (text && id) {
                        results.push({ id, userId, text, url, images, hashtags, postTime });
                    }
                });
                return results;
            });

            console.log(`   📝 取得件数: ${tweets.length}件`);

            let savedCount = 0;

            for (const tweet of tweets) {
                if (officialSet.has(tweet.userId)) continue;
                if (blacklist.has(tweet.userId)) continue;

                const hitNgWord = CONFIG.ngWords.find(word => tweet.text.includes(word));
                if (hitNgWord) {
                    await autoBanUser(tweet.userId, `NGワード: ${hitNgWord}`);
                    blacklist.add(tweet.userId);
                    totalBanned++;
                    continue;
                }
                const hitNgUrl = CONFIG.ngUrls.find(ngUrl => tweet.text.includes(ngUrl));
                if (hitNgUrl) {
                    await autoBanUser(tweet.userId, `NG URL: ${hitNgUrl}`);
                    blacklist.add(tweet.userId);
                    totalBanned++;
                    continue;
                }

                // ▼ ここで計算
                const calculatedTime = parsePostTime(tweet.postTime);

                const isNew = await saveTweet(tweet, calculatedTime);
                if (isNew) {
                    process.stdout.write(".");
                    savedCount++;
                }
            }
            console.log(`\n   💾 新規保存: ${savedCount}件`);
            totalSaved += savedCount;

            await page.waitForTimeout(CONFIG.scraping.queryDelay);

        } catch (error) {
            console.error(`❌ エラー (${query}):`, error.message);
        }
    }

    await browser.close();
    console.log(`\n✅ 全処理完了: 保存 ${totalSaved} 件 / 新規BAN ${totalBanned} 件`);
}

scrapeYahooRealtime();