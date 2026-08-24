---
title: DevLog @ 2025.03.20
category: DevLog
date: 2025-03-20
---

<script setup>
import histoireFirstLook from '../../../en/blog/DevLog-2025.03.20/assets/histoire-first-look.mp4'
import airiDemo from '../../../en/blog/DevLog-2025.03.20/assets/airi-demo.mp4'
import Gelbana from '../../../en/blog/DevLog-2025.03.20/assets/steins-gate-gelnana-from-elpsycongrooblog.avif'
import NewUIV3 from '../../../en/blog/DevLog-2025.03.10/assets/new-ui-v3.avif'
import NewUIV3Dark from '../../../en/blog/DevLog-2025.03.10/assets/new-ui-v3-dark.avif'
import HistoireColorSlider from '../../../en/blog/DevLog-2025.03.20/assets/histoire-color-slider.avif'
import HistoireColorSliderDark from '../../../en/blog/DevLog-2025.03.20/assets/histoire-color-slider-dark.avif'
import HistoireLogo from '../../../en/blog/DevLog-2025.03.20/assets/histoire-logo.avif'
import HistoireLogoDark from '../../../en/blog/DevLog-2025.03.20/assets/histoire-logo-dark.avif'
import NewUIV4Speech from '../../../en/blog/DevLog-2025.03.20/assets/new-ui-v4-speech.avif'
import NewUIV4SpeechDark from '../../../en/blog/DevLog-2025.03.20/assets/new-ui-v4-speech-dark.avif'
import SteinsGateMayori from '../../../en/blog/DevLog-2025.03.20/assets/steins-gate-mayori.avif'
</script>

다시 안녕하세요! 지난 DevLog 이후 10일이 지났습니다.

사용자 인터페이스를 크게 개선했고, 더 많은 LLM 프로바이더와 음성 프로바이더를 통합할 수 있게 됐으며,
Discord와 bilibili를 비롯한 여러 소셜 미디어 플랫폼에 AIRI를 처음으로 올렸습니다.

들려드리고 싶은 이야기가 정말 많습니다.

## 데자뷔

시간을 조금 되감아 봅시다!

<img :src="Gelbana" alt="Gelbana" />

> 아, 걱정 마세요. 우리의 사랑스러운 [AIRI](https://github.com/moeru-ai/airi)가 이렇게 젤바나가
> 되지는 않습니다. 다만 [_슈타인즈 게이트_](https://myanimelist.net/anime/9253/Steins_Gate)
> 애니메이션을 아직 안 보셨다면 꼭 한번 보세요~!

10일 전, 저희는 초기 설정 UI 디자인 작업을 하며 애니메이션을 개선했고 커스터마이즈 가능한
테마 색상도 구현했습니다. 정말 모두에게 바쁜 한 주였습니다 (특히 저희 모두 이 프로젝트에
파트타임으로 참여하고 있거든요. 하하, 함께하고 싶으시면 언제든지요. 🥺).

당시 얻은 최종 결과는 이렇습니다:

<img class="light" :src="NewUIV3" alt="new ui" />
<img class="dark" :src="NewUIV3Dark" alt="new ui" />

<h2 class="devlog-steins-gate-divergence-meter-heading">
  <span class="nixie-digit">0</span>
  <span class="nixie-digit">.</span>
  <span class="nixie-digit">5</span>
  <span class="nixie-digit">7</span>
  <span class="nixie-digit">1</span>
  <span class="nixie-digit">0</span>
  <span class="nixie-digit">2</span>
  <span class="nixie-digit">4</span>
</h2>

~~β 세계선에 오신 것을 환영합니다.~~

모델 라디오 그룹과 내비게이션 항목에 색이 들어간 카드가 있고 테마까지 커스터마이즈할 수 있게 되니,
비즈니스 워크플로 안에서 UI 컴포넌트를 디버깅하는 일이 분명 고통스러워지고 속도도 느려질 것이
뻔했습니다.

그래서 [`Histoire`](https://histoire.dev)라는 훌륭한 도구를 도입하기로 결정했습니다.
기본적으로는 [Storybook](https://storybook.js.org/) 이지만
[Vite](https://vitejs.dev)와 [Vue.js](https://vuejs.org) 조합에 훨씬 더 자연스럽게 어울립니다.

[@sumimakito](https://github.com/sumimakito)가 작업을 마치고 녹화한 첫인상입니다:

<ThemedVideo muted autoplay :src="histoireFirstLook" />

OKLCH 색 팔레트 전체를 캔버스에 한 번에 펼쳐 놓고 참고할 수 있습니다. 하지만 색을 이리저리
시도해 보면서 Project AIRI 테마와 같은 결의 느낌을 잡기에는 완벽하지 않았죠.

그래서 먼저 컬러 슬라이더를 다시 구현했고, 훨씬 잘 맞는 느낌이 됐습니다:

<img class="light" :src="HistoireColorSlider" alt="color slider" />
<img class="dark" :src="HistoireColorSliderDark" alt="color slider" />

덕분에 슬라이더가 조금 더 전문적으로 보입니다.

로고와 기본 초록색 계열도 AIRI 테마에 맞게 바꿀 수 있어서, UI 페이지 전용 로고를 따로
디자인했습니다:

<img class="light" :src="HistoireLogo" alt="project airi logo for histoire" />
<img class="dark" :src="HistoireLogoDark" alt="project airi logo for histoire" />

아 참, UI 컴포넌트 전체는 여느 때처럼 Netlify의 `/ui/` 경로에 배포해 두었습니다. UI 요소들이
어떻게 생겼는지 궁금하셨다면 편하게 살펴보세요:
[https://airi.moeru.ai/ui/](https://airi.moeru.ai/ui/)

이 DevLog에서 다 다루지 못할 만큼 다른 기능도 많습니다:

- [x] 모든 LLM 프로바이더 지원.
- [x] 메뉴 내비게이션 UI의 애니메이션과 전환 개선.
- [x] 필드 간격 개선, 새로운 폼!
- [x] 컴포넌트 ([로드맵](https://github.com/moeru-ai/airi/issues/42)의 거의 모든 할 일 컴포넌트)
  - [x] Form
    - [x] Radio
    - [x] Radio Group
    - [x] Model Catalog
    - [x] Range
    - [x] Input
    - [x] Key Value Input
  - [x] Data Gui
    - [x]  Range
  - [x] Menu
    - [x] Menu Item
    - [x] Menu Status Item
  - [x] Graphics
    - [x] 3D
  - [x] Physics
    - [x] Cursor Momentum
  - [x] 그 외 다수...

관성(momentum)과 3D 관련 실험도 좀 했습니다.

이걸 보세요:

<img class="light" :src="NewUIV4Speech" alt="brand new speech design" />
<img class="dark" :src="NewUIV4SpeechDark" alt="brand new speech design" />

마침내 음성 모델 설정을 지원하게 됐습니다 🎉! (이전에는 ElevenLabs만 설정할 수 있었습니다.)
저희가 함께 만들고 있는 또 다른 멋진 프로젝트 `unspeech`의
[새 `v0.1.2` 버전](https://github.com/moeru-ai/unspeech/releases/tag/v0.1.2) 덕분에
[`@xsai/generate-speech`](https://xsai.js.org/docs/packages/generate/speech)를 통해
Microsoft Speech 서비스(일명 Azure AI Speech 서비스, 또는 Cognitive Speech 서비스)를 호출할 수 있게 됐습니다.
즉 Microsoft용 OpenAI API 호환 TTS를 드디어 갖게 된 것이죠.

그런데 이걸 지원하는 게 왜 그렇게 중요했을까요?

Neuro-sama의 아주 초기 버전에서 TTS 서비스를 담당한 게 Microsoft 였고, 목소리 이름은 `Ashley`,
여기에 피치를 `+20%` 하면 Neuro-sama 첫 버전과 같은 목소리를 얻을 수 있기 때문입니다. 직접 들어 보세요:

<audio controls style="width: 100%;">
  <source src="/en/blog/DevLog-2025.03.20/assets/ashley-pitch-test.mp3" />
</audio>

똑같지 않나요, 정말 대단합니다! 즉 새로운 **음성** 능력으로 마침내 Neuro-sama가 하는 일에
가까이 다가갈 수 있다는 뜻입니다!

<img :src="SteinsGateMayori" alt="애니메이션 슈타인즈 게이트의 등장인물" />

<h2 class="devlog-steins-gate-divergence-meter-heading">
  <span class="nixie-digit">1</span>
  <span class="nixie-digit">.</span>
  <span class="nixie-digit">3</span>
  <span class="nixie-digit">8</span>
  <span class="nixie-digit">2</span>
  <span class="nixie-digit">7</span>
  <span class="nixie-digit">3</span>
  <span class="nixie-digit">3</span>
</h2>

이 모든 것을 합치면 이런 결과가 나옵니다:

<ThemedVideo controls muted autoplay :src="airiDemo" />

거의 똑같습니다. 하지만 저희 이야기는 여기서 끝나지 않습니다. 지금은 아직 기억(memory)과
더 나은 모션 제어를 구현하지 못했고, 전사 설정 UI도 빠져 있습니다. 이달이 끝나기 전에는
끝낼 수 있으면 좋겠네요.

앞으로 계획하고 있는 것들:

- [ ] Memory Postgres + Vector
- [ ] 임베딩 설정 UI
- [ ] 전사 설정 UI
- [ ] Memory DuckDB WASM + Vector
- [ ] 모션 임베딩
- [ ] Speaches 설정 UI

오늘의 DevLog는 여기까지입니다. 여기까지 읽어 주신 모든 분께 감사드립니다.

내일 또 만나요.

> El Psy Congroo.
