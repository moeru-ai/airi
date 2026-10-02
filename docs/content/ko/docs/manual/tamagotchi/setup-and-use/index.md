---
title: Project AIRI 사용 설명서
authors:
  - name: MuGewRayce
    aliases:
      - MuGewRayce
    role: Lead writing team
    kind: person
  - name: JhIcefair
    role: Contributing editor (primary)
    kind: person
  - name: 0xSelenicDove
    githubUsername: 0xSelenicDove
    role: Contributing editor
    kind: person
---
이 설명서는 AIRI 0.11.3 버전에 대응합니다.

::: warning 시작하기 전에
- AIRI의 일부 기능과 조작은 이 설명서에서 자세히 다루지 않습니다.
- 중국어판이 원본입니다. 다른 언어판은 기계 번역에 간단한 수동 교정을 거친 것이라 표현이 앱과 다를 수 있습니다. 차이가 있으면 항상 앱을 기준으로 삼아 주세요.
- 이 설명서는 참여자들이 직접 조사한 내용을 바탕으로 하며, 불완전하거나 부정확하거나 오래된 내용이 있을 수 있습니다.
- 이 설명서는 데스크톱 앱을 중심으로 다루며 일부 웹 튜토리얼을 포함합니다. 두 버전은 일부 영역에서 다르므로, 서로 충돌할 때는 앱을 따라 주세요.
- AIRI 업데이트로 문서화된 동작이 바뀔 수 있습니다. 이 설명서는 작성 시점의 버전을 설명하므로, 이후 버전은 앱과 최신 릴리스 노트를 참고하세요.
- 이 설명서에 대해 질문이 있으면 [Project AIRI 공식 Discord](https://discord.gg/TgQ3Cu2F7A) 채널에서 @jhicefair 또는 @0x_selenic_dove에게 메시지를 남겨 주세요.
- WeChat 그룹 참여: [WeChat 그룹 안내](https://github.com/moeru-ai/airi/blob/main/docs/wechat.md)를 열고 QR 코드를 스캔해 관리자의 WeChat을 추가한 뒤, 참여 요청에 `AIRI`를 포함하세요. 관리자가 그룹에 초대해 드립니다.
- QQ 그룹 참여: [QQ 그룹 초대 링크](https://qun.qq.com/universal-share/share?ac=1&authKey=9g00d%2BZS7nORzcJugNNddJ7rCghZTIR7fhXabGwch2S%2BG%2BKGIKwlN1N2nIqkh2jg&busi_data=eyJncm91cENvZGUiOiIxMDU4MTU2Njk3IiwidG9rZW4iOiJmcnkra1hWNFIxNytEcG0zcHRUdVJIaldlRDFxN0dzK080QWtvTEdOQjJkNEY2eUFta1g1clNpbkxSMS9FQWFYIiwidWluIjoiMTI2MDkwNzMzNSJ9&data=b1eJrwn3GVOUh7YIxZ7l9vHQo99HPmRxKPpMKlDCmfzx8Y57IXb2EZCMaOC9rVTd2U558qpNjwUYUWlPHxVHvg&svctype=4&tempid=h5_group_info)를 열고 QQ에서 참여를 확정하세요. 링크가 유효하지 않으면 저장소 README의 최신 링크를 참고하세요.
- AIRI에 관한 다른 질문은 Discord, WeChat 또는 QQ의 커뮤니티 토론에 참여해 주세요.
- AI 친구와 즐겁게 대화하세요! :)
:::

<a id="chapter-1-installation"></a>
## 1장: 설치

[최신 Project AIRI 릴리스](https://github.com/moeru-ai/airi/releases/latest)로 이동해 **Assets**를 펼치고 사용하는 기기에 맞는 파일을 내려받으세요. 패키지를 열고 설치 안내를 따르세요. 아래의 `<version>`은 현재 릴리스에서 사용하는 값으로 바꿔 읽으세요.

| 플랫폼 | 기기 | 내려받을 파일 |
| --- | --- | --- |
| Windows | x64 또는 Windows 11 ARM64 | `AIRI-<version>-windows-x64-setup.exe` |
| macOS | Apple silicon (M 시리즈) | `AIRI-<version>-darwin-arm64.dmg` |
| macOS | Intel | `AIRI-<version>-darwin-x64.dmg` |
| Linux | Ubuntu 등 x64 Debian 계열 | `AIRI-<version>-linux-amd64.deb` |
| Linux | Fedora, openSUSE 등 x64 RPM 계열 | `AIRI-<version>-linux-x86_64.rpm` |
| Linux | Ubuntu 등 ARM64 Debian 계열 | `AIRI-<version>-linux-arm64.deb` |
| Linux | Fedora, openSUSE 등 ARM64 RPM 계열 | `AIRI-<version>-linux-aarch64.rpm` |
| Android | 지원되는 HarmonyOS 기기를 포함한 Android 기기 | `AIRI-<version>-android.apk` |
| iOS/iPadOS | iPhone, iPad | iOS/iPadOS용 `.ipa` 에셋 |

::: info Windows 설치에 대하여
설치 프로그램은 AIRI를 현재 사용자용 또는 모든 사용자용으로 설치할 수 있습니다. 현재 사용자용 설치에는 관리자 권한이 필요하지 않습니다. 모든 사용자용 설치는 관리자 권한이 필요하며, 컴퓨터의 모든 사용자가 AIRI를 사용할 수 있게 됩니다.
:::

::: info iPhone과 iPad 설치에 대하여
현재는 IPA 파일만 제공됩니다. 직접 서명하고 수동으로 설치해야 하며, 상세한 설치 안내는 아직 제공되지 않습니다.

프로젝트 팀은 추후 TestFlight 테스트 링크를 공개할 예정입니다.
:::

::: info HarmonyOS에 대하여
네이티브 HarmonyOS 버전은 현재 제공되지 않습니다. HarmonyOS NEXT를 사용한다면 Zhuoyitong(卓易通)으로 Android 버전 AIRI를 설치하세요.
:::

<a id="chapter-2-initial-configuration"></a>
## 2장: 초기 설정

AIRI를 사용하기 전에 최소 하나의 채팅 제공자와 사용 가능한 채팅 모델이 필요합니다. 클라우드 서비스는 보통 API Key나 로그인 계정이 필요하고, 로컬 서비스는 먼저 모델 서비스를 시작해야 합니다.

다음 순서로 초기 설정을 마치세요:

1. AIRI를 열고 온보딩 과정을 시작하세요.
2. 환영 화면에서 필요하면 오른쪽 위의 <span class="i-lucide:globe inline-block align-[-0.125em]" aria-hidden="true"></span> **지구본 버튼**을 클릭해 인터페이스 언어를 변경하세요.
3. 자신의 제공자를 사용하려면 **Setup with your provider**를, AIRI 공식 제공자를 사용하려면 **Sign in**을 선택하세요. 어떤 제공자를 사용할지 모르겠다면 [AIRI 공식 제공자](../../config/providers/consciousness/official.md), [OpenRouter](../../config/providers/consciousness/openrouter.md), [OpenAI Compatible](../../config/providers/consciousness/openai.md), 또는 로컬 [Ollama](../../config/providers/consciousness/ollama.md) 인스턴스부터 시작하세요.
4. 자신의 제공자를 사용하는 경우:
    1. 사용할 제공자를 선택하고 **Next**를 클릭하세요.
    2. API Key를 입력하고, 필요하면 Base URL을 변경한 뒤 **Next**를 클릭하세요.
    3. 사용 분석 안내가 표시되면 내용을 확인하고 **Next**를 클릭하세요.
    4. 사용할 채팅 모델을 선택하고 **Save and Continue**를 클릭하세요.
5. AIRI 공식 제공자를 사용하려면 [AIRI 공식 제공자](../../config/providers/consciousness/official.md)를 참고하세요.

축하합니다! AIRI의 초기 설정을 완료했습니다.

::: tip 우선 채팅만 설정하세요
채팅 제공자와 모델 설정이 완료되면 AIRI가 메시지에 답할 수 있습니다. 이후 음성 합성(TTS), 음성 인식(ASR/STT), 시각 이해, 예술 창작 같은 기능을 추가할 수 있습니다. 설정 방법은 [음성 입력과 출력](../../config/audio.md), [시각 이해](../../config/vision.md) 또는 [예술 창작](#chapter-4-art)을 참고하세요.
:::

::: warning API Key 보안
API Key, AccessKey Secret 같은 서비스 자격 증명은 기기에만 저장해야 합니다. 저장소에 커밋하거나, 이슈에 올리거나, 스크린샷을 찍거나, 다른 사람에게 보내지 마세요.
:::

<a id="chapter-3-interface-overview"></a>
## 3장: AIRI 인터페이스 개요

<a id="chapter-3-main-window"></a>
### 메인 창

이 절은 데스크톱 앱을 중심으로 설명합니다. 웹과 모바일 앱의 많은 부분에도 적용되며, 각각의 고유 기능은 [여기](#chapter-3-main-web)에서 소개합니다.

이 창은 가상 캐릭터를 표시합니다. 주요 컨트롤은 다음과 같습니다:

- **Expand** - 오른쪽 아래에 있습니다. 클릭하면 더 많은 컨트롤이 나타납니다.
- **Open hearing Controls** - 음성 입력 컨트롤을 엽니다.
::: info 청각 컨트롤
먼저 마이크 입력을 켜고 마이크를 선택하세요. 권한 요청이 나타나면 AIRI가 마이크를 사용하도록 허용하세요. 전사 서비스를 설정하면 음성이 전사되어 현재 채팅 세션으로 전송됩니다. AIRI는 피드백을 줄이기 위해 말하는 동안 입력을 일시 중지합니다.
:::

- **Drag to move window** - 마우스 왼쪽 버튼을 누른 채 끌어서 메인 창을 옮깁니다.

**Expand**를 클릭하세요. 사용할 수 있는 컨트롤은 다음과 같습니다:

- **Sign in** — AIRI 계정으로 로그인합니다.
- **Open settings** — AIRI의 설정 인터페이스를 엽니다.
- **Switch Profile** — 프로필을 전환합니다.
- **Open Chat** — 채팅 창을 엽니다.
- **Refresh** — 메인 창을 새로 고칩니다.
- **Move to screen center** — 창을 화면 가운데로 옮깁니다.
- "Switch to dark mode"/"Switch to light mode" - AIRI의 인터페이스 테마를 전환합니다.
- "Pin on top"/"Unpin from top" - AIRI 창을 다른 창들 위에 항상 표시할지 제어합니다.
- "Auto hide"/"Always show" - 포인터를 창 위로 옮겼을 때 AIRI 창이 비켜날지 제어합니다.
- **Close** — 클릭 한 번으로 AIRI를 닫습니다.

![펼쳐진 AIRI 메인 창 컨트롤 메뉴](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-controls-island-expanded.avif)

<a id="chapter-3-system-tray"></a>
### 시스템 트레이의 그 외 옵션

Windows 작업 표시줄 또는 macOS 메뉴 막대에서 AIRI 아이콘을 찾으세요.

::: tip 작업 표시줄/메뉴 막대 아이콘이 보이지 않는다면...
Windows에서는 작업 표시줄의 "숨겨진 아이콘 표시 (⌃)"를 클릭해 펼쳐야 AIRI 아이콘을 찾을 수 있습니다.

디스플레이 노치가 있는 MacBook에서는 AIRI 아이콘이 보이는 메뉴 막대에 들어가지 못할 수 있습니다. **System Settings → Menu Bar**를 열고 다른 메뉴 막대 항목을 숨겨 자리를 만드세요.
:::

AIRI 아이콘을 오른쪽 클릭해 트레이 메뉴를 여세요. 표시되는 항목은 현재 플랫폼과 앱 상태에 따라 다릅니다:

- **Show** — 메인 창을 표시합니다.
- **Adjust sizes** — 메인 창 크기를 조절하고 가운데로 정렬합니다. 하위 옵션 네 개가 있습니다:
  - **Recommended (450x600)** — 권장 크기인 450x600으로 설정합니다.
  - **Full Height** — 메인 창 높이를 바탕화면 전체 높이로 맞춥니다.
  - **Half Height** — 메인 창 높이를 바탕화면 절반 높이로 맞춥니다.
  - **Full Screen** — 메인 창이 바탕화면 전체를 채우게 합니다.
- **Align to** — 메인 창을 특정 바탕화면 위치에 정렬합니다. 하위 옵션 다섯 개가 있습니다:
  - **Center** — 바탕화면 가운데로 정렬합니다.
  - **Top Left** — 바탕화면 왼쪽 위 모서리로 정렬합니다.
  - **Top Right** — 바탕화면 오른쪽 위 모서리로 정렬합니다.
  - **Bottom Left** — 바탕화면 왼쪽 아래 모서리로 정렬합니다.
  - **Bottom Right** — 바탕화면 오른쪽 아래 모서리로 정렬합니다.
- **Settings...** — 설정 인터페이스를 엽니다.
- **About...** — 정보 창을 열어 버전을 확인하고, 프로젝트 홈페이지를 방문하고, AIRI를 업데이트하거나 업데이트 채널을 선택할 수 있습니다.
- **Open Inlay...** — Electron vibrancy와 배경 재질 효과를 테스트하기 위한 실험적 창을 엽니다. Spotlight 프롬프트가 아닙니다.
- **Open Widgets...** — 위젯 창을 엽니다. 지도, 날씨, 그림, 확장 기능이 제공하는 위젯이 여기에 표시됩니다. 해당 도구나 확장 기능이 실행 중이 아니면 창이 비어 있을 수 있습니다.
- **Open Caption...** / **Close Caption...** — 자막을 열거나 닫습니다. TTS가 켜져 있으면 자막에 AIRI가 말하는 텍스트가 표시되고, 기본적으로 포인터를 자막 위에 올리면 숨겨집니다.
- **Caption Overlay** — 하위 옵션 두 개가 있습니다:
  - **Follow window** — 기본으로 선택된 모드입니다. 자막 창이 메인 창을 따라 움직이며, 선택을 해제하면 위치가 독립적으로 유지됩니다.
  - **Reset position** — 자막 위치를 초기화합니다.
- **Quit** — AIRI를 닫습니다.



<a id="chapter-3-settings-overview"></a>
### 설정

::: info 이 절의 범위
이 절은 인터페이스에 무엇이 있는지만 소개합니다. 구체적인 기능은 4장을 참고하세요.
:::

다음 두 가지 방법으로 설정 인터페이스를 열 수 있습니다:

- 메인 창에서 **Expand**를 클릭한 뒤 **Open settings**를 선택합니다.
- 시스템 트레이의 AIRI 아이콘을 오른쪽 클릭하고 **Settings...**를 선택합니다.

설정 내비게이션에는 다음이 포함됩니다:

- **AIRI 카드** - 활성 캐릭터를 선택하고 설정합니다.
- **모듈** - 의식, 음성 합성, 청각, 비전과 각종 연동 같은 AIRI 기능을 설정합니다.
- **장면** - 활성 캐릭터의 배경을 설정합니다.
- **모델** - 캐릭터 표시 모델을 선택하고, 가져오고, 설정합니다.
- **기억** - 기억 설정이 제공되는 대로 여기서 확인할 수 있습니다.
- **제공자** - 채팅, 비전, 음성 합성, 전사, Artistry 제공자를 설정합니다.
- **데이터** - 로컬에 저장된 AIRI 데이터를 내보내거나 초기화하거나 삭제합니다.
- **연결** - AIRI WebSocket 서버와 원격 접근을 설정합니다.
- **시스템** - **General**, **Color Scheme**, **Window Shortcuts**, **Developer** 페이지가 있습니다. 개발자 전용 페이지는 [데스크톱 개발자 도구](/ko/docs/contributing/desktop-developer-tools)를 참고하세요.

![AIRI 설정 개요](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-settings-window.avif)

<a id="chapter-3-chat-window"></a>
### 채팅 창

메인 창에서 **Expand**를 클릭한 뒤 **Open Chat**을 선택하면 채팅 창을 열 수 있습니다.

![AIRI 채팅 창](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-chat-window.avif)

여기서 AIRI와 대화할 수 있습니다. 음성 합성이 켜진 뒤에는 AIRI가 답변을 읽는 동안 **Stop speaking**이 표시됩니다. 이를 클릭하면 생성된 텍스트 답변은 취소하지 않고 현재 음성 재생만 중지합니다.

채팅 창 제목 표시줄의 **Conversations**를 클릭하거나 제목 자체를 클릭하면 대화 목록이 열립니다. 대화는 최근 업데이트 순으로 정렬되며 미리보기와 동기화 상태를 표시합니다. 대화를 전환하거나 삭제할 수 있고, 현재 캐릭터의 새 대화를 만들 수도 있습니다. 삭제는 보통 복구할 수 없으니 내용이 더 이상 필요 없는지 확인하세요.

<a id="chapter-4-settings"></a>
## 4장: 설정

다음 두 가지 방법으로 설정 인터페이스를 열 수 있습니다:

- 메인 창에서 **Expand**를 클릭한 뒤 **Open settings**를 선택합니다.
- 시스템 트레이의 AIRI 아이콘을 오른쪽 클릭하고 **Settings...**를 선택합니다.

<a id="chapter-4-airi-card"></a>
### AIRI 카드

여기서 캐릭터 카드를 가져오고, 만들고, 수정하고, 활성화할 수 있습니다.

![AIRI 캐릭터 카드 설정](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-airi-card.avif)

::: info 가져오기와 내보내기에 대하여
캐릭터 카드는 AIRI 캐릭터 카드 팩으로 가져오거나 내보낼 수 있습니다. 카드 팩은 Character Card V3 데이터를 사용하며 Live2D, Spine, Tachie 또는 VRM 표시 모델을 포함할 수 있습니다. 가져오는 동안 AIRI는 패키지 매니페스트와 캐릭터 카드 데이터를 검증합니다. 형식이 잘못되었거나 필수 파일이 빠진 패키지는 가져올 수 없습니다. AIRI 카드 팩은 명시적 필드 화이트리스트를 사용하며 무손실 CCv3 백업이 아닙니다. 자세한 내용은 [캐릭터 카드 템플릿](../character-card-template.md)을 참고하세요.
:::

캐릭터 카드를 만들려면:

1. 정체성 섹션을 작성하세요. 이름, 별명, 설명, 제작자 노트가 포함됩니다.
2. 성격, 시나리오, 인사말 같은 행동 세부 정보를 추가하세요.
3. **모듈**에서 캐릭터가 선호하는 기능을 설정하세요.
4. 필요하면 **Artistry**에서 이미지 생성 선호 설정을 구성하세요.
5. 시스템 프롬프트, 포스트 히스토리 지시문, 카드 버전이 포함된 **설정**을 검토하세요.
6. **Create**를 클릭하세요.
7. 카드 오른쪽 아래의 컨트롤을 클릭하거나, 카드를 열고 **Activate**를 클릭해 새 카드를 활성화하세요.

정체성 필드 중 가장 중요한 것은 캐릭터의 이름과 설명입니다:

- 이름은 AIRI가 현재 표시하는 캐릭터 이름입니다. Character Card V3는 `nickname` 필드를 지원하지만, 현재 인터페이스와 런타임은 여전히 `name`을 표시합니다.
- 설명은 모델에게 캐릭터가 누구인지 알려 줍니다. 예시가 필요하면 기본 캐릭터 카드를 참고하세요.

::: info 편집자 노트
- 기본 ReLU 프롬프트는 스테이지 감정과 동작을 위한 AIRI의 `ACT` 토큰을 설명합니다. 모델이 그 동작을 제어하게 하려면 커스텀 카드에도 동등한 지시문을 유지하세요. 생략하면 동작과 감정 출력이 줄거나 사라질 수 있습니다.
- 제작자 노트는 캐릭터 카드를 위한 메모일 뿐이며 AIRI의 응답 결과에 영향을 주지 않습니다.
- 행동(Behavior)은 성격, 시나리오, 인사말을 정의합니다. 모듈에서는 채팅, 비전, 음성 합성, 표시 모델 선호를 지정할 수 있습니다. Artistry는 이미지 생성 선호 설정을 저장합니다. 설정에는 시스템 프롬프트, 포스트 히스토리 지시문, 카드 버전이 있습니다.
:::

::: warning 직접 활성화가 필요합니다
캐릭터 카드를 만들어도 자동으로 활성화되지 않습니다. 그 카드로 대화를 시작하기 전에 카드의 활성화 컨트롤을 사용하세요.
:::

<a id="chapter-4-modules"></a>
### 모듈

여기서 AIRI의 활성 기능을 설정합니다.

![AIRI 모듈 설정](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-modules.avif)

#### 의식

**설정 → 모듈 → 의식**을 열어 활성 채팅 제공자와 모델을 선택하세요. 제공자부터 모델까지의 전체 과정은 [채팅 모델](../../config/llm.md)을 참고하세요.
![AIRI 의식 설정](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-consciousness.avif)

#### 음성 합성
**설정 → 모듈 → 음성 합성**을 열어 활성 음성 제공자, 모델, 목소리를 선택하세요. 설정 방법은 [음성 입력과 출력](../../config/audio.md)을 참고하세요. AIRI가 말하지 않게 하려면 **None**을 선택하세요.
::: tip 음성 합성 페이지 보충 설명
- 먼저 제공자와 모델을 선택한 뒤 지원되는 목소리를 선택하세요. 제공자마다 표시되는 필드가 다릅니다.
- Pitch는 이 파라미터를 지원하는 제공자와 모델에만 적용됩니다.
:::

![AIRI 음성 합성 설정](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-speech.avif)

#### 청각
**설정 → 모듈 → 청각**을 열어 전사 제공자, 모델, 오디오 입력을 선택하세요. 설정 방법은 [음성 입력과 출력](../../config/audio.md)을 참고하세요. 아직 음성 입력을 사용하지 않는다면 **None**을 선택하세요.

::: info 음성 인식 (ASR/STT)

STT(Speech-to-Text)는 자동 음성 인식(ASR)이라고도 하며, 음성 오디오를 텍스트로 변환합니다.
:::

::: info macOS에서 음성 입력 사용하기
macOS에서 음성 입력을 처음 사용할 때 권한 요청이 나타나면 AIRI가 마이크에 접근하도록 허용하세요.
![macOS 권한 요청](/en/docs/manual/tamagotchi/setup-and-use/image-7.png)
:::

![AIRI 청각 설정](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-hearing.avif)

추가로 다음을 할 수 있습니다:

- 자동 전송을 위해 Auto-send transcribed text 기능을 켭니다.
- 끄면 전송 전에 전사 결과를 확인하거나 수정할 수 있습니다.
- **Auto-send delay**로 AIRI가 전송 전에 기다리는 시간을 조정합니다.

::: info 자동 전송
자동 전송이 켜져 있으면 인식된 텍스트가 설정된 지연 시간 뒤에 채팅 세션으로 전송됩니다. 꺼져 있으면 직접 전송하기 전에 텍스트를 확인하거나 수정할 수 있습니다.
:::

마이크를 테스트하려면:

1. **Start Monitoring**을 클릭하세요.
2. 필요하면 **Sensitivity**를 조정하세요.

STT 기능을 테스트하려면:

1. **Start Speech-to-Text Test**를 클릭하세요.
2. **Transcription Result**에서 인식된 텍스트를 확인하세요.

#### 비전
**설정 → 모듈 → 비전**을 열어 활성 비전 제공자와 이미지 지원 모델을 선택하고 **Capture interval**을 설정하세요. 전체 과정은 [시각 이해](../../config/vision.md)를 참고하세요.

![AIRI 비전 설정](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-vision.avif)

::: warning 화면 비전을 사용하려면 먼저 Vision Capture를 시작해야 합니다
비전 서비스 제공자와 모델만 설정할 때는 이 도구를 켤 필요가 없습니다.

AIRI가 화면이나 창을 분석하게 하려면 **시스템 → Developer → Vision Capture**를 열고 화면 녹화 권한을 부여한 뒤, 창이나 디스플레이를 선택하고 **Start ticker**를 클릭하세요. 결과를 현재 캐릭터에게 전송하려면 **Publish to character**를 켜세요.

Vision Capture는 현재 데스크톱 디버깅/개발용 워크플로이며, 페이지를 벗어나면 캡처 루프가 중지됩니다. 전체 안내는 [데스크톱 개발자 도구](/ko/docs/contributing/desktop-developer-tools#vision-capture)를 참고하세요.
:::


<a id="chapter-4-art"></a>
#### Artistry (예술 창작)

여기서 AIRI의 예술 창작 능력을 설정할 수 있습니다.

**설정 → 제공자 → Artistry**를 열어 이미지 제공자를 설정한 뒤, **설정 → 모듈 → Artistry**에서 활성화하세요.

::: warning 대화형 Artistry의 도구 호출
일반적인 대화형 Artistry 흐름에서는 AIRI가 설정된 이미지 도구를 현재 **채팅 모델**에 제공하고, 채팅 모델이 그 도구를 호출해 생성 작업을 제출합니다. 이 흐름에는 **Tool Calling / Function Calling**을 지원하는 제공자와 모델이 필요합니다.

**설정 → 모듈 → 의식**에서 제공자가 도구 호출을 지원한다고 명시한 모델을 선택하세요. 일반 텍스트 대화만 가능한 모델은 선택한 이미지 서비스에 작업을 제출하지 않고 텍스트로만 응답할 수 있습니다.

설정을 마친 뒤 캐릭터에게 간단한 이미지를 생성해 달라고 요청하세요. AIRI가 도구 호출을 시작하는지 확인하고, 제공자가 작업 상태·기록·콘솔을 제공한다면 작업이 접수되었는지도 확인할 수 있습니다. 작업이 이미지를 반환하면 AIRI가 결과를 표시합니다. 제공자별 확인 방법은 **설정 → 제공자 → Artistry** 아래의 해당 페이지를 참고하세요.

캐릭터 카드 옵션인 **Cinematic Autonomy (Autonomous Artist)**는 별도의 텍스트 분석 흐름을 사용해 선택한 이미지 제공자를 직접 호출하므로, 이 모드에는 LLM 도구 호출이 필요하지 않습니다.
:::

#### 단기 기억

이 기능은 아직 제공되지 않습니다. 구현 아이디어가 있다면 이슈나 Pull Request를 제출해 주세요.

#### 장기 기억

이 기능은 아직 제공되지 않습니다. 구현 아이디어가 있다면 이슈나 Pull Request를 제출해 주세요.

#### Discord

Discord 연동을 사용하려면 AIRI가 Discord 서버의 메시지·음성 채널에 들어갈 수 있도록 봇 서비스를 소스에서 실행해야 합니다.

1. Discord 애플리케이션을 만들고 [Discord 봇 연동 가이드](/ko/docs/integrations/discord)에 설명된 필수 Intents를 활성화하세요.
2. 저장소에서 Discord 봇 서비스를 시작하세요.
3. AIRI에서 **설정 → 연결**을 열고 **Auth Token**을 봇 서비스 설정에 복사하세요.
4. **설정 → 모듈 → Discord**를 열고 **Bot Token**을 입력한 뒤 **Enable Discord Integration**을 켜고 **Save**를 클릭하세요. 실행 중인 봇 서비스가 AIRI로부터 이 설정을 전달받습니다.

::: warning 자격 증명 보안
Bot Token, AIRI Auth Token과 선택적 전사 자격 증명은 로컬 설정에만 저장해야 합니다. 이 값들을 제출하거나, 스크린샷으로 찍거나, 다른 곳에 보내지 마세요.
:::

#### X / Twitter

X / Twitter 설정 폼은 있지만 AIRI 0.11.3에서는 연동이 동작하지 않습니다. 자격 증명을 입력하지 마세요. 현재 구현의 제약은 [X / Twitter 연동 가이드](/ko/docs/integrations/x)를 참고하세요.

#### 웹 검색

**설정 → 모듈 → Web Search**를 열고 [웹 검색 설정 가이드](../../config/web-search.md)를 따라 Tavily API Key를 설정하고 사용법, 개인정보 팁, FAQ를 확인하세요.

#### Minecraft

Minecraft 연동을 사용하려면 로컬 에이전트 서비스를 소스에서 실행해야 합니다. [Minecraft 에이전트 연동 가이드](/ko/docs/integrations/minecraft)를 따라 신뢰할 수 있는 서버, AIRI, 모델 서비스를 설정한 뒤 에이전트를 시작하세요.

::: warning 보안 유의 사항
Minecraft 에이전트를 신뢰할 수 없는 공개 서버에 연결하지 마세요. 에이전트는 로컬 Minecraft 세션과 네트워크 연결을 조작하므로, 악의적인 서버가 예기치 않은 동작을 일으킬 수 있습니다.
:::

::: tip 연동 서비스 문서
연동 서비스를 소스에서 실행하는 방법은 문서 사이드바의 **Integration Services** 섹션에 있습니다.
:::

#### Factorio

**설정 → 모듈 → Factorio**를 열고 [Factorio 연동 가이드](/ko/docs/integrations/factorio)를 따라 신뢰할 수 있는 서버 주소, 포트, 게임 내 사용자 이름을 입력하세요. AIRI에는 바로 배포할 수 있는 Factorio 서버 측 연동이 포함되어 있지 않습니다.

#### MCP 서버

MCP(Model Context Protocol)는 AIRI가 로컬 프로세스를 통해 외부 도구를 사용할 수 있게 합니다. 데스크톱에서 **설정 → 모듈 → MCP Server**를 열고 **Add server**를 클릭한 뒤 **Identifier**, **Command**, **Arguments**와 선택 사항인 **Working directory**, **Environment** 값을 채우세요. **Test**로 선택한 서버를 테스트한 뒤 **Save and restart**를 클릭해 설정을 기록하고 MCP를 재시작하세요. 설정을 직접 관리할 수 있도록 **Reveal in file manager**와 **Edit JSON**도 제공됩니다. 신뢰하는 MCP 서버만 실행하세요. MCP 서버는 로컬에서 명령을 실행할 수 있고 여러분이 부여한 환경 변수에 접근할 수 있습니다.

#### Beat Sync

**설정 → 모듈 → Beat Sync**를 여세요. Beat Sync는 선택한 화면이나 창의 오디오를 분석해 스테이지 효과에 비트 신호를 보냅니다. **Start screen capture**를 클릭하고 오디오가 포함된 소스를 선택하세요. 캡처를 끝내려면 **Stop**을 사용하세요. 이 페이지는 감도, 최소 비트 간격, 고급 필터링 파라미터와 실시간 스펙트럼·비트 시각화를 제공합니다. 처음 사용할 때는 시스템 화면 녹화 권한이 필요할 수 있습니다.

<a id="chapter-4-stage"></a>
### 장면

장면은 AIRI 메인 인터페이스의 배경입니다.

**Scene Gallery**는 현재 AIRI에서 사용할 수 있는 배경을 보여 줍니다. 비활성 장면 위에 마우스를 올리고 체크 버튼을 클릭하면 활성 캐릭터 배경이 됩니다.

**Upload to Gallery**를 클릭해 이미지를 가져오세요.

활성 배경을 제거하려면 **Clear Default**를 클릭하세요.

<a id="chapter-4-character-model"></a>
### 모델

여기서 캐릭터의 모델을 고르고 설정할 수 있습니다.

![AIRI 캐릭터 모델 설정](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-models.avif)

AIRI는 Live2D, Spine 2D, VRM 3D, MMD, Tachie 모델을 지원합니다.

기존 모델로 전환만 하려면 다음 순서를 권장합니다:

1. **Select model**을 클릭해 **Model Selector**를 여세요.
2. 사용할 모델에서 **Pick**을 클릭하세요.
3. **Confirm**을 클릭해 전환을 마치세요.

직접 만든 모델을 가져오려면 **Model Selector**를 열고 **Import**를 사용하세요. 선택기는 다음 형식을 받습니다:

- Live2D: `.zip`
- VRM: `.vrm`
- Spine: `.zip`
- MMD: `.zip`, `.pmx` 또는 `.pmd`
- Tachie: `.tachie.zip`

::: info Godot Stage (실험적)
**Switch to Godot Stage (Experimental)**는 별도의 Godot 스테이지 렌더러를 시작합니다. 되돌리려면 **Back to Built-in Stage**를 클릭하세요. Godot Stage는 현재 VRM 모델만 지원합니다. VRM 모델을 선택한 상태에서는 Godot View에서 카메라 X/Y/Z, yaw, pitch, 시야각을 조정할 수 있습니다. 상태와 모델 로딩 오류도 거기에 표시됩니다.
:::

::: warning 모델을 가져오기 전에
- 구형 Live2D 형식은 지원되지 않습니다. 모델 패키지에 `.moc3` 파일이 포함되어야 합니다.
- 가져오기 전에 완전한 Live2D 모델 폴더를 `.zip` 파일로 압축하세요.
- Spine 모델도 `.zip`을 사용하고, VRM은 단일 `.vrm` 파일을 사용합니다.
:::

#### Live2D 모델을 선택한 경우

다음 순서로 이어서 조정할 수 있습니다:

1. **Scale and Position**을 펼쳐 모델의 크기와 위치를 조정하세요. X는 가로 위치, Y는 세로 위치를 조절합니다.
2. **Parameters**를 펼쳐 마우스 추적, 대기 애니메이션, 프레임 레이트, 눈 깜빡임, 그림자, 모델 캐시 지우기, 모델별 파라미터를 설정하세요.
3. 대기 애니메이션을 사용하려면 가져온 패키지에 애니메이션 파일이 포함되어 있는지 확인하세요.
4. **Expressions**를 펼치고 **Expression System**을 켜서 모델에 포함된 표정을 사용하세요.

음성 합성이 켜져 있으면 AIRI는 음성 재생이 끝난 뒤 Live2D의 입 모양 상태를 자동으로 복원합니다.

::: info 파라미터와 표정
모델에서 사용할 수 있는 파라미터, 대기 애니메이션, 표정은 모델 파일 자체가 결정합니다. Expression System을 켠 뒤에는 모델이 실제로 제공하는 표정만 표시됩니다. 표정이나 애니메이션 파일이 없으면 해당 옵션은 효과가 없습니다.
:::

#### Spine 2D 모델을 선택한 경우

Spine 모델은 별도의 설정 패널을 제공합니다. 크기, X/Y 위치, 스킨, 배리언트, 대기 애니메이션, 애니메이션 블렌드 시간과 재생 속도를 조정할 수 있고, 프레임 레이트 제한과 렌더 스케일 조정도 가능합니다. 모델에 사용할 수 있는 스킨, 배리언트, 애니메이션이 있으면 해당 드롭다운 옵션에 나타나며, 없는 에셋은 표시되지 않습니다.

#### VRM 3D 모델을 선택한 경우

**Scene**을 펼쳐 모델 위치, 시야각, 카메라 거리, Y축 회전, 시선 방향을 조정하세요.

::: info VRM 시점
내장 스테이지에서의 위치, 회전, 카메라 거리, 시선 방향은 현재 설정에 저장됩니다.
:::

<a id="chapter-4-memory-bank"></a>
### 기억

이 기능은 아직 제공되지 않습니다. 구현 아이디어가 있다면 이슈나 Pull Request를 제출해 주세요.

<a id="chapter-4-providers"></a>
### 제공자

**제공자**는 AIRI가 모델, 음성, 전사, 이미지 서비스에 연결하는 곳입니다. 여기서 제공자 자격 증명을 입력한 뒤, 해당 모듈 페이지에서 제공자와 모델을 선택하세요.

목적에 따라 카테고리를 선택할 수 있습니다:

- **채팅**: AIRI가 메시지에 답할 수 있도록 채팅 모델을 설정합니다. 동작하는 채팅 제공자가 최소 하나 필요합니다.
- **비전**: 이미지 이해를 위한 비전 모델을 설정한 뒤 **모듈 → 비전**에서 선택합니다.
- **음성 합성**: 텍스트를 음성으로 변환하는 기능을 설정한 뒤 **모듈 → 음성 합성**에서 제공자, 모델, 목소리를 선택합니다.
- **전사**: 음성을 텍스트로 변환하는 기능을 설정한 뒤 **모듈 → 청각**에서 제공자와 모델을 선택합니다.
- **Artistry**: 이미지 생성 서비스를 설정한 뒤 **모듈 → Artistry**에서 선택합니다.

온보딩을 건너뛰었다면 먼저 채팅 제공자를 설정하세요. API Key나 계정 정보와 함께 Base URL, 리전 같은 필수 고급 필드를 입력합니다. 자동 유효성 검사를 기다리고, **Ping API**가 표시되면 사용해 보세요. 그런 다음 **모듈 → 의식**을 열어 제공자와 모델을 선택하고 메시지를 보내세요.

채팅 제공자를 전환하면 선택했던 채팅 모델이 지워집니다. **모듈 → 의식**으로 돌아가 새 제공자의 모델을 선택하세요.

::: warning 자격 증명 보안
API Key, AccessKey Secret 같은 서비스 자격 증명은 기기의 설정에만 저장하세요. 저장소에 커밋하거나, 이슈에 올리거나, 스크린샷에 포함하거나, 누구에게도 보내지 마세요.
:::

::: tip 설정 가이드
- 제공자 필드, 유효성 검사 방법, 오류가 잘 이해되지 않으면 [공통 설정 안내](../../config/common.md)를 읽어 보세요.
- 채팅 모델을 설정하려면 [채팅 모델](../../config/llm.md)을 읽고 **설정 → 제공자 → 채팅**에서 제공자를 선택하세요.
- 음성 입력과 출력을 설정하려면 [음성 입력과 출력](../../config/audio.md)을 읽어 보세요. 음성 합성과 전사 제공자는 **설정 → 제공자**에 있으며, 각 모듈 페이지에서 활성화합니다.
- 비전 제공자는 필드가 해당 채팅 제공자와 같더라도 자격 증명을 따로 저장합니다. 자세한 내용은 [시각 이해](../../config/vision.md)를 참고하세요.
:::

![AIRI 서비스 제공자 설정](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-providers.avif)

::: tip 기술적 조언
제공자 목록은 설치된 AIRI 버전에 따라 다릅니다. 목록에 없는 제공자가 OpenAI 호환 인터페이스를 구현한다면, 해당하는 **OpenAI Compatible** 항목을 사용하고 그 제공자의 문서에 있는 정확한 Base URL과 모델 ID를 입력하세요.
:::

<a id="chapter-4-data"></a>
### 데이터

여기서 AIRI가 로컬에 저장한 데이터를 관리합니다.

::: warning 되돌릴 수 없는 작업
이 섹션의 삭제와 초기화 작업은 되돌릴 수 없습니다. 계속하기 전에 선택한 데이터를 확인하세요.
:::

![AIRI 데이터 설정](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-data-settings.avif)

**Move desktop window to center**를 사용해 데스크톱 스테이지를 현재 화면 가운데로 되돌릴 수 있습니다.

::: tip 데스크톱 전용 데이터 컨트롤
이 데이터 컨트롤은 데스크톱 버전에서만 사용할 수 있습니다. 웹이나 모바일 앱에서는 제공되지 않습니다.
:::

<a id="chapter-4-connection"></a>
### 연결

**연결**은 AIRI의 서비스 채널을 설정합니다. **WebSocket Server Address**를 설정하고, 암호화된 전송이 필요하면 **Enable Secure WebSocket (WSS)**를 켜세요. 데스크톱에서는 **Expose On Network**를 **This device**, **All**, **Advanced** 중 하나로 설정할 수 있으며, **Advanced**를 선택하면 **Bind Hostname**이 나타납니다. **Auth Token**을 설정하고 QR 코드로 모바일 버전을 연결할 수도 있습니다. AIRI는 신뢰할 수 있는 네트워크에만 노출하고 토큰은 비공개로 유지하세요.

![AIRI 연결 설정](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-websocket-settings.avif)

::: tip macOS에서는 관리자 확인이 필요할 수 있습니다
보안 WebSocket을 켜면 AIRI가 로컬 인증서를 macOS 로그인 키체인에 추가합니다. Touch ID 또는 Mac 로그인 암호 입력으로 이 작업을 승인하라는 요청을 받을 수 있습니다. 지문이나 Mac 로그인 암호를 확인하면 계속됩니다.
![macOS 관리자 확인](/en/docs/manual/tamagotchi/setup-and-use/image-16.png)
:::


<a id="chapter-4-system"></a>
### 시스템

#### General

여기서 AIRI의 테마, 언어와 일반 동작을 설정합니다.

![AIRI 시스템 일반 설정](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-system-general.avif)

- **Theme**은 라이트 모드와 다크 모드를 전환합니다.
- **Language**는 인터페이스 언어를 설정하며, 선택한 언어는 AIRI를 다시 시작해도 유지됩니다.
- **Controls Island Icon Size**는 데스크톱 컨트롤 아일랜드 아이콘 크기를 바꿉니다.
- **Enable usage analytics**는 현재 빌드에서 분석 기능이 제공될 때 익명 사용 분석을 제어합니다. 설명에서 개인정보 처리방침으로 연결됩니다.

#### Color scheme

여기서 AIRI의 테마 색상을 설정합니다.

![AIRI 테마 색상 설정](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-system-color-scheme.avif)

- **RGB**를 켜면 테마 색상이 자동으로 순환합니다.
- 색상 바 아래의 마커를 끌거나 바를 클릭해 색상을 선택하세요.
- 선택한 색상은 미리보기에서 확인하세요.
- 프리셋 견본을 클릭하면 바로 적용됩니다.

::: tip 색상 프리셋
색상 견본을 클릭해 해당 프리셋을 적용하세요.
:::

#### Window Shortcuts
여기서 **Spotlight** 전역 단축키를 수정할 수 있습니다. Spotlight는 AIRI의 플로팅 프롬프트 입력창입니다.

1. 현재 단축키를 클릭하세요.
2. 사용할 새 키 조합을 누르세요. Cmd, Ctrl, Alt, Super 중 최소 하나의 보조 키가 포함되어야 합니다.
3. 다른 애플리케이션이 이미 그 단축키를 사용 중이면 AIRI가 충돌을 알립니다. 기록을 취소하려면 Esc를 누르세요.
4. **Reset**을 클릭하면 기본 단축키로 되돌립니다.

::: tip Spotlight 사용하기
설정한 단축키를 누르면 Spotlight가 열립니다. 요청을 입력하고 Enter를 누르면 AIRI가 Spotlight를 숨기고 결과를 알림으로 표시합니다. 보내지 않고 닫으려면 Esc를 누르세요.
:::

#### Developer

이 페이지는 실험적 기능을 개발하고, 문제를 해결하고, 검증하는 데 사용합니다. 일반 사용자에게는 필요하지 않습니다. 전체 도구 설명은 [개발자 가이드 → 개발자 도구](/ko/docs/contributing/desktop-developer-tools)에서 볼 수 있습니다.

<a id="web-features"></a>
## 웹 버전 기능

<a id="chapter-3-main-web"></a>
### 웹 메인 인터페이스

![AIRI 웹 인터페이스](/en/docs/manual/tamagotchi/setup-and-use/assets/manual-main-web.avif)

웹 인터페이스는 캐릭터 스테이지, 채팅 영역, 계정·표시 컨트롤로 구성됩니다.

#### 채팅 박스

위쪽 영역은 대화 기록을 표시합니다. 아래쪽 영역에는 메시지 입력란과 대화, 전송 방식, 음성 입력을 위한 컨트롤이 있습니다.

#### 그 외 부분

##### 상단 영역

상단 영역에서는 **About**, **Characters**, 계정 메뉴에 접근할 수 있습니다. 로그인하면 계정 메뉴에 현재 이름과 Flux 잔액이 표시되고, 이어서 **Profile**, **Flux**, **설정**, **Sign out**이 나타납니다.

###### Profile

**Profile**은 계정 관리를 엽니다. 계정을 만든 방식에 따라 표시 이름을 변경하거나, 비밀번호와 연결된 로그인 방법을 관리하거나, 위험 구역(danger zone)에서 계정을 삭제할 수 있습니다. 현재 아바타는 계정 정보로 표시되지만, 이 페이지에서 아바타 업로드는 제공하지 않습니다.

###### Flux

Flux는 AIRI 공식 서비스가 사용하는 잔액입니다. 로그인한 뒤 **Flux**를 열면 잔액, 사용 통계, 거래 내역을 볼 수 있습니다. 현재 배포판이 구매를 지원하면 사용 가능한 패키지를 선택할 수 있습니다. 데스크톱 버전은 결제를 시스템 브라우저에서 엽니다. 공식 채팅, 비전, 음성 서비스에 대한 요청은 Flux를 소비할 수 있습니다. 서드파티 제공자는 사용량을 별도로 청구합니다.

###### 설정

**설정**은 [4장](#chapter-4-settings)에서 설명한 것과 같은 설정 영역을 엽니다. 다만 데스크톱 전용 컨트롤은 웹에서 제공되지 않습니다.

##### 하단 영역

오른쪽 아래 컨트롤은 여섯 가지 동작을 제공합니다:

- 저장된 대화 열기
- 음성 출력 음소거 또는 해제
- 캐릭터 위치와 크기 조정
- 현재 대화 지우기
- 라이트/다크 테마 전환
- 배경 변경

###### 위치와 크기

위치·크기 컨트롤을 열어 캐릭터의 X 위치, Y 위치, 크기(scale)를 조정하세요. 스테이지 왼쪽의 세로 컨트롤로도 화면을 조정할 수 있습니다.

![메인 창 위치와 크기 조정](/en/docs/manual/tamagotchi/setup-and-use/assets/web-position-size.avif)

###### 현재 대화 지우기

휴지통 버튼을 선택하면 활성 대화의 메시지와 컨텍스트가 지워집니다. 다른 저장된 대화는 삭제되지 않습니다.

::: warning 신중히 진행하세요
지운 메시지는 복구할 수 없습니다.
:::

###### 라이트/다크 전환

해 또는 달 버튼을 선택해 라이트와 다크 테마를 전환하세요.

###### 배경

배경 버튼을 선택해 다른 스테이지 배경을 고르세요.

<a id="features-issues"></a>
## 문제 해결과 바로 가기

### FAQ

- 업그레이드 후 저장된 크기나 위치가 화면 밖에 있으면 모델이 사라진 것처럼 보일 수 있습니다. **설정 → 모델**에서 모델의 크기와 위치를 초기화하세요.

<a id="h3-1-1"></a>
### 연결 상태 바로 가기

오른쪽 위 영역에 **WebSocket Status**가 표시되는 화면에서는 이를 클릭해 **연결**을 열고 **WebSocket Server Address**를 설정할 수 있습니다.


<a id="chapter-ed-toeveryeditor"></a>
## 이 설명서에 기여하기

커뮤니티가 유지 관리하는 이 설명서는 공식 AIRI 문서와 함께 게시됩니다. 정확성, 표현, 스크린샷, 서식을 개선하는 기여를 환영합니다. Pull Request를 제출하고, 기여가 크다면 저자 목록에 이름을 추가해 주세요.

AIRI 문서 개선에 힘써 주셔서 감사합니다.

——Ling Zhen
