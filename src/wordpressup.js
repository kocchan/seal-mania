import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import { fileURLToPath } from 'url';

// =====================================
// ⚙️ 設定: カテゴリーIDマップ
// =====================================
// スクリーンショットに基づき、実際のWordPress IDを設定します。
// ※未設定の県はデフォルト(1)になるため、必要に応じて管理画面でIDを確認し書き換えてください。
const CATEGORY_MAP = {
    "公式情報": 1,
    "目撃・在庫情報": 2,
    "ランキング": 3,
    "オンライン発売情報": 4,
    "自作シール情報": 5,
    "東京": 7, "東京都": 7,
    "埼玉": 8, "埼玉県": 8,
    "大阪": 9, "大阪府": 9,
    "宮城": 10, "宮城県": 10,
    "北海道": 11,
    "青森": 12, "青森県": 12,
    "岩手": 13, "岩手県": 13,
    "秋田": 14, "秋田県": 14,
    "山形": 15, "山形県": 15,
    "福島": 16, "福島県": 16,
    "茨城": 17, "茨城県": 17,
    "栃木": 18, "栃木県": 18,
    "群馬": 19, "群馬県": 19,
    "千葉": 20, "千葉県": 20,
    "神奈川": 21, "神奈川県": 21,
    "新潟": 22, "新潟県": 22,
    "富山": 23, "富山県": 23,
    "石川": 24, "石川県": 24,
    "福井": 25, "福井県": 25,
    "山梨": 26, "山梨県": 26,
    "長野": 27, "長野県": 27,
    "岐阜": 28, "岐阜県": 28,
    "静岡": 29, "静岡県": 29,
    "愛知": 30, "愛知県": 30,
    "三重": 31, "三重県": 31,
    "滋賀": 32, "滋賀県": 32,
    "京都": 33, "京都府": 33,
    "兵庫": 34, "兵庫県": 34,
    "奈良": 35, "奈良県": 35,
    "和歌山": 36, "和歌山県": 36,
    "鳥取": 37, "鳥取県": 37,
    "島根": 38, "島根県": 38,
    "岡山": 39, "岡山県": 39,
    "広島": 40, "広島県": 40,
    "山口": 41, "山口県": 41,
    "徳島": 42, "徳島県": 42,
    "香川": 43, "香川県": 43,
    "愛媛": 44, "愛媛県": 44,
    "高知": 45, "高知県": 45,
    "福岡": 46, "福岡県": 46,
    "佐賀": 47, "佐賀県": 47,
    "長崎": 48, "長崎県": 48,
    "熊本": 49, "熊本県": 49,
    "大分": 50, "大分県": 50,
    "宮崎": 51, "宮崎県": 51,
    "鹿児島": 52, "鹿児島県": 52,
    "沖縄": 53, "沖縄県": 53
};

// =====================================
// HTML本文生成
// =====================================
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
// =====================================
// WordPressへ投稿
// =====================================
async function postToWordPress(data) {
    // 環境変数チェック
    if (!process.env.WP_API_URL || !process.env.WP_USER || !process.env.WP_APP_PASSWORD) {
        console.error('❌ エラー: .envファイルにWP_API_URL, WP_USER, WP_APP_PASSWORDを設定してください');
        return null;
    }

    // 認証ヘッダーの作成
    const credentials = Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');

    // カテゴリーIDの取得
    // マップに県名があればそのID、なければ「目撃・在庫情報(ID:2)」をデフォルトにする
    const categoryId = CATEGORY_MAP[data.prefecture] || 2;

    // 送信データの構築
    const payload = {
        title: `【${data.prefecture}/${data.city}】${data.shop_name}にて${data.product_name}の目撃情報`,
        content: generateHtmlContent(data),
        status: 'draft', // 下書きとして作成
        categories: [categoryId], // 都道府県カテゴリーを設定

        // ★ ACF (カスタムフィールド) データ
        // スクリーンショット (15.33.31.png 等) のフィールド名と一致させています
        acf: {
            // [Group: 目撃情報詳細]
            shop_name: data.shop_name,      // 店舗名 (Text)
            shop_address: data.shop_address,// 住所 (Text)

            // [Group: Scraper Data] (もし存在する場合)
            location_name: data.city,       // エリア・店舗名
            source_url: data.source_url     // 情報ソースURL

            // expectation_rate (期待度) は送信しません
        }
    };

    try {
        console.log(`🚀 WordPress投稿中: ${payload.title} (CatID: ${categoryId})`);

        const response = await axios.post(`${process.env.WP_API_URL}/posts`, payload, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ 投稿成功!');
        console.log(`   記事ID: ${response.data.id}`);
        console.log(`   URL: ${response.data.link}`);

        return response.data;
    } catch (error) {
        console.error('❌ WordPress投稿エラー:');
        if (error.response) {
            console.error(`   ステータス: ${error.response.status}`);
            console.error(`   詳細: ${JSON.stringify(error.response.data, null, 2)}`);

            // ACFの設定ミスの場合によく出るエラーへのヒント
            if (error.response.data.code === 'acf_rest_invalid_fields') {
                console.error('   ⚠️ ヒント: ACF設定で「REST API に表示」がOFFになっているか、フィールド名が間違っています。');
            }
        } else {
            console.error(`   ${error.message}`);
        }
        return null;
    }
}

// =====================================
// JSONファイルから読み込んで投稿
// =====================================
async function postFromJsonFile(filePath, skipUploaded = true) {
    try {
        console.log(`📄 JSONファイル読み込み: ${filePath}`);
        if (!fs.existsSync(filePath)) {
            console.error(`❌ ファイルが見つかりません: ${filePath}`);
            return [];
        }

        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // 配列の場合は各要素を順次投稿
        if (Array.isArray(jsonData)) {
            const articlesToUpload = skipUploaded
                ? jsonData.filter(item => !item.uploaded)
                : jsonData;

            console.log(`   全記事: ${jsonData.length}件`);
            if (skipUploaded) {
                console.log(`   アップロード済み: ${jsonData.length - articlesToUpload.length}件`);
            }
            console.log(`   投稿予定: ${articlesToUpload.length}件`);

            if (articlesToUpload.length === 0) {
                console.log('💤 投稿する記事がありません');
                return [];
            }

            const results = [];
            for (let i = 0; i < articlesToUpload.length; i++) {
                const article = articlesToUpload[i];
                console.log(`\n[${i + 1}/${articlesToUpload.length}]`);

                const result = await postToWordPress(article);

                if (result) {
                    const articleIndex = jsonData.findIndex(item => item.source_url === article.source_url);
                    if (articleIndex !== -1) {
                        jsonData[articleIndex].uploaded = true;
                        jsonData[articleIndex].wp_post_id = result.id;
                        jsonData[articleIndex].uploaded_at = new Date().toISOString();
                    }
                }

                results.push(result);
                // API制限回避の待機
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
            console.log(`\n💾 アップロード状況を保存: ${filePath}`);

            return results;
        } else {
            return await postToWordPress(jsonData);
        }
    } catch (error) {
        console.error('❌ JSONファイル読み込みエラー:', error.message);
        return null;
    }
}

// =====================================
// メイン処理
// =====================================
async function main() {
    const args = process.argv.slice(2);
    const filePath = args[0] || 'output_articles.json';
    const skipUploaded = !args.includes('--all');

    console.log('🚀 WordPress投稿ツール起動');
    console.log(`📋 対象ファイル: ${filePath}`);

    await postFromJsonFile(filePath, skipUploaded);
}

// ESモジュールでのスクリプト直接実行判定
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error('❌ エラー発生:', error);
        process.exit(1);
    });
}

export { postToWordPress, postFromJsonFile };