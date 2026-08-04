---
title: DevLog @ 2025.08.01
category: DevLog
date: 2025-08-01
excerpt: |
  Makito shares how she implemented text animations in AIRI, and how to build a library that reads out "grapheme clusters" from a UTF-8 byte stream as they arrive. Hope it inspires you!
preview-cover:
  light: "/blog/DevLog-2025.08.01/assets/cover-light.avif"
  dark: "/blog/DevLog-2025.08.01/assets/cover-dark.avif"
---


<script setup>
import CharacterMatcher from '../../../en/blog/DevLog-2025.08.01/CharacterMatcher.vue'
import GraphemeClusterAssembler from '../../../en/blog/DevLog-2025.08.01/GraphemeClusterAssembler.vue'
import GraphemeClusterInspector from '../../../en/blog/DevLog-2025.08.01/GraphemeClusterInspector.vue'
import RollingText from '../../../en/blog/DevLog-2025.08.01/RollingText.vue'
</script>


## Before We Start


<RollingText text-2xl>
Hello~ I am Makito
<template #before="{ motionReduced }">
<div text-sm>
<template v-if="!motionReduced">
> The animation below can be toggled with the "Reduce Motion" switch in the top right corner
</template>
<template v-else>
> **The animation below is turned off** <br />
> You can turn it back on with the "Reduce Motion" switch in the top right corner
</template>
</div>
</template>
</RollingText>


The endless August has begun; maybe you can pass the time with this [realistic math problem](https://oeis.org/A180632/a180632.pdf). Sorry... I digress.


Although I have been involved with Project AIRI for a long time, this is my first time posting on the DevLog.


In this article, I will share how I implemented text animations in AIRI, and how to build a library that reads out "grapheme clusters" from a UTF-8 byte stream as they arrive. Hope it inspires you!


## Background


Recently, [Anime.js](https://animejs.com/) released brand new [text utilities](https://animejs.com/documentation/text) in v4.10, providing a series of handy tools for text animations (like the animation above). This update also filled the gap of Anime.js in the text animation direction. Previously, I had to manually split text into individual characters for animation, or rely on libraries like [splt](https://www.spltjs.com/) (which also uses Anime.js under the hood), or use the [SplitText](https://gsap.com/docs/v3/Plugins/SplitText/) plugin in [GSAP](https://gsap.com/).


Text animations allow chat messages to appear in the UI in a more impressive way. In general, messages arrive complete, so we only need to split the received text into characters and animate them.


In Project AIRI, our partner [@nekomeowww](https://github.com/nekomeowww) also made a silky smooth chat bubble component:


<video controls muted autoplay loop max-w="500px" w-full mx-auto>
  <source src="/blog/DevLog-2025.08.01/assets/animated-chat-bubble.mp4" />
</video>

<div text-sm text-center>
Welcome to check it out in [our UI storybook](https://airi.moeru.ai/ui/#/story/src-components-gadgets-chatbubbleminimalism-story-vue?variantId=chat)
</div>


But what if we want to read a UTF-8 byte stream and animate the received text in real time? This is common in real-time applications, such as chat or speech transcription apps, whose UI needs to display content character by character as it arrives.


## The "Character" Boundary


In this scenario, what counts as a "character"? In Unicode, the smallest meaningful unit of text is usually the [code point](https://www.unicode.org/versions/Unicode14.0.0/ch02.pdf#G25564). But at the encoding level, especially in UTF-8, a code point may consist of multiple bytes. For example, the Japanese kana 「あ」 corresponds to code point `U+3042`, encoded as `0xE3 0x81 0x82` in UTF-8. That is to say, when reading a byte stream, only when all the bytes have arrived can the complete character be restored.


Don't worry — we also have the Web API [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder). Using `TextDecoder.decode` with the `stream` option, the decoder will automatically handle streaming data and correctly restore the characters:

```javascript

const decoder = new TextDecoder()

const decoded = decoder.decode(chunk, { stream: true })

```


## Is This Safe?


TL;DR: **No**.


TextDecoder can indeed help us decode a byte stream correctly into Unicode code points (characters). But in Unicode, there is also the concept of the "grapheme cluster", which combines multiple code points into a single "visually" unified character. For example, the Emoji 「👩‍👩‍👧‍👦」(family) is actually made up of multiple code points at the underlying level, but visually it is one character. They are connected by the zero-width joiner (ZWJ, code point `U+200D`).


This may be a bit hard to understand. But don't worry — I made an interactive little component to help you explore how grapheme clusters and code points combine. Notice the `200D` code points in the split results:


<GraphemeClusterInspector initText="👩‍👩‍👧‍👦🏄‍♀️🤼‍♂️🙋‍♀️" />

<div text-sm text-center>
You can hover over the grapheme clusters or characters to see how they combine, and you can also enter any text.
</div>


Like Emoji, some languages also use combining code points to construct complex characters. For example, the Tamil 「நி」(ni) consists of the base character 「ந」(na) and the combining vowel 「 ி」(i). When combined, they form a single 「நி」 grapheme cluster. Let's split similar grapheme clusters:


<GraphemeClusterInspector initText="நிกำषिक्षि" /> <!-- cSpell:disable-line -->


## Building a "Reader"


For fixed-length strings, splitting grapheme clusters is actually simple. But in a streaming scenario, we are facing a "pipeline" of continuously flowing bytes, and in the most extreme case, only one byte arrives at a time. Also, due to the nature of UTF-8, we cannot assume that the received bytes always form a complete code point (a code point is at most 4 bytes).


To solve this problem, we can use the [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder) mentioned earlier. Each time bytes are received and decoded, we append the decoded string to a buffer, and the grapheme clusters can be assembled naturally.


Now that we can assemble bytes into characters or grapheme clusters, the next step is to consider how to <b title="Safety first" underline="~ dotted" cursor-help>safely</b> read grapheme clusters. Fortunately, we still have `Intl.Segmenter`, a Web API that splits strings into grapheme clusters and supports multiple languages. `Intl.Segmenter` is not just for grapheme clusters; it can also split text into words or sentences depending on the options you provide.


Suppose we received some bytes and, after correct decoding, got the following grapheme clusters:

<div flex="~ row items-center justify-center gap-1" overflow="x-scroll">
<GraphemeClusterAssembler :characters="[...'👩‍👧']" />
</div>


At this point, 「👩‍👧」(two people) is itself a grapheme cluster. Can we directly take it out and start reading the following bytes? No way. If more bytes arrive, the previous grapheme cluster will become 「👩‍👧‍👦」(three people):

<div flex="~ row items-center justify-center gap-1" overflow="x-scroll">
<GraphemeClusterAssembler :characters="['👩‍👧', '‍', '👦']" />
</div>


If we output 「👩‍👧」 early, we get an incomplete grapheme cluster, which is not what we want.


## Efficiency First


In some scenarios, we want to output these (of course, complete) grapheme clusters as early as possible. We still use `Intl.Segmenter`, but slightly adjust the dequeuing strategy: if we cannot be sure whether the current grapheme cluster is complete, we wait for the next one to appear and output all except the last one:

```ts

declare let clusterBuffer: string

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

while (true) {

  const segments = [...segmenter.segment(clusterBuffer)]

  segments.pop() // discard the last grapheme cluster

  for (const seg of segments) {

    yield seg.segment // output the complete grapheme cluster

  }

}

```


In this way, incomplete grapheme clusters are never output early; they are only processed when the next one appears. I also made an interactive little component to demonstrate this process:


<CharacterMatcher />

<div text-sm text-center>
As you can see, we wait until the second grapheme cluster appears before considering the first one complete.
</div>


## The Birth of [Clustr](https://github.com/sumimakito/clustr)


While writing this DevLog, there were already many libraries in the community that can split strings into grapheme clusters. But I could not find one that accepts a UTF-8 byte stream and outputs grapheme clusters as they arrive. So I implemented one myself, shared the idea with everyone, and named it [Clustr](https://github.com/sumimakito/clustr), echoing Unicode's "grapheme cluster" concept.


Although its core code is less than 100 lines, if you also want to turn UTF-8 byte streams into cool text animations in your project (like we do in Project AIRI), it might help you.


If you are interested in Project AIRI, you are also welcome to check out our GitHub repository [moeru-ai/airi](https://github.com/moeru-ai/airi)!

