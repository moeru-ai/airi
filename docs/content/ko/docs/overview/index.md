---
title: 이 프로젝트는 무엇인가요?
description: Project AIRI의 사용자 인터페이스 이해하기
---

### TL;DR

다음과 같이 생각해주세요:

- [Neuro-sama](https://www.youtube.com/@Neurosama)의 오픈소스 재구현
- [Grok Companion](https://news.ycombinator.com/item?id=44566355)의 오픈소스 대안
- Live2D, VRM을 지원하고, 함께 게임을 하거나 다른 앱을 인식하는 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 대안

사이버 생명체(사이버 와이푸/허스밴드)나
당신과 함께 놀고 채팅할 수 있는 디지털 동반자를 꿈꿔본 적이 있나요?

현대 LLM의 강력한 힘으로,
[Character.ai (일명 c.ai)](https://character.ai)나 [JanitorAI](https://janitorai.com/) 같은 플랫폼,
또는 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 같은 앱은 이미 채팅 기반이나 비주얼 ADV 게임 경험을 위한 충분히 완성된 솔루션을 제공합니다.

> 하지만 게임은 어떨까요? 또는 당신이 무엇을 코딩하고 있는지 보는 건?
> 게임을 하면서 채팅하고, 비디오를 보며, 다른 많은 일들을 할 수 있는 건?

아마 [Neuro-sama](https://www.youtube.com/@Neurosama)를 이미 아실 텐데, 그녀는 현재 최고의 디지털 동반자로 게임을 하고, 채팅하며, 당신과 (VTuber 커뮤니티의) 참가자들과 상호작용할 수 있습니다. 어떤 이들은 이런 존재를 "디지털 휴먼"이라고도 부릅니다. **안타깝게도, 아직 오픈소스가 아니며, 라이브 스트림이 오프라인이 되면 그녀와 상호작용할 수 없습니다**.

따라서 Project AIRI는 다른 가능성을 제공합니다:
**언제 어디서나 쉽게 당신만의 디지털 라이프, 사이버 생명을 소유할 수 있게 합니다**.

## 시작하기

웹과 클라이언트를 모두 지원합니다.

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
    <span>클라이언트</span>
    <a href="https://github.com/moeru-ai/airi/releases/latest" target="_blank" decoration-none class="text-primary-900 dark:text-primary-400 text-base not-prose bg-primary-400/10 dark:bg-primary-600/10 block px-4 py-2 rounded-lg active:scale-95 transition-all duration-200 ease-in-out">
      다운로드
    </a>
  </div>
</div>

웹 버전은 기능이 기본적이지만 모든 디바이스(모바일 포함)에서 접근할 수 있습니다.

클라이언트는 VTuber 스트리밍, computer-use, 로컬 LLM 모델 접근과 같은 고급 작업에 더 적합하며, AIRI 실행을 위해 많은 토큰 비용을 지불할 필요가 없습니다.

<div flex gap-2 w-full flex-col justify-center text-base>
  <a href="../overview/guide/tamagotchi/" w-full flex items-center gap-2 border="2 solid gray-500/10" rounded-lg px-4 py-2>
    <div w-full flex items-center gap-2>
      <div flex items-center gap-2 text-2xl>
        <div i-lucide:laptop />
      </div>
      <span>클라이언트</span>
    </div>
    <div decoration-none class="text-gray-900 dark:text-gray-200 text-base not-prose rounded-lg active:scale-95 transition-all duration-200 ease-in-out text-nowrap">
      사용법은?
    </div>
  </a>
  <a href="../overview/guide/web/" w-full flex items-center gap-2 border="2 solid gray-500/10" rounded-lg px-4 py-2>
    <div w-full flex items-center gap-2>
      <div flex items-center gap-2 text-2xl>
        <div i-lucide:app-window />
      </div>
      <span>웹</span>
    </div>
    <div class="text-gray-900 dark:text-gray-200 text-base not-prose rounded-lg active:scale-95 transition-all duration-200 ease-in-out text-nowrap">
      사용법은?
    </div>
  </a>
</div>

## 기여

이 프로젝트에 기여하는 방법에 대한 가이드는 [기여](../overview/contributing/) 페이지를 참조하세요.

Project AIRI 사용자 인터페이스를 설계하고 개선하는 방법에 대한 참고 자료는 [디자인 가이드라인](../overview/contributing/design-guidelines/resources) 페이지를 참조하세요.
