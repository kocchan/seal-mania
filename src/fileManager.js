import fs from 'fs';
import path from 'path';

const DATA_DIR = './data';
const TWEETS_FILE = path.join(DATA_DIR, 'tweets.json');
const BLACKLIST_FILE = path.join(DATA_DIR, 'blacklist.txt');

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// 設定ファイルの読み込み
export function loadConfig(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ブラックリストの読み込み (Setとして返す)
export function loadBlacklist() {
    if (!fs.existsSync(BLACKLIST_FILE)) return new Set();
    const content = fs.readFileSync(BLACKLIST_FILE, 'utf-8');
    // 空行を除去してSetにする
    return new Set(content.split('\n').map(line => line.trim()).filter(Boolean));
}

// ブラックリストへの追記
export function appendToBlacklist(userId) {
    fs.appendFileSync(BLACKLIST_FILE, `${userId}\n`, 'utf-8');
}

// 過去のツイートデータの読み込み
export function loadSavedTweets() {
    if (!fs.existsSync(TWEETS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(TWEETS_FILE, 'utf-8'));
    } catch (e) {
        return [];
    }
}

// ツイートデータの保存 (全書き換え)
export function saveTweets(tweets) {
    fs.writeFileSync(TWEETS_FILE, JSON.stringify(tweets, null, 2), 'utf-8');
}