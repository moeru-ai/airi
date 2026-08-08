---
title: DevLog @ 2025.03.05
category: DevLog
date: 2025-03-05
---

## 데자뷔

어제는 WebGPU 작업을 돕기 위해 [`gpuu` (GPU utilities)](https://github.com/moeru-ai/gpuu)
라는 패키지를 하나 추가했습니다. 어쩌면 이걸로 실제 GPU 장치와도 상호작용할 수 있을 겁니다.
지금은 할 수 있는 게 그리 많지 않지만 앞으로 기능을 더 추가할 예정입니다.

이런 느낌입니다:

```ts
import { check } from 'gpuu/webgpu'
import { onMounted } from 'vue'

onMounted(async () => {
  const result = await check()
  console.info(result)

  // 결과로 무언가를 한다
})
```

지난주에는 저희 협력 디자이너/아티스트가 Project AIRI 로고의 기본/첫 버전 커미션을
제출해 주었습니다. 로고의 느낌은 이렇습니다:

![](/en/blog/DevLog-2025.03.05/assets/airi-logos-v1.avif)

## 낮 시간

디자인 관점에서 보면 이 로고들은 홈 화면 앱 크기로 줄였을 때 너무 복잡하고
사용자 친화적이지 않았습니다. 그래서 이런 버전을 추가했습니다:

![](/en/blog/DevLog-2025.03.05/assets/airi-logo-v2.avif)

그리고 다른 변형들도 만들어 봤습니다:

![](/en/blog/DevLog-2025.03.05/assets/airi-logos-v2.avif)

이들은 전부 다크 테마에만 어울렸습니다. "다크 테마용 로고도 필요하잖아!" 라는 생각이 들어
이렇게 만들었습니다:

![](/en/blog/DevLog-2025.03.05/assets/airi-logo-v2-dark.avif)

[@kwaa](https://github.com/kwaa)가 두 테마의 색 구성을 서로 바꿔 보자고 제안했습니다:

![](/en/blog/DevLog-2025.03.05/assets/airi-logos-v3.avif)

확실히 더 나아 보이네요.

타이포그래피도 업데이트했습니다:

![](/en/blog/DevLog-2025.03.05/assets/airi-logos-v4.avif)

그리고 배경색을 다듬었습니다:

![](/en/blog/DevLog-2025.03.05/assets/airi-logos-v5.avif)

그래서 최종적으로 나온 결과가 이겁니다:

![](/en/blog/DevLog-2025.03.05/assets/airi-logos-final.avif)

오늘 늦게는 Project AIRI의 [문서 사이트](https://airi.build)를 온라인에 배포하는 작업을 했습니다.
저와 다른 개발자, 아티스트들이 참고 자료와 가이드라인으로 쓸 수 있도록요.

해냈습니다! 새로 디자인한 로고를 컬러 팔레트와 함께 [문서 사이트](https://airi.build)에 올렸습니다:

![](/en/blog/DevLog-2025.03.05/assets/airi-build-light.avif)
![](/en/blog/DevLog-2025.03.05/assets/airi-build-dark.avif)

[기본 가이드](../guides/),
[기여 가이드라인](../references/contributing/guide/),
[디자인 가이드라인](../references/design-guidelines/)
이 이 시점부터 모두 포함됐습니다.

점심 내내 YouTube의 Text PV 애니메이션을 감상하며 감을 잡았습니다.
정말 좋아하는 스타일이라, 브라우저에서도 비슷한 전환 효과를 구현할 수 있으면 좋겠습니다!

https://www.youtube.com/watch?v=_AIgv0EsOE4

다행히 이걸 정말 잘하는 개발자이자 아티스트를 알고 있습니다:
[yui540](https://github.com/yui540) (개인 사이트는 여기서 볼 수 있습니다: [yui540.com](https://yui540.com)).
마침 자신이 사용한 환상적인 전환 효과를 보여 주는 새 저장소를 막 공개했더군요.

관련 자료와 웹사이트 링크를 [https://airi.build](https://airi.build) 사이트에 추가해 두었으니 확인해 보세요.

## DevStream

[yui540](https://github.com/yui540)의 [저장소](https://github.com/yui540/css-animations)에 있는
애니메이션 전환을 상당수 [https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/)
로 포팅했습니다.

정말 잘 동작했습니다:

![](/en/blog/DevLog-2025.03.05/assets/animation-transitions.gif)

오늘의 DevLog는 여기까지입니다. DevStream에 참여해 끝까지 함께해 주신 모든 분께 감사드립니다.
내일 또 만나요.
