---
title: 開発ログ @ 2025.03.05
category: DevLog
date: 2025-03-05
---

## 既視感

昨日、[`gpuu` (GPU Utils)](https://github.com/moeru-ai/gpuu) という新しいパッケージを追加しました。
これは WebGPU 関連の機能を扱うのを助けるためのもので、将来的には実際の GPU デバイスとの対話にも使えるようになるかもしれません。
現時点では機能はまだ限られていますが、今後のバージョンでさらに機能を追加していく予定です。

使い方は以下の通りです：

```ts
import { check } from 'gpuu/webgpu'
import { onMounted } from 'vue'

onMounted(async () => {
  const result = await check()
  console.info(result)

  // 結果に対して何らかの操作を行う
})
```

先週、私たちの企業デザイナー/アーティストが Project AIRI のロゴの最初のデザイン案を提出してくれました。
ロゴの全体的なスタイルはこんな感じでした：

![](/en/blog/DevLog-2025.03.05/assets/airi-logos-v1.avif)

## 日中の作業

デザインの観点から見ると、これらのロゴはホーム画面のアプリアイコンサイズに縮小したときに、少し複雑すぎて親しみやすさに欠けるように見えました。
そこで、このバージョンを再デザインしました：

![](/en/blog/DevLog-2025.03.05/assets/airi-logo-v2.avif)

そして他のバリエーションも編集しました：

![](/en/blog/DevLog-2025.03.05/assets/airi-logos-v2.avif)

しかし、これらのバージョンはダークテーマにしか適していませんでした。「ライトテーマ用のバージョンも必要だ！」と思い、すぐにこれを作成しました：

![](/en/blog/DevLog-2025.03.05/assets/airi-logo-v2-dark.avif)

[@kwaa](https://github.com/kwaa) が、2つのテーマの配色を入れ替えてみてはどうかと提案してくれました：

![](/en/blog/DevLog-2025.03.05/assets/airi-logos-v3.avif)

確かにこの方が良く見えます。

フォントの配置も更新しました：

![](/en/blog/DevLog-2025.03.05/assets/airi-logos-v4.avif)

そして背景色も最適化しました：

![](/en/blog/DevLog-2025.03.05/assets/airi-logos-v5.avif)

というわけで、最終的にこうなりました：

![](/en/blog/DevLog-2025.03.05/assets/airi-logos-final.avif)

今日の遅くには、Project AIRI の[ドキュメントサイト](https://airi.build)を正式に公開する予定です。
私自身や他の開発者、アーティストのためのリファレンスやガイドを提供するためです。

ついに完成しました！新しいデザインのロゴと配色はすでに[ドキュメントサイト](https://airi.build)に統合されています：

![](/en/blog/DevLog-2025.03.05/assets/airi-build-light.avif)
![](/en/blog/DevLog-2025.03.05/assets/airi-build-dark.avif)

現在、サイトには[基本ガイド](../guides/)、
[貢献ガイド](../references/contributing/guide/)、
および[デザインガイドライン](../references/design-guidelines/)が含まれています。

YouTube で文字の PV アニメーション効果を研究するのに昼休みを丸ごと費やしました。
これらのアニメーションに魅了され、ブラウザでも同様のトランジション効果を実現したいと思いました！

https://www.youtube.com/watch?v=_AIgv0EsOE4

幸運なことに、この分野で非常に優れた開発者兼アーティストを知っています：
[yui540](https://github.com/yui540)（個人サイト：[yui540.com](https://yui540.com)）、
彼/彼女は素晴らしいトランジション効果の実装を紹介する新しいリポジトリを公開したばかりでした。

これらの関連リソースとサイトへのリンクを [https://airi.build](https://airi.build) サイトに追加しましたので、ぜひチェックしてみてください。

## 開発配信

[yui540](https://github.com/yui540) の[リポジトリ](https://github.com/yui540/css-animations)にある
多くのアニメーション・トランジション効果を [https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/) に移植しました。

移植後の効果はかなり良い感じです：

![](/en/blog/DevLog-2025.03.05/assets/animation-transitions.gif)

今日の DevLog はここまでです。DevStream に参加し、最後まで付き合ってくれた皆さんに感謝します。また明日お会いしましょう。
