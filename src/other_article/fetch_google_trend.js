import googleTrends from 'google-trends-api';
import fs from 'fs';

const SEARCH_KEYWORD = 'ボンボンドロップ';
const FILE_PATH = 'trends.json';

export const handler = async () => {
    try {
        console.log(`🔍 「${SEARCH_KEYWORD}」の過去24時間のトレンド（急上昇＆人気）を取得中...`);

        // 期間設定：過去24時間
        const startTime = new Date(Date.now() - (24 * 60 * 60 * 1000));

        const results = await googleTrends.relatedQueries({
            keyword: SEARCH_KEYWORD,
            geo: 'JP',
            startTime: startTime,
        });

        const parsedResults = JSON.parse(results);

        // データ構造のチェック
        if (!parsedResults.default || !parsedResults.default.rankedList) {
            console.log("⚠️ データが見つかりませんでした。");
            return;
        }

        // 今日の日付
        const today = new Date().toISOString().split('T')[0];
        const newData = [];

        // rankedListの中には通常2つのリスト（TopとRising）が入っているので、ループして両方処理する
        for (const list of parsedResults.default.rankedList) {
            const keywords = list.rankedKeyword;

            // データが空ならスキップ
            if (!keywords || keywords.length === 0) continue;

            // --- タイプの判別ロジック ---
            // 急上昇(Rising)は、formattedValue に "%" や "Breakout" が含まれる
            // 人気(Top)は、0〜100のスコア数値が入っている
            const isRising = keywords[0].formattedValue.includes('%') || keywords[0].formattedValue === 'Breakout';
            const typeLabel = isRising ? '🔥急上昇' : '👑人気';
            const typeKey = isRising ? 'rising' : 'top';

            console.log(`\n${typeLabel}ワード (${keywords.length}件):`);

            for (const item of keywords) {
                const query = item.query;
                let displayValue = item.formattedValue;

                // 表記を見やすく調整
                if (displayValue === 'Breakout') {
                    displayValue = '🔥爆発的';
                } else if (!isRising) {
                    // 人気ワードの場合は「スコア」と表記
                    displayValue = `スコア:${item.value}`;
                }

                console.log(` - ${query} (${displayValue})`);

                newData.push({
                    date: today,
                    keyword: query,
                    type: typeKey,        // 'top' か 'rising' かを区別して保存
                    value: displayValue,  // 表示用の値
                    fetched_at: new Date().toISOString()
                });
            }
        }

        if (newData.length === 0) {
            console.log("\n⚠️ 保存すべきデータが1件もありませんでした。");
            return;
        }

        // --- 保存処理 ---
        let existingData = [];
        if (fs.existsSync(FILE_PATH)) {
            try {
                existingData = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
            } catch (e) {
                console.log("既存ファイルの読み込みに失敗したため、新規作成します。");
            }
        }

        const finalData = [...existingData];
        let addedCount = 0;

        for (const newRec of newData) {
            // 重複チェック（日付 + キーワード + タイプ で判定）
            const isDuplicate = finalData.some(d =>
                d.date === newRec.date &&
                d.keyword === newRec.keyword &&
                d.type === newRec.type
            );

            if (!isDuplicate) {
                finalData.push(newRec);
                addedCount++;
            }
        }

        fs.writeFileSync(FILE_PATH, JSON.stringify(finalData, null, 2));

        console.log(`\n✅ 保存完了！ 新規追加: ${addedCount}件 (ファイル合計: ${finalData.length}件)`);

    } catch (error) {
        console.error('❌ エラー発生:', error);
    }
};

// ローカル実行用
if (process.argv[1] === new URL(import.meta.url).pathname) {
    handler();
}