---
title: 소개
description: Project AIRI의 UI를 알아보세요
---

### 한 줄 요약

저희를 이렇게 생각해 주세요.

- [Neuro-sama](https://www.youtube.com/@Neurosama)의 오픈소스 재현
- [Grok Companion](https://news.ycombinator.com/item?id=44566355)의 오픈소스 대안
- Live2D, VRM(3D), 그리고 게임 플레이와 애플리케이션 인식에 특화된 롤플레잉을 지원하는
[SillyTavern](https://github.com/SillyTavern/SillyTavern) 대안

함께 놀고 대화할 수 있는 디지털 생명체(AI 최애 캐릭터), 혹은 디지털 동반자를 가지는 꿈을 꿔본 적 있으신가요?

현대적인 대규모 언어 모델의 힘 덕분에
[Character.ai (일명 c.ai)](https://character.ai)나
[JanitorAI](https://janitorai.com/) 같은 플랫폼, 또는
[SillyTavern](https://github.com/SillyTavern/SillyTavern) 같은 애플리케이션은
채팅 기반이나 비주얼 노벨 같은 경험을 제공하기에 이미 충분한 해법입니다.

> 하지만 게임을 함께 플레이하는 능력은요? 그리고 여러분이 무엇을 코딩하고 있는지 보는 능력은요?
> 게임을 하고 영상을 보면서 대화하고, 그 밖에도 수많은 일을 해낼 수 있는 존재 말이에요.

아마 [Neuro-sama](https://www.youtube.com/@Neurosama)는 이미 알고 계실 겁니다. 그녀는 현재
게임을 하고, 대화하고, 여러분과 (VTuber 커뮤니티의) 참여자들과 상호작용할 수 있는 최고의 동반자이며,
어떤 사람들은 이런 존재를 "디지털 휴먼"이라고 부르기도 합니다.
**아쉽게도 오픈소스가 아니어서, 그녀가 라이브 스트림을 마치고 오프라인이 되면 더 이상 상호작용할 수 없습니다.**

그래서 이 프로젝트 AIRI는 또 다른 가능성을 제시합니다.
**여러분만의 디지털 생명을 언제 어디서나 손쉽게 소유하세요.**

## 시작하기

저희는 웹과 데스크톱을 모두 지원합니다.

<div flex gap-2 w-full justify-center text-xl>
  <div w-full flex flex-col items-center gap-2 border="2 solid gray-500/10" rounded-lg px-2 pt-6 pb-4>
    <div flex items-center gap-2 text-5xl>
      <div i-lucide:app-window />
    </div>
    <span>웹</span>
    <a href="https://airi.moeru.ai/" target="_blank" decoration-none class="text-primary-900 dark:text-primary-400 text-base not-prose bg-primary-400/10 dark:bg-primary-600/10 block px-4 py-2 rounded-lg active:scale-95 transition-all duration-200 ease-in-out">
      열기
    </a>
  </div>
  <div w-full flex flex-col items-center gap-2 border="2 solid gray-500/10" rounded-lg px-2 pt-6 pb-4>
    <div flex items-center gap-2 text-5xl>
      <div i-lucide:laptop />
      /
      <div i-lucide:computer />
    </div>
    <span>데스크톱</span>
    <a href="https://github.com/moeru-ai/airi/releases/latest" target="_blank" decoration-none class="text-primary-900 dark:text-primary-400 text-base not-prose bg-primary-400/10 dark:bg-primary-600/10 block px-4 py-2 rounded-lg active:scale-95 transition-all duration-200 ease-in-out">
      다운로드
    </a>
  </div>
</div>

웹 버전은 모바일 기기를 포함해 어디서나 손쉽게 접근할 수 있습니다.
데스크톱은 VTuber 스트리밍, 컴퓨터 조작, 그리고 AIRI를 돌리기 위해 막대한 양의 토큰 비용을
지불할 필요가 없는 로컬 LLM 접근 등 더 고급 용도에 적합합니다.

<div flex gap-2 w-full flex-col justify-center text-base>
  <a href="../manual/tamagotchi/" w-full flex items-center gap-2 border="2 solid gray-500/10" rounded-lg px-4 py-2>
    <div w-full flex items-center gap-2>
      <div flex items-center gap-2 text-2xl>
        <div i-lucide:laptop />
      </div>
      <span>데스크톱</span>
    </div>
    <div decoration-none class="text-gray-900 dark:text-gray-200 text-base not-prose rounded-lg active:scale-95 transition-all duration-200 ease-in-out text-nowrap">
      사용법 보기
    </div>
  </a>
  <a href="../manual/web/" w-full flex items-center gap-2 border="2 solid gray-500/10" rounded-lg px-4 py-2>
    <div w-full flex items-center gap-2>
      <div flex items-center gap-2 text-2xl>
        <div i-lucide:app-window />
      </div>
      <span>웹</span>
    </div>
    <div class="text-gray-900 dark:text-gray-200 text-base not-prose rounded-lg active:scale-95 transition-all duration-200 ease-in-out text-nowrap">
      사용법 보기
    </div>
  </a>
</div>

## 기여하기

이 프로젝트에 기여하는 방법을 이해하는 데 도움이 되는 가이드는 [기여하기](../contributing/) 페이지를 참고해 주세요.

Project AIRI의 UI를 디자인하고 개선하는 데 도움이 되는 자료는 [디자인 가이드라인](../contributing/design-guidelines/resources) 페이지를 참고해 주세요.
