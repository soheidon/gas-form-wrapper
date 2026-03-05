# 院内アンケートシステム

Google Workspace 組織内で運用する院内アンケートシステム。  
Googleフォームの設問をカスタムUIで表示し、GAS経由で回答を送信する。

## セットアップ

### 前提条件

- Node.js がインストール済み
- Google Workspace アカウント（組織内）

### 1. clasp のインストールとログイン

```bash
npm install -g @google/clasp
clasp login
```

### 2. Googleリソースの準備

以下の4つを作成する（すべて別ファイル / 別リソース）:

1. **Googleフォーム** — 設問を作成（対応タイプ: 記述・段落・ラジオ・チェックボックス・プルダウン）
2. **Response Sheet** — フォームのレスポンス先スプレッドシート（フォーム作成時に自動生成）
3. **Op Log スプレッドシート** — 新規作成し、以下のヘッダー行を設定:

| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| submissionId | status | receivedAt | submittedAt | formRevisionHash | userEmail | userTempKey | responseData | errorType | errorMessage | retryCount | lastRetryAt |

4. **Google Driveフォルダ** — responseData退避用。新規作成し、共有設定を「管理者のみ」に設定

### 3. GASプロジェクトの作成

```bash
# 新規作成の場合
clasp create --type webapp --rootDir src --title "院内アンケートシステム"

# 既存のGASプロジェクトに接続する場合
clasp clone <YOUR_SCRIPT_ID> --rootDir src
```

### 4. スクリプトプロパティの設定

ブラウザで Apps Script エディタを開き、プロジェクト設定 → スクリプトプロパティに以下を登録:

| キー | 値 |
|------|-----|
| `FORM_ID` | GoogleフォームのID |
| `OPLOG_SHEET_ID` | Op Logスプレッドシートの ID |
| `OPLOG_DRIVE_FOLDER_ID` | responseData退避先DriveフォルダのID |
| `ADMIN_EMAILS` | 管理者メール（カンマ区切り） |
| `WEBAPP_VERSION` | `1`（デプロイごとにインクリメント） |

```bash
clasp open  # ブラウザでエディタを開く
```

### 5. デプロイ

```bash
clasp push              # コードをGASへ反映
clasp deploy            # WebAppとしてデプロイ
clasp open --webapp     # WebApp URLで動作確認
```

### 6. デプロイ時の運用ルール

- デプロイ前に利用者へ告知する（「入力中の方は先に送信を完了してください」）
- デプロイ後、スクリプトプロパティの `WEBAPP_VERSION` をインクリメントする
- 開いたままの画面は「再読み込みしてください」エラーになるが、入力内容は localStorage に下書き保存されているため、再読み込み後に自動復元される

## 開発コマンド

```bash
clasp push          # ローカル → GAS
clasp deploy        # 新バージョンデプロイ
clasp open          # スクリプトエディタを開く
clasp open --webapp # WebApp URLを開く
```

## ドキュメント

- `docs/spec.md` — 基本仕様書 v1.1
