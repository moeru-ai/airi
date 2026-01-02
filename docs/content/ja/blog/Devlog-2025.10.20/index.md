---
title: DevLog @ 2025.10.20
category: DevLog
date: 2025-10-20
excerpt: |
  AIRI プロジェクトの最新の進捗状況、Tauri から Electron への移行、新しい Live2D モデル、およびさまざまなオープンソースプロジェクトの更新を共有します。
preview-cover:
# TODO
---

今日、AI による仮想通貨取引は本当に人気があります。私たちも同様の研究を共有したいと思っていますが、まずは開発の話から始めましょう...

## Tauri から Electron への移行

Tauri は数日前にもまた話題になりました。私たちは3月に最初に試しました。その間、プラグイン設計が気に入って多くの crate をカプセル化しました。6月にようやく v0.7.2 をリリースしましたが、その後、誰もが望む音声対話機能を実現するために、Tauri が現在使用している WebKit + 非常に使いにくい Web Audio API と DevTools に立ち向かいながら3ヶ月間リファクタリングしました... 3ヶ月... 9月になりました...

...結局我慢できず、国慶節に完全に Electron に切り替えました

<img src="/en/blog/DevLog-2025.10.20/assets/electron.png" alt="electron.png" />

現在、Electron は元の基盤の上で、Linux のサポート、私たちが Control Island（コントロールアイランド）と呼ぶ機能を追加し、macOS のウィンドウが全画面表示のときでもインターフェース上にオーバーレイできるようになりました。

互換性は非常に良く、とても気に入っています。昨日はついにキャプションオーバーレイも追加され、Neuro-sama のように AI が何を出力したかを確認できる字幕がつきました。

<img src="/en/blog/DevLog-2025.10.20/assets/control-island.png" alt="control-island.png" />

<div style="text-align: center; font-size: 0.875rem; color: #666; margin-top: 0.5rem;">
Control Island
</div>

## 新しい Live2D モデル

目ざといパートナーは気づいたかもしれませんが、モデルが更新されました！はい、更新されました！私は現在のこのモデルが大好きです（悲しいことに、まだオープンソースリポジトリにこのモデルを直接入れたくはありませんが）

このモデルは光栄にも、Neuro-sama 公式とも協力したことのある絵師の方と、非常に優れたモデリングの先生と協力して改善されました。新しいアニメーションの表情も非常に豊かです。

（小声）スポンサーが増えれば、喜んで公開するかもしれません（x

<video src="/en/blog/DevLog-2025.10.20/assets/airi.mp4" alt="airi.mp4" controls></video>

## Three.js MMD サポート

皆さんが持っている、または見つけられるモデルは必ずしも Live2D/VRM モデルとは限りません。おそらく最も多く、最高のモデルは依然として MMD でしょう。

私たちも Three.js に基づいて 3D レンダリングを実装していますが、現状では Three.js 側には正常に動作する MMD 実装がありません。kwaa の作業のおかげで、これを行うためのリポジトリができました。

興味がある方は、[一緒にメンテナンスしましょう！](https://github.com/moeru-ai/three-mmd)

## Velin：Vue でプロンプトを書く

> 「[Vue](https://velin-dev.netlify.app/#/) でプロンプトを書くことができます！」

5月に私たち自身が実装したプロンプトライブラリを共有したことを覚えていますか？RainbowBird の努力と寄付のおかげで、現在 Velin も Moeru AI の一員です。AIRI のほぼすべてのプロンプトは Velin によって駆動されていますが、クロスプラットフォーム機能を心配する必要はありません。Velin は Node.js 環境でも使用できます！

<img src="/en/blog/DevLog-2025.10.20/assets/velin.png" alt="velin.png" />

## Eventa：イベント駆動型 IPC/RPC

> 「イベントこそが必要なすべてです」

私たちは以前 [Netlify](https://velin-dev.netlify.app/#/) を共有しました。これは、Vercel AI SDK と同様の方法でブラウザ内で純粋なローカル推論を行うことを可能にするプロジェクトです。

これらのローカル推論は Web Worker / worker_thread でのみ実装でき、それらはすべてイベント通信です。Electron IPC も同様に機能しますが、これらは十分にエレガントではないと感じました。RainbowBird に感謝します。イベントベースの IPC/RPC を駆動および実装するためのライブラリ、[Eventa](https://github.com/moeru-ai/eventa) も現在 Moeru AI の一員です。

## プロジェクトの発展状況

現在、Moeru AI と Project AIRI はどちらも非常に大きな組織になっており、機械学習、データ処理、フロントエンド、バックエンドなどさまざまな分野をカバーする 50 以上のオリジナルリポジトリを持ち、TypeScript/Python/Rust/Go などの複数の言語を使用しています。

合計フォロワー数はすでに 800 人を超えています。これは1年前に私たちが設立したばかりの頃には想像もできなかったことです。皆さん、本当にありがとうございます。

<img src="/en/blog/DevLog-2025.10.20/assets/moeru.png" alt="moeru.png" />
<div style="text-align: center; font-size: 0.875rem; color: #666; margin-top: 0.5rem;">
Moeru AI
</div>

<img src="/en/blog/DevLog-2025.10.20/assets/project-airi.png" alt="project-airi.png" />
<div style="text-align: center; font-size: 0.875rem; color: #666; margin-top: 0.5rem;">
Project AIRI
</div>

## 純粋な Rust TTS 実装

小さな予告：最近、kwaa と一緒に有名な TTS モデル chatterbox を純粋な Rust 実装バージョンに移行しました。これにより、Python 環境の設定が難しいという問題を心配する必要がなくなりました。

4080S で約 5 秒で推論でき、とても気に入っています。

Rust で Python のモデルアーキテクチャに対してほぼ 1:1 で実装しました。他の SOTA TTS モデルに依存して、非常に軽量なローカル TTS 推論エンジンになることを期待しています。

<img src="/en/blog/DevLog-2025.10.20/assets/rust-tts.png" alt="rust-tts.png" />

## 最後に

今日の one more thing はここまでです。これほど長いスレッドを次々と読んでいただき、楽しんでいただければ幸いです。

明日は更新を続け、さらに多くの超大盛りな情報をお届けします。VLA / VLM ゲームプレイにおいて私たちがどのような探索を行い、どのように進め、どのような効果があったかを紹介します。
