---
title: DevLog @ 2025.08.01
category: DevLog
date: 2025-08-01
excerpt: |
  Makito が AIRI でのテキストアニメーション実装プロセスと、UTF-8 バイトストリームから「書記素クラスタ」(grapheme cluster) を読み取るライブラリの構築方法を共有します。インスピレーションになれば幸いです！
preview-cover:
  light: "@assets('/en/blog/DevLog-2025.08.01/assets/cover-light.avif')"
  dark: "@assets('/en/blog/DevLog-2025.08.01/assets/cover-dark.avif')"
---

<script setup>
import CharacterMatcher from '../../../en/blog/DevLog-2025.08.01/CharacterMatcher.vue'
import GraphemeClusterAssembler from '../../../en/blog/DevLog-2025.08.01/GraphemeClusterAssembler.vue'
import GraphemeClusterInspector from '../../../en/blog/DevLog-2025.08.01/GraphemeClusterInspector.vue'
import RollingText from '../../../en/blog/DevLog-2025.08.01/RollingText.vue'
</script>

## 始める前に

<RollingText text-2xl>
こんにちは～ Makito です

<template #before="{ motionReduced }">
<div text-sm>
<template v-if="!motionReduced">

> 下のアニメーション効果は右上の「アニメーションを減らす」スイッチで制御できます

</template>
<template v-else>

> **下のアニメーション効果はオフになっています** <br />
> 右上の「アニメーションを減らす」スイッチでアニメーションを再度オンにできます

</template>
</div>
</template>
</RollingText>

終わりのない8月が始まりました。この[現実味のある数学の問題](https://oeis.org/A180632/a180632.pdf)で時間をつぶすのもいいかもしれません。ごめんなさい……話がそれました。

私は長い間 Project AIRI に関わってきましたが、DevLog に投稿するのは今回が初めてです。

この記事では、AIRI でのテキストアニメーションの実装プロセスと、UTF-8 バイトストリームから「書記素クラスタ」(grapheme cluster) を受信しながら読み取るライブラリの構築方法を共有します。インスピレーションになれば幸いです！

## 背景

最近、[Anime.js](https://animejs.com/) は v4.10 で新しい[テキストユーティリティ](https://animejs.com/documentation/text)をリリースし、テキストアニメーション用の一連の実用的なツールを提供しました（上のアニメーションのように）。この更新は、Anime.js のテキストアニメーション分野の空白も埋めました。以前は、アニメーション化するためにテキストを手動で単一の文字に分割するか、[splt](https://www.spltjs.com/)（内部でも Anime.js を使用）のようなライブラリに依存するか、[GSAP](https://gsap.com/) で [SplitText](https://gsap.com/docs/v3/Plugins/SplitText/) プラグインを使用する必要がありました。

テキストアニメーションは、チャットメッセージを UI 上でよりクールに表示させることができます。一般的に、メッセージは受信した時点で完全なものなので、受信したテキストを文字ごとに分割してアニメーション化するだけで済みます。

Project AIRI では、パートナーの [@nekomeowww](https://github.com/nekomeowww) も滑らかなチャットバブルコンポーネントを作成しました：

<video controls muted autoplay loop max-w="500px" w-full mx-auto>
  <source src="/en/blog/DevLog-2025.08.01/assets/animated-chat-bubble.mp4">
</video>

<div text-sm text-center>

[私たちの UI storybook](https://airi.moeru.ai/ui/#/story/src-components-gadgets-chatbubbleminimalism-story-vue?variantId=chat) に遊びに来てください

</div>

しかし、UTF-8 バイトストリームを読み取り、受信したテキストにリアルタイムでアニメーション効果を追加したい場合はどうでしょうか？これは、チャットや音声文字起こしアプリケーションなど、リアルタイムのシナリオでよく見られます。このようなアプリケーションの UI は、受信しながら一文字ずつ内容を表示する必要があります。

## 「文字」の境界線

このようなシナリオでは、何が「文字」と見なされるのでしょうか？Unicode では、意味のある最小のテキスト単位は通常[コードポイント](https://www.unicode.org/versions/Unicode14.0.0/ch02.pdf#G25564) (Code point) です。しかし、エンコーディングレベル、特に UTF-8 では、1 つのコードポイントが複数のバイトで構成される場合があります。たとえば、日本語の仮名「あ」はコードポイント `U+3042` に対応し、UTF-8 では `0xE3 0x81 0x82` としてエンコードされます。つまり、バイトストリームを読み取る際、すべてのバイトが揃って初めて完全な文字を復元できるのです。

心配しないでください。Web API の [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder) があります。`TextDecoder.decode` を `stream` オプション付きで使用すると、デコーダーはストリーミングデータを自動的に処理し、文字を正しく復元します：

```javascript
const decoder = new TextDecoder()
const decoded = decoder.decode(chunk, { stream: true })
```

## これで安全ですか？

TL;DR: **いいえ**。

TextDecoder は確かにバイトストリームを Unicode コードポイント（文字）に正しくデコードするのに役立ちます。しかし、Unicode には「書記素クラスタ」(grapheme cluster) という概念があり、複数のコードポイントを組み合わせて「視覚的に」一体の文字にします。たとえば、「👩‍👩‍👧‍👦」（家族）という絵文字は、実際には複数のコードポイントで構成されていますが、視覚的には 1 つの文字です。それらはゼロ幅接合子（ZWJ、コードポイント `U+200D`）で接続されています。

これは少し理解しにくいかもしれません。しかし心配しないでください。書記素クラスタとコードポイントの組み合わせ方を探索するのに役立つインタラクティブなウィジェットを作成しました。分割結果の `200D` コードポイントに注目してください：

<GraphemeClusterInspector initText="👩‍👩‍👧‍👦🏄‍♀️🤼‍♂️🙋‍♀️" />

<div text-sm text-center>

マウスを書記素クラスタまたは文字の上に置くと、それらがどのように組み合わされているかを確認できます。また、任意のテキストを入力することもできます。

</div>

絵文字と同様に、一部の言語でも組み合わせコードポイントを使用して複雑な文字を構築します。たとえば、タミル語の「நி」（ni）は、基本文字「ந」（na）と組み合わせ母音「 ி」（i）で構成されています。これらを組み合わせると、全体として「நி」という書記素クラスタになります。同様の書記素クラスタを分割してみましょう：

<GraphemeClusterInspector initText="நிกำषिक्षि" /> <!-- cSpell:disable-line -->

## 「リーダー」の構築

固定長の文字列の場合、書記素クラスタの分割は実際には非常に簡単です。しかし、ストリーミングシナリオでは、バイトが絶えず流出する「パイプ」に直面しており、最も極端な場合は一度に 1 バイトしか受信しません。また、UTF-8 の特性上、受信したバイトが必ずしも完全なコードポイントを構成できるとは限りません（1 つのコードポイントは最大 4 バイト）。

この問題を解決するために、前述の [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder) を使用できます。毎回受信してデコードした後、デコードされた文字列をバッファに連結すれば、書記素クラスタは自然に組み立てられます。

これで、バイトを文字または書記素クラスタに組み立てることができるようになりました。次は、書記素クラスタを<b title="安全第一ですね" underline="~ dotted" cursor-help>安全に</b>読み取る方法を検討する必要があります。幸いなことに、`Intl.Segmenter` があります。これは、文字列を書記素クラスタに分割するための Web API ツールであり、多言語をサポートしています。`Intl.Segmenter` は書記素クラスタのツールであるだけでなく、提供されたオプションに基づいてテキストを単語や文に分割することもできます。

いくつかのバイトを受信し、正しくデコードして次の書記素クラスタが得られたと仮定します：

<div flex="~ row items-center justify-center gap-1" overflow="x-scroll">
<GraphemeClusterAssembler :characters="[...'👩‍👧']" />
</div>

この時点で、「👩‍👧」（2人）自体が書記素クラスタです。直接取り出して後続のバイトの読み取りを開始できますか？だめです。さらにバイトを受信すると、前の書記素クラスタは「👩‍👧‍👦」（3人）になる可能性があります：

<div flex="~ row items-center justify-center gap-1" overflow="x-scroll">
<GraphemeClusterAssembler :characters="['👩‍👧', '‍', '👦']" />
</div>

「👩‍👧」を事前に出力してしまうと、不完全な書記素クラスタが得られてしまいます。これは私たちが望む結果ではありません。

## 効率至上

一部のシナリオでは、これらの（もちろん完全な）書記素クラスタをできるだけ早く出力したい場合があります。引き続き `Intl.Segmenter` を使用しますが、デキュー（dequeuing）戦略を少し調整します：現在の書記素クラスタが完全かどうかわからない場合は、次の書記素クラスタが表示されるまで待ち、最後のものを除いてすべて出力します：

```ts
declare let clusterBuffer: string
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
while (true) {
  const segments = [...segmenter.segment(clusterBuffer)]
  segments.pop() // 最後の書記素クラスタを破棄
  for (const seg of segments) {
    yield seg.segment // 完全な書記素クラスタを出力
  }
}
```

このようにすれば、不完全な書記素クラスタが事前に出力されることはなく、次のものが表示されたときにのみ処理されます。このプロセスを実演するためのインタラクティブなウィジェットも作成しました：

<CharacterMatcher />

<div text-sm text-center>

2番目の書記素クラスタが表示されるまで待ってから、最初の書記素クラスタが完全であると見なされることがわかります。

</div>

## [Clustr](https://github.com/sumimakito/clustr) の誕生

この DevLog を書いている時点で、文字列を書記素クラスタに分割できるライブラリはコミュニティにすでにいくつかありました。しかし、UTF-8 バイトストリームを受け入れ、書記素クラスタを到着順に出力できる実装は見つかりませんでした。そこで私は自分で実装し、アイデアを皆さんと共有し、Unicode の「書記素クラスタ」の概念に対応して [Clustr](https://github.com/sumimakito/clustr) と名付けました。

コアコードは 100 行未満ですが、プロジェクトで UTF-8 バイトストリームをクールなテキストアニメーションにしたい場合（Project AIRI で行ったように）、役立つかもしれません。

Project AIRI に興味がある場合は、GitHub リポジトリ [moeru-ai/airi](https://github.com/moeru-ai/airi) もぜひご覧ください！
