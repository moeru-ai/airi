---
title: DevLog @ 2025.04.28
category: DevLog
date: 2025-04-28
---

<script setup>
import airiMcpSettings from '../../../en/blog/DevLog-2025.04.28/assets/airi-mcp-settings.mp4'
import airiMcpInputText from '../../../en/blog/DevLog-2025.04.28/assets/airi-mcp-input-text.mp4'
import airiMcpArch from '../../../en/blog/DevLog-2025.04.28/assets/airi-mcp-arch.avif'
</script>

안녕하세요 여러분, [@LemonNeko](https://github.com/LemonNekoGH)입니다. 오늘도 개발 이야기를 나누러 왔습니다.

## 낮 시간의 일기

일주일 전, AIRI가 휴대폰에 연결할 수 있도록 MCP 서버 [AIRI-android](https://github.com/LemonNekoGH/AIRI-android)를 만들었습니다. 하지만 이건 AIRI가 Android 폰을 조작하게 만드는 일의 전반부일 뿐이었습니다. AIRI도 MCP 서버와 상호작용할 수 있어야 했으니까요.

지난 이틀 동안 Tauri 플러그인 [#144](https://github.com/moeru-ai/AIRI/pull/144)를 작성해 후반부를 마쳤습니다. 이제 AIRI는 MCP 서버와 상호작용할 수 있고, 기존의 모든 MCP 서버와 함께 동작합니다.

관심 있으시면 아래 두 영상을 봐 주세요. 첫 번째는 AIRI의 MCP 서버 설정을, 두 번째는 AIRI가 Android 폰과 상호작용하는 모습을 보여 줍니다.

<details>
  <summary>AIRI의 MCP 서버 설정</summary>
  <ThemedVideo controls muted :src="airiMcpSettings" style="height: 640px;" />
</details>

<details>
  <summary>AIRI가 휴대폰에 `Hello World`를 입력하는 모습</summary>
  <ThemedVideo controls muted :src="airiMcpInputText" />
</details>

개발 중 생각을 정리하려고 LLM이 Android 폰을 호출하는 흐름을 그림으로 그려 봤습니다:

<img :src="airiMcpArch" alt="AIRI가 휴대폰을 조작하는 구조" :style="{ height: '640px', objectFit: 'contain' }" />

이제 개발 과정을 나눠 보겠습니다.

## Tauri 플러그인 개발

사실 처음부터 완전한 Tauri 플러그인을 만들 생각은 없었습니다. 그저 JavaScript 쪽에 명령 몇 개를 노출하고 싶었을 뿐입니다:

```rust
#[Tauri::command]
fn list_tools() -> Vec<String> {
  // 나중에 구현
}
```

그리고 이를 호출할 유틸리티 함수를 조금 작성하면 되겠지요:

```javascript
import { invoke } from '@Tauri-apps/api/core'

export const mcp = [
  {
    name: 'list_tools',
    description: 'List all tools',
    execute: async () => {
      return await invoke('list_tools')
    }
  }
]
```

그런데 곧, 명령 안에서 MCP 클라이언트를 쓰려면 MCP 클라이언트를 Tauri가 관리하는 상태(state)의 일부로 두어야 한다는 걸 알게 됐습니다:

```rust
// main.rs
fn main() {
  Tauri::Builder::default()
    .setup(|app| {
      app.manage(State::new(Mutex::new::<Option<McpClient>>(None))); // 상태 관리
    })
    .run(Tauri::generate_context!())
}

// mcp.rs
#[Tauri::command]
async fn list_tools(state: State<'_, Mutex<Option<McpClient>>>) -> Result<Vec<Tool>, String> { // 매개변수로 상태를 받을 수 있다
  // ...나머지 코드
}
```

명령도 있고 상태도 있으니, 완전한 플러그인까지는 얼마 남지 않았습니다. 그래서 아예 플러그인으로 만들기로 했습니다. 그러면 공개 배포도 할 수 있고, ~~어쩌면 인터넷 최초의 Tauri MCP 플러그인이 될지도 모르니까요~~.

다만 플러그인이 되고 나니 명령을 호출하는 방식이 바뀌어서, 플러그인을 거쳐 호출해야 했습니다:

```diff
  import { invoke } from '@Tauri-apps/api/core'

  export mcp = [
    {
      name: "list_tools",
      description: "List all tools",
      execute: async () => {
-       return await invoke("list_tools")
+       return await invoke("plugin:mcp|list_tools")
      }
    }
  ]
```

이건 한 줄만 바뀌었으니 괜찮습니다. 그런데 Tauri 2에는 권한 메커니즘이 있어서, 권한 목록을 자동 생성하려면 `build.rs`에 플러그인의 명령들을 정의해야 했습니다:

```rust
const COMMANDS: &[&str] = &[
  "list_tools",
];

fn main() {
  Tauri_plugin::Builder::new(COMMANDS).build();
}
```

이렇게 하면 빌드할 때 프로젝트 루트에 `permissions` 폴더가 생성되고, 그 안에 권한 선언과 설명 등이 담깁니다.

> 여기서 작은 사고가 하나 있었습니다. 두 번째로 빌드할 때 `Tauri-plugin` 버전을 올렸는데, 새 버전에서 생성 템플릿이 바뀌면서 공백이 일부 제거됐습니다. 그래서 마치 포맷터가 손댄 것처럼 보였죠. 무엇이 "포맷팅" 하는지 한 시간 동안 찾다가, 파일이 재생성된 것이었음을 깨달았습니다. 🤡 잃어버린 그 한 시간을 추모합니다.

위 그림에 따르면, LLM이 MCP 도구를 호출하면 매개변수는 결국 Python 쪽 MCP 서버로 전달됩니다. `input_swipe`를 예로 들면:

```python
# mcp_server.py
from mcp.server.fastmcp import FastMCP
from ppadb.client import Client

mcp = FastMCP("airi-android")
adb_client = Client()

@mcp.tool()
def input_swipe(x1: int, y1: int, x2: int, y2: int, duration: int = 500):
    return adb_client.input_swipe(x1, y1, x2, y2, duration)
```

이 매개변수들을 어떻게 넘겨야 할까요? Rust SDK 문서에는 이런 [정의](https://docs.rs/rmcp/0.1.5/rmcp/model/struct.CallToolRequestParam.html)가 있습니다:

```rust
pub struct CallToolRequestParam {
    pub name: Cow<'static, str>,
    pub arguments: Option<JsonObject>,
}
```

~~오, JsonObject 라니. 살았습니다!~~ Tauri 명령의 매개변수는 JSON으로 직렬화 가능한 아무 객체나 될 수 있으니, 그냥 `Map<String, Value>`를 넘기면 됩니다:

```rust
#[Tauri::command]
async fn call_tool(state: State<'_, Mutex<Option<McpClient>>>, name: String, args: Option<Map<String, Value>>) -> Result<(), ()> {
  let client = state.lock().await.unwrap();

  client.call_tool(CallToolRequestParam { name: name.into(), arguments: args }).await.unwrap();

  Ok(())
}
```

그러면 JavaScript 쪽에서는 객체 하나만 넘기면 됩니다:

```javascript
import { invoke } from '@Tauri-apps/api/core'

invoke('call_tool', { name: 'input_swipe', args: { x1: 100, y1: 100, x2: 200, y2: 200, duration: 500 } })
```

정말 편리하네요!

MCP 도구에 매개변수를 넘긴 다음에는 도구의 반환값도 받아야 합니다. Tauri 명령의 반환값 역시 JSON으로 직렬화 가능한 아무 객체나 될 수 있으니, 저는 포기하고 도구 반환값 전체를 그냥 LLM에게 던져 주기로 했습니다. LLM이 알아서 잘 처리해 주리라 믿으면서요.

좋습니다! 이제 Tauri 플러그인이 생겼습니다! (네? 저 짧은 예제 코드, 심지어 의사 코드로 완성이라고요?)

남은 내용은 여러분과 함께 이야기하고 싶은 몇 가지 질문입니다.

## 몇 가지 질문

1. 데모 영상에서 보시다시피, 대화에서 저는 먼저 AIRI에게 도구 목록을 가져오게 한 뒤 텍스트를 입력하게 했습니다. 초기화 시점에 도구 목록을 가져와 시스템 프롬프트에 바로 덧붙이면 어떨까요?
   - Cursor가 그렇게 합니다. MCP 서버를 개발할 때 도구 목록을 수정할 때마다 반영하려면 Cursor를 재시작해야 했습니다.
   - 유연성은 좀 희생하겠지만, 일반 사용자가 도구 목록을 자주 수정할까요?

2. AIRI가 여러 대의 휴대폰에 동시에 연결하도록 허용해야 할까요? AIRI가 휴대폰을 여러 대 쓰고 싶어 할까요? ~~보이스피싱에 쓰려는 건 아니겠죠?~~
3. 보시다시피 AIRI 저장소에는 이제 Tauri 애플리케이션과 Tauri 플러그인이 함께 있습니다. 이걸 어떻게 관리해야 할까요? CI는 어떻게 구성해야 할까요? Tauri 플러그인의 Rust 쪽과 JavaScript 쪽 버전 번호는 어떻게 동기화해야 할까요?

## 향후 계획

- 이미지 반환값 지원. [지난 DevLog](../DevLog-2025.04.22/) 에서 Cursor가 보여 준 것처럼 AIRI가 시각 능력으로 휴대폰 화면을 보고 어떻게 조작할지 판단할 수 있도록.
- AIRI가 스스로 기기 사용법을 익히게 하기? 기기 종류마다 프롬프트를 따로 써야 한다면 작업량이 어마어마할 겁니다.
- 다중 MCP 서버 지원. MCP는 AIRI가 온갖 일을 할 수 있게 해 주는 범용 인터페이스이니, AIRI도 휴대폰 조작만으로는 만족하지 않을 겁니다.
- SSE 지원. 브라우저의 AIRI도 MCP 서버를 쓸 수 있도록.

오늘은 여기까지입니다! 이번 DevLog가 너무 딱딱하지 않았기를 바랍니다. 앞으로도 더 재미있는 내용을 가져오겠습니다!
