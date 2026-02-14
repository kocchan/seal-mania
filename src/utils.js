import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
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