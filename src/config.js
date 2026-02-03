export const CONFIG = {
    // X 検索クエリ
    queries: [
        "\"ボンボンドロップ\" (\"入荷\" OR \"在庫\" OR \"売ってた\" OR \"買えた\" OR \"ない\" OR \"あった\") -PR -AD -Amazon -楽天 -メルカリ -予約 -交換 -譲 -求 -amzn -r10.to -afl.rakuten -\"シル活\"",
        "\"ぷっくり　シール\" (\"入荷\" OR \"在庫\" OR \"売ってた\" OR \"買えた\" OR \"ない\" OR \"あった\") -PR -AD -Amazon -楽天 -メルカリ -予約 -交換 -譲 -求 -amzn -r10.to -afl.rakuten -\"シル活\""
    ],

    // X 公式アカウントID
    officialAccounts: [
        "bonbon_drop",
        "bonnbondrop_official",
        "sanrio_official"
    ],

    // X NG単語
    ngWords: [
        "mercari.com",
        "amazon.co.jp/dp",
        "affiliate",
        "rakuten",
        "yahoo.co.jp/shopping",
        "bit.ly",
        "tinyurl",
        "amzn",
        "r10.to",
        "a.r10.to",
        "afl.rakuten",
        "m.qoo10.jp",
        "メルカリ",
        "招待コード",
        "相互フォロー",
        "ポイ活",
        "転売",
        "アフィリエイト",
        "買取",
        "フリマ",
        "出品",
        "オークション"
    ],

    // X NG URL
    ngUrls: [
        "mercari.com",
        "amazon.co.jp/dp",
        "affiliate",
        "rakuten",
        "yahoo.co.jp/shopping",
        "bit.ly",
        "tinyurl",
        "amzn",
        "r10.to",
        "afl.rakuten"
    ],

    // スクレイピング設定
    scraping: {
        headless: true,      // スクレイピング中に画面を出さない
        pageTimeout: 30000,
        queryDelay: 3000     // クエリごとの待機時間
    },

    // DynamoDBデータの保存期間（30日間）
    ttl: 30 * 24 * 60 * 60
};