---
title: これはどんなプロジェクト？
description: Project AIRI のユーザーインターフェースを知る
---

### TL;DR

私たちを次のようなものだと捉えてください。

- [Neuro-sama](https://www.youtube.com/@Neurosama) のオープンソース再現
- [Grok Companion](https://news.ycombinator.com/item?id=44566355) のオープンソース代替
- Live2D と VRM（3D）を扱え、ゲーム連携やアプリの状況把握に特化した [SillyTavern](https://github.com/SillyTavern/SillyTavern) の代替

サイバー生命体（サイバー推し）や、
一緒に遊んで会話できるデジタルコンパニオンを
持ちたいと思ったことはありませんか？

いまの LLM の力を借りれば、
[Character.ai](https://character.ai) や [JanitorAI](https://janitorai.com/) といったプラットフォーム、
あるいは [SillyTavern](https://github.com/SillyTavern/SillyTavern) のようなアプリで、
チャット主体やビジュアル ADV の体験はかなり実現できます。

> でも、ゲームを一緒に遊ぶには？今書いているコードを見てもらうには？
> ゲームしながら話したり、動画を観たり、もっといろんなことをしたい。

[Neuro-sama](https://www.youtube.com/@Neurosama) をご存じかもしれません。現状いちばん強いデジタルコンパニオンで、ゲームも会話もこなし、あなたや（VTuber コミュニティの）視聴者と双方向にやり取りできます。こうした存在を「デジタルヒューマン」と呼ぶ人もいます。**ただし彼女はオープンソースではなく、配信が終われば触れなくなってしまいます。**

だからこそ Project AIRI は、もうひとつの選択肢を用意しました。
**いつでもどこでも、手軽に自分だけのデジタルライフ／サイバー生命を持てるようにすること。**

## はじめかた

Web とデスクトップの両方を用意しています。

<div flex gap-2 w-full justify-center text-xl>
  <div w-full flex flex-col items-center gap-2 border="2 solid gray-500/10" rounded-lg px-2 pt-6 pb-4>
    <div flex items-center gap-2 text-5xl>
      <div i-lucide:app-window />
    </div>
    <span>Web</span>
    <a href="https://airi.moeru.ai/" target="_blank" decoration-none class="text-primary-900 dark:text-primary-400 text-base not-prose bg-primary-400/10 dark:bg-primary-600/10 block px-4 py-2 rounded-lg active:scale-95 transition-all duration-200 ease-in-out">
      開く
    </a>
  </div>
  <div w-full flex flex-col items-center gap-2 border="2 solid gray-500/10" rounded-lg px-2 pt-6 pb-4>
    <div flex items-center gap-2 text-5xl>
      <div i-lucide:laptop />
      /
      <div i-lucide:computer />
    </div>
    <span>デスクトップ</span>
    <a href="https://github.com/moeru-ai/airi/releases/latest" target="_blank" decoration-none class="text-primary-900 dark:text-primary-400 text-base not-prose bg-primary-400/10 dark:bg-primary-600/10 block px-4 py-2 rounded-lg active:scale-95 transition-all duration-200 ease-in-out">
      ダウンロード
    </a>
  </div>
</div>

Web 版は手軽にアクセスでき、モバイルからでも利用できます。

デスクトップ版は VTuber 配信や computer-use（PC 操作代行）、ローカル LLM へのアクセスなど高度な用途に向いています。ローカル推論なら、AIRI を動かすために大量のトークンを払う必要もありません。

<div flex gap-2 w-full flex-col justify-center text-base>
  <a href="../../../en/docs/overview/guide/tamagotchi/" w-full flex items-center gap-2 border="2 solid gray-500/10" rounded-lg px-4 py-2>
    <div w-full flex items-center gap-2>
      <div flex items-center gap-2 text-2xl>
      <div i-lucide:laptop />
      </div>
      <span>デスクトップ</span>
    </div>
    <div decoration-none class="text-gray-900 dark:text-gray-200 text-base not-prose rounded-lg active:scale-95 transition-all duration-200 ease-in-out text-nowrap">
      使い方を見る
    </div>
  </a>
  <a href="./guide/web/" w-full flex items-center gap-2 border="2 solid gray-500/10" rounded-lg px-4 py-2>
    <div w-full flex items-center gap-2>
      <div flex items-center gap-2 text-2xl>
      <div i-lucide:app-window />
      </div>
      <span>Web</span>
    </div>
    <div class="text-gray-900 dark:text-gray-200 text-base not-prose rounded-lg active:scale-95 transition-all duration-200 ease-in-out text-nowrap">
      使い方を見る
    </div>
  </a>
</div>

## コントリビュート

このプロジェクトへの貢献方法は [Contributing](../../../en/docs/overview/contributing/) をご覧ください。

Project AIRI の UI を設計・改善するための参考は [Design Guidelines](../../../en/docs/overview/contributing/design-guidelines/resources) を参照してください。
