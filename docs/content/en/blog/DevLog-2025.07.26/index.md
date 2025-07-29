---
title: DevLog @ 2025.07.26
category: DevLog
date: 2025-07-26
---

<script setup>
import RollingText from './RollingText.vue'
import GraphemeClusterAssembler from './GraphemeClusterAssembler.vue'
import GraphemeClusterInspector from './GraphemeClusterInspector.vue'
</script>

## Before we start

<RollingText text-2xl>
Hello, this is Makito.

<template #before="{ motionReduced }">
<div text-sm>
<template v-if="!motionReduced">

> **AIRI is working towards being a11y-friendly!** <br />
> Animations in this post can be turned off with the "Reduce Motion" toggle in the top-right corner.

</template>
<template v-else>

> **Animations are turned off.** <br />
> You can turn them on with the "Reduce Motion" toggle in the top-right corner.

</template>
</div>
</template>
</RollingText>

This is my first post on Project AIRI's DevLog, despite I have been working on it for a while.

In this post, I will share my journey from implementing text animations in AIRI to building a library to handle grapheme clusters arrives in a stream of UTF-8 bytes. I hope you find it informative and inspiring!

## Background

Recently, [Anime.js](https://animejs.com/) released its new [text utilities](https://animejs.com/documentation/text) in v4.10, providing a collection of utility functions to help with text animations (as shown above). This update indeed fills a gap Anime.js has had for a while. Previously, I had to manually split text into individual characters for animation, or rely on some libraries like [splt](https://www.spltjs.com/)—which uses Anime.js under the hood—or [SplitText](https://gsap.com/docs/v3/Plugins/SplitText/) in combination with [GSAP](https://gsap.com/).

Text animations are especially useful for making messages appear in a fancy way in the UI. Typically, messages received fully formed, so we only need to split the received text into characters and animate them.

However, what if we want to read a stream of UTF-8 bytes and animate them as they arrive? This is common in real-time applications, such as chat or audio transcription apps–the UI displays text as it is received, character by character.

## Character by character?

What should be considered a "character" in this context? In Unicode, the smallest meaningful unit of text is typically a [code point](https://www.unicode.org/versions/Unicode14.0.0/ch02.pdf#G25564). However, at the encoding level—especially in UTF-8—a single code point can span multiple bytes. For example, the character "あ" (the Japanese Hiragana letter A) corresponds to the code point `U+3042`, which is encoded as the byte sequence `0xE3 0x81 0x82` in UTF-8. This means that when reading a byte stream, we may not have a complete character until all its bytes are available.

Don't worry, the Web API [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder) is there to help. By using `TextDecoder.decode` with the `stream` option, the decoder will handle data that arrives in chunks, allowing us to decode partial characters correctly.

```javascript
const decoder = new TextDecoder()
const decoded = decoder.decode(chunk, { stream: true })
```

## Are we safe?

tl;dr: **Not exactly**.

TextDecoder can help us decode a stream of bytes into Unicode code points, or the characters, correctly. Nevertheless, in Unicode, there's another "grapheme cluster" concept, which combines multiple code points into a single "visual" character. For example, the emoji "👩‍👩‍👧‍👦" (family) is represented by multiple code points but is visually treated as a single character. Under the hood, the code points in "👩‍👩‍👧‍👦" are joined together using zero-width joiners (ZWJs), whose code is `U+200D`.

This could be hard to imagine. Don't worry. I built a simple interactive inspector for you to explore grapheme clusters and code points and understand how they are combined. Pay attention to the `200D` code points in the breakdown:

<GraphemeClusterInspector initText="👩‍👩‍👧‍👦🏄‍♀️🤼‍♂️🙋‍♀️" />

<div text-sm text-center>

Try hovering over the grapheme clusters or code points to see how they are combined. You can also change the text to inspect any text you want.

</div>

Similar to emojis, some languages also use combining code points to create complex characters. For example, the Tamil letter "நி" (ni) is represented by the base character "ந" (na) and the combining vowel "ி" (i). When these are combined, they form a single grapheme cluster that visually represents the character "நி". Check out the inspector below to see how they break down:

<GraphemeClusterInspector initText="நிกำषिक्षि" /> <!-- cSpell:disable-line -->

## Build a reader

It's relatively easy to split a fixed length string into grapheme clusters, but in the scenario of streaming, we are looking into a pipe where bytes flow out continuously. In the worst case, we only see a single byte at a time. Furthermore, because of the nature of UTF-8, we cannot safely assume that the bytes we received are complete for a code point, as a code point can be made up of at most 4 bytes.

To address this, we can use [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder) mentioned earlier. Upon receiving and decoding, we concatenate the decoded string to a buffer, where the grapheme clusters will be composed correctly.

<div flex="~ row items-center justify-center gap-1">
<GraphemeClusterAssembler :characters="[...'👋🏽']" />
</div>

Now that we have a pipeline to assemble the string back from bytes, we should start to worry about how to <b title="Because safety first" underline="~ dotted" cursor-help>safely</b> read grapheme clusters from the string. Luckily, `Intl.Segmenter` is happy to help. It provides an official way to split a string into grapheme clusters, with awareness of locales in mind.

However, let's imagine that we have received some bytes and they were correctly decoded into the following grapheme cluster:

<div flex="~ row items-center justify-center gap-1">
<GraphemeClusterAssembler :characters="[...'👩‍👩‍👧‍👧'].slice(0, 5)" />
</div>

<div flex="~ row items-center justify-center gap-1">
<GraphemeClusterAssembler :characters="['👩‍👩‍👧', '‍', '👦']" />
</div>
