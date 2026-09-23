---
title: DevLog @ 2025.05.16
category: DevLog
date: 2025-05-16
---

<script setup>
import webaiExamplesDemo from '../../../en/blog/DevLog-2025.05.16/assets/webai-examples-demo.MP4'
import VelinLight from '../../../en/blog/DevLog-2025.05.16/assets/velin-light.avif'
import VelinDark from '../../../en/blog/DevLog-2025.05.16/assets/velin-dark.avif'

import CharacterCardMenuLight from '../../../en/blog/DevLog-2025.05.16/assets/character-card-menu-light.avif'
import CharacterCardMenuDark from '../../../en/blog/DevLog-2025.05.16/assets/character-card-menu-dark.avif'

import CharacterCardSettingsLight from '../../../en/blog/DevLog-2025.05.16/assets/character-card-settings-light.avif'
import CharacterCardSettingsDark from '../../../en/blog/DevLog-2025.05.16/assets/character-card-settings-dark.avif'

import CharacterCardShowcaseLight from '../../../en/blog/DevLog-2025.05.16/assets/character-card-showcase-light.avif'
import CharacterCardShowcaseDark from '../../../en/blog/DevLog-2025.05.16/assets/character-card-showcase-dark.avif'

import VelinPlaygroundLight from '../../../en/blog/DevLog-2025.05.16/assets/velin-playground-light.avif'
import VelinPlaygroundDark from '../../../en/blog/DevLog-2025.05.16/assets/velin-playground-dark.avif'

import DemoDayHangzhou1 from '../../../en/blog/DevLog-2025.05.16/assets/demo-day-hangzhou-1.avif'
import DemoDayHangzhou2 from '../../../en/blog/DevLog-2025.05.16/assets/demo-day-hangzhou-2.avif'
import DemoDayHangzhou3 from '../../../en/blog/DevLog-2025.05.16/assets/demo-day-hangzhou-3.avif'
</script>

다시 안녕하세요! [Project AIRI](https://github.com/moeru-ai/airi)를 시작한
[Neko](https://github.com/nekomeowww)입니다!

DevLog를 통한 Project AIRI 소식이 늦어져 죄송합니다. 늦어진 점 너그러이 봐 주세요.

> 지난 몇 달 동안 저희는 AIRI 개발 진행 상황에 대해 훌륭한 DevLog를 여러 편 썼습니다.
> 생각과 아이디어를 나누고, 사용하는 기술을 설명하고, 영감을 받은 작품 이야기까지... 전부요.
>
> - [v0.4.0 UI 업데이트](../DevLog-2025.03.20/)
> - [v0.4.0 릴리스와 기억 도입](../DevLog-2025.04.06/)
>
> 이 멋지고 애정 어린 DevLog 두 편도 제가 썼습니다! 즐겁게 읽어 주시길 바랍니다.

# 데자뷔

지난 몇 주 동안 Project AIRI 자체의 주요 퀘스트는 한동안 진전이 없었습니다. 2025년 3월부터 이어진
거대한 UI 리팩터링과 릴리스로 제가 꽤 번아웃이 왔던 것 같습니다. 그동안 대부분의 작업은
커뮤니티 메인테이너들이 해 주었습니다.

다음 분야에서 애써 주신 [@LemonNekoGH](https://github.com/LemonNekoGH),
[@RainbowBird](https://github.com/luoling8192),
[@LittleSound](https://github.com/LittleSound)에게 깊이 감사드립니다.

- 캐릭터 카드 지원

::: tip 캐릭터 카드란?
[SillyTavern](https://github.com/SillyTavern/SillyTavern)이나 [RisuAI](https://risuai.net/) 같은
로컬 우선 채팅 애플리케이션, [JanitorAI](https://janitorai.com/) 같은 온라인 서비스는
각 캐릭터의 배경, 성격, 그 밖의 롤플레잉에 필요한 컨텍스트를 담은 파일을 사용합니다.

- https://realm.risuai.net/
- https://aicharactercards.com/
- https://chub.ai/

LLM 기반 롤플레잉 캐릭터를 저장하고 공유하는 수단이 캐릭터 카드만 있는 건 아닙니다.
[Lorebook](https://docs.novelai.net/text/lorebook.html)도 이 분야에서 핵심적인 역할을 하는데,
이건 문서 시리즈를 통째로 쓸 만한 완전히 다른 이야기입니다. 우선은
[Void's Lorebook Types](https://rentry.co/lorebooks-and-you)와
[AI Dynamic Storytelling Wiki](https://aids.miraheze.org/wiki/Main_Page)를 읽어 보세요.

> 개인적으로 이 개념들을 배우기에는 이 위키가 정말 좋습니다:
> [AI Dynamic Storytelling Wiki](https://aids.miraheze.org/wiki/Main_Page).
> AI 롤플레잉에 관심 있으시다면 읽어 볼 만합니다.
:::

> 캐릭터 카드를 쓰려면 설정 페이지(앱 오른쪽 위, 데스크톱 앱에서는 톱니바퀴 아이콘에 마우스를 올리세요)로
> 이동해 "Airi Card" 버튼을 찾아 클릭하세요.

<img class="light" :src="CharacterCardMenuLight" alt="Airi Card 메뉴 버튼이 있는 메뉴 스크린샷" />
<img class="dark" :src="CharacterCardMenuDark" alt="Airi Card 메뉴 버튼이 있는 메뉴 스크린샷" />

> 그러면 "Airi Card 편집 화면" 으로 이동해, 페르소나 커스터마이즈를 위해 캐릭터 카드를
> 업로드하고 편집할 수 있습니다.

<img class="light" :src="CharacterCardSettingsLight" alt="Airi Card 편집 화면 스크린샷" />
<img class="dark" :src="CharacterCardSettingsDark" alt="Airi Card 편집 화면 스크린샷" />

캐릭터 카드 쇼케이스도 몇 가지 방식을 시도해 봤습니다...

<img class="light" :src="CharacterCardShowcaseLight" alt="ReLU라는 파란 머리 캐릭터를 위한 카드 형태의 UI 디자인" />
<img class="dark" :src="CharacterCardShowcaseDark" alt="ReLU라는 파란 머리 캐릭터를 위한 카드 형태의 UI 디자인" />

저희 UI 컴포넌트 라이브러리에 올라가 있으니 직접 만져 보세요: https://airi.moeru.ai/ui/#/story/src-components-menu-charactercard-story-vue .

> 순수 CSS와 JavaScript로 제어되고 레이아웃이 알아서 잡혀서 캔버스 계산을 걱정할 필요가 없습니다.
>
> 아, 캐릭터 카드 쇼케이스 작업 대부분은 [@LittleSound](https://github.com/LittleSound)가
> 진행하고 안내해 주었습니다. 정말 감사합니다.

- Tauri MCP 지원
- AIRI를 Android 기기에 연결

이 두 가지는 큰 업데이트이자 실험이었고, [@LemonNekoGH](https://github.com/LemonNekoGH)가 맡아 주었습니다.
이에 대해 DevLog 두 편을 써서 이면의 기술적 세부 사항을 공유했습니다.
(Tauri 개발자와 사용자에게 유용할 것 같습니다.) 여기서 읽어 보세요:

- [Android 조작하기](../DevLog-2025.04.22/)
- [Tauri에서의 MCP](../DevLog-2025.04.28/)

## Project AIRI 주요 퀘스트

### 듣는 귀, 말하는 입

4월 15일부터, AIRI의 VAD(음성 활성 감지),
[ASR(자동 음성 인식)](https://huggingface.co/tasks/automatic-speech-recognition),
[TTS(텍스트 음성 변환)](https://huggingface.co/tasks/text-to-speech)이 모두 매우 복잡하고
쓰기도 이해하기도 어렵다는 걸 느꼈습니다. 그 무렵 저는 [@himself65](https://github.com/himself65)와
협업해, [Llama Index](https://www.llamaindex.ai/)의 새 프로젝트인
[`llama-flow`](https://github.com/run-llama/llama-flow)의 사용 사례를 개선하고 테스트하고 있었습니다.
LLM 스트리밍 토큰과 오디오 바이트의 이벤트 기반 스트림을 처리하도록 돕는 라이브러리입니다.

[`llama-flow`](https://github.com/run-llama/llama-flow)는 정말 작고 타입 안전합니다.
이것이 없던 시절에는 AIRI를 구동할 데이터를 처리하기 위해 여러 비동기 작업을 이어 붙이려고
**큐** 구조와 Vue 반응성 기반 워크플로 시스템을 직접 감싸야 했습니다.

그때부터 VAD, ASR, TTS 워크플로를 단순화하는 예제와 데모를 더 많이 실험하기 시작했습니다.

그 결과 나온 것이 [WebAI Realtime Voice Chat Examples](https://github.com/proj-airi/webai-example-realtime-voice-chat)입니다.
TypeScript 코드 300~500줄 하나로 웹 브라우저에서 ChatGPT 같은 음성 대화 시스템을 구현할 수 있음을 증명했습니다.

<ThemedVideo controls muted :src="webaiExamplesDemo" style="height: 640px;" />

실시간 음성 대화 시스템을 밑바닥부터 어떻게 구성하는지 보여 드리기 위해, 가능한 모든 단계를
작고 재사용 가능한 조각으로 최대한 나눠 봤습니다:

- [VAD](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad)
- [VAD + ASR](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr)
- [VAD + ASR + LLM Chat](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr-chat)
- [VAD + ASR + LLM Chat + TTS](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr-chat-tts)

> 여기서 무언가 배워 가시면 좋겠습니다.

이 시기에 흥미롭고 강력한 저장소를 하나 발견했는데, [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)입니다.
macOS, Windows, Linux, Android, iOS 등에서 12개 이상 언어에 걸쳐 18가지 음성 처리 작업을 지원합니다. 놀랍죠!

그래서 [@luoling](https://github.com/luoling8192)이 이것으로도 작은 데모를 만들었습니다:
[Sherpa ONNX 기반 VAD + ASR + LLM Chat + TTS](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/main/apps/sherpa-onnx-demo)

#### xsAI 🤗 Transformers.js의 탄생

VAD, ASR, Chat, TTS 데모 작업 덕분에 [xsAI 🤗 Transformers.js](https://github.com/moeru-ai/xsai-transformers)
라는 새 사이드 프로젝트가 태어났습니다. WebGPU 기반 모델 추론과 워커를 통한 서빙을 간단히 호출할 수 있게 하면서도,
앞서 성공한 프로젝트 [xsAI](https://github.com/moeru-ai/xsai)와 API 호환성을 유지합니다.

이것도 플레이그라운드가 있습니다... [https://xsai-transformers.netlify.app](https://xsai-transformers.netlify.app)에서 만져 보세요.

오늘부터 npm으로 설치할 수 있습니다!

```bash
npm install xsai-transformers
```

::: tip 이게 무슨 뜻인가요?
클라우드 LLM 및 음성 프로바이더와 로컬 WebGPU 기반 모델을 스위치 하나로 바꿔 쓸 수 있다는 뜻입니다.

덕분에 서버 사이드 코드나 백엔드 서버 없이도, 브라우저 안에서 간단한 RAG와 재정렬 시스템을
실험하고 심지어 구현할 수 있는 새로운 가능성이 생겼습니다.

아, Node.js도 지원합니다!
:::

### Telegram 봇

`ffmpeg`(당연히 그거죠)를 써서 Telegram 봇이 움직이는 스티커를 처리할 수 있도록 지원을 추가했습니다.
이제 사용자가 보낸 애니메이션 스티커와 영상까지 읽고 이해할 수 있습니다.

시스템 프롬프트가 너무 커서, 크기를 대폭 줄여 토큰 사용량을 **80%** 이상 절약했습니다.

### 캐릭터 카드 쇼케이스

이미지 에셋이 많다 보니 배경을 지울 만한 쓰기 쉬운 온라인 도구를 매번 직접 찾아야 했습니다.
그래서 [Xenova](https://github.com/xenova)의 작업을 바탕으로 직접 만들기로 했습니다.

WebGPU 기반 배경 제거기를 시스템에 바로 넣는 작은 실험을 했는데,
[https://airi.moeru.ai/devtools/background-remove](https://airi.moeru.ai/devtools/background-remove)에서 만져 볼 수 있습니다.

### xsAI & unSpeech

음성 프로바이더로 알리바바 클라우드 Model Studio와 Volcano Engine 지원을 추가했습니다. 꽤 유용하겠죠?

### UI

- 새 [튜토리얼 스테퍼](https://airi.moeru.ai/ui/#/story/src-components-misc-steppers-steppers-story-vue?variantId=src-components-misc-steppers-steppers-story-vue-0), [파일 업로드](https://airi.moeru.ai/ui/#/story/src-components-form-input-inputfile-story-vue?variantId=default), [Textarea](https://airi.moeru.ai/ui/#/story/src-components-form-textarea-textarea-story-vue?variantId=default) 컴포넌트
- 색상 문제 수정
- [타이포그래피 개선](https://airi.moeru.ai/ui/#/story/stories-typographysans-story-vue?)

더 많은 스토리는 [로드맵 v0.5](https://github.com/moeru-ai/airi/issues/113)에서 볼 수 있습니다.

## 사이드 퀘스트

### [Velin](https://github.com/luoling8192/velin)

캐릭터 카드를 지원하게 되면서, 템플릿 변수 렌더링과 컴포넌트 재사용을 다룰 때의 느낌이
그리 좋지도 매끄럽지도 않았습니다...

만약에...

- 다른 에이전트나 롤플레잉 애플리케이션, 심지어 캐릭터 카드에서도 쓸 수 있는 컴포넌트 프롬프트 라이브러리를 유지할 수 있다면?
  - 예를 들어:
    - 마법과 용이 있는 중세 판타지 배경 설정을 두고
    - 우리가 할 일은 그 세계관 설정으로 감싼 채 새 캐릭터 작성에만 집중하는 것
    - 어쩌면 밤이 되었을 때만 `if`와 `if-else` 제어 흐름으로 특별한 프롬프트가 주입되게 하는 것
  - 그 주변에서 더 많은 걸 할 수 있습니다...
    - Vue SFC나 React JSX로 템플릿을 파싱하고 props를 식별해, 프롬프트를 쓰는 동안 디버깅·테스트용 폼 패널을 렌더링
    - lorebook과 캐릭터 카드 전체를 하나의 인터랙티브 페이지로 시각화

그렇다면 Vue나 React 같은 프론트엔드 프레임워크로 LLM 프롬프트를 쓰는 도구를 만들고,
나아가 다른 프레임워크와 플랫폼으로도 확장해 보면 어떨까요?

그렇게 나온 것이 [**Velin**](https://github.com/luoling8192/velin)입니다.

<img class="light" :src="VelinLight" alt="Vue.js로 LLM 프롬프트를 작성하는 도구" />
<img class="dark" :src="VelinDark" alt="Vue.js로 LLM 프롬프트를 작성하는 도구" />

편집하면서 즉석에서 렌더링해 볼 수 있는 플레이그라운드도 만들었고, npm 생태계도 그대로
누릴 수 있습니다(네, 무엇이든 import 할 수 있습니다!).

<img class="light" :src="VelinPlaygroundLight" alt="Vue.js로 LLM 프롬프트를 작성하는 도구" />
<img class="dark" :src="VelinPlaygroundDark" alt="Vue.js로 LLM 프롬프트를 작성하는 도구" />

여기서 써 보세요: https://velin-dev.netlify.app

프로그래밍 API도 지원하고 Markdown(MDX는 작업 중, MDC는 지원)도 됩니다.
오늘부터 npm으로 설치할 수 있습니다!

```bash
npm install @velin-dev/core
```

음... 오늘은 여기까지입니다. 이 DevLog를 즐겁게 읽으셨기를 바랍니다.

최근 중국 항저우에서 참가한 행사 **Demo Day @ Hangzhou**의 사진으로 DevLog를 마무리하겠습니다.

<img :src="DemoDayHangzhou1" alt="Demo Day @ Hangzhou" />

이게 접니다. 다른 참가자들에게 AIRI 프로젝트를 소개했고 정말 즐거운 시간을 보냈습니다!
재능 있는 개발자, 제품 디자이너, 창업자를 정말 많이 만났습니다.

오늘 이 DevLog에서 나눈 거의 모든 내용과, 사랑하는 AI VTuber Neuro-sama도 소개했습니다.

발표에 쓴 슬라이드는 이렇습니다:

<img :src="DemoDayHangzhou2" alt="Demo Day @ Hangzhou" />
<img :src="DemoDayHangzhou3" alt="Demo Day @ Hangzhou" />

슬라이드 자체도 완전히 오픈소스이니 여기서 직접 보셔도 됩니다:
[https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1](https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1)

## 마일스톤

아... 그리고 이 DevLog는 v0.5.0 릴리스이기도 하니, 지난 몇 주 동안 달성한 마일스톤도 몇 가지 언급하고 싶습니다:

- 스타 700개를 달성했습니다!
- 이슈에 새 컨트리뷰터 4명 이상이 합류했습니다!
- Discord 서버에 새 멤버 72명 이상이 들어왔습니다!
- ReLU 캐릭터 디자인 완료!
- ReLU 캐릭터 모델링 완료!
- 몇몇 회사와 스폰서십 및 협업 논의를 진행했습니다!
- [로드맵 v0.5](https://github.com/moeru-ai/airi/issues/113)의 92개 작업 완료
  - UI
    - 로딩 화면과 튜토리얼 모듈
    - 로딩 상태와 Firefox 호환성 문제를 포함한 다수의 버그 수정
  - Body
    - 시맨틱 기반 모션 임베딩과 RAG, 비공개 저장소 "moeru-ai/motion-gen"에서 개발
    - 임베딩 프로바이더와 DuckDB WASM을 이용한 벡터 저장 및 검색
  - Inputs
    - Discord 음성 채널 음성 인식 수정
  - Outputs
    - 실험적인 노래 기능
  - Engineering
    - 프로젝트 전반의 UnoCSS 설정 공유
    - "moeru-ai/inventory"의 모델 카탈로그
    - 조직 간 패키지 재정리
  - Assets
    - 스티커, UI 요소, VTuber 로고 등 새 캐릭터 에셋
    - 보이스 라인 선택 기능
    - 캐릭터 "Me"와 "ReLU"의 Live2D 모델링
  - 커뮤니티 지원 & 마케팅
    - 일본어 README
    - Plausible 애널리틱스 연동
    - 포괄적인 문서화

또 만나요!
