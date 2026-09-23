---
title: DevLog @ 2025.08.05
description: |
  v0.7이 출시됐습니다. Windows를 완전히 지원하고 그 밖에도 많은 기능이 들어갔습니다.
date: 2025-08-04
excerpt: 오래 기다리게 해서 죄송합니다!<br/> v0.7은 7월 초에 나올 예정이었지만, Windows에서 발견한 몇 가지 치명적인 버그와 손봐야 할 것이 많아 지금까지 미뤄졌습니다.
preview-cover:
  light: "@assets('/en/blog/DevLog-2025.08.05/assets/cover-light.avif')"
  dark: "@assets('/en/blog/DevLog-2025.08.05/assets/cover-dark.avif')"
---

<script setup lang="ts">
import airiDemoFadeOnHover from '../../../en/blog/DevLog-2025.08.05/assets/airi-demo-fade-on-hover.mp4'
import airiDemoMove from '../../../en/blog/DevLog-2025.08.05/assets/airi-demo-move.mp4'
import airiDemoResize from '../../../en/blog/DevLog-2025.08.05/assets/airi-demo-resize.mp4'
import airiDemoOnboardingLight from '../../../en/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-light.mp4'
import airiDemoOnboardingDark from '../../../en/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-dark.mp4'
import airiDemoOnboardingMobileLight from '../../../en/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-mobile-light.mp4'
import airiDemoOnboardingMobileDark from '../../../en/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-mobile-dark.mp4'
import airiDocsLight from '../../../en/blog/DevLog-2025.08.05/assets/airi-docs-light.mp4'
import airiDocsDark from '../../../en/blog/DevLog-2025.08.05/assets/airi-docs-dark.mp4'
import Button from '../../../../.vitepress/components/Button.vue'

function handleOpenLatest() {
  window.open('https://github.com/moeru-ai/airi/releases/latest', '_blank')
}
</script>

다시 안녕하세요! [Neko](https://github.com/nekomeowww)입니다.

오래 기다리게 해서 죄송합니다! v0.7은 7월 초에 나올 예정이었지만, 밤잠을 설치게 만든 몇 가지
치명적인 Windows 호환성 문제와 저희가 손대기로 한 변경 범위가 워낙 커서 지금까지 미뤄졌습니다.

<Button @click="handleOpenLatest">
  다운로드
</Button>

그래도 지난 두 달 동안 준비한 것을 드디어 나눌 수 있어 설렙니다.

관심 있으실 만한 지난 블로그 & DevLog 글도 확인해 보세요:

- [DreamLog 0x1](../DreamLog-0x1/)
- [DevLog @ 2025.05.16](../DevLog-2025.05.16/)

지난 세 달이 어땠는지 솔직하게 말씀드리자면:

- [**커밋 391개**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**파일 1017개 변경**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**74,548줄 추가**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**13,930줄 삭제**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)

> 소프트웨어 업계에서 일해 보신 분들에게 이 숫자들은 아무 의미가 없다는 걸 압니다.
> 그저 이번 릴리스에서 저희가 만든 변화가 크다는 것을 보여 줄 뿐이죠.
>
> 걱정 마세요, 이 DevLog에서 주요 내용을 하나씩 안내해 드리겠습니다.

## 마일스톤

v0.7 릴리스와 이 DevLog를 계기로 지금까지 달성한 마일스톤도 몇 가지 언급하고 싶습니다:

- GitHub 스타 1850개를 넘겼습니다! 🎉
- 컨트리뷰터가 40명이 넘습니다! 🫂
- Discord 멤버가 300명이 넘습니다! 👾
- [Hacker News](https://news.ycombinator.com/item?id=44573640)에 저희를 알렸습니다
- [Product Hunt](https://www.producthunt.com/products/airi)에 저희를 알렸습니다
- 2025년 7월 17일 GitHub 트렌딩 `1위` 🏆 를 했습니다

## 기능

### 데스크톱 버전

Tamagotchi는 AIRI 데스크톱 버전의 이름으로, 다른 애플리케이션과 함께 작업을 방해하지 않으면서
바탕화면에서 늘 곁에 있는 별도의 동반자로 실행할 수 있습니다.

이전의 데스크톱 버전은 UI/UX가 충분히 다듬어지지 않은 실험 단계에 가까웠고,
로컬 ASR/STT(음성 인식) 같은 모듈은 쓸 만하지 않았습니다. 오디오 입력 장치 설정도 빠져 있었죠.

하지만 이제 크게 개선됐습니다.

#### Fade on hover™

지난 v0.6 릴리스에서 **Fade on hover™** 기능을 소개했습니다:

> 농담입니다. 저희는 이 프로젝트를 MIT 라이선스로 오픈소스 공개하고 있고, 이 기능에 등록된
> 상표 같은 건 없습니다.

::: tip
**Fade on hover** 기능을 끄는 기본 단축키는 <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="I" inline-block>I</kbd>입니다
:::

<br />

<ThemedVideo autoplay :src="airiDemoFadeOnHover" />

많은 사용자가 커서를 캐릭터 위에 올릴 때마다 창 전체가 흐려지는 이유를 헷갈려 했습니다.
이 기능을 설명하는 문서가 없었던 점, 그리고 이것이 AI 동반자에게 왜 중요하다고 생각하는지
설명하지 못한 점 사과드립니다.

VTuber 애플리케이션 중 Live2D와 VRM 3D 모델을 지원하는 가장 인기 있는 둘은 VTuber Studio와
Warudo입니다. 이들은 VTuber 방송용으로 설계되어서, OBS(Open Broadcaster Software)로 방송할 때
서로 다른 레이어의 요소로 장면을 구성할 수 있기 때문에 창 순서를 걱정할 필요가 없습니다.
모델 창은 항상 투명 배경의 최소화된 창으로 **백그라운드에** 있고 OBS나 다른 방송 캡처 드라이버가
이를 캡처합니다.

AIRI를 VTuber 방송에 쓴다면 Fade on hover 기능이 없어도 괜찮습니다. 하지만 바탕화면 위의
가상 동반자로 함께 지내게 하고 싶다면 곧 이런 점들을 느끼게 됩니다:

- 모델 창을 항상 위에 두도록 설계하면 그 아래 애플리케이션으로 가는 마우스 이벤트를 막아 버립니다.
  우리가 원하는 게 아니죠.
- 모델 창의 표시 여부를 매번 직접 토글해야 한다면, 특히 하던 일에 집중할 때 아주 불편합니다.

그래서 이런 아이디어를 냈습니다. 마우스가 창 위에 올라오면 AIRI 안의 캐릭터가 흐려지고,
마우스 클릭 이벤트는 아래 애플리케이션으로 통과시키는 기능을요.

저는 이 기능을 개인적으로 정말 좋아합니다. 이제 창을 끄거나 순서를 정리할 걱정 없이 어떤
애플리케이션을 쓰든 AIRI의 캐릭터가 곁에 있을 수 있으니까요. AIRI를 개발하는 날이면 웹 버전이든
데스크톱 버전이든 늘 바탕화면에 그녀를 띄워 두고, 터미널과 VSCode/Cursor를 함께 켜 둡니다.

**Fade on hover™**만 업데이트한 건 아닙니다. 데스크톱 버전의 UI/UX도 많이 개선하고
더 쓸 만하도록 기능을 추가했습니다.

#### 이동

**Fade on hover™** 창은 마우스 이벤트를 통과시키기 때문에, 때로는 모델 창을 더 나은 위치,
예컨대 오른쪽 아래나 아래 가운데로 옮기고 싶을 수 있습니다.

드래그 가능한 영역의 모양도 테마에 맞춰 둥근 모서리로 개선했습니다.

::: tip
이동 모드의 기본 단축키는 <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="N" inline-block>N</kbd>입니다
:::

<br />

<ThemedVideo autoplay :src="airiDemoMove" />

이동 모드에 들어가면 드래그 가능한 영역이 나타납니다. 마우스로 옮기는 것 외에도 트레이 메뉴의
Position > Center / Bottom Left / Bottom Right를 쓰는 방법도 있습니다.

#### 크기 조절

모두의 모델 크기가 같지는 않으니, 모델 창의 크기를 조절하는 기능도 중요합니다.

이동 모드와 마찬가지로 크기 조절 테두리 표시에도 둥근 모서리를 적용했고, 아바타 가장자리도
둥글게 다듬었습니다.

::: tip
크기 조절 모드의 기본 단축키는 <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="R" inline-block>R</kbd>입니다
:::

<br />

<ThemedVideo autoplay :src="airiDemoResize" />

#### Resource Island

ASR/STT(음성 인식)와 VAD(음성 활성 감지) 모델을 불러오는 동안 기다리는 건 괴로운 일이라,
Steam이나 Battle.net처럼 모듈과 필요한 파일의 다운로드 진행 상황을 보여 줄 방법을 찾아야 했습니다.

그래서 iOS의 다이내믹 아일랜드에서 영감을 받아 **Resource Island**라는 새 컴포넌트 세트를
디자인했습니다. 떠 있는 형태로 마우스를 올릴 수 있는 위젯이며 모듈의 다운로드·설치 진행 상황을
표시하고, 다운로드가 끝나면 사라집니다.

동작하는 모습을 보세요:

<video autoplay controls muted loop>
  <source src="/en/blog/DevLog-2025.08.05/assets/airi-demo-resource-island.mp4" type="video/mp4">
  브라우저가 video 태그를 지원하지 않습니다.
</video>

준비 중인 모듈로 가는 링크도 들어 있어서, 모듈 링크를 클릭하면 해당 모듈 설정 페이지가 열려
이 모델이나 파일이 왜 필요한지 확인할 수 있습니다.

#### 로컬 ASR/STT

[@luoling8192 (Luoling)](https://github.com/luoling8192)과 저장소
[candle-examples](https://github.com/proj-airi/candle-examples)에서 진행한 실험 덕분에,
이제 Windows, macOS, Linux에서 동작하는 로컬 ASR/STT 엔진을 갖게 됐습니다.

<video autoplay controls muted loop>
  <source src="/en/blog/DevLog-2025.08.05/assets/airi-demo-settings-hearing.mp4" type="video/mp4">
  브라우저가 video 태그를 지원하지 않습니다.
</video>

<br />

::: info
이 데모는 OpenAI의 음성 서비스를 쓰지만, ASR/STT를 로컬 프로바이더로 전환할 수도 있습니다.
:::

처음에는 candle을 직접 쓰려 했지만 Windows와 Linux 빌드에서 (CUDA 유무를 모두 고려해) candle
런타임을 임베드할 좋은 방법을 찾지 못했습니다. 그래서 ort(Rust용 ONNX Runtime)로 전환했는데,
비슷한 성능과 정확도를 내면서 호환성이 훨씬 좋고 쓰기도 쉽습니다.

### 웹

#### 온보딩

AIRI 설정이 지금 꽤 복잡하다는 걸 압니다 (그래도 코드 구조를 이해해야 설정할 수 있는
순수 Python 기반 프로젝트들에 비하면 여전히 쉽습니다).

[Me1td0wn76 (melty kiss)](https://github.com/Me1td0wn76) 님이 웹 버전에 온보딩 화면 지원을
추가해 주신 덕분에, 처음 AIRI를 쓸 때 훨씬 나은 경험을 하실 수 있습니다.

이분은 Pull Request가 머지된 뒤 Project AIRI에 기여한 경험을 블로그로 나눠 주셨습니다:
[AIRIプロジェクトに参加した話 - YAMA-blog](https://yama-pro.blog/posts/airi/)

<img class="light" src="/en/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-light.avif" alt="온보딩 라이트 모드" />
<img class="dark" src="/en/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-dark.avif" alt="온보딩 다크 모드" />

동작하는 모습을 보세요:

<ThemedVideo
  autoplay
  :light="airiDemoOnboardingLight"
  :dark="airiDemoOnboardingDark"
/>

#### VRM

[Lilia-Chen (Lilia_Chen)](https://github.com/Lilia-Chen) 님의 노고 덕분에 VRM 모델이 정밀한
카메라 구현과 렌더링 메커니즘으로 더 잘 표시됩니다.

<img class="light" src="/en/blog/DevLog-2025.08.05/assets/airi-demo-vrm-light.avif" alt="VRM 라이트 모드" />
<img class="dark" src="/en/blog/DevLog-2025.08.05/assets/airi-demo-vrm-dark.avif" alt="VRM 다크 모드" />

### 모바일 웹

#### 온보딩

온보딩은 모바일 웹 버전에서도 쓸 수 있습니다:

<ThemedVideo
  autoplay
  :light="airiDemoOnboardingMobileLight"
  :dark="airiDemoOnboardingMobileDark"
/>

#### 씬

모바일의 기본 씬을 완전히 다시 디자인하고 새로 작성했습니다.

[LemonNekoGH (LemonNeko)](https://github.com/LemonNekoGH) 덕분에 씬에서 Live2D 모델의 오프셋을
조정하는 더 나은 방법이 생겼습니다.

이 디자인 아이디어는 iOS 측면 볼륨 조절에서 가져왔습니다. 더 직관적이고 명확하게 다루실 수 있기를 바랍니다.

::: tip
기본값으로 되돌리고 싶으신가요? X, Y, Scale 버튼을 두 번 탭하면 기본값으로 초기화됩니다.
:::

<br />

<video class="light" autoplay controls muted loop>
  <source src="/en/blog/DevLog-2025.08.05/assets/airi-demo-quick-editor-mobile-light.mp4" type="video/mp4">
  브라우저가 video 태그를 지원하지 않습니다.
</video>

<video class="dark" autoplay controls muted loop>
  <source src="/en/blog/DevLog-2025.08.05/assets/airi-demo-quick-editor-mobile-dark.mp4" type="video/mp4">
  브라우저가 video 태그를 지원하지 않습니다.
</video>

### 양쪽 버전 공통

기능을 위해 흥미로운 새 컴포넌트를 여럿 만들었습니다.

#### 더 나은 텍스트 애니메이션

채팅 말풍선의 텍스트 애니메이션을 개선했습니다. [sumimakito (Makito)](https://github.com/sumimakito/)가
며칠 전에 이에 대해 아주 훌륭한 DevLog를 써서, 왜 특별하게 구현했는지와 i18n 호환성을 어떻게 고려했는지
자세히 설명해 주었습니다. 꼭 읽어 보세요: [DevLog 2025.08.01](../DevLog-2025.08.01/).

동작하는 모습을 보세요:

<video class="light" autoplay controls muted loop>
  <source src="/en/blog/DevLog-2025.08.05/assets/airi-demo-clustr-light.mp4" type="video/mp4">
  브라우저가 video 태그를 지원하지 않습니다.
</video>

<video class="dark" autoplay controls muted loop>
  <source src="/en/blog/DevLog-2025.08.05/assets/airi-demo-clustr-dark.mp4" type="video/mp4">
  브라우저가 video 태그를 지원하지 않습니다.
</video>

#### 레벨 미터

> UI 컴포넌트: https://airi.moeru.ai/ui/#/story/src-components-gadgets-levelmeter-story-vue

감지된 오디오 입력 레벨이나 실시간 시스템 부하를 표시할 때 유용합니다:

<img class="light" src="/en/blog/DevLog-2025.08.05/assets/airi-ui-level-meter-light.avif" alt="레벨 미터 라이트 모드" />
<img class="dark" src="/en/blog/DevLog-2025.08.05/assets/airi-ui-level-meter-dark.avif" alt="레벨 미터 다크 모드" />

#### 시계열 차트

> UI 컴포넌트: https://airi.moeru.ai/ui/#/story/src-components-gadgets-timeserieschart-story-vue

값이 변하는 것을 보여 준다는 점은 레벨 미터와 비슷하지만, 특히 과거 데이터에 유용합니다.

<img class="light" src="/en/blog/DevLog-2025.08.05/assets/airi-ui-time-series-chart-light.avif" alt="시계열 차트 라이트 모드" />
<img class="dark" src="/en/blog/DevLog-2025.08.05/assets/airi-ui-time-series-chart-dark.avif" alt="시계열 차트 다크 모드" />

이 밖에도 추가한 컴포넌트가 많습니다...

- [x] `<Progress />` (@Menci 님 감사합니다 [2cb602aa](https://github.com/moeru-ai/airi/commit/2cb602aa3eac456a479b622a5ecf043831597ffe))
- [x] `<FieldSelect />` ([d0d782ff](https://github.com/moeru-ai/airi/commit/d0d782ff94a5a0a12819725303f687bd1a47e87c))
- [x] `<Alert />` ([@typed-sigterm](https://github.com/typed-sigterm) 님 감사합니다, [#295](https://github.com/moeru-ai/airi/pull/295))
- [x] `<ErrorContainer />` ([@typed-sigterm](https://github.com/typed-sigterm) 님 감사합니다, [#295](https://github.com/moeru-ai/airi/pull/295))
- [x] 새 사이드바 내비게이션 디자인
- [x] Toaster
- [x] 새 버전이 나오면 사용자에게 업데이트를 알리는 안내

## 커뮤니티

### 새 문서 사이트

이제 완전히 새로운 문서 사이트가 생겼습니다:

<ThemedVideo
  autoplay
  :light="airiDocsLight"
  :dark="airiDocsDark"
/>

정말 멋져 보입니다. [Reka UI](https://reka-ui.com)의 작업을 바탕으로 완전히 새로 쓰면서
블로그 글 목록, 언어 전환 등 많은 기능을 추가하고 VitePress에 맞게 여러 스타일을 조정했습니다.

그리고 언제나처럼, 아름다운 디자인을 만들어 준 그들에게 감사드립니다. 저희 것을 만들 때 그들의
컴포넌트를 많이 쓰고 있으니 꼭 살펴보세요!

블로그 페이지도 [@lynzrand (Rynco Maekawa)](https://github.com/lynzrand)가 디자인한 새 커버와 함께
더 보기 좋아졌습니다.

<img class="light" src="/en/blog/DevLog-2025.08.05/assets/airi-docs-blogs-light.avif" alt="문서 블로그 라이트 모드" />
<img class="dark" src="/en/blog/DevLog-2025.08.05/assets/airi-docs-blogs-dark.avif" alt="문서 블로그 다크 모드" />

### 번역 워크플로 변경

이른바 `i18n` 또는 로케일 파일을 저희 거대한 모노레포 안의 전용 패키지로 분리했습니다.

새 로케일을 추가하거나 번역을 추가·수정해 기여하실 때는 먼저
[https://github.com/moeru-ai/airi/tree/main/packages/i18n/src/locales](https://github.com/moeru-ai/airi/tree/main/packages/i18n/src/locales)로 가 주세요.

<img class="light" src="/en/blog/DevLog-2025.08.05/assets/airi-packages-i18n-light.avif" alt="packages/i18n 라이트 모드" />
<img class="dark" src="/en/blog/DevLog-2025.08.05/assets/airi-packages-i18n-dark.avif" alt="packages/i18n 다크 모드" />

여기서 언어별 디렉터리를 찾을 수 있습니다. 원하는 것을 골라 진행하세요.

영어를 예로 들면 디렉터리 구조는 이렇습니다:

```bash
└── en
  ├── docs
  ├── tamagotchi
  #
  ├── base.yaml
  ├── settings.yaml
  ├── stage.yaml
  └── index.ts
```

`docs`와 `tamagotchi`는 서로 구별되는 두 모듈을 위한 디렉터리입니다:

- 문서 사이트
- 데스크톱 버전 (Tamagotchi)

문서 사이트(글이나 실제 문서가 아니라 UI)의 번역을 돕고 싶으시다면 `docs` 디렉터리로 가서
문서 사이트의 UI 문자열이 담긴 `theme.yaml` 파일을 편집하시면 됩니다.

`tamagotchi` 디렉터리는 조금 특별해서 모든 번역 문자열을 찾을 수는 없습니다. 데스크톱 버전에서만
쓰이는 특별한 번역 몇 가지를 담고 있고, 나머지는 모두 루트 디렉터리에 있습니다.

`docs`와 `tamagotchi` 외의 것들은:

- `base.yaml`은 언어와 버튼 기본 상태 등 필수 문자열을 담습니다
- `settings.yaml`은 설정 페이지의 문자열을 담습니다
- `stage.yaml`은 스테이지(모델이 표시되는 UI)의 문자열을 담습니다

언어를 더 추가하고 싶으시다면 기존 언어 로케일 디렉터리 하나를 복사해 새 언어 코드로 이름을 바꾸세요.
예를 들어 프랑스어를 추가하려면 `en` 디렉터리를 `fr`로 복사한 뒤 `base.yaml`, `settings.yaml`,
`stage.yaml`, `index.ts` 파일을 편집해 번역을 추가하면 됩니다. Pull Request 리뷰 과정에서
일부만 번역해도 괜찮습니다.

::: info 도움을 구합니다!
좀 우습게 들릴 수 있지만, 저희 i18n 패키지를 [Crowdin](https://crowdin.com)이나
[Weblate](https://weblate.org/en/) 같은 번역 자동화 도구와 통합해 주실 경험 있는 분을 찾고 있습니다.

저희는 이 분야 전문가가 아니니, 도와주실 Pull Request를 열거나 논의를 위한 이슈를 편하게 열어 주세요.
:::

언어 코드는 아래 도구 중 하나로 작업 중인 언어의 코드를 찾아 사용해 주세요:

- [Language subtag lookup app](https://r12a.github.io/app-subtags/)
- [iana.org/assignments/language-subtag-registry/language-subtag-registry](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry)

```bash
.
├── packages
    ├── i18n
    ├── package.json
    └── src
         ├── index.ts
         └── locales
             ├── en
             │   ├── base.yaml
             │   ├── docs
             │   │   ├── index.ts
             │   │   └── theme.yaml
             │   ├── index.ts
             │   ├── settings.yaml
             │   ├── stage.yaml
             │   └── tamagotchi
             │       ├── index.ts
             │       ├── settings.yaml
             │       └── stage.yaml
             ├── index.ts
             └── zh-Hans
                 ├── base.yaml
                 ├── docs
                 │   ├── index.ts
                 │   └── theme.yaml
                 ├── index.ts
                 ├── settings.yaml
                 ├── stage.yaml
                 └── tamagotchi
                     ├── index.ts
                     ├── settings.yaml
                     └── stage.yaml
```

이에 대한 자료는 여기서 더 읽어 보실 수 있습니다:

- https://developer.mozilla.org/en-US/docs/Glossary/BCP_47_language_tag
- https://en.wikipedia.org/wiki/IETF_language_tag
- https://en.wikipedia.org/wiki/ISO_15924

## 엔지니어링

### 워크플로를 몇 배 빠르게 만든 툴체인

요약:

- 여러 패키지를 **buildless** 구성으로 전환했습니다
- `unbuild`의 `stub`를 걷어냈습니다
- `rolldown-vite`로 전환했습니다
- `unbuild`를 `tsdown`으로 교체했습니다
- 더 빠르고 캐시되는 빌드를 위해 `turborepo`를 도입했습니다

좀 더 자세히 말하면:

이전에는 모노레포 아키텍처를 택하면서 매끄러운 개발 경험을 위해, 컨트리뷰터가 프로젝트를 클론한 뒤
의존성을 설치할 때마다 `postinstall` 스크립트로 각 패키지의 `jiti` export와 `.d.ts` 모듈을 스텁으로
만들어 부트스트랩해야 했습니다.

덕분에 컨트리뷰터가 모노레포 동작 방식을 배우지 않아도 기여할 수 있었습니다. 하지만 `pnpm install`
때마다 다시 빌드하고 다시 스텁을 만드는 건 분명 영리한 전략이 아니었죠.

[@kwaa](https://github.com/kwaa)가 도입한 buildless 아키텍처 변경 덕분에, 시간이 가장 오래 걸리던
최대 패키지 `stage-ui`를 타입 체크나 의존성 해석 문제 없이 건너뛸 수 있게 됐습니다.

이후 [@kwaa](https://github.com/kwaa)는 `unbuild`가 가져오던, 때때로 문제를 일으키는 중복
`stub` 스크립트도 제거해 주었습니다. 덕분에 성가신
`The requested module './dist/index.mjs' does not provide an export named 'foo'`
오류와 더는 씨름하지 않는 훨씬 깔끔한 워크플로가 됐습니다.

가장 큰 변화는 두 달 전, [@kwaa](https://github.com/kwaa)가 `vite`를 `rolldown-vite`로 교체해
**워크플로를 2배 빠르게** 만든 것입니다.

여기서 멈추지 않고 `unbuild`를 `tsdown`으로 교체해 **추가로 4.2배 속도 향상**을 얻었고,
이제 각 하위 패키지 빌드가 250ms 미만으로 끝납니다.

> `tsdown`으로 옮기면서 얻은 이점은 더 있습니다...
>
> - 사용하지 않는 의존성 검사
> - CSS 번들링
> - Vue SFC 컴포넌트 번들링

`postinstall` 스크립트는 여전히 필요하지만, 의존성을 인식해 빌드 결과를 캐시할 방법을 찾으면
중복 빌드를 많이 피할 수 있습니다. 여기서 `turborepo`가 빌드를 더 빠르게 만들어 줍니다.
`turborepo` 덕분에 AIRI 빌드 시간이 **평균 4분에서 25초로 줄었습니다**.

### 이제 Nix를 지원합니다

[@Weathercold (Weathercold)](https://github.com/Weathercold) 덕분에 AIRI를 빌드하는 Nix flake가
생겼습니다. 크로스 플랫폼 호환성에 훌륭한 보탬이 되죠. macOS에서도 동작합니다.

nix-pkgs로 들어갈 최종 Pull Request가 머지되기를 기다리고 있지만, 다음 명령으로 미리 써 보실 수 있습니다:

```bash
nix run --extra-experimental-features 'nix-command flakes' github:moeru-ai/airi
```

### 통합된 빌드 파이프라인

이전에는 테스트, 스테이징, 릴리스의 빌드 파이프라인이 전부 달라서, 파이프라인이 성공할지 확신할 수 없어
새 버전을 낼지 결정하는 게 저에게는 악몽이었습니다.

Tauri가 크로스 플랫폼 호환성과 Rust로 syscall을 하고 네이티브 OS 기능에 통합하는 강력한 능력이라는
이점을 많이 준 건 사실이지만...

v0.7 개발 초기에 저는 ASR/STT 파이프라인의 추론 엔진 구현으로
[huggingface/candle](https://github.com/huggingface/candle)을 도입했는데, NVIDIA CUDA에 의존해서
빌드가 정말 엉망이었고 호환성 문제가 도처에 있었습니다.

하지만 이제 훨씬 나아졌습니다. 릴리스와 동일한 스크립트와 워크플로 단계를 매일 실행하는 예약 빌드
파이프라인이 생겼습니다. (`canary`나 `nightly` 빌드라고 들어 보셨을 겁니다.)

그래서 최신 릴리스에서 문제를 겪으신다면, `main` 브랜치의 최신 빌드를 받아 문제가 고쳐졌는지
언제든 확인해 보실 수 있습니다.

나이틀리 빌드는 [https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml](https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml)에서 찾을 수 있습니다.

## 마치기 전에...

이번 릴리스 사이에 태어난 새 패키지들:

> [@sumimakito](https://github.com/sumimakito)에게 큰 박수를. 정말 환상적인 일을 너무 많이 해서
> 다 세지도 못하겠네요...

- [`@proj-airi/chromatic`](https://github.com/proj-airi/chromatic) ([@sumimakito](https://github.com/sumimakito))
- [`@proj-airi/unocss-preset-chromatic`](https://github.com/proj-airi/chromatic) ([@sumimakito](https://github.com/sumimakito))
- [`@moeru-ai/jem`](https://github.com/moeru-ai/inventory/tree/main/packages/jem-validator) ([@LemonNekoGH](https://github.com/LemonNekoGH)), 통합 모델 카탈로그
- [`clustr`](https://github.com/sumimakito/clustr) ([@sumimakito](https://github.com/sumimakito))
- [`@proj-airi/drizzle-orm-browser`](https://github.com/proj-airi/drizzle-orm-browser) (제가 만들었습니다)

이번 릴리스 사이에 태어난 사이드 프로젝트들:

- [HuggingFace Inspector](https://hf-inspector.moeru.ai/) (https://github.com/moeru-ai/hf-inspector)
- [whisper & VAD, candle, burn, ort에 관한 더 많은 candle 예제](https://github.com/proj-airi/candle-examples)
- [(모델 카탈로그) Inventory 제출!](https://github.com/moeru-ai/inventory/pull/1) ([@LemonNekoGH](https://github.com/LemonNekoGH))

이 DevLog에 모든 것을 담을 수는 없습니다. 자세한 내용은 저희 로드맵의
[Roadmap v0.7](https://github.com/moeru-ai/airi/issues/200)에서 언제든 확인하실 수 있습니다.

<div class="w-full flex flex-col items-center justify-center gap-3 py-3">
  <img src="/en/blog/DevLog-2025.08.05/assets/relu-sticker-thinks.avif" alt="ReLU 스티커 thinks" class="w-30!" />
  <div class="text-center">
    <span class="block font-bold">여기까지 읽어 주셔서 감사합니다!</span>
  </div>
</div>
