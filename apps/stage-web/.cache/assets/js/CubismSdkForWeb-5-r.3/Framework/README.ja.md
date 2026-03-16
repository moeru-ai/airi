[English](README.md) / [日本語](README.ja.md)

---

# Cubism Web Framework

Live2D Cubism Editor で出力したモデルをアプリケーションで利用するためのフレームワークです。

モデルを表示、操作するための各種機能を提供します。
モデルをロードするには Live2D Cubism Core ライブラリと組み合わせて使用します。

ビルドを行うことで、ブラウザで利用可能な JavaScript ライブラリとして利用することができます。


## ライセンス

本 SDK を使用する前に、[ライセンス](LICENSE.md)をご確認ください。


## Cubism 5新機能や過去バージョンとの互換性について

本 SDK はCubism 5に対応した製品です。

Cubism 5 Editorに搭載された新機能のSDK対応については [こちら](https://docs.live2d.com/cubism-sdk-manual/cubism-5-new-functions/)をご確認ください。

過去バージョンのCubism SDKとの互換性については [こちら](https://docs.live2d.com/cubism-sdk-manual/compatibility-with-cubism-5/)をご確認ください。


## 開発環境

### Node.js

* 23.4.0
* 22.12.0


### TypeScript

5.7.2


## 開発環境構築

1. [Node.js] と [Visual Studio Code] をインストールします
1. Visual Studio Code で本プロジェクトを開き、推奨拡張機能をインストールします
    * 拡張機能タブから `@recommended` と入力することで確認できます
1. コマンドパレット（*View > Command Palette...*）で `>Tasks: Run Task` を入力してタスク一覧を表示します
1. `npm: install` を選択して依存パッケージのダウンロードを行います

コマンドパレットのタスク一覧から各種コマンドを実行することができます。

NOTE: デバック用の設定は、`.vscode/tasks.json` に記述しています。

## タスク一覧

### `npm: build`

ソースファイルのビルドを行い、`dist` ディレクトリに出力します。

`tsconfig.json` を編集することで設定内容を変更できます。

### `npm: test`

TypeScript の型チェックテストを行います。

`tsconfig.json` を編集することで設定内容を変更できます。

### `npm: lint`

`src` ディレクトリ内の TypeScript ファイルの静的解析を行います。

`.eslintrc.yml` を編集することで設定内容を変更できます。

### `npm: lint:fix`

`src` ディレクトリ内の TypeScript ファイルの静的解析及び自動修正を行います。

`.eslintrc.yml` を編集することで設定内容を変更できます。

### `npm: clean`

ビルド成果物ディレクトリ（`dist`）を削除します。


## コンポーネント

### effect

自動まばたきやリップシンクなど、モデルに対してモーション情報をエフェクト的に付加する機能を提供します。

### id

モデルに設定されたパラメータ名・パーツ名・Drawable名を独自の型で管理する機能を提供します。

### math

行列計算やベクトル計算など、モデルの操作や描画に必要な算術演算の機能を提供します。

### model

モデルを取り扱うための各種機能（生成、更新、破棄）を提供します。

### motion

モデルにモーションデータを適用するための各種機能（モーション再生、パラメータブレンド）を提供します。

### physics

モデルに物理演算による変形操作を適用するための機能を提供します。

### rendering

モデルを描画するためのグラフィックス命令を実装したレンダラを提供します。

### type

フレームワーク内で使用する型定義を提供します。

### utils

JSONパーサーやログ出力などのユーティリティ機能を提供します。


## Live2D Cubism Core for Web

当リポジトリには Cubism Core for Web は同梱されていません。

[Cubism SDK for Web] からダウンロードしてください。

[Cubism SDK for Web]: https://www.live2d.com/download/cubism-sdk/download-web/


## サンプル

標準的なアプリケーションの実装例は [CubismWebSamples] を参照ください。

[CubismWebSamples]: https://github.com/Live2D/CubismWebSamples


## マニュアル

[Cubism SDK Manual](https://docs.live2d.com/cubism-sdk-manual/top/)


## 変更履歴

当リポジトリの変更履歴については [CHANGELOG.md](CHANGELOG.md) を参照ください。


## プロジェクトへの貢献

プロジェクトに貢献する方法はたくさんあります。バグのログの記録、このGitHubでのプルリクエストの送信、Live2Dコミュニティでの問題の報告と提案の作成です。

### フォークとプルリクエスト

修正、改善、さらには新機能をもたらすかどうかにかかわらず、プルリクエストに感謝します。メインリポジトリを可能な限りクリーンに保つために、必要に応じて個人用フォークと機能ブランチを作成してください。

### バグ

Live2Dコミュニティでは、問題のレポートと機能リクエストを定期的にチェックしています。バグレポートを提出する前に、Live2Dコミュニティで検索して、問題のレポートまたは機能リクエストがすでに投稿されているかどうかを確認してください。問題がすでに存在する場合は、関連するコメントを追記してください。

### 提案

SDKの将来についてのフィードバックにも関心があります。Live2Dコミュニティで提案や機能のリクエストを送信できます。このプロセスをより効果的にするために、それらをより明確に定義するのに役立つより多くの情報を含めるようお願いしています。


## フォーラム

ユーザー同士でCubism SDKの活用方法の提案や質問をしたい場合は、是非フォーラムをご活用ください。

- [Live2D 公式クリエイターズフォーラム](https://creatorsforum.live2d.com/)
- [Live2D Creator's Forum(English)](https://community.live2d.com/)
