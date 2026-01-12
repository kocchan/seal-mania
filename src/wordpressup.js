import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';

// =====================================
// 設定
// =====================================
const CATEGORY_MAP = {
    "北海道": 1,
    "青森": 2,
    "岩手": 3,
    "宮城": 4,
    "秋田": 5,
    "山形": 6,
    "福島": 7,
    "茨城": 8,
    "栃木": 9,
    "群馬": 10,
    "埼玉": 11,
    "千葉": 12,
    "東京": 13,
    "神奈川": 14,
    "新潟": 15,
    "富山": 16,
    "石川": 17,
    "福井": 18,
    "山梨": 19,
    "長野": 20,
    "岐阜": 21,
    "静岡": 22,
    "愛知": 23,
    "三重": 24,
    "滋賀": 25,
    "京都": 26,
    "大阪": 27,
    "兵庫": 28,
    "奈良": 29,
    "和歌山": 30,
    "鳥取": 31,
    "島根": 32,
    "岡山": 33,
    "広島": 34,
    "山口": 35,
    "徳島": 36,
    "香川": 37,
    "愛媛": 38,
    "高知": 39,
    "福岡": 40,
    "佐賀": 41,
    "長崎": 42,
    "熊本": 43,
    "大分": 44,
    "宮崎": 45,
    "鹿児島": 46,
    "沖縄": 47
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

    // カテゴリーIDの取得 (なければデフォルトID: 1)
    const categoryId = CATEGORY_MAP[data.prefecture] || 1;

    // 送信データの構築
    const payload = {
        title: `【${data.prefecture}/${data.city}】${data.shop_name}にて${data.product_name}の目撃情報`,
        content: generateHtmlContent(data),
        status: 'draft', // 下書きとして作成
        categories: [categoryId],
        acf: {
            location_name: data.city,
            shop_name: data.shop_name,
            shop_address: data.shop_address,
            source_url: data.source_url
        }
    };

    try {
        console.log(`🚀 WordPress投稿中: ${payload.title}`);

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
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // 配列の場合は各要素を順次投稿
        if (Array.isArray(jsonData)) {
            // アップロード済みの記事をフィルタリング
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
                    // 投稿成功した場合、元のJSONデータを更新
                    const articleIndex = jsonData.findIndex(item => item.source_url === article.source_url);
                    if (articleIndex !== -1) {
                        jsonData[articleIndex].uploaded = true;
                        jsonData[articleIndex].wp_post_id = result.id;
                        jsonData[articleIndex].uploaded_at = new Date().toISOString();
                    }
                }

                results.push(result);

                // API制限を避けるため、少し待機
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // 更新されたJSONを保存
            fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
            console.log(`\n💾 アップロード状況を保存: ${filePath}`);

            return results;
        } else {
            // 単一オブジェクトの場合
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
    // コマンドライン引数からファイルパスを取得
    const filePath = process.argv[2] || './data/wordpressup_file/sample.json';
    const skipUploaded = process.argv[3] !== '--all'; // --all オプションで全記事を投稿

    console.log('🚀 WordPress投稿ツール起動');
    console.log(`📋 対象ファイル: ${filePath}`);
    console.log(`⚙️  モード: ${skipUploaded ? 'アップロード済みをスキップ' : '全記事を投稿'}\n`);

    const results = await postFromJsonFile(filePath, skipUploaded);

    if (results && results.length > 0) {
        const successCount = results.filter(r => r !== null).length;
        console.log(`\n✅ 処理完了: ${successCount}/${results.length}件の投稿に成功しました`);
    } else {
        console.log('\n✅ 処理完了');
    }
}

// スクリプトとして直接実行された場合のみmainを実行
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('❌ エラー発生:', error);
        process.exit(1);
    });
}

// モジュールとしてエクスポート
export { postToWordPress, postFromJsonFile };
