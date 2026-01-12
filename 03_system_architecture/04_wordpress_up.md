Markdownファイルとして保存可能な内容を出力しました。以下のテキストをコピーしてファイルに保存してください。
# WordPress記事自動投稿モジュール 実装仕様書

## 1. 概要
本モジュール（`wordpressup.js`）は、AIによって解析されたJSONデータを受け取り、WordPressのREST APIを通じて「目撃情報記事」を自動的に下書き作成するNode.jsスクリプトです。

## 2. 前提条件・環境
* **実行環境:** Node.js (v14以上推奨)
* **依存ライブラリ:**
    * `axios` (HTTPリクエスト用)
    * `dotenv` (環境変数管理用)
    * `btoa` (Basic認証用 / Node v16以降は標準機能で代用可)

## 3. 環境変数 (.env)
セキュリティのため、認証情報は `.env` ファイルで管理してください。

```ini
WP_API_URL=[https://www.seal-search.com/wp-json/wp/v2](https://www.seal-search.com/wp-json/wp/v2)
WP_USER=your_username
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx
# WP管理画面 > ユーザー > プロフィール > アプリケーションパスワード で発行したもの

```

## 4. 入力データ仕様 (JSON)

本スクリプトが受け取るデータ構造です。AI解析結果として渡されます。

```json
{
  "is_sighting": true,
  "prefecture": "東京",
  "city": "池袋",
  "shop_name": "ビックカメラ 池袋本店",
  "shop_address": "〒170-0013 東京都豊島区東池袋1-41-5",
  "product_name": "ぷっくり系シール",
  "sighting_time": "2026年1月1日 夕方頃",
  "status_text": "在庫は少量のようです。",
  "confidence_memo": "ボンドロ（ボンボンドロップ）か分からないとのことですので、類似品の可能性も含めて現地でご確認ください。",
  "source_url": "[https://twitter.com/pill_elua_818/status/2006638482094198808](https://twitter.com/pill_elua_818/status/2006638482094198808)",
  "is_prediction": false
}

```

* **is_prediction**: `true` の場合、記事本文に「※AIによる推測です」という警告文を表示する必要があります。

## 5. 実装ロジック詳細

### 5-1. カテゴリーIDのマッピング

都道府県名（文字列）をWordPressのカテゴリーID（数値）に変換する定数マップを用意してください。

* 事前にWordPress管理画面で各都道府県のカテゴリーIDを確認する必要があります。

```javascript
const CATEGORY_MAP = {
  "東京": 7,
  "埼玉": 8,
  "大阪": 9,
  // ... 他の都道府県も定義
};

```

### 5-2. 本文 (HTML) の生成ルール

`content` フィールドに渡すHTML文字列は、以下の構成で組み立ててください。

1. **AI推測アラート (条件付き):** `is_prediction: true` の場合のみ表示。
2. **概要文:** 都道府県、店舗名、商品名、状況を含む導入文。
3. **目撃日時:** 📅 アイコン付き。
4. **詳細リスト:** 📦 アイコン付きの見出しとリスト。
5. **店舗情報:** 📍 アイコン付きの見出しとリスト。
6. **情報ソース:** 🔗 アイコン付き。元ツイートへのリンク。

### 5-3. ACF (カスタムフィールド) へのマッピング

地図機能と連携させるため、`acf` プロパティへ以下の通りデータを格納してください。

| WPフィールドキー (ACF) | 値のソース | 説明 |
| --- | --- | --- |
| `location_name` | `data.city` | エリア名（例：池袋） |
| `shop_name` | `data.shop_name` | **地図ピン表示に必須** |
| `shop_address` | `data.shop_address` | 住所 |
| `source_url` | `data.source_url` | ツイートURL |

※ `expectation_rate`（期待度）はPHP側で自動計算するため、送信不要です。

## 6. 実装コードサンプル (wordpressup.js)

以下をベースに実装してください。

```javascript
require('dotenv').config();
const axios = require('axios');

// ▼ 設定: 都道府県とカテゴリーIDの対応表 (実際のIDに書き換えてください)
const CATEGORY_MAP = {
    "東京": 7,
    "埼玉": 8,
    "大阪": 9,
    "宮城": 10
    // 必要分を追加
};

/**
 * 記事本文(HTML)を生成する関数
 */
function generateHtmlContent(data) {
    let predictionNote = "";
    
    // AI予測フラグがある場合の注釈
    if (data.is_prediction) {
        predictionNote = `
        <p style="background:#fff3cd; padding:10px; border-radius:5px; font-size:0.9rem; border:1px solid #ffeeba; color:#856404;">
        ⚠️ <strong>注意:</strong> 店舗名と住所はツイート内容からAIが推定しました。<br>
        確実な情報は情報ソースのリンク先をご確認ください。
        </p>`;
    }

    return `
    <p>
        ${data.prefecture}${data.city}の「${data.shop_name}」にて、${data.product_name}の目撃情報が寄せられています。<br>
        ${data.status_text} お近くの方はチェックしてみる価値がありそうです。
    </p>

    ${predictionNote}

    <p><strong>📅 目撃・入荷時期</strong> ${data.sighting_time}</p>

    <h3>📦 販売状況・詳細</h3>
    <ul>
        <li><strong>内容:</strong> ${data.product_name}が販売されていたとの報告あり。</li>
        <li><strong>注意:</strong> ${data.confidence_memo}</li>
    </ul>

    <h3>📍 店舗情報</h3>
    <ul>
        <li><strong>店舗名:</strong> ${data.shop_name}</li>
        <li><strong>住所:</strong> ${data.shop_address}</li>
    </ul>

    <p>🔗 <strong>情報ソース</strong><br>
    <a href="${data.source_url}" target="_blank" rel="noopener">${data.source_url}</a>
    </p>
    `;
}

/**
 * WordPressへ記事を投稿するメイン関数
 */
async function postToWordPress(data) {
    // 1. 認証ヘッダーの作成
    const credentials = Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');
    
    // 2. カテゴリーIDの取得 (なければデフォルトID: 1 = 未分類)
    const categoryId = CATEGORY_MAP[data.prefecture] || 1;

    // 3. 送信データの構築
    const payload = {
        title: `【${data.prefecture}/${data.city}】${data.shop_name}にて${data.product_name}の目撃情報`,
        content: generateHtmlContent(data),
        status: 'draft', // テストのため最初は下書き(draft)推奨
        categories: [categoryId],
        acf: {
            location_name: data.city,
            shop_name: data.shop_name,
            shop_address: data.shop_address,
            source_url: data.source_url
        }
    };

    try {
        console.log(`🚀 Posting to WordPress: ${payload.title}...`);
        
        const response = await axios.post(`${process.env.WP_API_URL}/posts`, payload, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Success!');
        console.log(`ID: ${response.data.id}`);
        console.log(`URL: ${response.data.link}`);
        
    } catch (error) {
        console.error('❌ Error posting to WordPress:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

// --- 実行テスト用 ---
// 本来は外部モジュールから data を受け取る形になります
const sampleData = {
    is_sighting: true,
    prefecture: "東京",
    city: "池袋",
    shop_name: "ビックカメラ 池袋本店",
    shop_address: "〒170-0013 東京都豊島区東池袋1-41-5",
    product_name: "ぷっくり系シール",
    sighting_time: "2026年1月1日 夕方頃",
    status_text: "在庫は少量のようです。",
    confidence_memo: "ボンドロ（ボンボンドロップ）か分からないとのことですので、類似品の可能性も含めて現地でご確認ください。",
    source_url: "[https://twitter.com/pill_elua_818/status/2006638482094198808](https://twitter.com/pill_elua_818/status/2006638482094198808)",
    is_prediction: false
};

// 実行
if (require.main === module) {
    postToWordPress(sampleData);
}

module.exports = { postToWordPress };

```