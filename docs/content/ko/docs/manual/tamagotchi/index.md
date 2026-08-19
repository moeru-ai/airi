---
title: 데스크톱 빠른 시작
description: 데스크톱 버전을 시작하는 방법
---

## 먼저 대화 시작하기

AIRI를 설치하고 실행한 뒤 온보딩 과정을 완료하세요:

1. 환영 화면에서 필요하다면 오른쪽 위의 <span class="i-lucide:globe inline-block align-[-0.125em]" aria-hidden="true"></span> **지구본 버튼**을 클릭해 인터페이스 언어를 변경하세요.
2. **직접 제공자 설정하기**를 선택하거나, 공식 AIRI 제공자를 사용하려면 **로그인**을 선택하세요.
3. OpenRouter, OpenAI Compatible, DeepSeek, Ollama, Google Gemini, Anthropic 같은 채팅 제공자를 선택하세요.
4. API Key, 로컬 서비스 주소 등 필요한 정보를 입력하세요.
5. 채팅 모델을 선택한 뒤 **저장하고 계속하기**를 선택하세요.
6. 메인 캐릭터 창으로 돌아온 뒤, 오른쪽 아래 컨트롤 아일랜드에서 **확장**을 클릭하세요.
7. **채팅 열기**를 클릭하고 메시지를 입력해 전송하세요.

::: tip Ollama를 로컬에서 쓰시나요?
Ollama는 기본적으로 데스크톱 버전의 개발용 origin과 패키징된 앱 origin에서 오는 요청을 허용합니다. 따라서 로컬 설정에서는 보통 `OLLAMA_ORIGINS`가 필요하지 않습니다. 기본값이 아닌 원격 웹 origin에서 CORS 오류가 발생하면 해당 origin을 정확히 `OLLAMA_ORIGINS`에 추가한 뒤 Ollama를 재시작하세요. 와일드카드를 사용하거나 Ollama를 공개 인터넷에 노출하지 마세요.
:::

<br />

<video controls autoplay loop muted>
 <source src="/assets/tutorial-basic-setup-providers.mp4" type="video/mp4">
</video>

## 화면 구성

데스크톱 버전은 보통 다음 인터페이스로 구성됩니다:

- **메인 캐릭터 창**: Live2D, Spine, VRM, MMD, Tachie를 지원하는 바탕화면 상주형 캐릭터 무대입니다.
- **컨트롤 아일랜드**: 메인 캐릭터 창 오른쪽 아래에 있는 작은 버튼 묶음입니다.
- **채팅 창**: 컨트롤 아일랜드에서 여는 대화 창입니다.
- **설정 창**: 제공자, 프로필, 모델, 모듈, 데이터, 연결, 시스템 옵션을 설정합니다.
- **시스템 트레이 메뉴**: 창 크기와 위치를 조정하고, 설정을 열고, 자막과 위젯을 관리하고, AIRI를 종료할 수 있습니다.

메인 캐릭터 창이 숨겨졌다면 AIRI 트레이 아이콘을 클릭하거나 트레이 메뉴에서 **표시**를 선택해 다시 불러올 수 있습니다.

## 컨트롤 아일랜드

컨트롤 아일랜드는 데스크톱 앱을 일상적으로 사용할 때의 주요 진입점입니다.

- **확장**을 클릭하면 더 많은 동작이 나타납니다.
- **채팅 열기**를 클릭하면 채팅 창이 열립니다.
- **설정 열기**를 클릭하면 제공자, 모델, 모듈, 프로필, 시스템 설정을 구성할 수 있습니다.
- **프로필 전환**을 클릭하면 현재 캐릭터 카드를 바꿀 수 있습니다.
- 필요하면 **새로고침**을 클릭해 무대를 다시 불러올 수 있습니다.
- 라이트/다크 아이콘을 클릭하면 테마가 바뀝니다.
- 핀 아이콘을 클릭하면 **항상 위에 고정**을 켜고 끌 수 있습니다.
- 눈 아이콘을 클릭하면 **자동 숨김** / **항상 표시**를 전환할 수 있습니다.
- **청각 컨트롤 열기**를 클릭하면 음성 입력 컨트롤이 열립니다.
- **드래그로 창 이동**을 드래그해 메인 캐릭터 창을 옮길 수 있습니다.

## 호버 시 숨김

눈 아이콘은 AIRI가 완전히 상호작용 가능한 상태를 유지할지, 아니면 작업하는 동안 방해가 되지 않도록 흐려질지를 결정합니다.

- **항상 표시**는 캐릭터를 계속 보이게 하고 클릭도 가능하게 둡니다.
- **자동 숨김**은 커서가 가까이 오면 캐릭터와 인터페이스를 흐리게 만들어 아래에 있는 애플리케이션을 더 쉽게 클릭할 수 있게 합니다.

호버 시 숨김을 처음 켜면 AIRI가 짧은 안내를 보여 줍니다. AIRI를 클릭하기 어려워졌다면 컨트롤 아일랜드 근처로 커서를 옮긴 뒤 눈 아이콘을 다시 클릭해 끄세요.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-180 translate-x--30 translate-y--2 lg:scale-150 lg:translate-x--40">
    <source src="/assets/tutorial-basic-fade-on-hover.mp4" type="video/mp4">
  </video>
</div>

## 이동과 크기 조절

메인 캐릭터 창을 옮기려면 컨트롤 아일랜드 오른쪽 아래의 이동 버튼을 드래그하세요.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-225 translate-x--45 translate-y--5 lg:scale-200 lg:translate-x--80 lg:translate-y--5">
    <source src="/assets/tutorial-basic-move.mp4" type="video/mp4">
  </video>
</div>

Windows에서는 창의 가장자리나 모서리를 드래그해 크기를 조절할 수 있습니다. 트레이 메뉴에도 자주 쓰는 몇 가지 크기가 준비되어 있습니다:

1. AIRI 트레이 아이콘을 오른쪽 클릭하세요.
2. **크기 조절**을 여세요.
3. **권장 (450x600)**, **전체 높이**, **절반 높이**, **전체 화면** 중 하나를 선택하세요.

같은 트레이 메뉴의 **정렬 위치**를 이용하면 창을 화면 중앙이나 네 모서리로 옮길 수 있습니다.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-160 translate-x--20 lg:scale-150 lg:translate-x--40 lg:translate-y-10">
    <source src="/assets/tutorial-basic-resize.mp4" type="video/mp4">
  </video>
</div>

## 확인해 볼 만한 설정

첫 대화를 마친 뒤 다음 페이지들을 살펴보세요:

- **제공자**: 채팅, 비전, 음성 합성, 전사, Artistry 제공자를 추가하거나 수정합니다.
- **모듈**: 의식, 음성 합성, 청각, 비전, 기억, Discord, Minecraft, Factorio, MCP 등 각 모듈에 사용할 서비스를 선택합니다.
- **모델**: 지원되는 2D/3D 모델을 전환하거나 직접 만든 모델을 불러옵니다.
- **AIRI 카드**: 현재 캐릭터를 바꾸거나 새 캐릭터 카드를 만듭니다.
- **시스템**: 언어, 테마, 사용 분석 설정, 데스크톱 전용 옵션을 설정합니다.

일부 모듈은 실험적이며 로컬 소스 설정이나 추가 서비스가 필요합니다. 자세한 안내는 [전체 데스크톱 사용 설명서](./setup-and-use/)를 참고하세요.
