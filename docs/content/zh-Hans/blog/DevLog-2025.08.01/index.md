---
title: DevLog @ 2025.08.01
category: DevLog
date: 2025-08-01
excerpt: |
  Makito 会分享她在 AIRI 中实现文本动画的过程，以及如何构建一个从 UTF-8 字节流中边接收边读出「字素簇」（grapheme cluster）的库。希望对你有所启发！
preview-cover:
  light: "@assets('../../../en/blog/DevLog-2025.08.01/assets/cover-light.avif')"
  dark: "@assets('../../../en/blog/DevLog-2025.08.01/assets/cover-dark.avif')"
---

<script setup>
import CharacterMatcher from '../../../en/blog/DevLog-2025.08.01/CharacterMatcher.vue'
import GraphemeClusterAssembler from '../../../en/blog/DevLog-2025.08.01/GraphemeClusterAssembler.vue'
import GraphemeClusterInspector from '../../../en/blog/DevLog-2025.08.01/GraphemeClusterInspector.vue'
import RollingText from '../../../en/blog/DevLog-2025.08.01/RollingText.vue'
</script>

## 开始之前

<RollingText text-2xl>
你好～我是 Makito

<template #before="{ motionReduced }">
<div text-sm>
<template v-if="!motionReduced">

> 下方动画效果可通过右上角的「减少动画」开关控制

</template>
<template v-else>

> **下方动画效果已关闭** <br />
> 可以通过右上角的「减少动画」开关重新开启动画

</template>
</div>
</template>
</RollingText>

漫无止境的八月开始了，也许可以用这道[有真实感的数学问题](https://oeis.org/A180632/a180632.pdf)消磨时光。抱歉……跑题了。

虽然我已经参与 Project AIRI 很久了，但这还是我第一次在 DevLog 上发文。

在这篇文章中，我会分享我在 AIRI 中实现文本动画的过程，以及如何构建一个从 UTF-8 字节流中边接收边读出「字素簇」（grapheme cluster）的库。希望对你有所启发！

## 背景

最近，[Anime.js](https://animejs.com/) 在 v4.10 版本中发布了全新的[文字工具](https://animejs.com/documentation/text)，为文本动画提供了一系列实用工具（如上方动画所示）。这次更新也补上了 Anime.js 在文本动画方向的空白。以前，我需要手动把文本拆分成单个字符来做动画，或者依赖像 [splt](https://www.spltjs.com/)（底层用的也是 Anime.js）这样的库，或者在 [GSAP](https://gsap.com/) 中使用 [SplitText](https://gsap.com/docs/v3/Plugins/SplitText/) 插件。

文本动画能够让聊天消息在 UI 中以更炫酷的方式出现。一般来说，消息收到即是完整的，所以我们只需要把收到的文本按字符拆分后做动画即可。

在 Project AIRI 里，我们的伙伴 [@nekomeowww](https://github.com/nekomeowww) 也做了一个丝滑的聊天气泡组件：

<video controls muted autoplay loop max-w="500px" w-full mx-auto>
  <source src="../../../en/blog/DevLog-2025.08.01/assets/animated-chat-bubble.mp4">
</video>

<div text-sm text-center>

欢迎来[我们的 UI storybook](https://airi.moeru.ai/ui/#/story/src-components-gadgets-chatbubbleminimalism-story-vue?variantId=chat) 看看

</div>

但如果我们想要读取 UTF-8 字节流，实时地给收到的文本加上动画效果呢？这在实时应用场景中很常见，比如聊天或语音转写应用，这类应用的 UI 需要边接收边逐字显示内容。

## 「字」的边界感

在这种场景下，什么才算「字」？在 Unicode 里，最小的有意义文本单位通常是[码点](https://www.unicode.org/versions/Unicode14.0.0/ch02.pdf#G25564)（Code point）。但在编码层面，尤其是 UTF-8，一个码点可能由多个字节组成。例如日文假名「あ」对应码点 `U+3042`，在 UTF-8 下编码为 `0xE3 0x81 0x82`。也就是说，在读取字节流时，只有所有字节都到齐的情况下，才能还原出完整字符。

别担心，我们还有 Web API 的 [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder) 可以用。用 `TextDecoder.decode` 并加上 `stream` 选项，解码器就会自动处理流式到达的数据，并正确还原出字符：

```javascript
const decoder = new TextDecoder()
const decoded = decoder.decode(chunk, { stream: true })
```

## 这样安全吗？

太长不看：**并不**。

TextDecoder 的确能帮我们把字节流正确解码成 Unicode 码点（字符）。但在 Unicode 里，还有「字素簇」（grapheme cluster）这个概念，它把多个码点组合成一个「视觉上」一体的字符。例如「👩‍👩‍👧‍👦」（家庭）这个 Emoji，底层其实由多个码点组成，但视觉上是一个字符。它们之间通过零宽连接符（ZWJ，码点 `U+200D`）连接。

这可能有点难以理解。不过别担心，我做了一个交互式的小组件，来帮助你探索字素簇和码点的组合方式。可以留意拆分结果里的 `200D` 码点：

<GraphemeClusterInspector initText="👩‍👩‍👧‍👦🏄‍♀️🤼‍♂️🙋‍♀️" />

<div text-sm text-center>

可以把鼠标悬停在字素簇或字符上，看看它们是如何组合的，也可以输入任意文本。

</div>

类似 Emoji，一些语言也会用组合码点来构造复杂的字符。例如泰米尔语的「நி」（ni），由基础字符「ந」（na）和组合元音「 ி」（i）组成。它们组合后，就变成了一个整体的「நி」字素簇。我们把类似的字素簇拆分看看：

<GraphemeClusterInspector initText="நிกำषिक्षि" /> <!-- cSpell:disable-line -->

## 构建一个「读取器」

对于固定长度的字符串，拆分字素簇其实很简单。但在流式场景下，我们面对的是一个不断流出字节的「管道」，最极端时每次只收到一个字节。而且由于 UTF-8 的特性，我们无法假设收到的字节一定能构成完整码点（一个码点最多 4 字节）。

为了解决这个问题，我们可以用前面提到的 [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder)。每次收到并解码后，把解码出来的字符串拼接到缓冲区，字素簇就能自然地组装起来。

现在我们已经能把字节拼成字符或是字素簇了，接下来就要考虑如何<b title="安全第一呀" underline="~ dotted" cursor-help>安全地</b>读取字素簇。好在我们还有 `Intl.Segmenter` 可以用，它是 Web API 提供的拆分字符串为字素簇的工具，并且支持多语言。 `Intl.Segmenter` 不只是字素簇的工具，它还可以根据你提供的选项把文本拆分成单词或句子。

假设我们收到了一些字节，正确解码后得到了如下字素簇：

<div flex="~ row items-center justify-center gap-1" overflow="x-scroll">
<GraphemeClusterAssembler :characters="[...'👩‍👧']" />
</div>

此时，「👩‍👧」（两个人）本身就是一个字素簇。我们能直接把它取出来，然后开始读取后续字节吗？哒咩。如果收到更多字节，前面的字素簇会变成「👩‍👧‍👦」（三个人）：

<div flex="~ row items-center justify-center gap-1" overflow="x-scroll">
<GraphemeClusterAssembler :characters="['👩‍👧', '‍', '👦']" />
</div>

如果我们提前把「👩‍👧」输出，就会得到一个不完整的字素簇，这并不是我们想要的结果。

## 效率至上

有些场景下，我们希望可以尽早输出这些（当然是完整的）字素簇。我们依然用 `Intl.Segmenter`，但对出队（dequeuing）策略稍作调整：如果无法确定当前字素簇是否完整，就等下一个出现时，把除了最后一个以外的都输出：

```ts
declare let clusterBuffer: string
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
while (true) {
  const segments = [...segmenter.segment(clusterBuffer)]
  segments.pop() // 丢弃最后一个字素簇
  for (const seg of segments) {
    yield seg.segment // 输出完整的字素簇
  }
}
```

这样的话，不完整的字素簇永远不会被提前输出，而是等下一个出现时才被处理。我也做了一个交互式的小组件来演示这个过程：

<CharacterMatcher />

<div text-sm text-center>

可以看到，我们会等到第二个字素簇出现后，才认为第一个是完整的。

</div>

## [Clustr](https://github.com/sumimakito/clustr) 的诞生

写这篇 DevLog 的时候，社区中已经有不少可以把字符串拆分成字素簇的库了。但我没找到一个既能接受 UTF-8 字节流、又能随到随输出字素簇的实现。所以我自己实现了一个，并把思路分享给了大家，并取名为 [Clustr](https://github.com/sumimakito/clustr)，和 Unicode 的「字素簇」概念相应。

尽管它的核心代码不到 100 行，如果你也想在项目里把 UTF-8 字节流做成炫酷的文本动画（比如我们在 Project AIRI 里做的那样），它或许能帮到你。

如果你对 Project AIRI 感兴趣，也欢迎来我们的 GitHub 仓库 [moeru-ai/airi](https://github.com/moeru-ai/airi) 看看！
