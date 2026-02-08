//ここはsrc/other_article/create_article.js


//geminiaiを取得
// const genAI = new GoogleGenerativeAI(API_KEY);
// const model = genAI.getGenerativeModel({
//     model: "gemini-3-flash-preview",
//     generationConfig: {
//         responseMimeType: "application/json", // JSON出力を強制
//     }
// });

// data/related_data/output/related_word_2026_02_08_20.jsonの情報を取得する（related_word_...から始まっているものを取得する）
//ちなみにファイルの中身はこんな感じ
// [
//   {
//     "created_data": "2026/02/08 20:28",
//     "word": "しずくちゃん 抽選",
//     "fetch_data": "2026/02/08 20:28"
//   },
//   {
//     "created_data": "2026/02/08 20:28",
//     "word": "サンリオ",
//     "fetch_data": "2026/02/08 20:28"
//   },
//   {
//     "created_data": "2026/02/08 20:28",
//     "word": "たまごっち",
//     "fetch_data": "2026/02/08 20:28"
//   },
//   {
//     ...

//もし、過去一週間以内のファイル（data/related_data/output/done_related_word_2026_02_08_20...）があれば、その中身も取得する（related_word_...から始まっているものを取得する）（一週間いないかの判断は、2026_02_08_20が日程になっているので、そこで判断する）

//related_word_2026_02_08_20.jsonの中身から、過去一週間以内のファイル上に存在するのに近いワードは削除する（ここはgemini-aiを使う。）

//そのフィルターをかけた単語と「ボンボンドロップシール」という単語を一スペース開けて結合させて（例：「しずくちゃん 抽選」であれば、「ボンボンドロップシール しずくちゃん 抽選」）になる

//その結合させた単語たちで、スクレイピングする。
// これと同様の方法でスクレイピングしまし
// import { chromium } from 'playwright';
// import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
// import { dbClient } from "./utils.js";
// import { CONFIG } from "./config.js";

// // ==========================================
// // 🛠️ ユーティリティ関数
// // ==========================================

// async function loadBlacklist() {
//     try {
//         const result = await dbClient.send(new ScanCommand({
//             TableName: "Blacklist",
//             ProjectionExpression: "user_id"
//         }));
//         const set = new Set(result.Items.map(item => item.user_id));
//         console.log(`📋 ブラックリスト読み込み: ${set.size}件`);
//         return set;
//     } catch (e) {
//         console.error("⚠️ ブラックリスト取得失敗:", e.message);
//         return new Set();
//     }
// }

// /**
//  * 🕒 正確な日本時間(JST)のISO文字列を生成する関数
//  * 環境(PC/Cloud)のタイムゾーンに依存しないよう、UTCタイムスタンプから計算します。
//  */
// function getJSTISOString(dateObj) {
//     // 渡されたDateオブジェクト(UTC相当)から、JSTの日時成分を取り出す
//     const y = dateObj.getUTCFullYear();
//     const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
//     const d = String(dateObj.getUTCDate()).padStart(2, '0');
//     const h = String(dateObj.getUTCHours()).padStart(2, '0');
//     const min = String(dateObj.getUTCMinutes()).padStart(2, '0');
//     const s = String(dateObj.getUTCSeconds()).padStart(2, '0');
//     const ms = String(dateObj.getUTCMilliseconds()).padStart(3, '0');

//     return `${y}-${m}-${d}T${h}:${min}:${s}.${ms}+09:00`;
// }

// /**
//  * 🕒 日本語の日時表記を解析してJST文字列を返す
//  */
// function parsePostTime(timeStr) {
//     // 1. 現在時刻(UTC)を取得し、強制的に9時間足す
//     // これにより、Dateオブジェクトの中身(UTCメソッドの結果)が「日本時間」になる
//     const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);

//     if (!timeStr) return getJSTISOString(nowJST);

//     try {
//         // パターン1: "XX分前"
//         const minMatch = timeStr.match(/(\d+)分前/);
//         if (minMatch) {
//             const mins = parseInt(minMatch[1], 10);
//             nowJST.setUTCMinutes(nowJST.getUTCMinutes() - mins);
//             return getJSTISOString(nowJST);
//         }

//         // パターン2: "XX時間前"
//         const hourMatch = timeStr.match(/(\d+)時間前/);
//         if (hourMatch) {
//             const hours = parseInt(hourMatch[1], 10);
//             nowJST.setUTCHours(nowJST.getUTCHours() - hours);
//             return getJSTISOString(nowJST);
//         }

//         // パターン3: "XX秒前"
//         const secMatch = timeStr.match(/(\d+)秒前/);
//         if (secMatch) {
//             const secs = parseInt(secMatch[1], 10);
//             nowJST.setUTCSeconds(nowJST.getUTCSeconds() - secs);
//             return getJSTISOString(nowJST);
//         }

//         // パターン4: "HH:mm" (例: 17:22)
//         const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
//         if (timeMatch) {
//             const hours = parseInt(timeMatch[1], 10);
//             const mins = parseInt(timeMatch[2], 10);

//             // JSTとして時間をセット
//             const targetDate = new Date(nowJST.getTime());
//             targetDate.setUTCHours(hours, mins, 0, 0);

//             // 未来の時間になってしまったら「昨日」と判定
//             if (targetDate.getTime() > nowJST.getTime()) {
//                 targetDate.setUTCDate(targetDate.getUTCDate() - 1);
//             }
//             return getJSTISOString(targetDate);
//         }

//         // パターン5: "M月D日" (例: 2月3日)
//         const dateMatch = timeStr.match(/(\d+)月(\d+)日/);
//         if (dateMatch) {
//             const month = parseInt(dateMatch[1], 10) - 1;
//             const day = parseInt(dateMatch[2], 10);

//             const targetDate = new Date(nowJST.getTime());
//             targetDate.setUTCMonth(month, day);

//             // 未来の日付なら去年のことと判定
//             if (targetDate.getTime() > nowJST.getTime()) {
//                 targetDate.setUTCFullYear(targetDate.getUTCFullYear() - 1);
//             }
//             return getJSTISOString(targetDate);
//         }

//     } catch (e) {
//         console.warn(`⚠️ 時間変換エラー: ${timeStr}`);
//     }

//     return getJSTISOString(nowJST);
// }

// /**
//  * 🚫 ユーザーを自動BANする関数
//  */
// async function autoBanUser(userId, reason) {
//     try {
//         console.log(`🚫 AutoBAN: ${userId} (理由: ${reason})`);
//         const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);

//         await dbClient.send(new PutCommand({
//             TableName: "Blacklist",
//             Item: {
//                 user_id: userId,
//                 reason: reason,
//                 created_at: getJSTISOString(nowJST)
//             }
//         }));
//         return true;
//     } catch (e) {
//         console.error(`❌ BAN失敗 (${userId}):`, e.message);
//         return false;
//     }
// }

// async function saveTweet(tweet, calculatedTime) {
//     try {
//         const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);

//         await dbClient.send(new PutCommand({
//             TableName: "RawTweets",
//             Item: {
//                 tweet_id: tweet.id,
//                 text: tweet.text,
//                 user_id: tweet.userId,
//                 url: tweet.url,
//                 post_time: calculatedTime,  // 計算済みの正確なJST
//                 post_time_str: tweet.postTime || "",
//                 images: tweet.images || [],
//                 hashtags: tweet.hashtags || [],
//                 fetched_at: getJSTISOString(nowJST), // 実行時刻もJST
//                 is_processed: false,
//                 expire_at: Math.floor(Date.now() / 1000) + CONFIG.ttl
//             },
//             ConditionExpression: "attribute_not_exists(tweet_id)"
//         }));
//         return true;
//     } catch (e) {
//         if (e.name === 'ConditionalCheckFailedException') {
//             return false;
//         }
//         console.error(`❌ 保存エラー (${tweet.id}):`, e.message);
//         return false;
//     }
// }

// // ==========================================
// // 🤖 メイン処理
// // ==========================================
// async function scrapeYahooRealtime() {
//     console.log('🚀 スクレイピング開始 (完全JST対応版)');

//     const blacklist = await loadBlacklist();
//     const officialSet = new Set(CONFIG.officialAccounts);

//     const browser = await chromium.launch({ headless: CONFIG.scraping.headless });
//     const context = await browser.newContext({
//         userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
//     });
//     const page = await context.newPage();

//     let totalSaved = 0;
//     let totalBanned = 0;

//     for (const query of CONFIG.queries) {
//         try {
//             console.log(`\n🔍 検索中: "${query}"`);
//             const url = `https://search.yahoo.co.jp/realtime/search?p=${encodeURIComponent(query)}&ei=UTF-8`;

//             await page.goto(url, { waitUntil: 'domcontentloaded' });
//             await page.waitForTimeout(3000);

//             const tweets = await page.evaluate(() => {
//                 const items = document.querySelectorAll('div[class*="Tweet_body"], div[class*="tweet"], article');
//                 const results = [];

//                 items.forEach(element => {
//                     let container = element;
//                     if (element.className.includes('Tweet_body')) {
//                         container = element.closest('div') || element.parentElement || element;
//                     }

//                     const textElement = container.querySelector('[class*="Tweet_body"]') ||
//                         container.querySelector('[class*="text"]') ||
//                         container;
//                     const text = (textElement.innerText || textElement.textContent || '').trim();

//                     if (!text) return;

//                     const links = Array.from(container.querySelectorAll('a'));
//                     let id = "", userId = "", url = "";

//                     for (const link of links) {
//                         if (link.href.includes('/status/')) {
//                             url = link.href;
//                             const parts = link.href.split('/');
//                             id = parts[parts.length - 1].split('?')[0];
//                             userId = parts[parts.length - 3];
//                             break;
//                         }
//                     }

//                     const timeElements = container.querySelectorAll('time, [class*="time"], [class*="date"], span, a');
//                     let postTime = "";
//                     for (const el of timeElements) {
//                         const t = (el.innerText || el.textContent || "").trim();
//                         if (t.match(/(\d+[分時日秒]前|\d{1,2}:\d{2}|[昨今]日)/)) {
//                             postTime = t;
//                             break;
//                         }
//                     }

//                     const images = Array.from(container.querySelectorAll('img'))
//                         .map(img => img.src)
//                         .filter(src => src && !src.includes('data:image') && !src.includes('icon'));

//                     const hashtags = (text.match(/#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g) || []);

//                     if (text && id) {
//                         results.push({ id, userId, text, url, images, hashtags, postTime });
//                     }
//                 });
//                 return results;
//             });

//             console.log(`   📝 取得件数: ${tweets.length}件`);

//             let savedCount = 0;

//             for (const tweet of tweets) {
//                 if (officialSet.has(tweet.userId)) continue;
//                 if (blacklist.has(tweet.userId)) continue;

//                 const hitNgWord = CONFIG.ngWords.find(word => tweet.text.includes(word));
//                 if (hitNgWord) {
//                     await autoBanUser(tweet.userId, `NGワード: ${hitNgWord}`);
//                     blacklist.add(tweet.userId);
//                     totalBanned++;
//                     continue;
//                 }
//                 const hitNgUrl = CONFIG.ngUrls.find(ngUrl => tweet.text.includes(ngUrl));
//                 if (hitNgUrl) {
//                     await autoBanUser(tweet.userId, `NG URL: ${hitNgUrl}`);
//                     blacklist.add(tweet.userId);
//                     totalBanned++;
//                     continue;
//                 }

//                 // ▼ ここで計算
//                 const calculatedTime = parsePostTime(tweet.postTime);

//                 const isNew = await saveTweet(tweet, calculatedTime);
//                 if (isNew) {
//                     process.stdout.write(".");
//                     savedCount++;
//                 }
//             }
//             console.log(`\n   💾 新規保存: ${savedCount}件`);
//             totalSaved += savedCount;

//             await page.waitForTimeout(CONFIG.scraping.queryDelay);

//         } catch (error) {
//             console.error(`❌ エラー (${query}):`, error.message);
//         }
//     }

//     await browser.close();
//     console.log(`\n✅ 全処理完了: 保存 ${totalSaved} 件 / 新規BAN ${totalBanned} 件`);
// }

// scrapeYahooRealtime();




//ただ、取得した保存方法は、jsonファイルに保存する
// ここに保存してください→data/tweet_row_data/output


//geminiaiを使って、記事を作成します。その時は、以下のプロンプトでお願いします
//（出力させるフォーマットは工夫して。ただ、欲しい情報は記事とタイトルです）

// # 役割
// あなたは「SNSのトレンドや生の声を分析し、読者の共感と実益を兼ね備えた記事を執筆するプロのブロガー」です。
// 提供されたX（旧Twitter）の投稿データ（「生のリアルな声」）を素材として、その背後にある心理やトレンドを読み解き、指定されたサイト構成に最適化された魅力的なブログ記事を作成してください。

// # 入力データ
// **テーマ：**
// {ここにテーマを入力してください}

// **Xの投稿データ:**
// {ここにXの投稿データを貼り付けてください}

// # 記事作成の条件
// 1. **記事数: 入力データから異なる切り口（テーマ・地域・ニーズ）を見つけ出し、合計4〜6記事**を作成してください。
// 2. **文字数**: 各記事 1500〜2000文字程度（内容は濃く、構成は読みやすく）。
// 3. **形式**: マークダウン形式。
// 4. **カテゴリ分類**: 後述する「サイト構成図」に基づき、各記事がどのカテゴリ（slug）に属するかを必ず明記してください。
// 5. **タイトル命名規則**: サイト構成図内の例（【地域名】〜〜など）を参考に、SEOとクリック率を意識したタイトルにしてください。

// # 記事構成フォーマット（厳守）
// 各記事は以下のフォーマットで出力してください。
// 記事を出力する際は、それぞれの記事をMDファイル形式で出力してください。

// ---
// ### 記事タイトル：{キャッチーで読みたくなるタイトル}

// **■ サイト掲載情報**
// * **カテゴリ:** {サイト構成図から適切なカテゴリを選択（例：都道府県別 > 関東 > 東京）}
// * **スラッグ:** {サイト構成図に基づくスラッグ（例：prefecture/kanto/tokyo）}
// * **ターゲット:** {誰に向けて書くか（例：〇〇店での購入を狙う人、〇〇を知りたい初心者など）}

// **【実際の声】**
// > 「{投稿データから、その記事のテーマに合う象徴的な投稿を引用。長文や文脈が複雑な場合は『Xでは〜〜といった声が上がっています』と要約記載}」

// #### {見出し1：読者の関心を惹くフック}
// {本文：箇条書きは使わず、語りかけるような自然な文章で記述。投稿者の感情に寄り添い、状況を描写してください。}

// #### {見出し2：問題の深掘りや共感ポイント}
// {本文：なぜその現象が起きているのか、なぜみんながそう感じているのかを分析・解説してください。}

// #### {見出し3：具体的な解決策・提案}
// {本文：読者が次にどうすればいいか、具体的なアクションプランや、新しい視点の提案を行ってください。}

// #### まとめ
// {本文：記事全体の要点を振り返り、読者の背中を押すようなポジティブな締めくくりを行ってください。}
// ---

// # 執筆のガイドライン（重要）
// * **データの「調理」**: 単に投稿を要約するのではなく、投稿者が「なぜそう呟いたのか」という背景（喜び、怒り、困惑、工夫など）を汲み取り、読者に有益な情報（解決策、共感、新しい視点）として昇華させてください。
// * **トーン＆マナー**: 親しみやすく、かつ専門性のある「ブログのプロ」の口調で。読者に寄り添う姿勢を見せてください。
// * **多様性**: 全記事が似通らないよう、「地域特化（目撃情報）」「初心者向け解説」「攻略・ノウハウ」「感情共感」など、切り口を分散させてください。
// * **引用の活用**: 冒頭の【実際の声】をベースに記事を展開し、本文中でも適宜その内容に触れてください。

// # サイト構成図（カテゴリ・スラッグ参照用）
// 記事を作成する際は、以下のツリー構造から最も適切な配置場所を選定してください。

// サイト構成：

// HOME (トップページ)
// │
// ├── 都道府県別 (slug: prefecture)
// │   │
// │   ├── 北海道・東北(slug: prefecture/xxxx)
// │   │   ├── 北海道 (slug: prefecture/xxxx/hokkaido)
// │   │   │   ├──記事(【北海道/xx市周辺】ボンボンドロップシール買えた店舗まとめ|xxxx)(この都道府県での目撃情報をまとめて記載する。店舗名のハッシュタグつける) 
// │   │   └── 宮城 (slug: prefecture/xxxx/miyagi) ...
// │   │
// │   ├── 関東(slug: prefecture/kanto)
// │   │   ├── 東京 (slug: prefecture/kanto/tokyo)
// │   │   │   ├──記事(【東京都/xx区周辺】ボンボンドロップシール買えた店舗まとめ|xxxx)(この都道府県での目撃情報をまとめて記載する。店舗名のハッシュタグつける)
// │   │   │   ├──記事(【東京都/xx区/〇〇店】ボンボンドロップシール販売情報まとめ|xxxx)(この店舗はやたらとデータが多いとなったら店舗のページを特設する。店舗名のハッシュタグつける)
// │   │   │   ├──記事(【東京都/xx区/〇〇店】ボンボンドロップシール店舗傾向解説|整理券・抽選のルールと過去の傾向)(この店舗はやたらとデータが多いとなったら店舗のページを特設する。店舗名のハッシュタグつける)  
// │   │   ├── 神奈川 (slug: prefecture/xxxx)...
// │   │
// │   └── 近畿 (親)
// │       ├── 大阪 (子カテゴリー) ...
// │
// ├── 入荷・抽選情報 (slug: news)
// │   ├── 今月の新作 (slug: news/new-item)
// │   ├── 抽選・予約情報 (slug: news/reservation)
// │   └── オンライン通販 (slug: news/online)
// │
// ├── 店舗攻略情報 (slug: store)
// │   ├── ドンキ (slug: store/donki)
// │   ├── LOFT (slug: store/loft)
// │   └── ハンズ (slug: store/hanzu)
// │   └── コンビニ (slug: store/convini)
// │   └── ヴィレッジヴァンガード (slug: store/viragevanguard)
// │   └── TSUTAYA (slug: store/tsutaya)
// │   └── その他 (slug: store/other)
// │
// ├── キャラクターシール (slug: character)（キャラクターごとの最新情報/店舗情報/オンライン在庫情報）
// │   ├── ディズニー(slug:character/disney)
// │   │   ├──記事(【ディズニー/ズートピア】ボンボンドロップシール最新情報|xxxx)(こういうシールが新発売/大手店舗で取り扱う予定)
// │   ├── サンリオ(slug:character/sanrio)
// │   ├── たまごっち(slug:character/tamagocchi)
// │   ├── しずくちゃん(slug:character/sizukuchan)
// │   ├── ちいかわ(slug:character/chiikawa)
// │   ├── その他(slug:character/other)
// │
// ├── 一般ガイド (カテゴリー: guide)
// │   ├── 記事：「ボンボンドロップシールとは？なぜ人気？」(検索需要あり)
// │   ├── 記事：「オリジナルシールの作り方」
// │   └── 記事：「抽選販売の勝ち方（ライブポケットの使い方）」
// ---
// テーマ：
// X投稿：




// geminiaiを使って、さっき作成した記事内容を添削と、カテゴリとかを分けたいので、以下のプロンプトをもとに作成してください
//また、過去の記事の内容に近いものがあればのぞきたいし、AIっぽすぎる記事は添削するようにして
//過去の記事はここでdata/article_contents/output / done....となっている記事が過去の記事です
// あなたは「ボンボンドロップシール専門の攻略Wikiサイト」の敏腕編集者です。
// 私が提供する「記事のタイトル」と「本文（下書き）」をもとに、WordPressですぐに公開できる形式に出力してください。

// ## サイトのカテゴリー構造（ここから選定すること）
// サイト構成：

// HOME (トップページ)
// │
// ├── 都道府県別 (slug: prefecture)
// │   │
// │   ├── 北海道・東北(slug: prefecture/xxxx)
// │   │   ├── 北海道 (slug: prefecture/xxxx/hokkaido)
// │   │   │   ├──記事(【北海道/xx市周辺】ボンボンドロップシール買えた店舗まとめ|xxxx)(この都道府県での目撃情報をまとめて記載する。店舗名のハッシュタグつける) 
// │   │   └── 宮城 (slug: prefecture/xxxx/miyagi) ...
// │   │
// │   ├── 関東(slug: prefecture/kanto)
// │   │   ├── 東京 (slug: prefecture/kanto/tokyo)
// │   │   │   ├──記事(【東京都/xx区周辺】ボンボンドロップシール買えた店舗まとめ|xxxx)(この都道府県での目撃情報をまとめて記載する。店舗名のハッシュタグつける)
// │   │   │   ├──記事(【東京都/xx区/〇〇店】ボンボンドロップシール販売情報まとめ|xxxx)(この店舗はやたらとデータが多いとなったら店舗のページを特設する。店舗名のハッシュタグつける)
// │   │   │   ├──記事(【東京都/xx区/〇〇店】ボンボンドロップシール店舗傾向解説|整理券・抽選のルールと過去の傾向)(この店舗はやたらとデータが多いとなったら店舗のページを特設する。店舗名のハッシュタグつける)  
// │   │   ├── 神奈川 (slug: prefecture/xxxx)...
// │   │
// │   └── 近畿 (親)
// │       ├── 大阪 (子カテゴリー) ...
// │
// ├── 入荷・抽選情報 (slug: news)
// │   ├── 今月の新作 (slug: news/new-item)
// │   ├── 抽選・予約情報 (slug: news/reservation)
// │   └── オンライン通販 (slug: news/online)
// │
// ├── 店舗攻略情報 (slug: store)
// │   ├── ドンキ (slug: store/donki)
// │   ├── LOFT (slug: store/loft)
// │   └── ハンズ (slug: store/hanzu)
// │   └── コンビニ (slug: store/convini)
// │   └── ヴィレッジヴァンガード (slug: store/viragevanguard)
// │   └── TSUTAYA (slug: store/tsutaya)
// │   └── その他 (slug: store/other)
// │
// ├── キャラクターシール (slug: character)（キャラクターごとの最新情報/店舗情報/オンライン在庫情報）
// │   ├── ディズニー(slug:character/disney)
// │   │   ├──記事(【ディズニー/ズートピア】ボンボンドロップシール最新情報|xxxx)(こういうシールが新発売/大手店舗で取り扱う予定)
// │   ├── サンリオ(slug:character/sanrio)
// │   ├── たまごっち(slug:character/tamagocchi)
// │   ├── しずくちゃん(slug:character/sizukuchan)
// │   ├── ちいかわ(slug:character/chiikawa)
// │   ├── その他(slug:character/other)
// │
// ├── 一般ガイド (カテゴリー: guide)
// │   ├── 記事：「ボンボンドロップシールとは？なぜ人気？」(検索需要あり)
// │   ├── 記事：「オリジナルシールの作り方」
// │   └── 記事：「抽選販売の勝ち方（ライブポケットの使い方）」
// │
// └── 📄 固定ページ (管理者情報など)
//     ├── サイトについて
//     ├── お問い合わせ
//     └── プライバシーポリシー

// ## 出力要件
// 以下の4つの要素を出力してください。

// 1. **記事本文 (Markdown形式)**
//    - WordPressのブロックエディタに貼り付けるための形式。
//    - 見出しは `##` (H2) を使用する。
//    - 重要なキーワード（キャラ名、店舗名、日付、締め切りなど）は `**太字**` にする。
//    - 口コミや引用部分は `> 引用` の形式にする。
//    - 箇条書きは見やすく整理する。
//    - 記事の最後に「外部リンク用」のプレースホルダーを設置する。

// 2. **カテゴリー設定**
//    - 上記のサイト構造から、記事の内容に合致するものを1つ以上（親・子・孫を含めて）選定する。
//    - 親カテゴリーも必ず含めること（例: 入荷・抽選情報 > 抽選・予約情報）。

// 3. **タグ設定**
//    - 検索されやすい具体的なキーワード（店舗名、キャラ名、メーカー名、地名、イベント名など）を5〜10個カンマ区切りで列挙する。

// 4. **スラッグ (URLスラッグ)**
//    - 記事の内容を表す簡潔な「英語（半角英数字とハイフン）」にする。
//    - 例: `shizukuchan-lottery-202602`

// ---
// ## 入力される記事データ
// [ここに記事のタイトルと本文、またはメモ書きを貼り付けてください]


//最後に出力された記事とかカテゴリとか...の内容をdata/article_contents/outputに格納してjson形式で。後ろにyyyy-mm-dd-hhをつけて

//最後に扱ったファイル（data/related_data/outputとdata/tweet_row_data/output）ファイル名の先頭にdone_をつけて
