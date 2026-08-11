---
title: DevLog @ 2025.03.10
category: DevLog
date: 2025-03-10
---

<script setup>
import customizableThemeColors from '../../../en/blog/DevLog-2025.03.10/assets/customizable-theme-colors.mp4'
</script>

## 데자뷔

지난 금요일(3월 7일)에는 AIRI 스테이지 UI와 설정 UI의 새로운 느낌을 디자인하고 다듬어 보려 했는데,
DevStream이 끝날 무렵에야 마침내 아이디어가 떠올랐습니다.

## 낮 시간

3월 7일부터 새 설정 UI 구현을 시작했습니다. 이 기간에 많은 진전을 이뤘습니다.

[@LemonNekoGH](https://github.com/LemonNekoGH),
[@sumimakito](https://github.com/sumimakito),
[@kwaa](https://github.com/kwaa),
[@luoling8192](https://github.com/luoling8192),
[@junkwarrior87](https://github.com/junkwarrior87)이 함께 도와주었습니다.

설정 디자인의 기본 버전을 먼저 완성한 건 저였는데, 이런 느낌입니다:

![](/en/blog/DevLog-2025.03.10/assets/new-ui-v1.avif)

![](/en/blog/DevLog-2025.03.10/assets/new-ui-v1-dark.avif)

이후 [@sumimakito](https://github.com/sumimakito)가 접속해서 버튼의 점선 효과 구현을 도와주었습니다:

![](/en/blog/DevLog-2025.03.10/assets/new-ui-v2.avif)

> 이제 메뉴에서 더 리듬감이 느껴지지 않나요?!

개발 중에 현재 `packages/` 디렉터리 아래에 있는 패키지들 중 일부가 사실 Project AIRI의
워크플로에도 들어 있지 않은 독립적인 패키지라는 걸 알게 됐습니다.

즉 이들을 다른 곳으로 옮겨서 메인 저장소
[airi](https://github.com/moeru-ai/airi)의 설치 용량과 빌드 과정을 단순화할 수 있다는 뜻입니다.

> 어디로 옮기지?

좋은 질문입니다! 이미 GitHub에 [`@proj-airi`](https://github.com/proj-airi) 조직을 등록해 두었고,
많은 패키지와 정적 애플리케이션이 Moeru AI에도 그리 쓸모 있지 않았으니
[`@proj-airi`](https://github.com/proj-airi)로 옮기면 되겠죠.

그래서 일부 패키지와 애플리케이션을 [`@proj-airi`](https://github.com/proj-airi) 조직으로
옮겼습니다! 한번 확인해 보세요:

- https://github.com/proj-airi/webai-examples : WebGPU 및 관련 기술로 데모를 만들기 위한 곳입니다.
- https://github.com/proj-airi/lobe-icons : [Lobe Icons](https://github.com/lobehub/lobe-icons)를
  Iconify JSON과 UnoCSS에서 쓸 수 있게 포팅한 것입니다.

이 두 저장소는 지금처럼 계속 오픈소스로 MIT 라이선스를 유지하니 걱정 마세요.

3월 8일에는 [@junkwarrior87](https://github.com/junkwarrior87)이 접속해서 스테이지의 파도
애니메이션을 순수 CSS로 만들어 주었습니다!

> 이건 정말 말도 안 됩니다. 가능할 거라고는 생각도 못 했어요.

커밋들을 살펴보며 배워 보세요:

- https://github.com/moeru-ai/airi/pull/54
- https://github.com/moeru-ai/airi/pull/55
- https://github.com/moeru-ai/airi/pull/65

스테이지의 파도 애니메이션을 고치고 개선해 준 [@sumimakito](https://github.com/sumimakito)와
[@junkwarrior87](https://github.com/junkwarrior87)에게 정말 감사드립니다.

3월 8일 끝 무렵에는 [@LemonNekoGH](https://github.com/LemonNekoGH)와
[@junkwarrior87](https://github.com/junkwarrior87) 덕분에 스테이지 전체의 색을 커스터마이즈할 수
있게 됐습니다! (이게 몇 시간 만에 될 줄은 정말 몰랐습니다...)

<ThemedVideo controls muted :src="customizableThemeColors" />

- https://github.com/moeru-ai/airi/pull/53
- https://github.com/moeru-ai/airi/pull/60
- https://github.com/moeru-ai/airi/pull/61
- https://github.com/moeru-ai/airi/pull/63

심지어 로고까지 커스터마이즈한 색을 따라가게 만들었습니다 🤯.

> 이 3일 동안 훨씬 더 많은 개선이 있었습니다. 멋진 컨트리뷰터들이 별도의 DevLog로 생각을
> 나누고 싶어 할지도 모르니 기대해 주세요!

이것이 최종 결과입니다. 한번 써 보세요!

![](/en/blog/DevLog-2025.03.10/assets/new-ui-v3.avif)

![](/en/blog/DevLog-2025.03.10/assets/new-ui-v3-dark.avif)

그리고 언제나처럼, 저희에게 기여하러 오시는 걸 환영합니다! 프로그래밍과 코딩에 익숙하지
않은 분들께도 저희는 열려 있고 친절합니다!

아, 하마터면 빠뜨릴 뻔했네요... [@junkwarrior87](https://github.com/junkwarrior87)이
이전에 [@LemonNekoGH](https://github.com/LemonNekoGH)가 보여 준, 색상 hue가 RGB 스펙트럼
전체를 훑으며 빛나는 기능을 살려 두었습니다. 이름은 "I Want It Dynamic!" 입니다
(**RGB ON** 기능이라고 생각하시면 됩니다 😂):

- https://github.com/moeru-ai/airi/pull/64

## DevStream

요 며칠 꽤 바빴던 탓에 😭 DevStream은 없었습니다.

오늘의 DevLog는 여기까지입니다. DevStream에 참여해 끝까지 함께해 주신 모든 분께 감사드립니다.
내일 또 만나요.
