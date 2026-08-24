---
title: DevLog @ 2025.04.22
category: DevLog
date: 2025-04-22
---

<script setup>
import cursorOpenSettings from '../../../en/blog/DevLog-2025.04.22/assets/cursor-open-settings.mp4'
</script>

## 낮 시간의 일기

안녕하세요, [@LemonNeko](https://github.com/LemonNekoGH)입니다. 이번에는 제가 DevLog 작성에 참여해서 개발 이야기를 나눠 보려 합니다.

두 달 전, 저희는 AIRI의 웹 인터페이스를 Electron으로 포팅했습니다 [#7](https://github.com/moeru-ai/airi/pull/7) (지금은 Tauri로 다시 리팩터링됐지만요 🤣 [#90](https://github.com/moeru-ai/airi/pull/90)). 덕분에 화면 위에 데스크톱 펫처럼 띄울 수 있게 됐죠. 그와 동시에 AIRI가 휴대폰을 쓸 수 있게 하면 어떨까 하는 생각이 있었는데, 계속 미뤄 두고 있었습니다.

지난 주말(2025.04.20), 시간을 좀 내서 ADB와 상호작용할 수 있는 MCP 서버 데모 [airi-android](https://github.com/LemonNekoGH/airi-android)를 만들었습니다. AIRI에게 기본적인 모바일 조작 능력을 주는 것이죠 (사실 대부분의 LLM이 이걸 통해 휴대폰을 조작할 수 있습니다). 데모 영상입니다:

<ThemedVideo controls muted :src="cursorOpenSettings" />

Docker 이미지로도 패키징해서 [MCP 서버 목록](https://mcp.so/server/airi-android/lemonnekogh)에 등록했습니다. 관심 있으시면 편하게 써 보세요.

사실 처음 생각은 Tool Calling 코드를 좀 짜고 프롬프트를 수정해서, LLM에게 "이 도구들로 휴대폰을 조작할 수 있다"고 알려 주면 끝이라는 것이었습니다. ~~그런데 요즘 MCP가 너무 유행이라 FOMO가 와서 MCP로 구현하기로 했습니다.~~

MCP 서버를 쓰려면 먼저 MCP가 뭔지 이해해야 했습니다 (물론 저는 실전 전에 이론부터 파는 타입은 아니라서, 일단 뛰어들어 Cursor에게 써 보게 하는 쪽을 선호합니다). MCP(Model Context Protocol)는 애플리케이션이 LLM에게 컨텍스트를 제공하는 방식을 표준화하려는 프로토콜입니다. 몇 가지 핵심 개념을 제안하죠:

1. Resources: 서버가 데이터와 콘텐츠를 LLM에게 컨텍스트로 제공할 수 있습니다.
2. Prompts: 재사용 가능한 프롬프트 템플릿과 워크플로를 만듭니다.
3. Tools: LLM이 여러분의 서버를 통해 동작을 수행할 수 있게 합니다.

아, 리소스 — 이건 압니다! Ruby on Rails에서 사용자는 일종의 리소스죠. 그럼 ADB 기기도 리소스일까요? LLM이 연결된 기기 목록을 보게 하려면 이렇게 쓰면 될까요:

```python
from mcp.server.fastmcp import FastMCP
from ppadb.client import Client

mcp = FastMCP("airi-android")
adb_client = Client()

@mcp.resource("adb://devices")
def get_devices():
    return adb_client.devices()
```

틀렸습니다! Cursor에게 기기 목록을 가져오라고 했더니 어떻게 해야 할지 모르더군요. 어떤 기기가 연결됐는지 능동적으로 확인하고 싶다고 했으니, 이건 도구(tool)입니다. 음, 제가 완전히 이해하지 못했던 모양입니다.

LLM이 휴대폰을 조작하게 하는 정확한 방법은 아직 못 찾았고, 여러분과 함께 이야기해 보고 싶습니다. 다만 Cursor는 이렇게 동작합니다:

1. 스크린샷 기능으로 휴대폰 화면에 무엇이 있는지 대략 파악합니다.
2. UI 자동화 도구로 조작하려는 요소의 정확한 위치를 얻습니다.
3. 클릭하거나 스와이프합니다.
4. 위 단계를 반복합니다.

지금까지는 잘 동작하는 것 같은데, 작은 의문이 몇 가지 있습니다:

1. 화면에 UI 컴포넌트가 아니라 그래픽 API로 직접 그리는 게임이 떠 있다면, UI 자동화 도구는 요소 위치를 얻을 수 없어 조작도 못 합니다.
2. LLM 응답에는 길이 제한이 있습니다. 조작이 복잡하면 단계별로 나눠서 끝내야 할 텐데, [airi-factorio](https://github.com/moeru-ai/airi-factorio)처럼 각 단계가 끝날 때마다 자동으로 알려서 다음 단계를 트리거할 수 있을까요?
3. 어떤 앱은 화려한 애니메이션이 있어서, 조작 직후 스크린샷을 찍으면 결과가 안 보일 수 있습니다. 조작 후 잠시 기다렸다 찍어야 할까요, 아니면 아예 화면 녹화를 써야 할까요?
4. AI가 휴대폰을 직접 조작하게 하는 것의 보안은 어떨까요? 어떤 위험이 있을까요?

몇 가지 소회입니다.

AI와 작업하면서 사람과 함께 코딩하는 기분이 든 건 이번이 처음입니다. 제 목표가 "AI가 내 도구를 쓰게 하는 것"이어서 AI가 제 클라이언트가 되어 버린 탓인지도 모르겠습니다. 저는 계속 AI의 피드백에 맞춰 코드를 고쳐야 했으니까요. 동시에 AI는 제 동료이기도 했습니다. 함께 고민하고 문제를 풀어야 했거든요. 이 스크린샷을 보세요. 정말 그렇게 보이지 않나요?

![](/en/blog/DevLog-2025.04.22/assets/develop-with-cursor.avif)

개발하면서 작은 요령도 배웠습니다. 예를 들어 명령줄로 Android 에뮬레이터를 띄우면 Android Studio를 열 필요가 없어서 메모리 부담이 크게 줄어듭니다.

```bash
emulator -avd Pixel_6_Pro_API_34
```

다음에는 AIRI 데스크톱 펫을 MCP 서버에 연결해서 뭘 하고 싶어 하는지 보려고 합니다. 어쩌면 지금 ReLU가 하는 것처럼 Telegram을 열고 우리와 대화할지도 모르죠. 다만 Telegram API를 쓰지 않고서요.

다소 두서없고 알맹이가 부족했을지 모를 DevLog를 읽어 주셔서 감사합니다. 다음에 또 만나요!
