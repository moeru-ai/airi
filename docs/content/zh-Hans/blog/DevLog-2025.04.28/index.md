---
title: 开发日志 @ 2025.04.28
category: DevLog
date: 2025-04-28
---

<script setup>
import airiMcpArch from './assets/airi-mcp-arch.avif'
</script>

大家好，这里是 [@LemonNeko](https://github.com/LemonNekoGH)，今天由我来和大家一起分享开发故事。

## Day time 日常

一周前，我为 AIRI 写了用于连接到手机的 MCP 服务器 [AIRI-android](https://github.com/LemonNekoGH/AIRI-android)，但这只是 AIRI 操作安卓手机的前半部分，AIRI 还需要能与 MCP 服务器交互才行。

这两天我完成了后半部分，给 Tauri 写了一个插件 [#144](https://github.com/moeru-ai/AIRI/pull/144)，现在 AIRI 可以与 MCP 服务器交互了，可以和现有的所有 MCP 服务器交互。

如果有兴趣，可以看看这两个视频，先演示了 AIRI 的 MCP 服务器设置，然后演示了 AIRI 与安卓手机交互。

<details>
  <summary>AIRI 的 MCP 服务器设置</summary>
  <ThemedVideo controls muted src="./assets/airi-mcp-settings.mp4" style="height: 640px;" />
</details>

<details>
  <summary>AIRI 在手机上输入 `Hello World`</summary>
  <ThemedVideo controls muted src="./assets/airi-mcp-input-text.mp4" />
</details>

开发时，为了理清思路，我画了一张图，从 LLM 调用安卓手机：

<img :src="airiMcpArch" alt="AIRI 操作手机" :style="{ height: '640px', objectFit: 'contain' }" />

接下来和大家分享一下我的开发过程。

## Tauri 插件开发

其实一开始我并没有想写一个完整的 Tauri 插件，我只是想给 JavaScript 侧暴露一些命令：

```rust
#[Tauri::command]
fn list_tools() -> Vec<String> {
  // 之后再实现
}
```

然后写一些工具函数来调用它们：

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

但很快，我注意到，如果我想在命令中使用 MCP 客户端，就需要让 MCP 客户端作为状态的一部分让 Tauri 来管理：

```rust
// main.rs
fn main() {
  Tauri::Builder::default()
    .setup(|app| {
      app.manage(State::new(Mutex::new::<Option<McpClient>>(None))); // 管理状态
    })
    .run(Tauri::generate_context!())
}

// mcp.rs
#[Tauri::command]
async fn list_tools(state: State<'_, Mutex<Option<McpClient>>>) -> Result<Vec<Tool>, String> { // 可以在参数中拿到状态
  // ...rest code
}
```

我们有了命令，有了状态，那离一个完整的插件也不远了，于是我决定让它成为一个插件，这样我们还能公开发出去，~~并且成为可能的全网第一个 Tauri MCP 插件~~。

然而它成为一个插件后，命令的调用方式就变了，需要通过插件来调用：

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

这还好，只是改了一行，但是，Tauri 2 有了权限机制，我需要在 `build.rs` 中定义插件的命令，以便自动生成权限列表：

```rust
const COMMANDS: &[&str] = &[
  "list_tools",
];

fn main() {
  Tauri_plugin::Builder::new(COMMANDS).build();
}
```

这样在构建时，项目根目录下会生成 `permissions` 文件夹，包含了权限声明、描述等。

> 在这时出现了一点小插曲，因为我第二次构建的时候，升级了 `Tauri-plugin` 的版本，同时新版本中生成模板发生了变化，有一些空格删掉了，所以它看上去像是被格式化了，于是我到处寻找是什么东西在「格式化」它，花了一个小时才发现是文件被重新生成了，以此 🤡 纪念我被吃掉的一个小时。

根据上面的图，当 LLM 调用 MCP 工具时，参数最后会被传递给 Python 侧的 MCP 服务器，以 `input_swipe` 为例：

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

我要怎样传递这些参数呢？在 Rust SDK 文档中有这样的 [定义](https://docs.rs/rmcp/0.1.5/rmcp/model/struct.CallToolRequestParam.html)：

```rust
pub struct CallToolRequestParam {
    pub name: Cow<'static, str>,
    pub arguments: Option<JsonObject>,
}
```

~~哇，是 JsonObject，我们有救了！~~ 因为 Tauri 命令的参数可以是任何能被序列化成 JSON 的对象，那我们不如，直接给它传一个 `Map<String, Value>` 好了：

```rust
#[Tauri::command]
async fn call_tool(state: State<'_, Mutex<Option<McpClient>>>, name: String, args: Option<Map<String, Value>>) -> Result<(), ()> {
  let client = state.lock().await.unwrap();

  client.call_tool(CallToolRequestParam { name: name.into(), arguments: args }).await.unwrap();

  Ok(())
}
```

那在 JavaScript 侧，我们就简单给一个对象就好了：

```javascript
import { invoke } from '@Tauri-apps/api/core'

invoke('call_tool', { name: 'input_swipe', args: { x1: 100, y1: 100, x2: 200, y2: 200, duration: 500 } })
```

超方便！

把参数传递给 MCP 工具后，我们还需要接收 MCP 工具的返回值，因为 Tauri 命令的返回值也可以是任何能被序列化成 JSON 的对象，所以我摆烂了，我把工具的返回整个丢给了 LLM，相信 LLM 会处理好的。

好！现在我们已经有 Tauri 插件了！（啊？示例代码这么点，甚至是伪代码就算完成了？）

剩下的内容还想和大家讨论一些问题。

## 一些问题

1. 从演示视频可以看到，在对话中，我首先是让 AIRI 获取了一下工具列表，再让它输入文本的，那我们能不能在初始化的时候就去获取工具列表，然后直接追加到系统提示词中呢？
   - Cursor 就是这样做的，在我开发 MCP 服务器时，每次我改动了工具列表，都需要重启 Cursor 才能生效。
   - 这样做也许会牺牲灵活性，但普通用户会频繁改动工具列表吗？

2. 要允许 AIRI 同时连接到多个手机吗？AIRI 可能会想使用多台手机吗？~~她会不会想拿去做电信诈骗？~~
3. 可以看到现在的 AIRI 仓库中已经有了 Tauri 应用和 Tauri 插件，要怎么管理比较好？CI 要怎么配置？如何同步 Tauri 插件的 Rust 侧和 JavaScript 侧的版本号？

## 未来想要做的事情

- 支持图片返回值，这样 AIRI 就可以像 [上一篇 DevLog](./DevLog-2025.04.22.md) 中展示的 Cursor 那样，直接通过视觉能力看到手机上的内容，然后再决定用什么方式来交互。
- 让 AIRI 自己学习设备的使用方法？如果每种设备我们都要单独写提示词，那工作量是巨大的。
- 多 MCP 服务器支持，毕竟 MCP 提供了一种通用的接口，可以允许 AIRI 做各种各样的事，AIRI 应该不会满足于只操作手机吧。
- SSE 支持，这样浏览器中的 AIRI 也可以使用 MCP 服务器了。

到这里就结束啦！希望这篇 DevLog 没有那么干巴巴的！之后也希望给大家带来更多好玩的内容！
