---
title: DevLog @ 2025.08.01
category: DevLog
date: 2025-08-01
excerpt: |
  Makito가 AIRI에서 텍스트 애니메이션을 구현하다가, UTF-8 바이트 스트림으로 들어오는 grapheme cluster를 다루는 라이브러리를 만들기까지의 여정을 나눕니다.<br /> 유익하고 영감이 되기를 바랍니다!
preview-cover:
  light: "@assets('/en/blog/DevLog-2025.08.01/assets/cover-light.avif')"
  dark: "@assets('/en/blog/DevLog-2025.08.01/assets/cover-dark.avif')"
---

<script setup>
import CharacterMatcher from '../../../en/blog/DevLog-2025.08.01/CharacterMatcher.vue'
import GraphemeClusterAssembler from '../../../en/blog/DevLog-2025.08.01/GraphemeClusterAssembler.vue'
import GraphemeClusterInspector from '../../../en/blog/DevLog-2025.08.01/GraphemeClusterInspector.vue'
import RollingText from '../../../en/blog/DevLog-2025.08.01/RollingText.vue'

// NOTICE:
// These two arrays are hoisted out of the template on purpose.
//
// Written inline as `:characters="['👩‍👧', '‍', '👦']"` — the way the English
// post does it — vue-tsc reports `error TS1005: ',' expected` against an
// unrelated straight double quote much further down the page (the
// "grapheme cluster" in the Clustr section).
//
// The astral-plane emoji inside a template binding expression desynchronise
// Volar's offset mapping for VitePress markdown, so a later plain-text `"`
// ends up parsed as part of a generated TS expression. Escaping the ZWJ or
// editing that prose line only moves the symptom; keeping the surrogate
// pairs out of template expressions is what actually fixes it.
//
// The English post survives by luck, not by construction — its prose happens
// not to place a straight quote at the mis-mapped offset.
//
// Removal condition: drop this once Volar maps surrogate pairs in markdown
// template expressions correctly.
const pairCluster = [...'👩‍👧']
const trioCluster = ['👩‍👧', '‍', '👦']
</script>

## 시작하기 전에

<RollingText text-2xl>
안녕하세요, Makito입니다.

<template #before="{ motionReduced }">
<div text-sm>
<template v-if="!motionReduced">

> 아래 애니메이션은 오른쪽 위의 "모션 줄이기" 토글로 끌 수 있습니다.

</template>
<template v-else>

> **아래 애니메이션이 꺼져 있습니다** <br />
> 오른쪽 위의 "모션 줄이기" 토글로 다시 켤 수 있습니다.

</template>
</div>
</template>
</RollingText>

끝나지 않는 8월이 시작됐습니다… 이 [현실적인 수학 문제](https://oeis.org/A180632/a180632.pdf)로 시간을 보내도 좋겠네요. 앗, 이야기가 샜습니다.

한동안 작업해 오긴 했지만, Project AIRI DevLog에 글을 쓰는 건 이번이 처음입니다.

이 글에서는 AIRI에서 텍스트 애니메이션을 구현하다가 UTF-8 바이트 스트림으로 들어오는 grapheme cluster를 다루는 라이브러리를 만들기까지의 여정을 나눠 보겠습니다. 유익하고 영감이 되기를 바랍니다!

## 배경

최근 [Anime.js](https://animejs.com/) 가 v4.10에서 새로운 [텍스트 유틸리티](https://animejs.com/documentation/text)를 공개하며, 텍스트 애니메이션을 돕는 유틸리티 함수 모음을 제공하기 시작했습니다(위 예시처럼요). 이 업데이트는 Anime.js가 오랫동안 비워 두었던 자리를 확실히 채워 줍니다. 이전에는 애니메이션을 위해 텍스트를 직접 글자 단위로 쪼개거나, 내부적으로 Anime.js를 쓰는 [splt](https://www.spltjs.com/) 같은 라이브러리, 또는 [GSAP](https://gsap.com/) 와 함께 쓰는 [SplitText](https://gsap.com/docs/v3/Plugins/SplitText/) 에 기대야 했습니다.

텍스트 애니메이션은 UI에서 메시지를 멋지게 등장시킬 때 특히 유용합니다. 보통 메시지는 완성된 형태로 도착하므로, 받은 텍스트를 글자로 쪼개서 애니메이션을 주기만 하면 됩니다.

Project AIRI에서는 [@nekomeowww](https://github.com/nekomeowww)도 모션 효과가 들어간 애니메이션 채팅 말풍선 컴포넌트를 만들었습니다:

<video controls muted autoplay loop max-w="500px" w-full mx-auto>
  <source src="/en/blog/DevLog-2025.08.01/assets/animated-chat-bubble.mp4">
</video>

<div text-sm text-center>

[저희 UI 스토리북](https://airi.moeru.ai/ui/#/story/src-components-gadgets-chatbubbleminimalism-story-vue?variantId=chat)에서 확인해 보세요

</div>

그런데 UTF-8 바이트 스트림을 읽으면서 도착하는 대로 애니메이션을 주고 싶다면 어떨까요? 채팅이나 음성 전사 앱처럼 실시간 애플리케이션에서 흔한 상황입니다. UI가 받은 만큼 한 글자씩 텍스트를 표시하는 거죠.

## 한 글자씩?

여기서 "글자"란 무엇으로 봐야 할까요? 유니코드에서 의미를 갖는 가장 작은 텍스트 단위는 보통 [코드 포인트](https://www.unicode.org/versions/Unicode14.0.0/ch02.pdf#G25564)입니다. 하지만 인코딩 수준에서는, 특히 UTF-8에서는 코드 포인트 하나가 여러 바이트에 걸칠 수 있습니다. 예를 들어 "あ"(일본어 히라가나 A)는 코드 포인트 `U+3042`에 대응하고, UTF-8에서는 바이트 시퀀스 `0xE3 0x81 0x82`로 인코딩됩니다. 즉 바이트 스트림을 읽을 때는 모든 바이트가 도착하기 전까지 완전한 글자를 갖지 못할 수 있다는 뜻입니다.

걱정 마세요. Web API [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder)가 도와줍니다. `TextDecoder.decode`를 `stream` 옵션과 함께 쓰면 디코더가 청크 단위로 도착하는 데이터를 처리해 주어, 부분적인 글자도 올바르게 디코딩할 수 있습니다.

```javascript
const decoder = new TextDecoder()
const decoded = decoder.decode(chunk, { stream: true })
```

## 이제 안전할까요?

요약: **꼭 그렇지는 않습니다**.

TextDecoder는 바이트 스트림을 유니코드 코드 포인트, 즉 글자로 올바르게 디코딩해 줍니다. 하지만 유니코드에는 여러 코드 포인트를 하나의 "시각적" 글자로 묶는 "grapheme cluster"라는 개념이 또 있습니다. 예를 들어 이모지 "👩‍👩‍👧‍👦"(가족)는 여러 코드 포인트로 표현되지만 시각적으로는 한 글자로 취급됩니다. 내부적으로 "👩‍👩‍👧‍👦" 의 코드 포인트들은 코드가 `U+200D` 인 zero-width joiner(ZWJ)로 연결되어 있습니다.

상상하기 어려울 수 있습니다. 걱정 마세요. grapheme cluster와 코드 포인트를 살펴보고 어떻게 결합되는지 이해할 수 있도록 간단한 인터랙티브 인스펙터를 만들었습니다. 분해 결과에서 `200D` 코드 포인트를 눈여겨보세요:

<GraphemeClusterInspector initText="👩‍👩‍👧‍👦🏄‍♀️🤼‍♂️🙋‍♀️" />

<div text-sm text-center>

grapheme cluster나 코드 포인트에 마우스를 올려 어떻게 결합되는지 확인해 보세요. 원하는 텍스트로 바꿔서 살펴볼 수도 있습니다.

</div>

이모지와 비슷하게, 어떤 언어들은 결합용 코드 포인트로 복잡한 글자를 만듭니다. 예를 들어 타밀 문자 "நி"(ni)는 기본 문자 "ந"(na)와 결합 모음 "ி"(i)로 표현됩니다. 이 둘이 결합되면 "நி" 라는 글자를 시각적으로 나타내는 하나의 grapheme cluster가 됩니다. 아래 인스펙터에서 어떻게 분해되는지 확인해 보세요:

<GraphemeClusterInspector initText="நிกำषिक्षि" /> <!-- cSpell:disable-line -->

## 리더 만들기

길이가 정해진 문자열을 grapheme cluster로 쪼개는 건 비교적 쉽지만, 스트리밍 상황에서는 바이트가 끊임없이 흘러나오는 파이프를 들여다보게 됩니다. 최악의 경우 한 번에 1바이트씩만 볼 수도 있습니다. 게다가 UTF-8의 특성상, 코드 포인트 하나가 최대 4바이트로 이루어질 수 있으므로 받은 바이트가 코드 포인트로서 완전하다고 안전하게 가정할 수 없습니다.

이를 해결하려면 앞서 언급한 [TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder)를 쓰면 됩니다. 데이터를 받아 디코딩할 때마다 디코딩된 문자열을 버퍼에 이어 붙이면, 그 안에서 grapheme cluster가 올바르게 구성됩니다.

바이트에서 문자열을 다시 조립하는 파이프라인이 생겼으니, 이제 그 문자열에서 grapheme cluster를 어떻게 <b title="안전이 제일이니까요" underline="~ dotted" cursor-help>안전하게</b> 읽어낼지 고민할 차례입니다. 다행히 [`Intl.Segmenter`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter)가 기꺼이 도와줍니다. 로케일을 고려하면서 문자열을 grapheme cluster로 쪼개는 공식적인 방법을 제공하죠. `Intl.Segmenter`는 grapheme cluster 전용 도구를 넘어, 옵션에 따라 텍스트를 단어나 문장 단위로 나눌 수도 있습니다.

바이트를 좀 받아서 다음과 같은 grapheme cluster로 올바르게 디코딩했다고 상상해 봅시다:

<div flex="~ row items-center justify-center gap-1" overflow="x-scroll">
<GraphemeClusterAssembler :characters="pairCluster" />
</div>

이 시점에서 "👩‍👧"(2인) 자체는 하나의 grapheme cluster입니다. 이걸 꺼내고 다음 바이트를 읽기 시작해도 될까요? 아직입니다. 실제로 바이트가 더 도착하면 앞의 grapheme cluster는 "👩‍👧‍👦"(3인)가 됩니다:

<div flex="~ row items-center justify-center gap-1" overflow="x-scroll">
<GraphemeClusterAssembler :characters="trioCluster" />
</div>

"👩‍👧"(2인)를 한 스텝 일찍 내보내면 불완전한 grapheme cluster를 만들어 내게 되는데, 이건 우리가 원하는 게 아닙니다.

## 최대한 빨리, 그러나 안전하게

어떤 상황에서는 (물론 완전한) grapheme cluster를 가능한 한 빨리 읽어내고 싶을 수 있습니다. 여전히 `Intl.Segmenter`를 쓰되, 큐에서 꺼내는 전략만 살짝 바꿉니다. 현재 grapheme cluster가 완전한지 확신할 수 없다면, 다음 것이 나타날 때까지 기다렸다가 마지막 하나를 제외하고 내보내면 됩니다:

```ts
declare let clusterBuffer: string
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
while (true) {
  const segments = [...segmenter.segment(clusterBuffer)]
  segments.pop() // 마지막 세그먼트는 버린다
  for (const seg of segments) {
    yield seg.segment // 완전한 grapheme cluster 만 내보낸다
  }
}
```

이렇게 하면 불완전할 수 있는 grapheme cluster는 결코 현재 것이 아니라 항상 다음 것이 됩니다. 이를 보여 주는 인터랙티브 컴포넌트를 하나 더 만들었습니다:

<CharacterMatcher />

<div text-sm text-center>

두 번째 grapheme cluster가 나타날 때까지 기다렸다가 첫 번째 것을 내보내는 모습을 볼 수 있습니다.

</div>

## [Clustr](https://github.com/sumimakito/clustr) 소개

이 DevLog를 쓰는 시점에도 문자열을 grapheme cluster로 쪼개 주는 좋은 라이브러리는 여럿 있습니다. 하지만 그중에 UTF-8 바이트 스트림을 받아서 도착하는 대로 grapheme cluster를 내보내 주는 건 찾지 못했습니다. 그래서 위에서 설명한 방식으로 직접 하나 만들었고, 유니코드의 "grapheme cluster" 개념과 어감을 맞추려고 [Clustr](https://github.com/sumimakito/clustr)라고 이름 붙였습니다.

핵심 코드는 총 100줄도 되지 않지만, UTF-8 바이트 스트림으로부터 멋진 텍스트 애니메이션을 만들고 싶은 다음 프로젝트에서 — Project AIRI에서 저희가 한 것처럼 — 도움이 될지도 모릅니다.

Project AIRI에서 저희가 하는 일이 궁금하시다면 GitHub 저장소 [moeru-ai/airi](https://github.com/moeru-ai/airi)를 확인해 보세요!
