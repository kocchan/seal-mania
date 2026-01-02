import { appendToBlacklist } from './fileManager.js';

// ブラックリスト判定
export function isBlacklisted(userId, blacklistSet) {
    return blacklistSet.has(userId);
}

// 重複判定
export function isDuplicate(tweetId, savedTweetIdsSet) {
    return savedTweetIdsSet.has(tweetId);
}

// NGワード/スパム判定 & 自動BAN処理
export function checkNGAndBan(tweet, ngConfig, blacklistSet) {
    const { text, urls, userId } = tweet;

    // 1. 本文チェック
    for (const ngWord of ngConfig.texts) {
        if (text.includes(ngWord)) {
            executeBan(userId, blacklistSet, `NGワード検知: ${ngWord}`);
            return true; // スパム扱い
        }
    }

    // 2. URLチェック
    if (urls && urls.length > 0) {
        for (const url of urls) {
            for (const ngUrl of ngConfig.urls) {
                if (url.includes(ngUrl)) {
                    executeBan(userId, blacklistSet, `スパムURL検知: ${ngUrl}`);
                    return true; // スパム扱い
                }
            }
        }
    }

    return false; // クリーン
}

// 自動BAN実行ヘルパー
function executeBan(userId, blacklistSet, reason) {
    if (!blacklistSet.has(userId)) {
        console.log(`🚫 [AutoBAN] User: ${userId} Reason: ${reason}`);
        blacklistSet.add(userId);     // メモリ更新
        appendToBlacklist(userId);    // ファイル追記
    }
}