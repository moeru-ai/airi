---
title: DevLog @ 2025.04.28
category: DevLog
date: 2025-04-28
---

<script setup>
import airiMcpArch from './assets/airi-mcp-arch.avif'
</script>

Hello everyone, this is [@LemonNeko](https://github.com/LemonNekoGH), and today I'm here to share development stories with you.

## Day time Daily

A week ago, I wrote an MCP server [AIRI-android](https://github.com/LemonNekoGH/AIRI-android) for AIRI to connect to mobile phones, but this was only the first half of enabling AIRI to operate Android phones—AIRI also needed to be able to interact with MCP servers.

Over the past two days, I completed the second half by writing a Tauri plugin [#144](https://github.com/moeru-ai/AIRI/pull/144). Now AIRI can interact with MCP servers and work with all existing MCP servers.

If you're interested, check out these two videos. The first demonstrates AIRI's MCP server setup, and the second shows AIRI interacting with an Android phone.

<details>
  <summary>AIRI's MCP Server Setup</summary>
  <ThemedVideo controls muted src="./assets/airi-mcp-settings.mp4" style="height: 640px;" />
</details>

<details>
  <summary>AIRI Inputting `Hello World` on Phone</summary>
  <ThemedVideo controls muted src="./assets/airi-mcp-input-text.mp4" />
</details>

During development, to clarify my thinking, I drew a diagram showing how LLMs call Android phones:

<img :src="airiMcpArch" alt="AIRI Operating Phone" :style="{ height: '640px', objectFit: 'contain' }" />

Next, let me share my development process.

## Tauri Plugin Development

Actually, I didn't initially plan to write a complete Tauri plugin—I just wanted to expose some commands to the JavaScript side:

```rust
#[Tauri::command]
fn list_tools() -> Vec<String> {
  // To be implemented later
}
```

Then write some utility functions to call them:

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

But soon I noticed that if I wanted to use the MCP client in commands, I needed to have the MCP client managed as part of the state by Tauri:

```rust
// main.rs
fn main() {
  Tauri::Builder::default()
    .setup(|app| {
      app.manage(State::new(Mutex::new::<Option<McpClient>>(None))); // Manage state
    })
    .run(Tauri::generate_context!())
}

// mcp.rs
#[Tauri::command]
async fn list_tools(state: State<'_, Mutex<Option<McpClient>>>) -> Result<Vec<Tool>, String> { // Can get state from parameters
  // ...rest code
}
```

We had commands, we had state—we weren't far from a complete plugin. So I decided to make it a plugin, which would allow us to publish it publicly, ~~and potentially become the first Tauri MCP plugin on the entire internet~~.

However, once it became a plugin, the way commands were called changed—they needed to be called through the plugin:

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

This was fine—just one line changed. But Tauri 2 has a permission mechanism, so I needed to define the plugin's commands in `build.rs` to automatically generate the permission list:

```rust
const COMMANDS: &[&str] = &[
  "list_tools",
];

fn main() {
  Tauri_plugin::Builder::new(COMMANDS).build();
}
```

This way, during build, a `permissions` folder would be generated in the project root directory, containing permission declarations, descriptions, etc.

> At this point, there was a small hiccup. When I built it the second time, I upgraded the `Tauri-plugin` version, and the new version had changes to the generation template—some spaces were removed, so it looked like it had been formatted. I spent an hour searching for what was "formatting" it before realizing the file had been regenerated. 🤡 In memory of that lost hour.

According to the diagram above, when an LLM calls an MCP tool, the parameters eventually get passed to the Python-side MCP server. Taking `input_swipe` as an example:

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

How should I pass these parameters? The Rust SDK documentation has this [definition](https://docs.rs/rmcp/0.1.5/rmcp/model/struct.CallToolRequestParam.html):

```rust
pub struct CallToolRequestParam {
    pub name: Cow<'static, str>,
    pub arguments: Option<JsonObject>,
}
```

~~Wow, it's JsonObject—we're saved!~~ Since Tauri command parameters can be any object that can be serialized to JSON, why not just pass it a `Map<String, Value>`:

```rust
#[Tauri::command]
async fn call_tool(state: State<'_, Mutex<Option<McpClient>>>, name: String, args: Option<Map<String, Value>>) -> Result<(), ()> {
  let client = state.lock().await.unwrap();

  client.call_tool(CallToolRequestParam { name: name.into(), arguments: args }).await.unwrap();

  Ok(())
}
```

Then on the JavaScript side, we can simply pass an object:

```javascript
import { invoke } from '@Tauri-apps/api/core'

invoke('call_tool', { name: 'input_swipe', args: { x1: 100, y1: 100, x2: 200, y2: 200, duration: 500 } })
```

Super convenient!

After passing parameters to the MCP tool, we also need to receive the MCP tool's return value. Since Tauri command return values can also be any object that can be serialized to JSON, I gave up and just threw the entire tool return to the LLM, trusting that the LLM would handle it properly.

Great! Now we have a Tauri plugin! (Wait? That little example code, even pseudo-code, counts as completed?)

The remaining content is some questions I'd like to discuss with everyone.

## Some Questions

1. From the demo videos, you can see that in the conversation, I first had AIRI get the tool list, then had it input text. Could we get the tool list during initialization and directly append it to the system prompt?
   - Cursor does it this way. When I was developing the MCP server, every time I modified the tool list, I needed to restart Cursor for it to take effect.
   - This might sacrifice flexibility, but do regular users frequently modify tool lists?

2. Should we allow AIRI to connect to multiple phones simultaneously? Might AIRI want to use multiple phones? ~~Would she want to use them for telecom fraud?~~
3. As you can see, the AIRI repository now has both Tauri applications and Tauri plugins. How should this be managed? How should CI be configured? How to synchronize version numbers between the Rust and JavaScript sides of Tauri plugins?

## Future Plans

- Support image return values, so AIRI can see what's on the phone through visual capabilities like Cursor demonstrated in the [previous DevLog](./DevLog-2025.04.22.md), then decide how to interact.
- Let AIRI learn how to use devices itself? If we have to write separate prompts for each type of device, the workload would be enormous.
- Multi-MCP server support. After all, MCP provides a universal interface that allows AIRI to do all sorts of things—AIRI probably won't be satisfied with just operating phones.
- SSE support, so AIRI in the browser can also use MCP servers.

That's all for now! I hope this DevLog isn't too dry! Looking forward to bringing you more fun content in the future!
