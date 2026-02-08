import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import 'dotenv/config';

// 設定オブジェクトを作成
const config = {
    region: process.env.AWS_REGION || "ap-northeast-1",
};

// ローカル開発時のみ、認証情報を明示的にセット
// (AWS上では自動でIAMロールが使われるため、credentialsは不要)
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    };
}

const client = new DynamoDBClient(config);

const dbClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});

export { dbClient };