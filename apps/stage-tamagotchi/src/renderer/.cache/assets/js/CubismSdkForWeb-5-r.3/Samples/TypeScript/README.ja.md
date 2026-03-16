[English](README.md) / [日本語](README.ja.md)

---

# Cubism Web Samples for TypeScript

TypeScript で実装したアプリケーションのサンプル実装です。


## 開発環境

| パッケージ | バージョン |
| --- | --- |
| TypeScript | 5.7.2 |
| Vite | 6.0.3 |

その他のパッケージに関しては、各プロジェクトの `package.json` を確認してください。
また、その他の開発環境・動作確認環境はトップディレクトリにある [README.md](/README.ja.md) を参照してください。


## タスク一覧

### `npm: start`

開発用のローカルサーバが起動され、プロジェクトの監視ビルドが行われます。
プロジェクトの変更を行うと自動的に再ビルドが行われ、ブラウザのリロードが発生します。
[プロジェクトのデバック]から Visual Studio Code 上でデバックを行うことができます。

Visual Studio Code 上で終了する場合は、
コマンドパレットから `>Tasks: Terminate Task` を入力してタスクを選択します。

### `npm: build`

`dist` ディレクトリに、TypeScript のビルド成果物を出力します。
Vite を用いて1つにまとめられた JavaScript ファイルが出力されます。
動作に必要なファイルもコピーされます。

`tsconfig.json` 及び `vite.config.mts` を編集することで設定内容を変更できます。

### `npm: build:prod`

上記のビルドを最適化した上で行います。
ビルドサイズが削減されるため、本番環境用の成果物の出力に使用します。

### `npm: test`

TypeScript の型チェックテストを行います。

`tsconfig.json` を編集することで設定内容を変更できます。

### `npm: lint`

`src` ディレクトリ内の TypeScript ファイルの静的解析を行います。

`.eslintrc.yml` を編集することで設定内容を変更できます。

### `npm: lint:fix`

`src` ディレクトリ内の TypeScript ファイルの静的解析及び自動修正を行います。

`.eslintrc.yml` を編集することで設定内容を変更できます。

### `npm: serve`

簡易ローカルサーバを起動します。
ブラウザからサーバ内の `/Samples/TypeScript/Demo` にアクセスすることで index.html の確認ができます。
事前にプロジェクトのビルドを行なっている必要があります。

本番環境に近い環境で成果物の検証を行うことができます。

### `npm: clean`

ビルド成果物ディレクトリ（`dist`）を削除します。
