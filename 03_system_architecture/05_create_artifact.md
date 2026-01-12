ご提示いただいた `tweet.json` の中から、「具体的な店舗での目撃情報」のみを抽出し、Gemini APIを使って住所などの詳細情報を付加してJSON化する処理を作成します。

今回は **Node.js** を使用し、Googleの最新モデル（**Gemini 1.5 Flash** または **Pro**）のJSONモードを活用して、高精度かつ構造化されたデータを一発で生成するアプローチをとります。

### 📋 事前準備

1. **Gemini APIキーの取得**: [Google AI Studio](https://aistudio.google.com/) でAPIキーを取得してください。
2. **ライブラリのインストール**:
プロジェクトフォルダで以下のコマンドを実行します。
```bash
npm install @google/generative-ai dotenv

```



### 🛠️ 実装コード (`article_generator.js`)

このスクリプトは、ローカルの `tweet.json` を読み込み、Geminiに「目撃情報の抽出」と「住所の特定」を同時に行わせます。

```javascript
require('dotenv').config();
const fs = require('fs');
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");

// ▼ .envファイルに GEMINI_API_KEY=あなたのキー を記述してください
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 入力データ (tweet.json) の読み込み
const rawData = fs.readFileSync('tweet.json', 'utf8');
const tweets = JSON.parse(rawData);

async function generateArticles() {
  // 最新の Gemini 1.5 Flash モデルを使用 (高速・安価・高性能)
  // responseMimeType: "application/json" を指定することで確実にJSONを返させます
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            is_sighting: { type: SchemaType.BOOLEAN },
            prefecture: { type: SchemaType.STRING },
            city: { type: SchemaType.STRING },
            shop_name: { type: SchemaType.STRING },
            shop_address: { type: SchemaType.STRING },
            product_name: { type: SchemaType.STRING },
            sighting_time: { type: SchemaType.STRING },
            status_text: { type: SchemaType.STRING },
            confidence_memo: { type: SchemaType.STRING },
            source_url: { type: SchemaType.STRING },
            is_prediction: { type: SchemaType.BOOLEAN },
          },
          required: ["is_sighting", "shop_name", "shop_address", "source_url"]
        }
      }
    }
  });

  // AIへの命令 (プロンプト)
  const prompt = `
  あなたは「人気商品の在庫・目撃情報」を収集する敏腕リポーターAIです。
  以下のツイートリスト（JSON）を分析し、**「具体的な店舗名（または具体的な施設名）」が含まれる有効な目撃情報のみ**を抽出してください。

  ### 重要な指示
  1. **住所の特定**: 抽出した「店舗名」とツイート内の「地域情報」から、あなたの知識ベースを検索し、**具体的な住所（〒含む）を特定して 'shop_address' に入力してください**。
     - 例: "西尾のイチカワ" -> 愛知県西尾市...の手芸店の住所を探す。
     - 例: "KOKOくろべ" -> 富山県黒部市...の道の駅の住所を探す。
  2. **フィルタリング**: 「どこにもない」「欲しい」「ネットで見た」などのツイートは除外し、実際に店舗で「見た」「買った」「入荷していた」という情報だけを抽出してください。
  3. **都道府県・市区町村**: 住所から 'prefecture' (都道府県) と 'city' (市区町村) を埋めてください。
  4. **日時**: ツイートの 'fetchedAt' や 'postTime' ('x分前'など) を考慮し、目撃された具体的な日付・時間帯を 'sighting_time' に記述してください（基準日: 2026年1月12日）。

  ### 対象ツイートデータ
  ${JSON.stringify(tweets)}
  `;

  try {
    console.log("🤖 Gemini AI に解析と住所特定を依頼中...");
    
    const result = await model.generateContent(prompt);
    const response = result.response;
    const jsonOutput = response.text();
    
    // 結果のパース
    const sightings = JSON.parse(jsonOutput);

    // is_sightingがtrueのものだけをフィルタリング（念のため）
    const validSightings = sightings.filter(item => item.is_sighting === true);

    console.log(`✅ 解析完了: ${validSightings.length} 件の有効な目撃情報を抽出しました。`);
    
    // 結果をファイルに保存
    fs.writeFileSync('output_articles.json', JSON.stringify(validSightings, null, 2));
    console.log("📁 'output_articles.json' に保存しました。");

  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
  }
}

// 実行
generateArticles();

```

### 💡 このコードのポイント

1. **住所の自動特定 (`shop_address`)**:
* プロンプト内で「あなたの知識ベースを検索し、具体的な住所を特定して」と指示しています。
* 例えば、インプットデータの `userId: toyama_kanamaru` のツイートにある **「KOKOくろべ」** という単語から、AIは「道の駅KOKOくろべ（富山県黒部市）」を推論し、その住所を生成します。
* `userId: iseki1355` の **「いせき」** も、文脈（手芸屋）から「手芸のいせき（埼玉県所沢市）」などを推論します。


2. **Gemini 1.5 Flash の利用**:
* 大量のツイートを一度に処理でき、かつ高速・安価です。
* `responseSchema` を定義しているため、**確実に指定したJSONフォーマット**で返ってきます（パースエラーが起きにくい）。


3. **フィルタリング**:
* 「欲しい」「ない」といったノイズを除去し、店舗名があるものだけを出力するように指示しています。



### 実行方法

1. 上記のコードを `article_generator.js` として保存。
2. 同じ階層に `tweet.json` を配置。
3. `.env` ファイルを作成し `GEMINI_API_KEY=あなたのキー` を記述。
4. 実行:
```bash
node article_generator.js

```



### 期待される出力 (`output_articles.json` の例)

Geminiが正しく推論できた場合、以下のようなファイルが生成されます。

```json
[
  {
    "is_sighting": true,
    "prefecture": "富山",
    "city": "黒部",
    "shop_name": "道の駅 KOKOくろべ",
    "shop_address": "〒938-0041 富山県黒部市堀切925番地1",
    "product_name": "たまごっち ボンボンドロップシール",
    "sighting_time": "2026年1月12日 昼頃",
    "status_text": "入荷されていたが、現在は完売の可能性あり。",
    "confidence_memo": "ツイートにて「完売らしい」との情報あり。在庫状況は要確認。",
    "source_url": "https://x.com/toyama_kanamaru/status/2010569539734601810",
    "is_prediction": false
  },
  {
    "is_sighting": true,
    "prefecture": "愛知",
    "city": "西尾",
    "shop_name": "手芸の店 イチカワ",
    "shop_address": "〒445-0852 愛知県西尾市花ノ木町4-16",
    "product_name": "ぷっくりシール",
    "sighting_time": "2026年1月11日",
    "status_text": "昨日（1/11）時点で販売されていたとの情報。",
    "confidence_memo": "「ボンボンドロップ」とは明言されていませんが、文脈から該当商品の可能性が高いです。",
    "source_url": "https://x.com/ikana0403/status/2010275342725079345",
    "is_prediction": true
  }
]

```