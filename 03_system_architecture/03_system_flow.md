
# 実装仕様書：在庫情報スクレイピング・フィルタリング処理

**対象モジュール:** スクレイピングエンジン (`scraper-worker`)

**実行環境:** Node.js (v18+) on AWS (Lambda or EC2)

**トリガー:** 15分間隔 (EventBridge Scheduler / Cron)

## 1. 処理フロー概要
本システムは、Yahoo!リアルタイム検索から在庫に関するユーザー投稿を収集し、スパムやノイズを除去した上でデータベース（JSONファイル）に蓄積する。

### 処理フロー図
```mermaid
graph TD
    %% 定義エリア
    Start(("開始<br>15分トリガー"))
    End(("待機"))

    subgraph "📄 ファイル・データ群"
        QueryFile[("設定: 検索クエリ単語")]
        NGWordFile[("設定: NGワードリスト<br>(メルカリURL等)")]
        DB_Tweets[("蓄積: 取得一覧ファイル<br>(tweets.json)")]
        DB_Blacklist[("蓄積: ブラックリストファイル<br>(blacklist.txt)")]
    end

    subgraph "🔄 実行処理 (Node.jsスクリプト)"
        Init["初期化: 各ファイルの内容をメモリにロード"]

        %% URL構築フェーズ
        BuildURL["検索URL構築<br>(クエリ単語 + 最新BLユーザー除外)"]

        %% スクレイピングフェーズ
        AccessYahoo["Yahoo!リアルタイム検索へアクセス<br>(Playwright)"]
        Extract["ツイート抽出<br>(最新約12件)"]

        %% フィルタリングループフェーズ
        LoopStart{"ループ開始<br>(各ツイートに対して)"}
        
        %% CheckOfficialを削除し、直接BLチェックへ
        CheckBL{"既存ブラックリストユーザーか？<br>(メモリ上のリスト照合)"}
        CheckDup{"重複済みツイートか？<br>(メモリ上のID照合)"}
        CheckNG{"NGワード/スパムを含むか？<br>(本文・URLチェック)"}

        ActionBan["【自動BAN】<br>ユーザーIDをブラックリストへ追加<br>(メモリ＆ファイル追記)"]
        Discard["対象外として破棄<br>(スキップ)"]
        Keep["新規保存候補リストへ追加"]
        
        LoopEnd{"全件完了？"}

        %% 保存フェーズ
        SaveDB["取得一覧ファイル(tweets.json)を更新保存"]

    end

    %% フロー接続
    Start --> Init
    
    QueryFile -.-> Init
    NGWordFile -.-> Init
    DB_Tweets -.-> Init
    DB_Blacklist -.-> Init

    Init --> BuildURL
    BuildURL --> AccessYahoo
    AccessYahoo --> Extract
    Extract --> LoopStart

    %% ループ内判定フロー
    LoopStart --> CheckBL

    %% ステップ1: ブラックリストチェック
    CheckBL -- YES(既知のスパム) --> Discard
    CheckBL -- NO --> CheckDup

    %% ステップ2: 重複チェック
    CheckDup -- YES(重複) --> Discard
    CheckDup -- NO(新規) --> CheckNG

    %% ステップ3: NGワード/スパムチェック
    CheckNG -- YES(新規スパム発見) --> ActionBan
    ActionBan -.-> DB_Blacklist
    ActionBan --> Discard

    CheckNG -- NO(クリーンな投稿) --> Keep

    %% ループ終了判定
    Discard --> LoopEnd
    Keep --> LoopEnd

    LoopEnd -- 未完了 --> LoopStart
    LoopEnd -- 完了 --> SaveDB

    SaveDB --> DB_Tweets
    SaveDB --> End
    
```

---

## 2. ディレクトリ構成とファイル役割

MVPのため、RDBは使用せずローカルファイル（JSON/TXT）で管理する構成とする。

```text
/inventory-scraper
│
├── config/
│   ├── queries.json      # 検索対象キーワード（例: ["店舗名 入荷", "商品名 在庫"]）
│   └── ng_words.json     # NGワード設定（例: ["mercari.com", "招待コード", "相互フォロー"]）
│
├── data/
│   ├── blacklist.txt     # 自動BANされたユーザーIDリスト（改行区切り）
│   └── tweets.json       # 取得済みツイートの蓄積データ
│
├── src/
│   ├── index.js          # メイン実行ファイル
│   ├── scraper.js        # Playwrightによるブラウザ操作・DOM解析
│   ├── filters.js        # 判定ロジック（公式判定、NGワード、ブラックリスト）
│   └── fileManager.js    # ファイルの読み書き操作
│
└── package.json

```

---

## 3. 実装詳細

### 3.1 初期化・データロード (`Init`)

* `fs` モジュールを使用し、`data/` および `config/` 内のファイルを同期的に読み込む。
* `blacklist.txt` は `Set` オブジェクトに展開し、高速な検索（O(1)）を可能にする。
* `tweets.json` から過去のツイートIDのみを抽出し、`Set` (Duplicate Check用) を作成する。

### 3.2 URL構築 (`BuildURL`)

Yahoo!リアルタイム検索のURLパラメータを構築する。

* **Base URL:** `https://search.yahoo.co.jp/realtime/search`
* **Query Parameters (`p`):**
* 検索キーワード（OR条件で結合等はYahooの仕様に合わせる）
* *(Option)* 直近で激しくスパムを行っているユーザーIDが特定できている場合のみ、`-ID:xxxxx` を付与する。
* **注意:** URL長制限があるため、すべてのブラックリストユーザーをURLで除外することはせず、後続のフィルタリング処理に委ねる。


* **Sort:** 最新順 (`ei=UTF-8&mtype=image` など必要に応じて指定)

### 3.3 スクレイピング (`AccessYahoo` & `Extract`)

**使用ライブラリ:** `Playwright`

1. **ブラウザ起動:** ヘッドレスモード (`headless: true`)。
2. **Wait処理:** ページ遷移後、タイムライン要素が表示されるまで `page.waitForSelector()` で待機する。
3. **DOM解析:**
* ツイートコンテナ（例: `.div.Tweet_body` 等）を取得。
* 各要素から以下を抽出する：
* `tweetId` (一意なID)
* `userId` / `userName` (投稿者情報)
* `text` (本文)
* `timestamp` (投稿時間)
* `isOfficial` (公式バッジの有無)
* `urls` (投稿に含まれるリンク一覧)





### 3.4 フィルタリングロジック (`Loop` & `Check`)

抽出した各ツイートオブジェクトに対して、以下の順序で判定を行う。

1. **CheckOfficial (特例判定)**
* 公式バッジがある、または事前に定義した `official_accounts` リストに含まれるIDであれば、**無条件で保存候補 (`Keep`)** とする。


2. **CheckBL (ブラックリスト判定)**
* `userId` が `blacklist` Setに含まれている場合、**即時破棄 (`Discard`)**。


3. **CheckDup (重複判定)**
* `tweetId` が `savedTweetIds` Setに含まれている場合、**即時破棄 (`Discard`)**。


4. **CheckNG (NGワード・スパム判定)**
* 本文およびURLに対して `ng_words.json` の正規表現マッチングを行う。
* **判定条件例:**
* メルカリ、Amazonアソシエイト等の転売系URLが含まれる。
* 「招待」「ポイ活」などのスパムワードが含まれる。


* **ActionBan:**
* NG条件にヒットした場合、その `userId` をメモリ上のブラックリストに追加し、ファイル (`blacklist.txt`) にも追記保存する。
* 当該ツイートは**破棄 (`Discard`)**。





### 3.5 データ保存 (`SaveDB`)

* `Keep` と判定された新規ツイートリストを `tweets.json` の先頭（または末尾）に追加。
* ファイルサイズ肥大化防止のため、保存件数が上限（例: 1000件）を超えた場合、古いデータを削除するローテーション処理を入れることが望ましい。

---

## 4. エラーハンドリングと運用考慮

* **HTML構造変更への対応:**
* DOM要素が見つからない（クラス名変更など）場合は、例外をキャッチし、管理者（Slack/LINE Notify等）へ「スクレイピング失敗」のアラートを送信する。


* **アクセス制限回避:**
* リクエスト毎にランダムなUser-Agentを設定する。
* AWS Lambda等で実行する場合、IP固定化は避け、都度IPが変わる特性を利用する（またはプロキシを挟む）。


* **整合性:**
* ファイルの書き込み中にプロセスが落ちてデータが破損しないよう、一時ファイルに書き込んでからリネームする等の安全策を講じる（MVP段階では必須ではないが推奨）。


***

### 💡 ネクストステップ
この実装仕様書で「何を」「どうやって」作るかが明確になりました。
次は具体的なコード記述に入れます。

**「Playwrightを使った `scraper.js` のコードの雛形（Yahoo検索のDOM取得部分）」** を作成しましょうか？
それとも、**「AWS Lambdaに乗せるための `package.json` 構成やデプロイ手順」** の方が優先ですか？
