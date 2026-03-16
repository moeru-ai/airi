[English](NOTICE.md) / [日本語](NOTICE.ja.md)

---

# お知らせ

## [注意事項] Cubism 4 SDK for Web R1 以降へのアップデートに伴う注意

Cubism 4 SDK for Web R1 にてそれ以前のベータ版から正式版のリリースに伴い、
利便性向上のためパッケージ及びリポジトリの構造変更がおこなわれました。

この変更は Cubism 4 SDK for Native と構造を変えずに運用がなされるほか、
ユーザに管理が不必要なファイルが混在することを避けることが理由です。

構造の変更点、及び Cubism 4 SDK for Web beta2 以前のプロジェクトからの更新方法に関して、
[Cubism SDK Manual] に詳細を記載しています。アップデートを行う際は必ずご確認ください。

[Cubism SDK Manual]: https://docs.live2d.com/cubism-sdk-manual/warning-for-cubism4-web-r1-update/

## [注意事項] 依存パッケージでの宣言重複エラーについて (2023-02-23)

Cubism 4 SDK for Web Samples で利用されている依存パッケージのうち `@types/node` に起因する、
宣言重複のエラーが発生する場合があります。

こちらは以下のいずれかの手順で解決が可能であることを確認しております。

### 解決策1: npm-check-updatesを利用する方法

1. ターミナルで `/Samples/TypeScript/Demo` ディレクトリに移動する。
1. コマンド `npm i -g npm-check-updates` を実行する。
1. コマンド `ncu` を実行する。

### 解決策2: @types/node明示的にインストールし直す方法

1. ターミナルで `/Samples/TypeScript/Demo` ディレクトリに移動する。
1. コマンド `npm uninstall @types/node` を実行する。
1. コマンド `npm install @types/node` を実行する。

---

©Live2D
