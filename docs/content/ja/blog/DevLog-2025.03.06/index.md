---
title: 開発ログ @ 2025.03.06
category: DevLog
date: 2025-03-06
---

## 既視感

前日の開発配信で、AIRI のための基本アニメーションとトランジション効果の制作の進捗状況をお見せしました。

主な目標は、[@yui540](https://yui540.com/) の素晴らしい作品を移植し、再利用可能な Vue コンポーネントとして適応させることで、
どんな Vue プロジェクトでもこれらの美しいアニメーション効果を簡単に使えるようにすることでした。

> yui540 に関する詳細情報や関連する引用ライブラリ、作業内容は、新しくデプロイされたドキュメントサイトにまとめられています：
> [https://airi.build/references/design-guidelines/resources/](../references/design-guidelines/resources/)。

最終的な移植結果はかなり良く、以下にデプロイされています：
[https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/)。

![](/en/blog/DevLog-2025.03.06/assets/animation-transitions.gif)

> また、これからは各パッケージのすべてのプレイグラウンドが
> "proj-airi" + "${subDirectory}" + "${packageName}" というパターンで Netlify に
> デプロイされるようになります。

前日の主な目標は CSS の実装を Vue コンポーネントに分割することでしたが、実際の再利用性の部分はまだ完全には実現されていません。
他のページでも便利に使えるように、柔軟かつ拡張可能なワークフローとメカニズムを設計する必要があります。

## 日中

[`unplugin-vue-router`](https://github.com/posva/unplugin-vue-router) が提供する [`definePage`](https://uvr.esm.is/guide/extending-routes.html#definepage) マクロフックを試してみたところ、私の使用シナリオに非常に適していることがわかったので、この方向で探索を続けることにしました。

[https://cowardly-witch.netlify.app/](https://cowardly-witch.netlify.app/) からさらに3つの新しいアニメーション・トランジション効果を移植しました。これらはすでに [https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/) で利用可能です。

昨日、公式ドキュメントサイトを [https://airi.build](https://airi.build) にデプロイしましたが、[@kwaa](https://github.com/kwaa) から `https://airi.more.ai/docs` の方法を試してみてはどうかというコメントをもらいました。~~しかし、/docs のために 200 リダイレクトプロキシを設定する方法が思いつきませんでした。~~

編集：最終的にその方法を学びました。将来の開発ログに詳細を含める予定です。

試してみましたが、約10回のコミットを費やして CI/CD パイプラインと格闘しました（はい、またです）が、結局正常に動作させることはできませんでした。

今日の遅くには、いくつかの技術や DeepSeek チームが1週間前に公開した[オープンソースリポジトリ](https://github.com/deepseek-ai/open-infra-index)、そしていわゆる ByteDance が公開した [LLM ゲートウェイ AIBrix](https://github.com/vllm-project/aibrix) について調査しました。また、新しくリリース・発表された Phi-4-mini が AIRI で使用するために移植可能かどうかも研究しています。良いニュースは、[Phi-4-mini](https://techcommunity.microsoft.com/blog/educatordeveloperblog/welcome-to-the-new-phi-4-models---microsoft-phi-4-mini--phi-4-multimodal/4386037) に関数呼び出し機能が含まれていることです。これはつまり、ついに事前学習サポート付きのエージェントを構築できることを意味します。

## 開発配信

午後、別のアーティストに連絡を取り、近日更新予定のアカウントアイコンとして使用するためのピクセルアートの依頼を有償でお願いしたいと伝えました。

~~はい、アーティストにいくつかイースターエッグを入れてもらうように頼みました（笑）。見つけられるよう頑張ってください。~~

配信のレイアウトと設定を更新しました 😻 これはほぼ1年前に自分でデザインしたものですが、今見ても素晴らしく、見ていて落ち着く感じがします。チャットにコメントや提案を残していただけると嬉しいです。

![](/en/blog/DevLog-2025.03.06/assets/live-stream-layout-update.avif)

今日の開発配信では、ステージトランジションアニメーションコンポーネントを AIRI ウェブサイトのメインステージに統合しようとしましたが、プロセスはそれほど順調ではありませんでした。以前のアニメーションコンポーネント設計にいくつかの問題が見つかりましたが、良いニュースはそれらの問題を修正できたことです。新しいアニメーション・トランジション効果は現在、私たちの公式デプロイ [https://airi.moeru.ai](https://airi.moeru.ai) で利用可能です。

モジュール設定インターフェースと設定ページに関するいくつかのランダムなアイデアから、最終的に決断を下しました。それらはすべて実装され、公開されています。設定を調整する際の感触が良くなっているはずです。気に入っていただければ幸いです。

配信を終了した後、ついに自分の携帯電話で結果をテストしました。デスクトップやタブレットデバイスでは正常に動作しましたが、モバイルデバイスでアニメーションを誤って壊してしまったことに気づきました。明日の日中にこの問題を修正します 😹

今日の DevLog はここまでです。DevStream に参加し、最後まで付き合ってくれた皆さんに感謝します。また明日お会いしましょう。
