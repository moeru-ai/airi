---
title: 開発ログ @ 2025.03.10
category: DevLog
date: 2025-03-10
---

## 既視感

先週の金曜日（3月7日）、AIRI のステージ UI と設定 UI の新しいスタイルをデザイン・構想しようとしていましたが、開発配信の終了間際にようやくアイデアが閃きました。

## 日中

3月7日から、新しい設定 UI の実装を開始しました。この期間中に大きな進歩を遂げました。

[@LemonNekoGH](https://github.com/LemonNekoGH)、[@sumimakito](https://github.com/sumimakito)、[@kwaa](https://github.com/kwaa)、[@luoling8192](https://github.com/luoling8192)、そして [@junkwarrior87](https://github.com/junkwarrior87) がこのプロジェクトに協力してくれています。

最初に私が設定デザインの基本バージョンを完成させました。こんな感じです：

![](/en/blog/DevLog-2025.03.10/assets/new-ui-v1.avif)

![](/en/blog/DevLog-2025.03.10/assets/new-ui-v1-dark.avif)

その後、[@sumimakito](https://github.com/sumimakito) がオンラインになり、ボタンにドット効果を実装するのを手伝ってくれました：

![](/en/blog/DevLog-2025.03.10/assets/new-ui-v2.avif)

> これでメニューからよりリズムを感じられるようになりましたね？！

開発中に、現在 `packages/` ディレクトリにあるいくつかのパッケージが実際には独立したパッケージであり、Project AIRI のワークフローにさえ含まれていないことに気づきました。

つまり、これらのパッケージを他の場所に移動することで、メインリポジトリ [airi](https://github.com/moeru-ai/airi) のインストールサイズとビルドプロセスを簡素化できるということです。

> どこへ行くの？

いい質問です！GitHub 上で [`@proj-airi`](https://github.com/proj-airi) という組織を登録しました。多くのパッケージや静的アプリケーションは Moeru AI にとっても有用ではないため、これらのパッケージを [`@proj-airi`](https://github.com/proj-airi) に移動するのが良いかもしれません。

というわけで、いくつかのパッケージとアプリケーションを [`@proj-airi`](https://github.com/proj-airi) 組織に移動しました！こちらで確認できます：

- https://github.com/proj-airi/webai-examples：WebGPU や関連コンテンツのデモ制作用。
- https://github.com/proj-airi/lobe-icons：[Lobe Icons](https://github.com/lobehub/lobe-icons) の移植版で、Iconify JSON と UnoCSS で使用できます。

これら2つのリポジトリはオープンソースのままであり、通常通り MIT ライセンスを使用しますのでご心配なく。

その後、3月8日に [@junkwarrior87](https://github.com/junkwarrior87) がオンラインになり、純粋な CSS でステージ上の波のアニメーションを作成するのを手伝ってくれました！

> これは本当にクレイジーです。こんなことが実現できるなんて思ってもみませんでした！

以下のコミットから彼/彼女の学習成果を確認できます：

- https://github.com/moeru-ai/airi/pull/54
- https://github.com/moeru-ai/airi/pull/55
- https://github.com/moeru-ai/airi/pull/65

ステージ上の波のアニメーションの修正と改善に協力してくれた [@sumimakito](https://github.com/sumimakito) と [@junkwarrior87](https://github.com/junkwarrior87) に深く感謝します。

3月8日の終わりには、[@LemonNekoGH](https://github.com/LemonNekoGH) と [@junkwarrior87](https://github.com/junkwarrior87) がなんとステージ全体のカラーカスタマイズ機能を実装しました！（これがわずか数時間で完成するとは夢にも思いませんでした...）

<ThemedVideo controls muted src="/en/blog/DevLog-2025.03.10/assets/customizable-theme-colors.mp4" />

- https://github.com/moeru-ai/airi/pull/53
- https://github.com/moeru-ai/airi/pull/60
- https://github.com/moeru-ai/airi/pull/61
- https://github.com/moeru-ai/airi/pull/63

彼らはロゴさえもカスタムカラーに合わせて変化するようにしました 🤯。

> この3日間でさらに多くの改善を行いました。おそらく、これらの素晴らしい貢献者たちが、いくつかのアイデアを共有するための専用の開発ログを書いてくれるかもしれません。お楽しみに！

これが最終的な結果です。試してみてください！

![](/en/blog/DevLog-2025.03.10/assets/new-ui-v3.avif)

![](/en/blog/DevLog-2025.03.10/assets/new-ui-v3-dark.avif)

いつものように、貢献は大歓迎です！私たちは誰に対しても、プログラミングやコーディングに詳しくない人たちに対しても、オープンでフレンドリーです！

ああ、忘れるところでした... [@junkwarrior87](https://github.com/junkwarrior87) は、以前 [@LemonNekoGH](https://github.com/LemonNekoGH) がデモした、色相を RGB スペクトル全体で輝かせる機能を維持してくれました。これは「ダイナミックにしたい！」と呼ばれています（**RGB ON** 機能と考えてください 😂）：

- https://github.com/moeru-ai/airi/pull/64

## 開発配信

最近とても忙しくて 😭、開発配信を行っていません。

今日の DevLog はここまでです。DevStream に参加し、最後まで付き合ってくれた皆さんに感謝します。また明日お会いしましょう。
