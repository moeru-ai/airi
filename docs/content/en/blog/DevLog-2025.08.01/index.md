---
title: DevLog @ 2025.08.01
category: DevLog
date: 2025-08-01
excerpt: |
  Makito will share her journey from implementing text animations in AIRI to building a library to handle grapheme clusters as they arrive in a stream of UTF-8 bytes.<br /> We hope you find it informative and inspiring!
preview-cover:
  light: "@assets('./assets/cover-light.avif')"
  dark: "@assets('./assets/cover-dark.avif')"
---

<script setup>
import CharacterMatcher from './CharacterMatcher.vue'
import GraphemeClusterAssembler from './GraphemeClusterAssembler.vue'
import GraphemeClusterInspector from './GraphemeClusterInspector.vue'
import RollingText from './RollingText.vue'
</script>

## Before we start

<RollingText text-2xl>
Hello, this is Makito.

<template #before="{ motionReduced }">
<div text-sm>
<template v-if="!motionReduced">

> The animation below can be turned off with the "Reduce Motion" toggle in the top-right corner.

</template>
<template v-else>

> **The animation below has been turned off** <br />
> You can turn it on with the "Reduce Motion" toggle in the top-right corner.

</template>
</div>
</template>
</RollingText>

Endless August has begun… Maybe we can pass the time with this [realistic math problem](https://oeis.org/A180632/a180632.pdf). Oops, sorry for getting off-topic.

This is my first post on Project AIRI's DevLog, even though I have been working on it for a while.

In this post, I will share my journey from implementing text animations in AIRI to building a library to handle grapheme clusters as they arrive in a stream of UTF-8 bytes. I hope you find it informative and inspiring!

## Background

Recently, [Anime.js](https://animejs.com/) released its new [text utilities](https://animejs.com/documentation/text) in v4.10, providing a collection of utility functions to help with text animations (as shown above). This update indeed fills a gap Anime.js has had for a while. Previously, I had to manually split text into individual characters for animation, or rely on some libraries like [splt](https://www.spltjs.com/)—which uses Anime.js under the hood—or [SplitText](https://gsap.com/docs/v3/Plugins/SplitText/) in combination with [GSAP](https://gsap.com/).

Text animations are especially useful for making messages appear in a fancy way in the UI. Typically, messages are received fully formed, so we only need to split the received text into characters and animate them.

In Project AIRI, [@nekomeowww](https://github.com/nekomeowww) also built an animated chat bubble component with motion effects:

<video controls muted autoplay loop max-w="500px" w-full mx-auto>
  <source src="./assets/animated-chat-bubble.mp4">
</video>

<div text-sm text-center>

Check it out in [our UI storybook](https://airi.moeru.ai/ui/#/story/src-components-gadgets-chatbubbleminimalism-story-vue?variantId=chat)

</div>

However, what if we want to read a stream of UTF-8 bytes and animate them as they arrive? This is common in real-time applications, such as chat or audio transcription apps—the UI displays text as it is received, character by character.

## Character by character?

What should be considered a "character" in this context? In Unicode, the smallest meaningful unit of text is typically a [code point](https://www.unicode.org/versions/Unicode14.0.0/ch02.pdf#G25564). However, at the encoding level—especially in UTF-8—a single code point can span multiple bytes. For example, the character "あ" (the Japanese Hiragana letter A) corresponds to the code point `U+3042`, which is encoded as the byte sequence `0xE3 0x81 0x82` in UTF-8. This means that when reading a byte stream, we may not have a complete character until all its bytes are available.

Don't worry, the Web API [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder) is there to help. By using `TextDecoder.decode` with the `stream` option, the decoder will handle data that arrives in chunks, allowing us to decode partial characters correctly.

```javascript
const decoder = new TextDecoder()
const decoded = decoder.decode(chunk, { stream: true })
```

## Are we safe?

tl;dr: **Not exactly**.

TextDecoder can help us decode a stream of bytes into Unicode code points, or characters, correctly. Nevertheless, in Unicode, there's another "grapheme cluster" concept, which combines multiple code points into a single "visual" character. For example, the emoji "👩‍👩‍👧‍👦" (family) is represented by multiple code points but is visually treated as a single character. Under the hood, the code points in "👩‍👩‍👧‍👦" are joined together using zero-width joiners (ZWJs), whose code is `U+200D`.

This could be hard to imagine. Don't worry. I built a simple interactive inspector for you to explore grapheme clusters and code points and understand how they are combined. Pay attention to the `200D` code points in the breakdown:

<GraphemeClusterInspector initText="👩‍👩‍👧‍👦🏄‍♀️🤼‍♂️🙋‍♀️" />

<div text-sm text-center>

Try hovering over the grapheme clusters or code points to see how they are combined. You can also change the text to inspect any text you want.

</div>

Similar to emojis, some languages also use combining code points to create complex characters. For example, the Tamil letter "நி" (ni) is represented by the base character "ந" (na) and the combining vowel "ி" (i). When these are combined, they form a single grapheme cluster that visually represents the character "நி". Check out the inspector below to see how they break down:

<GraphemeClusterInspector initText="நிกำषिक्षि" /> <!-- cSpell:disable-line -->

## Build a reader

It's relatively easy to split a fixed-length string into grapheme clusters, but in the scenario of streaming, we are looking into a pipe where bytes flow out continuously. In the worst case, we only see a single byte at a time. Furthermore, because of the nature of UTF-8, we cannot safely assume that the bytes we receive are complete for a code point, as a code point can be made up of at most 4 bytes.

To address this, we can use [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder) mentioned earlier. Upon receiving and decoding, we concatenate the decoded string to a buffer, where the grapheme clusters will be composed correctly.

Now that we have a pipeline to assemble the string back from bytes, we should start to worry about how to <b title="Because safety first" underline="~ dotted" cursor-help>safely</b> read grapheme clusters from the string. Luckily, [`Intl.Segmenter`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter) is happy to help. It provides an official way to split a string into grapheme clusters, with awareness of locales in mind. `Intl.Segmenter` is more than a utility for grapheme clusters. It can also segment text into words or sentences, depending on the options you provide.

Let's imagine that we have received some bytes and they were correctly decoded into the following grapheme cluster:

<div flex="~ row items-center justify-center gap-1" overflow="x-scroll">
<GraphemeClusterAssembler :characters="[...'👩‍👧']" />
</div>

By this time, "👩‍👧" (2 people) itself is a grapheme cluster. Can we take it out and start reading the following bytes? Not yet. In fact, if more bytes arrive, the previous grapheme cluster will become "👩‍👧‍👦" (3 people):

<div flex="~ row items-center justify-center gap-1" overflow="x-scroll">
<GraphemeClusterAssembler :characters="['👩‍👧', '‍', '👦']" />
</div>

If we emit the "👩‍👧" (2 people) a step earlier, we will produce an incomplete grapheme cluster, which is not what we are expecting.

## ASAP but safely

In some scenarios, you may want to read these (complete, of course) grapheme clusters out as early as possible. We still use `Intl.Segmenter`, but with a slightly different dequeuing strategy. If we cannot assume whether the current grapheme cluster is complete, we can wait until the next one appears, and emit the ones except the last one:

```ts
declare let clusterBuffer: string
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
while (true) {
  const segments = [...segmenter.segment(clusterBuffer)]
  segments.pop() // Discard the last segment
  for (const seg of segments) {
    yield seg.segment // Emit complete grapheme clusters
  }
}
```

This way, the potentially incomplete grapheme cluster will never be the current one, but the next one. I built another interactive component to demonstrate this:

<CharacterMatcher />

<div text-sm text-center>

You may see how we wait until the second grapheme cluster to appear before emitting the first one.

</div>

## Introducing [Clustr](https://github.com/sumimakito/clustr)

By the time I wrote this DevLog, there are many nice libraries that help you split a string into grapheme clusters for you to choose from. However, among them, I didn't find one that both accepts a stream of UTF-8 bytes and emits grapheme clusters as they arrive. So I built one myself, with the approach described above, which I named [Clustr](https://github.com/sumimakito/clustr) to give it some resonance with the "grapheme cluster" concept in Unicode.

Although the total line count of its core is less than 100, it may help you with your next project where you want to have some fancy text animations from a stream of UTF-8 bytes—like what we did in Project AIRI.

If you are interested in what we're doing in Project AIRI, please check out our GitHub repository at [moeru-ai/airi](https://github.com/moeru-ai/airi)!
