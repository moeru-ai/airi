[English](README.md) / [日本語](README.ja.md)

---

# Cubism Web Samples

Live2D Cubism Editor で出力したモデルを表示するアプリケーションのサンプル実装です。

Cubism Web Framework および Live2D Cubism Core と組み合わせて使用します。


## ライセンス

本 SDK を使用する前に、[ライセンス](LICENSE.md)をご確認ください。


## お知らせ

本 SDK を使用する前に、[お知らせ](NOTICE.ja.md)をご確認ください。


## Cubism 5新機能や過去バージョンとの互換性について

本 SDK はCubism 5に対応した製品です。  
Cubism 5 Editorに搭載された新機能のSDK対応については [こちら](https://docs.live2d.com/cubism-sdk-manual/cubism-5-new-functions/)をご確認ください。  
過去バージョンのCubism SDKとの互換性については [こちら](https://docs.live2d.com/cubism-sdk-manual/compatibility-with-cubism-5/)をご確認ください。

## ディレクトリ構成

```
.
├─ .vscode          # Visual Studio Code 用プロジェクト設定ディレクトリ
├─ Core             # Live2D Cubism Core が含まれるディレクトリ
├─ Framework        # レンダリングやアニメーション機能などのソースコードが含まれるディレクトリ
└─ Samples
   ├─ Resources     # モデルのファイルや画像などのリソースが含まれるディレクトリ
   └─ TypeScript    # TypeScript のサンプルプロジェクトが含まれるディレクトリ
```


## Live2D Cubism Core for Web

モデルをロードするためのライブラリです。

当リポジトリではCubism Coreを管理していません。
[こちら](https://www.live2d.com/download/cubism-sdk/download-web/)からCubism SDK for Webをダウンロードして、
Coreディレクトリのファイルをコピーしてください。


## 開発環境構築

1. [Node.js] と [Visual Studio Code] をインストールします
1. Visual Studio Code で **本 SDK のトップディレクトリ** を開き、推奨拡張機能をインストールします
    * ポップアップ通知の他、拡張機能タブから `@recommended` を入力することで確認できます

### サンプルデモの動作確認

コマンドパレット（*View > Command Palette...*）で `>Tasks: Run Task` を入力することで、タスク一覧が表示されます。

1. タスク一覧から　`npm: install - Samples/TypeScript/Demo` を選択して依存パッケージのダウンロードを行います
1. タスク一覧から `npm: build - Samples/TypeScript/Demo` を選択してサンプルデモのビルドを行います
1. タスク一覧から `npm: serve - Samples/TypeScript/Demo` を選択して動作確認用の簡易サーバを起動します
1. ブラウザの URL 欄に `http://localhost:5000` と入力してアクセスします
1. コマンドパレットから `>Tasks: Terminate Task` を入力して `npm: serve` を選択すると簡易サーバが終了します

その他のタスクに関してはサンプルプロジェクトの [README.md](Samples/TypeScript/README.ja.md) を参照ください。

NOTE: デバック用の設定は、`.vscode/tasks.json` に記述しています。

### プロジェクトのデバック

Visual Studio Code で **本 SDK のトップディレクトリ** を開き、 *F5* キーを入力すると Debugger for Chrome が起動します。

Visual Studio Code 上でブレイクポイントを貼って Chrome ブラウザと連動してデバックを行うことができます。

NOTE: デバック用の設定は、`.vscode/launch.json` に記述しています。


## SDKマニュアル

[Cubism SDK Manual](https://docs.live2d.com/cubism-sdk-manual/top/)


## 変更履歴

Samples : [CHANGELOG.md](CHANGELOG.md)

Framework : [CHANGELOG.md](Framework/CHANGELOG.md)

Core : [CHANGELOG.md](Core/CHANGELOG.md)


## 開発環境

### Node.js

* 23.4.0
* 22.12.0


## 動作確認環境

| プラットフォーム | ブラウザ | バージョン |
| --- | --- | --- |
| Android | Google Chrome | 133.0.6943.50 |
| Android | Microsoft Edge | 131.0.2903.87 |
| Android | Mozilla Firefox | 133.0.3 |
| iOS / iPadOS | Google Chrome | 131.0.6778.134 |
| iOS / iPadOS | Microsoft Edge | 131.0.2903.92 |
| iOS / iPadOS | Mozilla Firefox | 133.3 |
| iOS / iPadOS | Safari | 18.2 |
| macOS | Google Chrome | 131.0.6778.140 |
| macOS | Microsoft Edge | 131.0.2903.99 |
| macOS | Mozilla Firefox | 133.0.3 |
| macOS | Safari | 18.2 |
| Windows | Google Chrome | 131.0.6778.140 |
| Windows | Microsoft Edge | 133.0.3065.69 |
| Windows | Mozilla Firefox | 133.0.3 |

Note: 動作確認時のサーバの起動は `./Samples/TypeScript/Demo/package.json` の `serve` スクリプトを使用して行っています。


## プロジェクトへの貢献

プロジェクトに貢献する方法はたくさんあります。バグのログの記録、このGitHubでのプルリクエストの送信、Live2Dコミュニティでの問題の報告と提案の作成です。

### フォークとプルリクエスト

修正、改善、さらには新機能をもたらすかどうかにかかわらず、プルリクエストに感謝します。ただし、ラッパーは可能な限り軽量で浅くなるように設計されているため、バグ修正とメモリ/パフォーマンスの改善のみを行う必要があることに注意してください。メインリポジトリを可能な限りクリーンに保つために、必要に応じて個人用フォークと機能ブランチを作成してください。

### バグ

Live2Dコミュニティでは、問題のレポートと機能リクエストを定期的にチェックしています。バグレポートを提出する前に、Live2Dコミュニティで検索して、問題のレポートまたは機能リクエストがすでに投稿されているかどうかを確認してください。問題がすでに存在する場合は、関連するコメントを追記してください。

### 提案

SDKの将来についてのフィードバックにも関心があります。Live2Dコミュニティで提案や機能のリクエストを送信できます。このプロセスをより効果的にするために、それらをより明確に定義するのに役立つより多くの情報を含めるようお願いしています。


## フォーラム

ユーザー同士でCubism SDKの活用方法の提案や質問をしたい場合は、是非フォーラムをご活用ください。

- [Live2D 公式クリエイターズフォーラム](https://creatorsforum.live2d.com/)
- [Live2D Creator's Forum(English)](https://community.live2d.com/)
