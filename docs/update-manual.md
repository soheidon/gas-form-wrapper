# gas-form-wrapper 更新マニュアル

## 1. このプロジェクトの場所

このプロジェクトは WSL 上の以下に置く。

```bash
/home/sohei/dev/gas-form-wrapper
```

Windows から見たパスは以下。

```text
\\wsl.localhost\Ubuntu\home\sohei\dev\gas-form-wrapper
```

ただし、開発作業は基本的に **WSL 側で行う**。
Windows 側の `\\wsl.localhost\...` を直接開くより、WSL ターミナルや WSL 接続した Cursor を使うほうが望ましい。

---

## 2. clasp の場所

この環境では `clasp` は以下に入っている。

```bash
/home/sohei/.nvm/versions/node/v22.15.1/bin/clasp
```

確認コマンドはこれ。

```bash
which clasp
```

---

## 3. clasp の認証情報の場所

`clasp` の認証情報は以下に保存される。

```bash
/home/sohei/.clasprc.json
```

確認コマンドはこれ。

```bash
ls -la ~/.clasprc.json
```

---

## 4. このプロジェクトと GAS の結び付け設定

このプロジェクトには、リポジトリ直下に `.clasp.json` を置く。

場所:

```bash
/home/sohei/dev/gas-form-wrapper/.clasp.json
```

内容:

```json
{
  "scriptId": "1ZByG3Er8GTs0PgeSe1kWwZhxsEjrJzs7ZnJq0J_6abv3RJy47iE6mSrV",
  "rootDir": "src"
}
```

意味は以下の通り。

* `scriptId`: 接続先の Google Apps Script プロジェクト
* `rootDir`: GAS に push / pull する対象フォルダ

このプロジェクトでは、`src` 配下が GAS の本体である。

---

## 5. プロジェクト構成

概略は以下。

```text
gas-form-wrapper/
  .clasp.json
  .claspignore
  .gitignore
  README.md
  docs/
    spec.md
    update-manual.md
  src/
    appsscript.json
    config.js
    formService.js
    main.js
    opLog.js
    retry.js
    submitService.js
    validation.js
    html/
      admin.html
      index.html
```

役割は次の通り。

* `docs/` : 仕様書など
* `src/` : GAS に送る本体コード
* `.clasp.json` : GAS との接続設定
* `.git` : GitHub 管理情報

---

## 6. 役割分担

このプロジェクトでは、以下のように役割を分ける。

### GitHub

Git で管理する対象はリポジトリ全体。

使うもの:

* Cursor
* git

主な操作:

* 編集
* commit
* push / pull

### GAS

Apps Script に反映する対象は `src/` 配下。

使うもの:

* clasp

主な操作:

* `clasp push`
* `clasp pull`
* `clasp status`

---

## 7. Cursor の起動方法

### 基本方針

Cursor は **WSL 経由で開く** のが望ましい。
`\\wsl.localhost\Ubuntu\...` を Windows 側から直接開く方法でも動くことはあるが、警告が出たり、動作が不安定になることがある。

### 推奨の起動方法

WSL ターミナルで、プロジェクトへ移動してから起動する。

```bash
cd ~/dev/gas-form-wrapper
cursor .
```

### 起動できない場合

`cursor: command not found` と出る場合は、Cursor の CLI が使える状態になっていない可能性がある。

その場合は次を確認する。

* Cursor に WSL Extension が入っているか
* Cursor 側で `WSL: Connect to WSL` が使えるか
* Cursor のコマンドライン起動が有効になっているか

### Cursor 側から開く場合

Cursor のコマンドパレットで次を実行する。

```text
WSL: Connect to WSL
```

その後、以下のフォルダを開く。

```text
/home/sohei/dev/gas-form-wrapper
```

### 非推奨の開き方

以下のパスを Windows 側から直接開く方法。

```text
\\wsl.localhost\Ubuntu\home\sohei\dev\gas-form-wrapper
```

この方法でも開けることはあるが、WSL 経由の起動のほうが望ましい。

---

## 8. 作業開始時

まず WSL ターミナルでプロジェクトへ移動する。

```bash
cd ~/dev/gas-form-wrapper
```

必要なら GitHub 側の最新を取る。

```bash
git pull
```

GAS 側の状況確認はこれ。

```bash
clasp status
```

---

## 9. 通常の更新手順

### 9-1. Cursor で編集

Cursor でこのフォルダを開く。

```bash
cd ~/dev/gas-form-wrapper
cursor .
```

### 9-2. Git の状態確認

```bash
git status
```

### 9-3. GitHub に反映

```bash
git add .
git commit -m "update"
git push
```

### 9-4. GAS に反映

```bash
clasp push
```

これで `src/` 配下の内容が Google Apps Script に送られる。

---

## 10. GAS 側の変更を取り込む方法

Apps Script エディタで直接編集した内容をローカルへ取り込みたい場合は以下。

```bash
cd ~/dev/gas-form-wrapper
clasp pull
```

ただし、これはローカルの `src/` を上書きしうる。
そのため、実行前に必ず確認する。

```bash
git status
```

未コミット変更がある場合は、先に commit するか退避する。

---

## 11. 状況確認コマンド

### Git の状態

```bash
git status
```

### Git の接続先確認

```bash
git remote -v
```

### clasp の状態

```bash
clasp status
```

### clasp の場所確認

```bash
which clasp
```

### ホームディレクトリ確認

```bash
echo $HOME
```

### clasp 認証ファイル確認

```bash
ls -la ~/.clasprc.json
```

### `.clasp.json` 確認

```bash
cat .clasp.json
```

---

## 12. 認証が切れたとき

`clasp push` などで認証エラーが出た場合は再ログインする。

```bash
clasp logout
mv ~/.clasprc.json ~/.clasprc.json.bak
clasp login --no-localhost
```

認証後、ブラウザで許可し、最後に表示された

```text
http://localhost:8888/?code=...
```

という URL 全体を、**端末が入力待ちの状態で貼り付ける**。

成功すると次のように出る。

```text
You are logged in as ...
```

---

## 13. 注意点

### GitHub と GAS は別である

以下は別操作である。

* `git push`
* `clasp push`

つまり、

* `git push` しただけでは GAS に反映されない
* `clasp push` しただけでは GitHub に保存されない

必要に応じて両方実行する。

### `clasp pull` は慎重に使う

`clasp pull` はローカル側を上書きしうるため、先に `git status` を確認する。

### 開発場所は WSL 側が基本

このプロジェクト、`clasp`、認証情報はすべて WSL 側にある。
そのため、Windows 側ではなく **WSL 側を基準に運用する**。

---

## 14. 最低限これだけ覚える版

### 作業場所

```bash
cd ~/dev/gas-form-wrapper
```

### Cursor 起動

```bash
cursor .
```

### GitHub 更新

```bash
git add .
git commit -m "update"
git push
```

### GAS 更新

```bash
clasp push
```

### 状態確認

```bash
git status
clasp status
```
