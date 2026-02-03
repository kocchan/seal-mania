# バージョンを v1.49.1 から v1.57.0 に変更
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# パッケージ定義をコピーしてインストール
COPY package.json package-lock.json ./
RUN npm install

# ソースコードと実行スクリプトをコピー
COPY src ./src
COPY entrypoint.sh ./

# 実行権限を念のため付与
RUN chmod +x entrypoint.sh

# タイムゾーンを東京に設定
ENV TZ=Asia/Tokyo

# コンテナ起動時に実行するコマンド
CMD ["./entrypoint.sh"]