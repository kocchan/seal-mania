import { chromium } from 'playwright';
import fs from 'fs';

export async function scrapeYahooRealtime(queries) {
    const browser = await chromium.launch({
        headless: true // 本番用に戻す
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // ブラウザのコンソールログをキャッチ
    page.on('console', msg => {
        console.log(`[Browser] ${msg.type()}: ${msg.text()}`);
    });

    let allResults = [];

    for (const query of queries) {
        try {
            console.log(`🔍 Searching: ${query}...`);
            // URL構築
            const url = `https://search.yahoo.co.jp/realtime/search?p=${encodeURIComponent(query)}&ei=UTF-8`;

            await page.goto(url, { waitUntil: 'domcontentloaded' });

            // デバッグ用スクリーンショット
            await page.screenshot({ path: `debug_${query.replace(/\s+/g, '_')}.png`, fullPage: true });

            // ページのタイトルを確認
            console.log(`   Page title: ${await page.title()}`);

            // 汎用的なセレクタで検索結果エリアを待機
            try {
                await page.waitForTimeout(3000); // 3秒待機してページが完全にロード

                // 複数のセレクタを試す
                const possibleSelectors = [
                    'div[class*="Tweet_body"]',
                    'div[class*="tweet"]',
                    'div[class*="Tweet"]',
                    'article',
                    'div[data-testid]',
                    '.cnt'
                ];

                let foundSelector = null;
                for (const selector of possibleSelectors) {
                    const elements = await page.$$(selector);
                    if (elements.length > 0) {
                        foundSelector = selector;
                        console.log(`   Found ${elements.length} elements with selector: ${selector}`);
                        break;
                    }
                }

                if (!foundSelector) {
                    console.log(`   No matching selectors found for "${query}"`);
                    // HTMLの一部を表示してデバッグ
                    const bodyText = await page.$eval('body', el => el.innerText.slice(0, 500));
                    console.log(`   Body text preview: ${bodyText}...`);
                    continue;
                }

            } catch (e) {
                console.log(`   Error waiting for selectors: ${e.message}`);
                continue;
            }

            // データ抽出処理（改善版）
            const tweets = await page.evaluate(() => {
                const results = [];

                // より汎用的なセレクタで試す
                const selectors = [
                    'div[class*="Tweet_body"]',
                    'div[class*="tweet"]',
                    'div[class*="Tweet"]',
                    'article',
                    '.cnt'
                ];

                let items = [];
                for (const selector of selectors) {
                    items = document.querySelectorAll(selector);
                    if (items.length > 0) {
                        console.log(`Using selector: ${selector}, found ${items.length} items`);
                        break;
                    }
                }

                // 最初の3要素のみ詳細デバッグ
                const debugCount = Math.min(3, items.length);
                console.log(`=== Debugging first ${debugCount} elements ===`);

                items.forEach((element, index) => {
                    // 詳細デバッグは最初の3要素のみ
                    const isDebug = index < 3;
                    try {
                        // デバッグ: 要素の構造を詳しく調べる
                        if (isDebug) {
                            console.log(`=== Element ${index} Debug Info ===`);
                            console.log(`Tag: ${element.tagName}`);
                            console.log(`Classes: ${element.className}`);
                            console.log(`Attributes:`, Array.from(element.attributes).map(attr => `${attr.name}="${attr.value}"`).join(', '));
                            console.log(`InnerHTML (first 200 chars): ${element.innerHTML.slice(0, 200)}...`);
                        }

                        // より柔軟なコンテナ取得
                        let container = element;
                        if (element.className.includes('Tweet_body')) {
                            container = element.closest('div') || element.parentElement || element;
                        }

                        // テキスト取得 - より広範囲から
                        let text = '';
                        const textElement = container.querySelector('[class*="Tweet_body"]') ||
                            container.querySelector('[class*="text"]') ||
                            container;
                        if (textElement) {
                            text = textElement.innerText || textElement.textContent || '';
                        }

                        // リンクから情報抽出
                        const allLinks = Array.from(container.querySelectorAll('a'));
                        if (isDebug) {
                            console.log(`Links found: ${allLinks.length}`);
                            allLinks.forEach((link, i) => {
                                console.log(`  Link ${i}: href="${link.href}" text="${link.textContent.trim()}"`);
                            });
                        }

                        let tweetId = null;
                        let userId = null;
                        let tweetUrl = null;

                        for (const link of allLinks) {
                            const href = link.href;
                            if (href.includes('twitter.com') || href.includes('x.com')) {
                                if (href.includes('/status/')) {
                                    tweetUrl = href;
                                    const urlParts = href.split('/');
                                    const statusIndex = urlParts.findIndex(part => part === 'status');
                                    if (statusIndex > 0 && statusIndex < urlParts.length - 1) {
                                        userId = urlParts[statusIndex - 1];
                                        tweetId = urlParts[statusIndex + 1].split('?')[0].split('#')[0];
                                    }
                                }
                            }
                        }

                        // フォールバック: IDを生成
                        if (!tweetId) {
                            tweetId = `yahoo_${Date.now()}_${index}`;
                        }
                        if (!userId) {
                            // ユーザー名っぽいテキストを探す
                            const userElement = container.querySelector('[class*="user"]') ||
                                container.querySelector('[class*="name"]');
                            if (userElement) {
                                userId = userElement.textContent.replace('@', '').trim() || `user_${index}`;
                            } else {
                                userId = `user_${index}`;
                            }
                        }

                        // URLを抽出
                        const contentUrls = allLinks.map(a => a.href).filter(url =>
                            !url.includes('twitter.com') && !url.includes('x.com') && url.startsWith('http')
                        );

                        // 詳細な情報を取得
                        const detailedData = {};

                        // 1. 時間情報の取得（より詳細）
                        const timeElements = container.querySelectorAll('time, [class*="time"], [class*="date"], a[href*="status"]');
                        let postTime = null;
                        let absoluteTime = null;

                        timeElements.forEach(el => {
                            const text = el.textContent.trim();
                            const datetime = el.getAttribute('datetime');

                            if (datetime) {
                                absoluteTime = datetime;
                            }
                            if (text && (text.includes('分前') || text.includes('時間前') || text.includes('日前') || text.includes(':'))) {
                                postTime = text;
                            }
                        });

                        detailedData.postTime = postTime;
                        detailedData.absoluteTime = absoluteTime;

                        // 2. エンゲージメント数の詳細取得
                        const engagement = {
                            replies: 0,
                            retweets: 0,
                            likes: 0
                        };

                        // リプライ、RT、いいねのリンクから数値を取得
                        allLinks.forEach(link => {
                            const text = link.textContent.trim();
                            const href = link.href;

                            // 数値を含むテキストのみ処理
                            if (text.match(/[\d,]/)) {
                                const number = text.replace(/,/g, '');
                                if (href.includes('intent/tweet?in_reply_to=')) {
                                    engagement.replies = parseInt(number) || 0;
                                } else if (href.includes('intent/retweet')) {
                                    engagement.retweets = parseInt(number) || 0;
                                } else if (href.includes('intent/like')) {
                                    engagement.likes = parseInt(number) || 0;
                                }
                            }
                        });

                        detailedData.engagement = engagement;

                        // 3. 画像情報の詳細取得
                        const images = Array.from(container.querySelectorAll('img')).map(img => ({
                            src: img.src,
                            alt: img.alt || '',
                            width: img.width || null,
                            height: img.height || null,
                            className: img.className || ''
                        })).filter(img => img.src && !img.src.includes('data:image'));

                        detailedData.images = images;

                        // 4. ハッシュタグとメンションの抽出
                        const hashtags = [];
                        const mentions = [];
                        const hashtagMatches = text.match(/#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g);
                        const mentionMatches = text.match(/@[\w]+/g);

                        if (hashtagMatches) hashtags.push(...hashtagMatches);
                        if (mentionMatches) mentions.push(...mentionMatches);

                        detailedData.hashtags = hashtags;
                        detailedData.mentions = mentions;

                        // 5. 外部リンクの詳細
                        const externalLinks = contentUrls.map(url => ({
                            url: url,
                            domain: url.split('/')[2] || '',
                            isShortened: url.includes('t.co') || url.includes('bit.ly') || url.includes('tinyurl')
                        }));

                        detailedData.externalLinks = externalLinks;

                        // 6. ツイートの種類を判定
                        let tweetType = 'original';
                        if (text.includes('返信先:')) {
                            tweetType = 'reply';
                        } else if (container.querySelector('[class*="retweet"]') || text.startsWith('RT @')) {
                            tweetType = 'retweet';
                        }

                        detailedData.tweetType = tweetType;

                        // 7. その他のメタデータ
                        detailedData.hasMedia = images.length > 0 || externalLinks.length > 0;
                        detailedData.textLength = text.length;
                        detailedData.extractedClasses = Array.from(container.querySelectorAll('*')).map(el => el.className).filter(Boolean);

                        if (isDebug) {
                            console.log(`Detailed data found:`, detailedData);
                        }

                        if (text && text.trim().length > 0) {
                            console.log(`Extracted tweet ${index}: ${text.slice(0, 50)}...`);
                            results.push({
                                // 基本情報
                                id: tweetId,
                                userId: userId,
                                text: text.trim(),
                                url: tweetUrl,

                                // 時間情報
                                postTime: detailedData.postTime,
                                // absoluteTime: detailedData.absoluteTime,
                                // timestamp: new Date().toISOString(),
                                fetchedAt: new Date().toISOString(),

                                // エンゲージメント数
                                // engagement: detailedData.engagement,

                                // 画像情報
                                images: detailedData.images,

                                // リンク情報
                                // urls: contentUrls, // 後方互換性のため
                                // externalLinks: detailedData.externalLinks,

                                // ソーシャル要素
                                hashtags: detailedData.hashtags,
                                // mentions: detailedData.mentions,

                                // メタデータ
                                // tweetType: detailedData.tweetType,
                                // hasMedia: detailedData.hasMedia,
                                // textLength: detailedData.textLength,
                                // extractedClasses: detailedData.extractedClasses
                            });
                        }
                    } catch (err) {
                        console.log(`Error processing item ${index}:`, err.message);
                    }
                });

                console.log(`Total results extracted: ${results.length}`);
                return results;
            });

            console.log(`   Found ${tweets.length} tweets.`);
            allResults = allResults.concat(tweets);

            // 1秒待機 (マナー)
            await page.waitForTimeout(1000);

        } catch (error) {
            console.error(`Error searching ${query}:`, error);
        }
    }

    await browser.close();
    return allResults;
}