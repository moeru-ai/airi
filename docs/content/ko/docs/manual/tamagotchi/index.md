---
title: 데스크톱 빠른 시작
description: 데스크톱에서 Project AIRI를 시작하는 방법
---

## 대화 시작하기

AIRI를 설치하고 실행한 뒤, 가장 빠르게 대화를 시작하는 방법은 온보딩 과정을 끝까지 마치는 것입니다.

1. AIRI가 물어보면 사용할 언어를 선택합니다.
2. **직접 프로바이더 설정하기**를 선택하거나, 이미 AIRI 계정을 쓰고 있다면 로그인합니다.
3. OpenRouter, OpenAI 호환 API, DeepSeek, Ollama, Qwen, Gemini, Claude 등 채팅 프로바이더를 고릅니다.
4. 필요한 API 키나 로컬 엔드포인트 정보를 입력합니다.
5. 채팅 모델을 고른 뒤 저장하고 계속 진행합니다.
6. 메인 캐릭터 창에서 컨트롤 아일랜드 오른쪽 아래의 **확장** 버튼을 클릭합니다.
7. **채팅 열기**를 클릭하고 메시지를 입력해 전송합니다.

::: tip Ollama를 로컬에서 쓰시나요?
시스템 환경 변수로 `OLLAMA_ORIGINS=*`를 설정한 다음, Ollama를 재시작하고 나서 AIRI에서 선택하세요.
:::

<br />

<video controls autoplay loop muted>
 <source src="/assets/tutorial-basic-setup-providers.mp4" type="video/mp4">
</video>

## 화면 구성

Stage Tamagotchi 라고도 부르는 데스크톱 버전은 보통 다음과 같은 화면 요소로 이루어집니다.

- **메인 캐릭터 창**: 항상 바탕화면 위에 떠 있는 Live2D / VRM 무대입니다.
- **컨트롤 아일랜드**: 캐릭터 창 오른쪽 아래에 있는 작은 버튼 묶음입니다.
- **채팅 창**: 컨트롤 아일랜드에서 여는 대화 창입니다.
- **설정 창**: 프로바이더, 캐릭터, 모델, 모듈, 데이터, 연결, 시스템 설정을 다룹니다.
- **시스템 트레이 메뉴**: 크기, 정렬, 설정, 자막, 위젯, 종료 동작을 제공합니다.

캐릭터 창이 숨겨졌다면 AIRI 트레이 아이콘을 클릭하거나 트레이 메뉴에서 **표시**를 선택해 다시 불러올 수 있습니다.

## 컨트롤 아일랜드

컨트롤 아일랜드는 평소에 데스크톱 앱을 조작하기에 가장 편리한 곳입니다.

- **확장**을 클릭하면 더 많은 동작이 나타납니다.
- **채팅 열기**를 클릭하면 채팅 창이 열립니다.
- **설정 열기**를 클릭하면 프로바이더, 모델, 모듈, 캐릭터, 시스템 설정을 구성할 수 있습니다.
- **프로필 전환**을 클릭하면 활성 캐릭터 카드를 바꿀 수 있습니다.
- 무대를 다시 불러와야 할 때는 **새로고침**을 클릭합니다.
- 라이트/다크 아이콘을 클릭하면 테마가 바뀝니다.
- 핀 아이콘을 클릭하면 항상 위에 표시를 켜고 끌 수 있습니다.
- 눈 아이콘을 클릭하면 **자동 숨김** / **항상 표시**를 전환할 수 있습니다.
- 마이크 버튼으로 청각 관련 설정을 엽니다.
- 이동 버튼을 드래그해 캐릭터 창의 위치를 옮깁니다.

## 자동 숨김

눈 버튼은 AIRI가 완전히 상호작용 가능한 상태를 유지할지, 아니면 작업하는 동안 시야와 클릭 방해를 부드럽게 줄일지를 결정합니다.

- **항상 표시**는 캐릭터를 계속 보이게 하고 클릭도 가능하게 둡니다.
- **자동 숨김**은 커서가 가까이 오면 캐릭터와 UI를 흐리게 만들고, 클릭이 아래 앱으로 통과하도록 합니다.

자동 숨김을 처음 켜면 AIRI가 동작 방식을 설명하는 짧은 안내를 보여 줍니다. AIRI를 클릭하기 어려워졌다면 컨트롤 아일랜드 근처로 커서를 옮긴 뒤 눈 버튼을 다시 클릭하세요.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-180 translate-x--30 translate-y--2 lg:scale-150 lg:translate-x--40">
    <source src="/assets/tutorial-basic-fade-on-hover.mp4" type="video/mp4">
  </video>
</div>

## 이동과 크기 조절

캐릭터 창을 옮기려면 컨트롤 아일랜드 오른쪽 아래의 이동 버튼을 드래그하세요.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-225 translate-x--45 translate-y--5 lg:scale-200 lg:translate-x--80 lg:translate-y--5">
    <source src="/assets/tutorial-basic-move.mp4" type="video/mp4">
  </video>
</div>

Windows에서는 창의 가장자리나 모서리를 드래그해 캐릭터 창 크기를 조절할 수 있습니다. 트레이 메뉴에도 몇 가지 빠른 프리셋이 있습니다.

1. AIRI 트레이 아이콘을 오른쪽 클릭합니다.
2. **크기 조절**을 엽니다.
3. **권장**, **전체 높이**, **절반 높이**, **전체 화면** 중 하나를 고릅니다.

같은 트레이 메뉴의 **정렬 위치**를 이용하면 창을 화면 중앙이나 모서리에 배치할 수 있습니다.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-160 translate-x--20 lg:scale-150 lg:translate-x--40 lg:translate-y-10">
    <source src="/assets/tutorial-basic-resize.mp4" type="video/mp4">
  </video>
</div>

## 확인해 볼 만한 설정

첫 대화가 잘 동작한 뒤에 살펴보면 좋은 페이지들입니다.

- **서비스 소스**: 채팅, 음성, 전사, 그림 프로바이더를 추가하거나 수정합니다.
- **바디 모듈**: 의식, 목소리, 청각, 시각, 기억, Discord, Minecraft, Factorio, MCP 등 각 모듈에 AIRI가 어떤 프로바이더를 쓸지 고릅니다.
- **캐릭터 모델**: Live2D와 VRM 모델을 전환하거나 직접 만든 모델을 불러옵니다.
- **AIRI 캐릭터 카드**: 활성 캐릭터를 바꾸거나 새로 만듭니다.
- **시스템**: 언어, 테마, 분석 수집 여부, 데스크톱 전용 옵션을 설정합니다.

일부 모듈은 아직 실험적이며 로컬 소스 설정이나 외부 서비스가 필요할 수 있습니다. Windows를 중심으로 한 더 자세한 안내는 [전체 데스크톱 사용 설명서](./setup-and-use/)를 참고하세요.
