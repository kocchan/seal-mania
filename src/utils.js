import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import 'dotenv/config';

// AWS認証設定
const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// DynamoDBのデータ形式変換関数
const dbClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true, // undefinedは削除して保存
        convertEmptyValues: true     // 空文字も許容
    }
});

export { dbClient };