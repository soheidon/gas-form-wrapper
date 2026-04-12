# 運用担当・技術者向け：デプロイと初回セットアップ

Google Workspace 組織内の Web アプリとして本プロジェクトを動かすまでの手順です。開発環境の詳細（WSL、認証トラブルなど）は [development.md](development.md) を参照してください。

**プログラムを書かず、ブラウザの Apps Script 画面だけで Web アプリを公開する**手順は、一般向けに **[webapp-deploy-for-beginners.md](webapp-deploy-for-beginners.md)** にまとめています（初回の承認ダイアログや「デプロイ」メニューの流れ）。

---

## 前提

- **Node.js** が入っていること
- **Google Workspace** のアカウント（Web アプリは組織内アクセスを想定している）
- `appsscript.json` の Web アプリ設定（`executeAs` / `access`）はプロジェクトに合わせて確認すること

---

## 1. clasp の準備

```bash
npm install -g @google/clasp
clasp login
```

---

## 2. Google 側で用意するもの（別々のリソース）

1. **Google フォーム** — 設問を作成する（対応タイプの目安: 記述・段落・ラジオ・チェックボックス・プルダウンなど。詳細は [spec.md](spec.md)）
2. **Response Sheet（フォームの回答先）** — フォーム作成時に自動で作られることが多い。ラッパーは主に **Op Log 用スプレッドシート**を別途用意する
3. **Op Log 用スプレッドシート** — 新規作成し、**1 行目**に次の列名を置く

| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| submissionId | status | receivedAt | submittedAt | formRevisionHash | userEmail | userTempKey | responseData | errorType | errorMessage | retryCount | lastRetryAt |

4. **Google Drive フォルダ（推奨）** — 長大な回答 JSON をファイル退避するときの保存先。アクセスは運用ポリシーに合わせて限定する。未設定時はスクリプト実装上、マイドライブ直下への退避にフォールバックする

---

## 3. GAS プロジェクトとこのリポジトリの接続

```bash
clasp create --type webapp --rootDir src --title "gas-form-wrapper"
# または既存プロジェクトへ
clasp clone <YOUR_SCRIPT_ID> --rootDir src
```

---

## 4. スクリプトプロパティ（Apps Script のプロジェクト設定）

エディタの「プロジェクトの設定」→「スクリプト プロパティ」で設定する。

| キー | 内容 |
|------|------|
| `FORM_ID` | 対象 Google フォームの ID。**初回は [6. Web アプリ上での初回初期設定](#6-web-アプリ上での初回初期設定推奨) の画面から保存してもよい** |
| `OPLOG_SHEET_ID` | Op Log スプレッドシートの ID。**同上** |
| `OPLOG_DRIVE_FOLDER_ID` | 退避先 Drive フォルダの ID。**省略可**（未設定時はコード上警告のうえマイドライブ直下に退避） |
| `ADMIN_EMAILS` | 管理者メール（カンマ区切りで複数可）。**初回は [6. Web アプリ上での初回初期設定](#6-web-アプリ上での初回初期設定推奨) で、最初に保存したアカウントが自動登録される** |
| `WEBAPP_VERSION` | デプロイのたびに増やす整数など（例: `1`）。**未設定時は既定値**を使う |

```bash
clasp open   # エディタでプロジェクト設定を開く
```

手動で上記をすべて埋めてもよい。空のままデプロイし、**6** の画面から初回だけ登録する運用も可能。

---

## 5. デプロイと動作確認

```bash
clasp push
clasp deploy
clasp open --webapp
```

---

## 6. Web アプリ上での初回初期設定（推奨）

`FORM_ID` / `OPLOG_SHEET_ID` / `ADMIN_EMAILS` を、エディタで手入力せずに始められる。

**[2. Google 側で用意するもの](#2-google-側で用意するもの別々のリソース)** で、フォームと Op Log 用スプレッドシートを用意してから進める。

1. **Web アプリの URL を開く**（`?page=setup` は不要。**通常の `/exec` の URL** でよい）
2. **`ADMIN_EMAILS` が未設定または空文字**のあいだは、回答画面の代わりに **初期設定** 画面が表示される（`?page=setup` を付けた場合も同様に、初回は誰でも開ける）
3. **Google フォーム**と **Op Log 用スプレッドシート**をブラウザで開き、**アドレス欄の URL をそのまま**貼り付ける
4. **「設定を保存する」**を押す
5. **保存時にログインしている Google アカウント**が、以後の **管理者**として `ADMIN_EMAILS` に登録される。運用担当本人のアカウントで行うこと
6. 成功すると **回答者に共有する URL** が表示される
7. **2 回目以降**、通常 URL では **回答画面**が開く。フォームやログ先を変えるときは **`?page=setup`**（**登録済み管理者のみ**）

**注意**

- 組織内アクセス前提のため、**Google にログインしていない**と保存に失敗することがある
- すでに `ADMIN_EMAILS` がある場合、通常 URL からは自動では初期設定画面に切り替わらない（変更は `?page=setup`）
- この画面と同じ内容は、スクリプトプロパティへの手入力でもよい

---

## デプロイ時の注意

- デプロイ前に利用者へ知らせる（入力中の人は先に送信してもらう）
- デプロイ後、`WEBAPP_VERSION` を更新する運用にすると、版不一致検知がしやすい
- 古いタブは版不一致で再読み込みが必要になることがある。回答画面は下書き復元で入力負担を減らせる

---

## 管理者画面（`?page=admin`）

Web アプリの URL に **`?page=admin`** を付けて開く。

**初期設定を保存したあと**は、`ADMIN_EMAILS` に含まれるユーザーのみアクセスできる。初回ブートストラップ中（`ADMIN_EMAILS` が空）は、管理者一覧が空のため実質アクセスできない。

---

## 初期設定画面（`?page=setup`）

- **設定の変更**用。URL に **`?page=setup`** を付与
- **登録済み管理者のみ**アクセス可能
- **`ADMIN_EMAILS` が未設定または空**の間は、組織内ユーザーであれば表示される（通常 URL でも初期設定が表示される）

---

## 関連ドキュメント

- [webapp-deploy-for-beginners.md](webapp-deploy-for-beginners.md) — 編集画面から Web アプリを公開する手順（一般向け）
- [spec.md](spec.md) — 機能・データフロー・セキュリティ
- [development.md](development.md) — ローカル開発、clasp、トラブルシュート
- [README.md](../README.md) — 使い始める人向け（初期設定画面の説明など）
