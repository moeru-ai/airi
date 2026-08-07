---
title: Project AIRI 사용 설명서
authors:
  - name: MuGewRayce
    role: Lead writing team
    kind: person
  - name: JhIcefair
    role: Contributing editor (primary)
    kind: person
publishedAt: 2026-05-11
publishedAtOverride: May 11, 2026 – afternoon (UTC+8)
---

대응 버전: AIRI-0.10.2

::: warning 시작하기 전에
- AIRI의 일부 기술적 기능과 조작은 이 설명서에서 자세히 다루지 않습니다.
- 주 편집자는 중국어판만 담당합니다. 다른 언어판은 현재 AI 번역에 간단한 수동 교정을 거친 것이라 실제 표시되는 내용과 다를 수 있습니다. 실제 내용을 기준으로 봐 주세요.
- 이 설명서의 대부분은 편집장 팀원들과 다른 참여자들이 직접 탐색하고 조사한 내용입니다. 사실과 다르거나 편차가 있을 수 있으니 최종적으로는 여러분의 실제 경험을 기준으로 삼아 주세요.
- 이 설명서는 제때 갱신되지 않을 수 있습니다.
- 역량과 시간의 한계로, 현재 이 설명서는 Windows 설치 패키지 버전과 웹 버전의 일부 상세 튜토리얼만 다룹니다.
- 소프트웨어의 일부는 번역 없이 영어로 표시됩니다. 이 설명서는 그 부분을 번역해 두었지만, 최종 해석은 실제 소프트웨어를 따라야 합니다.
- AIRI의 버전 업데이트로 일부 내용이 바뀔 수 있습니다. 이 설명서는 작성 시점의 최신 버전 기능만 소개합니다. 그 이전이나 이후 버전에 대해서는 일부 기능 설명이 남아 있을 수 있으니, 차이가 있다면 직접 판단해 주세요.
- 이 설명서에 대해 질문이 있으면 공식 Project AIRI Discord 채널에서 @jhicefair를 멘션하고 메시지를 남겨 주세요.
- 그 밖의 질문은 공식 Project AIRI Discord 채널에 남겨 주세요.
- 즐겁게 사용하세요! AwA
:::

## 목차

- [1장 – 설치](#chapter-1-installation)
- [2장 – 초기 설정](#chapter-2-initial-configuration)
  - [1절 – 준비](#chapter-2-prerequisites)
  - [2절 – Airi를 실행하자!](#chapter-2-launch)
- [3장 – Airi 인터페이스 개요](#chapter-3-interface-overview)
  - [메인 창](#chapter-3-main-window)
  - [시스템 트레이의 그 외 옵션](#chapter-3-system-tray)
  - [설정 창](#chapter-3-settings-overview)
  - [채팅 창](#chapter-3-chat-window)
- [4장 – 설정](#chapter-4-settings)
  - [AIRI 캐릭터 카드](#chapter-4-airi-card)
  - [바디 모듈](#chapter-4-modules)
  - [장면](#chapter-4-stage)
  - [캐릭터 모델](#chapter-4-character-model)
  - [메모리 뱅크](#chapter-4-memory-bank)
  - [서비스 소스](#chapter-4-providers)
  - [데이터](#chapter-4-data)
  - [연결](#chapter-4-connection)
  - [시스템](#chapter-4-system)
- [웹 버전 기능 보충](#web-features)
- [과거 특성 & 자주 겪는 문제](#features-issues)
- [끝에 남기는 말](#chapter-ed-toeveryeditor)

<a id="chapter-1-installation"></a>
## 1장 – 설치

Project AIRI GitHub 홈페이지로 이동합니다: [moeru-ai/airi](https://github.com/moeru-ai/airi)

다음 순서를 따르세요:

1. 페이지 오른쪽에서 "**Releases**" 항목을 찾습니다.
2. "+ 68 releases"를 클릭합니다.
3. 버전을 하나 고르고 그 아래 "**Assets**"를 찾아 펼칩니다.
4. 사용하는 컴퓨터에 맞는 버전을 골라 내려받습니다.
5. 내려받은 설치 파일을 찾아 더블클릭해 설치합니다.

::: tip 다운로드 페이지 참고
- "+ 68 releases"의 숫자는 다른 릴리스가 몇 개 있는지만 나타내므로 여러분 화면에서는 다를 수 있습니다.
- 하단의 "Show all 19 assets"를 눌러야 할 수도 있고, 이 숫자도 다를 수 있습니다.
- 이후 내용은 Windows 설치 파일 버전을 예로 듭니다.
- 시간 제약으로 설치 과정 자체는 생략합니다. 이 정도는 직접 하실 수 있을 겁니다.
:::

<a id="chapter-2-initial-configuration"></a>
## 2장 – 초기 설정

<a id="chapter-2-prerequisites"></a>
### 1절 – 준비

시작하기 전에 LLM 서비스 제공자의 API를 최소 하나 준비해야 합니다.

::: info 용어
* LLM

LLM은 Large Language Model(대규모 언어 모델)의 약자입니다.
간단히 말해 AI입니다.

* API

API는 Application Programming Interface의 약자입니다.
서로 다른 소프트웨어가 통신하고 데이터를 주고받고 기능을 공유할 수 있게 하는, 미리 정의된 규칙의 모음입니다.
깊이 이해할 필요는 없고, 어떻게 얻는지만 알면 됩니다.
:::

::: tip API 얻기
LLM 제공자는 아주 많고 API를 얻는 방법도 각기 다릅니다. 시간 제약으로 여기서는 튜토리얼이나 예시를 제공하지 않습니다. 검색해 보거나 AI에게 물어보세요.
:::

::: warning API 키를 안전하게 보관하세요
API를 얻으면 안전하게 보관하고 다른 사람과 공유하지 마세요.
:::

<a id="chapter-2-launch"></a>
### 2절 – Airi를 실행하자!

::: info 예시
아래 단계는 Deepseek을 예시 제공자로 사용합니다.
:::

[과거 특성: 시작 시 발생하는 버그](#h2-2-1)

다음 순서로 첫 설정을 마칩니다:

1. Airi를 엽니다 (보통 설치 후 자동으로 열립니다).
2. 메인 창에서 언어를 선택합니다.
3. "**setup with your provider**"를 클릭합니다. 또는 "**Login**"을 클릭합니다 (로그인을 선택하는 과정에 대한 간단한 안내).
4. 서비스 소스를 선택하고 "**Next**"를 클릭합니다.
5. API 키를 입력하고 "**Next**"를 클릭합니다.
6. 다시 "**Next**"를 클릭합니다.
7. 사용할 모델을 선택하고 "**Save and continue**"를 클릭합니다.

축하합니다! Airi의 초기 설정을 완료했습니다.

<a id="chapter-3-interface-overview"></a>
## 3장 – Airi 인터페이스 개요

<a id="chapter-3-main-window"></a>
### > 메인 창

[웹 버전 메인 인터페이스 소개](#chapter-3-main-web)

이 창은 가상 캐릭터를 표시합니다. 버튼이 세 개 있습니다: [과거 특성](#h3-1-1)

- "Expand" – 오른쪽 아래. 클릭하면 더 많은 옵션이 나타납니다 (아래 참고).
- "Open hearing control" – 오른쪽 아래. Airi에게 말을 걸 수 있게 합니다. STT 서비스가 필요합니다.
- "Move" – 오른쪽 아래. 길게 누른 뒤 끌어서 메인 창의 위치를 옮깁니다.

![Airi main window overview](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-main-window.avif)

::: info 청각 제어에 대하여
채팅 창을 먼저 열어야 하는 것 같습니다. 편집자에게는 아직 이 기능이 동작하지 않아 튜토리얼은 생략합니다.
:::

::: info 용어
* STT

STT는 Speech-to-Text의 약자로 자동 음성 인식(ASR)이라고도 합니다.
컴퓨터가 사람의 말을 이해해 텍스트로 변환하게 하는 것이 목표입니다.
:::

"Expand"를 클릭하면 아홉 개 옵션이 나타납니다: **(로그인 버튼 & 작은 버튼 여덟 개)**

- "Login" – 자신의 Airi 계정으로 로그인할 수 있습니다.
- "Open settings" – 설정 창을 엽니다.
- "Switch character" – 캐릭터 카드를 전환합니다.
- "Open chat" – 채팅 창을 엽니다.
- "Refresh" – 메인 창을 새로 고칩니다.
- "Switch to dark mode" – 라이트/다크 테마를 전환합니다.
- "Unpin" – 메인 창을 항상 위에 두지 않게 합니다.
- "Always show" / "Hide on hover" – 창을 클릭이 통과하도록 합니다.
- "Close" – Airi를 닫습니다.

![Airi expanded controls menu](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-controls-island-expanded.avif)

<a id="chapter-3-system-tray"></a>
### > 시스템 트레이의 그 외 옵션

먼저 시스템 트레이에서 Airi 아이콘을 찾습니다.

::: tip Windows 작업 표시줄 팁
Windows에서는 작업 표시줄의 "숨겨진 아이콘 표시" 를 눌러야 Airi 아이콘을 찾을 수 있습니다.
:::

Airi 아이콘을 오른쪽 클릭하면 열 개 옵션이 보입니다:

- "Show" – 메인 창을 띄웁니다. 보통 필요하지 않습니다.
- "Adjust size" – 메인 창 크기를 조절하고 가운데로 정렬합니다. 하위 옵션 네 개가 있습니다:
  - "Recommended (450x600)" – 권장 크기인 450x600으로 설정합니다.
  - "Full height" – 창 높이를 바탕화면 전체 높이로 맞춥니다.
  - "Half height" – 창 높이를 바탕화면 절반 높이로 맞춥니다.
  - "Full screen" – 창이 바탕화면 전체를 채우게 합니다.
- "Align to" – 메인 창을 특정 화면 위치에 정렬합니다. 하위 옵션 다섯 개가 있습니다:
  - "Center" – 바탕화면 가운데로 정렬합니다.
  - "Top left" – 왼쪽 위 모서리로 정렬합니다.
  - "Top right" – 오른쪽 위 모서리로 정렬합니다.
  - "Bottom left" – 왼쪽 아래 모서리로 정렬합니다.
  - "Bottom right" – 오른쪽 아래 모서리로 정렬합니다.
- "Settings" – 설정 창을 엽니다.
- "About" – 상세 설명 생략.
- "Open quick actions" – 상세 설명 생략.
- "Open widgets" – 상세 설명 생략.
- "Open caption" – 자막을 엽니다. Airi가 말할 때 텍스트를 표시하려면 TTS 서비스가 필요하며, 기본적으로 마우스를 올리면 숨겨집니다.
- "Caption overlay" – 하위 옵션 두 개가 있습니다:
  - "Follow window" – 기본값. 자막 위치가 메인 창을 따라갑니다.
  - "Reset position" – 자막 위치를 초기화합니다.
- "Quit" – Airi를 닫습니다.

::: info 용어
* TTS

TTS는 Text-to-Speech의 약자로, 문자 텍스트를 자연스러운 음성 출력으로 변환합니다.
:::

<a id="chapter-3-settings-overview"></a>
### > 설정 창

::: info 범위
이 절은 창에 무엇이 들어 있는지만 설명합니다. 자세한 기능은 4장에서 다룹니다.
:::

다음 두 가지 방법으로 설정을 열 수 있습니다:

- 메인 창에서 "Expand"를 클릭한 뒤 "Open settings"를 선택합니다.
- Airi 트레이 아이콘을 오른쪽 클릭하고 "Settings"를 선택합니다.

설정 창에는 아홉 개 섹션이 있습니다:

- "AIRI Character Card" – 캐릭터 성격을 설정합니다.
- "Body Modules" – 여러 기능을 설정합니다: 의식, 발화, 청각, 시각, 단기 기억, 장기 기억, Discord, X/Twitter, Minecraft, Factorio, MCP 서버, 리듬 게임.
- "Scene" – Airi의 장면(배경)을 설정합니다.
- "Character Model" – 캐릭터 모델을 선택하고 설정합니다.
- "Memory Bank" – 아직 공개되지 않았습니다.
- "Service Sources" – LLM, TTS, STT, Artistry 서비스를 설정합니다.
- "Data" – Airi의 데이터를 관리합니다.
- "Connection" – WebSocket 서버 주소를 설정합니다.
- "System" – 하위 섹션 네 개가 있습니다:
  - "General" – 테마, 언어 등.
  - "Color Scheme" – 테마 색상을 변경합니다.
  - "Window Shortcuts" – 현재 비어 있고 뒤로 가기 버튼이 없습니다.
  - "Developer" – 고급 기능. 4장 참고.

::: warning "Window Shortcuts"를 열지 마세요
이 옵션은 현재 내용도 없고 뒤로 가기 버튼도 없습니다. 한번 들어가면 설정 창을 닫고 다시 열어야 나올 수 있습니다.
:::

![Airi settings window overview](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-settings-window.avif)

<a id="chapter-3-chat-window"></a>
### > 채팅 창

메인 창에서 "Expand"를 클릭하고 "Open chat"을 선택하면 채팅 창을 열 수 있습니다.

![Airi chat window interface](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-chat-window.avif)

여기서 Airi와 대화할 수 있습니다.

<a id="chapter-4-settings"></a>
## 4장 – 설정

다음 두 가지 방법으로 설정을 열 수 있습니다:

- 메인 창에서 "Expand"를 클릭한 뒤 "Open settings"를 선택합니다.
- Airi 트레이 아이콘을 오른쪽 클릭하고 "Settings"를 선택합니다.

<a id="chapter-4-airi-card"></a>
### > AIRI 캐릭터 카드

여기서 기본 캐릭터 카드를 업로드하거나 새로 만들거나 수정할 수 있습니다.

![Airi character card settings window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-airi-card.avif)

::: info 업로드에 대하여
업로드 대화상자는 어떤 파일 형식이든 지원한다고 하지만, 편집자가 실제로 써 본 적이 없고 내보내기 기능도 없어서 상세 설명은 생략합니다.
:::

새 캐릭터 카드를 만들 때 권장하는 순서는 다음과 같습니다:

1. **Identity**를 작성합니다. 이름, 별명, 설명, 제작자 노트가 포함됩니다.
2. 그다음 **Behavior**를 조정합니다. 성격, 시나리오, 첫 인사가 포함됩니다.
3. 필요하면 **Modules**에서 캐릭터별 바디 모듈을 설정합니다.
4. 필요에 따라 **Artistry** 섹션을 설정해 그 캐릭터의 이미지 생성 기능을 구성합니다.
5. 마지막으로 **Settings**를 확인합니다. 시스템 프롬프트, 히스토리 프롬프트 지시, 버전이 포함됩니다.
6. 준비가 되면 "**Create**"를 클릭해 캐릭터 카드를 만듭니다.
7. 만든 뒤에는 카드 오른쪽 아래의 원을 클릭하거나, 카드를 선택하고 Activate를 클릭해 활성화합니다.

**Identity**에서 가장 중요한 항목은 이름과 설명입니다:

- 이름은 공식 명칭입니다. 별명을 설정하면 별명이 먼저 사용됩니다.
- 설명은 상세한 성격입니다. 창의적으로 쓰거나 기본 캐릭터 카드를 참고하세요.

::: info 편집자 노트
- 기본 캐릭터 카드를 참고한다면 ACT 태그에 관한 부분은 생략해도 됩니다.
- 편집자는 제작자 노트를 써 본 적이 없어 상세 설명은 생략합니다.
- 편집자가 Behavior, Modules, Artistry, Settings를 아직 충분히 테스트하지 못했습니다. 위에는 대략적인 용도만 적어 두었습니다.
:::

::: warning 활성화가 필요합니다
새로 만든 카드는 기본적으로 활성화되지 않습니다. 직접 활성화해야 합니다.
:::

<a id="chapter-4-modules"></a>
### > 바디 모듈

여기서 Airi의 여러 기능을 다음과 같이 설정할 수 있습니다:

![Airi body modules settings window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-modules.avif)

#### > 의식 (Consciousness)

권장 순서:

1. 먼저 서비스 소스를 선택하거나, 새로 추가한 뒤 선택합니다.
2. 그다음 모델을 선택합니다.

::: tip 서비스 소스가 너무 많을 때
소스가 너무 많아 뒤쪽 항목을 클릭할 수 없으면, 탭 위에 마우스를 올리고 가운데 버튼을 누른 채 좌우로 끌어 보세요.
:::

![Airi consciousness settings window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-consciousness.avif)

#### > 발화 (Vocalization)

::: tip 발화 관련 참고
- 서비스 소스에 따라 설정 과정이 조금씩 다를 수 있습니다. 이 절은 알리바바 Bailian을 예로 들었으니 실제 화면을 따라 주세요.
- 일부 서비스에서는 Pitch 조절이 동작하지 않을 수 있습니다.
- 소스가 너무 많아 뒤쪽 항목을 클릭할 수 없으면, 탭 위에 마우스를 올리고 가운데 버튼을 누른 채 좌우로 끌어 보세요.
:::

권장 순서:

1. 먼저 서비스 소스를 선택하거나, 새로 추가한 뒤 선택합니다.
2. 그다음 모델을 선택합니다.
3. 이어서 목소리를 선택합니다.
4. Airi가 말하지 않게 하려면 "None"을 선택합니다.
5. 기본 설정을 마친 뒤에는 이 페이지 하단에 텍스트를 입력하고 "**Test voice**"를 클릭해 샘플을 생성할 수 있습니다.

![Airi vocalization settings window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-speech.avif)

#### > 청각 (Hearing)

::: tip 서비스 소스가 너무 많을 때
소스가 너무 많아 뒤쪽 항목을 클릭할 수 없으면, 탭 위에 마우스를 올리고 가운데 버튼을 누른 채 좌우로 끌어 보세요.
:::

권장 순서:

1. 먼저 오디오 입력 장치를 선택합니다.
2. 그다음 서비스 소스를 선택하거나, 새로 추가한 뒤 선택합니다.
3. 그다음 모델을 선택합니다.

![Airi hearing settings window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-hearing.avif)

추가로 다음을 할 수 있습니다:

- "Auto-send transcribed text"를 켜면 전사된 텍스트가 자동으로 전송됩니다.
- 끄면 전송 전에 전사 결과를 다듬을 수 있습니다.
- "Auto-send delay"로 전송 지연을 조정할 수 있습니다.

::: info 편집자 노트
"자동 전송을 끄면 전사 결과를 다듬을 수 있다" 는 것은 편집자의 추측입니다. 편집자는 청각 기능을 아직 제대로 써 보지 못했습니다.
:::

마이크를 테스트하려면:

1. 페이지 중간의 "**start monitoring**"을 클릭합니다.
2. 필요하면 Sensitivity를 조정합니다.

STT를 테스트하려면:

1. 페이지 하단의 "**start speech-to-text**"를 클릭합니다.
2. "Transcription Result"에서 결과를 확인합니다.

#### > 시각 (Vision)

::: tip 서비스 소스가 너무 많을 때
소스가 너무 많아 뒤쪽 항목을 클릭할 수 없으면, 탭 위에 마우스를 올리고 가운데 버튼을 누른 채 좌우로 끌어 보세요.
:::

권장 순서:

1. 먼저 서비스 소스를 선택하거나, 새로 추가한 뒤 선택합니다.
2. 그다음 모델을 선택합니다.
3. 필요하면 "Capture interval"로 캡처 빈도를 조절합니다.

![Airi vision settings window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-vision.avif)

::: warning Vision Capture가 필요합니다
이 기능은 `System → Developer → vision capture`에서 `vision capture`를 활성화해야 합니다. 자세한 내용은 해당 절을 참고하세요.
:::

#### > 그림 (Artistry)

::: tip 서비스 소스가 너무 많을 때
소스가 너무 많아 뒤쪽 항목을 클릭할 수 없으면, 탭 위에 마우스를 올리고 가운데 버튼을 누른 채 좌우로 끌어 보세요.
:::

여기서 Airi의 예술적 창작 능력을 설정할 수 있습니다.

참고: 이 기능은 **Neuro의 그림 로직과는 다릅니다.** 서드파티 AI 서비스로 이미지를 생성해 아주 정교한 **AI 생성 이미지**를 얻을 수 있습니다.

시간 제약으로 이 절은 당장은 자세히 다루지 않습니다.


#### > 단기 기억 (Short-term Memory)

아직 공개되지 않았습니다.

#### > 장기 기억 (Long-term Memory)

아직 공개되지 않았습니다.

#### > Discord

여기서 Discord 봇을 설정해 Airi가 여러분의 Discord 서버에 들어와 상호작용하게 할 수 있습니다.

권장 순서:

1. Discord 봇 토큰을 얻습니다.
2. 해당 입력란에 넣습니다.
3. 나머지 설정은 화면을 보고 마칩니다.

::: warning Discord 봇에 대하여
이 기능은 Discord 봇이 필요한데, 설치 파일 버전에는 포함되어 있지 않습니다. GitHub 페이지에서 관련 파일을 받아야 합니다. 편집자에게 이 항목의 우선순위가 낮아 전체 튜토리얼은 생략합니다.
:::

#### > X/Twitter

Discord와 비슷하며 봇이 필요합니다. 튜토리얼 생략.

#### > Minecraft

봇이 필요합니다. 튜토리얼 생략.

#### > Factorio

봇이 필요합니다. 튜토리얼 생략.

#### > MCP 서버

편집자가 써 본 적이 없습니다. 튜토리얼 생략.

#### > 리듬 게임

편집자가 아직 탐색 중입니다. 튜토리얼 생략.

<a id="chapter-4-stage"></a>
### > 장면 (Scene)

여기서 Airi 메인 인터페이스의 장면, 간단히 말해 Airi 메인 인터페이스의 배경을 설정할 수 있습니다.

프리셋 두 개가 포함되어 있습니다. 장면을 적용하려면 프리셋 가운데의 체크 표시를 클릭하세요 (마우스를 올렸을 때만 나타납니다).

"**Upload to Gallery**"를 클릭해 직접 만든 이미지 장면을 가져올 수도 있습니다.

장면을 지우려면 "**Clear Default**"를 클릭하세요.

<a id="chapter-4-character-model"></a>
### > 캐릭터 모델

여기서 캐릭터 모델을 고르고 설정할 수 있습니다.

![Airi character model settings window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-models.avif)

Airi는 Live2D 모델과 VRM 3D 모델을 지원합니다.

기존 모델로만 전환하고 싶다면:

1. "**select model**"을 클릭해 모델 선택기를 엽니다.
2. 이 버전에는 기본으로 Live2D 두 개와 VRM 두 개가 있습니다.
3. 하나를 선택하고 "**confirm**"을 클릭해 전환합니다.

직접 만든 모델을 가져오려면 "**add**"를 클릭해 Live2D 또는 VRM 모델을 가져옵니다.

::: info 편집자 노트
"Switch to Godot Stage (Experimental)" 옵션에 대해서는, 설명서 편집팀이 아직 이 기능을 충분히 이해하지 못했고 실험 단계로 보이므로 관련 소개는 당장은 생략합니다.
:::

::: warning 모델을 가져오기 전에
- 구형 Live2D 모델은 지원되지 않습니다. "\*.moc3"를 포함한 파일을 사용해야 합니다.
- Live2D 모델을 가져오기 전에 모델 폴더를 "\*.zip" 파일로 압축하세요.
:::

#### > Live2D 모델을 선택한 경우

다음 순서로 진행할 수 있습니다:

1. "Zoom & Position"을 펼쳐 메인 창에서 모델의 크기와 위치를 조정합니다. x는 좌우, y는 상하입니다.
2. "parameters"를 펼쳐 마우스 추적, Idle Animation, 프레임레이트, Auto Blink, Force Auto Blink(대체 타이머), Shadow, 기본 파라미터로 초기화, 모델 캐시 지우기, 그리고 모델별 파라미터 전체를 설정합니다.
3. 대기 애니메이션을 원한다면 모델 zip에 애니메이션 파일이 포함되어 있는지 확인하세요.
4. 필요하면 "Expressions"를 펼쳐 표정 시스템을 활성화합니다.

::: info 편집자 노트
편집자가 이 부분을 아직 충분히 테스트하지 못해 상세 내용이 제한적입니다.
:::

#### > VRM 3D 모델을 선택한 경우

"Scene"을 펼친 뒤 Model Position, 카메라 각도(도), 카메라 거리(줌), 모델 방향(Y축 회전), 모델 시선 방향과 관련 값들을 설정합니다.

::: info 편집자 노트
"Change model"을 포함한 이 절은 시간 제약으로 생략합니다.
:::

<a id="chapter-4-memory-bank"></a>
### > 메모리 뱅크

아직 공개되지 않았습니다.

<a id="chapter-4-providers"></a>
### > 서비스 소스

여기서 Chat(LLM), Speech(TTS), Transcription(STT), Artistry 서비스 소스를 설정할 수 있습니다.

항목을 선택하고, 미리 준비해 둔 서비스 소스를 고른 뒤, 해당 화면에서 필요한 정보를 채우면 설정이 완료됩니다.

또한 Pricing이나 Deployment 같은 기준으로 모든 서비스를 필터링할 수 있습니다.

* Pricing은 세 가지 옵션이 있습니다:

  - All
  - Free
  - Paid

* Deployment는 세 가지 옵션이 있습니다:

  - All
  - Local
  - Cloud

![Airi service sources settings window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-providers.avif)

::: warning 주의해 주세요
일부 서비스의 설정 화면은 제때 유지보수되지 못해 정상 동작하지 않을 수 있습니다. 비슷한 문제를 겪으면 GitHub에 이슈를 제출하거나, (선택한 서비스 소스가 지원한다면) "OpenAI Compatible API" 옵션으로 설정을 시도해 보세요.
:::

::: tip 기술적 조언
현재 시장에는 AI 모델이 아주 많습니다. AIRI가 그 전부를 개별 지원하거나 실시간 유지보수를 보장할 수는 없으므로, **OpenAI 호환 API** 옵션을 고려해 보시길 권합니다. 사용하는 모델이 OpenAI 호환 API를 지원한다면 여기서 설정할 수 있습니다.
:::

<a id="chapter-4-data"></a>
### > 데이터

여기서 Airi의 여러 데이터를 관리할 수 있습니다.

![Airi data settings window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-data-settings.avif)

::: warning 되돌릴 수 없는 동작
이 섹션에서는 데이터를 삭제하고 초기화할 수 있으며, 되돌릴 수 없습니다. 신중히 조작하시고, 삭제나 초기화를 실행하기 전에 다시 확인하세요.
:::

::: tip 알려진 문제
"Open app data folder"에는 현재 폴더가 여러 번 열리는 버그가 있습니다.
:::

이 페이지는 여러 상자로 구성되어 있습니다:

1. 첫 번째 상자에는 "Open app data folder"가 있습니다. "**Open folder**"를 클릭해 엽니다.
2. 두 번째 상자에서는 대화 기록을 가져오거나 내보내거나, 모든 대화 세션을 삭제할 수 있습니다.
3. 세 번째 상자에서는 가져온 모든 모델을 삭제하거나 모듈 설정과 자격 증명을 초기화할 수 있습니다.
4. 네 번째 상자에서는 데스크톱 설정과 상태를 초기화할 수 있습니다.
5. 다섯 번째 상자에서는 모든 프로바이더 설정과 자격 증명을 초기화하거나, 모든 로컬 설정·프로바이더 구성·모델을 지울 수 있습니다.

::: tip 웹 버전 관련 설명
위의 1번과 4번 항목은 웹 페이지에는 없습니다.
:::

<a id="chapter-4-connection"></a>
### > 연결

여기서 WebSocket 서버 주소를 설정할 수 있습니다.

![Airi connection settings window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-websocket-settings.avif)

::: info 편집자 노트
상세 설명 생략.
:::

<a id="chapter-4-system"></a>
### > 시스템

#### > General

여기서 프로그램 테마, 언어 등을 설정할 수 있습니다.

![Airi general system settings window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-system-general.avif)

- 테마는 기본이 라이트입니다. 버튼을 클릭하면 다크 모드로 전환됩니다.
- Language는 인터페이스 언어를 설정합니다.
- Control island icon size는 메인 창 오른쪽 아래 세 버튼의 크기를 바꿉니다.
- 마지막으로 사용 데이터와 크래시 리포트 수집을 허용할지 선택하거나 개인정보 처리방침을 읽을 수 있습니다 ("Privacy Policy" 클릭).

#### > Color Scheme

여기서 테마 색상을 바꿀 수 있습니다.

![Airi color scheme settings window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-system-color-scheme.avif)

- RGB 옵션을 켜면 테마 색상이 RGB 스트립처럼 순환합니다.
- 검은 선을 끌거나 색상 바를 클릭해 테마 색상을 바꿉니다.
- 그 아래에는 색상 미리보기가 있습니다.
- 아래에서 프리셋을 골라 테마 색상을 바꿀 수도 있습니다.

::: tip 색상 프리셋
네모난 상자가 아니라 원 중 하나를 클릭하세요.
:::

#### > Window Shortcuts

::: warning 열지 마세요
이 옵션은 내용도 없고 뒤로 가기 버튼도 없습니다. 한번 들어가면 설정 창을 닫고 다시 열어야 합니다. 클릭하지 마세요.
:::

#### > Developer

여기서 몇 가지 고급 기능을 쓸 수 있습니다.

![Airi developer settings window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-system-developer.avif)

::: info 고급 기능
이 내용 대부분은 영어이며 거의 필요하지 않은 고급 기능이므로, 이 절은 참고용입니다.
:::

첫 번째 상자와 관련 옵션들:

- 첫 번째 상자에서 "**Open**"을 클릭하면 개발자 도구 창이 열립니다 (브라우저의 F12 같은 것).
- 두 번째 "Markdown stress test" – 상세 설명 생략.
- 세 번째 "IO Tracer" – 기능 소개는 당장은 생략.
- 네 번째 "Lag visualization" – 상세 설명 생략.
- 다섯 번째 "Enable stage transition animation" – 상세 설명 생략.
- 여섯 번째 "Use page-specific cutscenes" – 상세 설명 생략.

##### > useMagicKeys tool

::: info 편집자 노트
현재 페이지가 비어 있어 상세 설명 생략.
:::

##### > useElectronWindowMouse

여기서 화면상의 마우스 커서 위치를 감지할 수 있습니다.

![Airi useElectronWindowMouse tool window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-devtools-use-window-mouse.avif)

##### > Displays

여기서 화면상의 마우스 커서 위치를 시각화할 수 있습니다.

![Airi Displays tool window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-devtools-displays.avif)

##### > widgets calling

![Airi widgets calling tool window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-devtools-widgets-calling.avif)

##### > Context Flow

들어오는 컨텍스트 갱신(서버 + 브로드캐스트)과 나가는 채팅 훅을 실시간으로 살펴봅니다. 플러그인 컨텍스트(예: VSCode 코딩 컨텍스트)가 채팅 파이프라인으로 흘러 들어가고 서버 이벤트로 나가는 과정을 확인하는 데 사용하세요.

![Airi Context Flow tool window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-devtools-context-flow.avif)

##### > relative mouse

여기서 이 창 안에서의 마우스 커서 위치를 시각화할 수 있습니다.

![Airi relative mouse tool window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-devtools-relative-mouse.avif)

##### > beat sync visualizer

![Airi beat sync visualizer tool window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-devtools-beat-sync.avif)

##### > WebSocket Inspector

![Airi WebSocket Inspector tool window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-devtools-websocket-inspector.avif)

##### > Plugin Host Debug

![Airi Plugin Host Debug tool window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-devtools-plugin-host.avif)

##### > Updater

상세 소개는 당장은 생략.

##### > Screen Capture

시스템 수준의 화면 캡처 권한을 아직 부여하지 않았다면, 먼저 아래 스크린샷처럼 권한 요청이 나타납니다. 권한을 부여하면 임의의 애플리케이션 창이나 전체 화면을 캡처할 수 있습니다.

상단에 네 개 옵션이 있습니다:

- "applications" – 열려 있는 임의의 애플리케이션 창을 선택하고 "**share window**"를 클릭하면 상단에서 볼 수 있습니다. 캡처 위로 마우스를 옮기고 "stop"을 클릭하면 중지합니다.
- "displays" – 전체 화면을 캡처합니다. "**share screen**"을 클릭하면 볼 수 있고, 캡처 위로 마우스를 옮기고 "stop"을 클릭하면 중지합니다.
- "devices" – 상세 설명 생략.
- "refetch" – 상세 설명 생략.

![Airi Screen Capture tool window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-devtools-screen-capture.avif)

##### > vision capture

화면 캡처 권한을 아직 부여하지 않았다면 이 페이지도 먼저 권한 요청을 보여 줍니다. 권한을 부여하면 페이지가 프레임 캡처를 시작하고 시각 처리 결과를 보여 줄 수 있습니다.

![Airi vision capture tool window](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-devtools-vision-capture.avif)

<a id="web-features"></a>
## > 웹 버전 기능 보충

<a id="chapter-3-main-web"></a>
### > 웹 버전 메인 인터페이스

![Airi Web Interface](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-main-web.avif)

여기서 캐릭터 모델을 보고 직접 대화할 수 있습니다.

크게 세 부분으로 나뉩니다:

- 캐릭터 모델 공간
- 채팅 박스
- 그 외

아래에서는 채팅 박스와 그 외 부분을 중심으로 살펴봅니다.

#### > 채팅 박스

채팅 박스는 두 부분으로 나뉩니다:

- 위쪽은 대화 기록을 표시하고 기록하는 영역입니다
- 아래쪽은 입력란으로, 여기에 입력해 캐릭터와 대화합니다

아래쪽 아래에는 버튼 세 개가 있습니다: (문구는 참고용)

- Conversations (대화 관리. 대화는 서로 독립적입니다)
- Send method (메시지 전송을 확정하는 방식 선택)
- 음성 입력 활성화

#### > 그 외 부분

##### > 상단 영역

세 개 옵션이 있습니다:

- About
- Character Card
- Account & Settings

세 번째 옵션에는 주요 섹션 세 개가 있습니다:

- 계정 정보
- Profile, Flux, Settings
- 로그아웃

###### > Profile

Airi에 로그인한 상태라면 여기서 계정 정보를 관리할 수 있습니다.

상세 설명 생략.

###### > Flux

관련 설명은 당장은 생략.

###### > Settings

데스크톱 버전 설정과 같습니다. 자세한 내용은 [4장](#chapter-4-settings)을 참고하세요.

##### > 하단 영역

네 개 옵션이 있습니다: (문구는 참고용)

- Position & Size
- Delete Chat History
- Toggle Light/Dark
- Background

###### > Position & Size

클릭하면 옵션 왼쪽에 x, y, scale 세 옵션이 새로 나타나고, 웹 인터페이스 왼쪽에 수직 바가 생깁니다. 여기서 x는 모델의 x축 위치, y는 모델의 y축 위치, scale은 모델의 줌(크기)입니다. 웹 인터페이스 왼쪽의 수직 바를 **클릭한 채 끌어서** 이 세 값을 조정할 수 있습니다.

![Adjust position and size on the main interface](/en/docs/manual/tamagotchi/setup-and-use/assets/web-position-size.avif)

###### > Delete Chat History

클릭하면 모든 대화 기록을 한 번에 지웁니다.

::: warning 신중히 진행하세요
삭제한 대화는 복구할 수 없으니 조심해서 조작해 주세요!
:::

###### > Toggle Light/Dark

인터페이스를 "Light" 또는 "Dark" 테마로 전환합니다.

###### > Background

메인 인터페이스의 배경을 바꿉니다.

<a id="features-issues"></a>
## > 과거 특성 & 자주 겪는 문제

### > 자주 겪는 문제

- 구버전에서 0.10.2로 업그레이드할 때, 이전에 모델의 크기와 위치를 바꿔 두었다면 모델이 '사라진' 것처럼 보일 수 있습니다. 이 문제를 겪더라도 걱정하지 마세요. 모델 설정 화면에서 모델의 scale과 위치를 초기화하면 해결됩니다.

<a id="h2-2-1"></a>
### > 특성 H2-2-1

애플리케이션을 처음 시작할 때 이런 버그를 만날 수 있습니다. 메인 인터페이스 테두리가 깜빡이고, 클릭해서 팝업 메뉴를 펼치면 곧바로 다시 접힙니다…

이 버그를 만나더라도 걱정하지 마세요. 아래 순서로 해결할 수 있습니다 (다만 클릭이 빨라야 합니다):

먼저 깜빡이는 테두리가 어두워지는 바로 그 순간에 클릭해서 펼칩니다.

그다음 두 번째 줄의 첫 번째 옵션인 'Refresh'를 빠르게 찾아 클릭합니다. 이렇게 하면 문제가 해결됩니다.

* 이 특성은 수정되었습니다!

<a id="h3-1-1"></a>
### > 특성 H3-1-1

과거 일부 버전에서는 메인 창 오른쪽 위 모서리에도 옵션이 하나 보였습니다:

- "websocket status" – 오른쪽 위. 클릭하면 연결 설정이 열려 WebSocket 서버 주소를 설정할 수 있었습니다.

<a id="chapter-ed-toeveryeditor"></a>
## > 끝에 남기는 말

이 설명서는 주로 비공식 인원이 작성해 공식 사이트에 제출한 것입니다. 내용 유지보수는 보통 Mujiu Yunxuan Studio 구성원이 담당하지만, 이 문서를 편집하고 싶거나 이미 편집한 모든 분들이 문서 앞부분 저자 항목에 이름을 남겨 주시기를 진심으로 바랍니다. 내용을 바꾸든 서식을 다듬든, 이 설명서를 함께 풍성하게 하고 다듬는 데 누구든 참여해 주시길 환영합니다. Airi 프로젝트와 이 설명서에 여러분의 힘을 보태 주세요!

또한 비공식 사용자이면서 이 설명서를 편집할 아이디어가 있다면, 부담 갖지 마시고 그냥 수정해서 Pull Request를 보내 주세요. 다만 이름을 남기는 것을 잊지 마시길 다시 한번 당부드립니다!

여러분의 성원과 협조에 감사드립니다!

감사의 마음으로,
JhIceFair
