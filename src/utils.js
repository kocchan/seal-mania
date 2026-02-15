import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3"; // 📍追加: S3用のインポート
import 'dotenv/config';

// DynamoDB 接続設定
const credentials = process.env.AWS_ACCESS_KEY_ID && {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
};

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "ap-northeast-1",
    ...(credentials && { credentials })
});

export const dbClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true }
});

// 📍追加: S3クライアント設定 (DynamoDBと同じ認証情報を使用)
export const s3Client = new S3Client({
    region: process.env.AWS_REGION || "ap-northeast-1",
    ...(credentials && { credentials })
});

// 現在の日本時間(JST)をISO文字列で返す
export const getNowJST = () => {
    const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return jstDate.toISOString().replace('Z', '+09:00');
};

// DateオブジェクトからJSTのISO文字列を生成する
export const getJSTISOString = (dateObj) => {
    const s = (n) => String(n).padStart(2, '0');
    const y = dateObj.getUTCFullYear();
    const m = s(dateObj.getUTCMonth() + 1);
    const d = s(dateObj.getUTCDate());
    const h = s(dateObj.getUTCHours());
    const min = s(dateObj.getUTCMinutes());
    const sec = s(dateObj.getUTCSeconds());
    const ms = String(dateObj.getUTCMilliseconds()).padStart(3, '0');

    return `${y}-${m}-${d}T${h}:${min}:${s}.${ms}+09:00`;
};

// ==========================================
// 📍ここから下を追加：トレンドキーワード・S3処理用
// ==========================================

/**
 * S3から取得したストリームデータを文字列に変換する
 */
export const streamToString = (stream) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

/**
 * DynamoDB保存用フォーマット: YYYY/MM/DD HH:MM
 */
export const formatDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
};

/**
 * S3ファイルリネーム用フォーマット: YYYY-MM-DD-HH
 */
export const formatRenameDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}-${hh}`;
};