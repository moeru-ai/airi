---
title: DevLog @ 2025.04.22
category: DevLog
date: 2025-04-22
---

## Day time Daily

Hello everyone, I'm [@LemonNeko](https://github.com/LemonNekoGH), and this time I'm participating in writing the DevLog to share development stories with you.

Two months ago, we ported AIRI's web interface to Electron [#7](https://github.com/moeru-ai/airi/pull/7) (which has now been refactored using Tauri 🤣 [#90](https://github.com/moeru-ai/airi/pull/90)), allowing it to appear as a desktop pet on our screens. At the same time, I had the idea of allowing AIRI to use mobile phones, but I kept putting it off.

Last weekend (2025.04.20), I spent some time creating an MCP server demo [airi-android](https://github.com/LemonNekoGH/airi-android) that can interact with ADB, providing AIRI with basic mobile interaction capabilities (in fact, most LLMs can interact with phones through it). Here's a demo video:

<ThemedVideo controls muted src="./assets/cursor-open-settings.mp4" />

I also packaged it as a Docker image and submitted it to the [MCP server list](https://mcp.so/server/airi-android/lemonnekogh). Feel free to try it if you're interested.

Actually, my initial idea was to write some Tool Calling code, modify the prompts, and tell the LLM that we can use these tools to interact with the phone, and that would be it. ~~But recently MCP has been so popular that I had some FOMO, so I chose MCP to implement it.~~

To write an MCP server, I had to first understand what MCP is (although I'm not the type to study theory before practice—I prefer to dive right in and let Cursor try to use it). MCP (Model Context Protocol) is a protocol that attempts to standardize how applications provide context to LLMs. It proposes several core concepts:

1. Resources: Servers can provide data and content as context to LLMs.
2. Prompts: Create reusable prompt templates and workflows.
3. Tools: Allow LLMs to perform actions through your server.

Ah, resources—I know this! In Ruby on Rails, users are a type of resource. So are ADB devices also resources? If I want the LLM to view the list of connected devices, could I write it like this:

```python
from mcp.server.fastmcp import FastMCP
from ppadb.client import Client

mcp = FastMCP("airi-android")
adb_client = Client()

@mcp.resource("adb://devices")
def get_devices():
    return adb_client.devices()
```

Wrong! When I asked Cursor to get the device list, it didn't know how to operate. It said it wanted to actively check which devices were connected, so it's a tool. Hmm, it seems I didn't fully understand.

I haven't figured out exactly how to let LLMs operate phones yet, and I'd like to discuss it with everyone. But here's how Cursor operates:

1. Use screenshot functionality to get a general understanding of what's on the phone screen.
2. Use UI automation tools to get the precise position of the element you want to operate.
3. Click or swipe it.
4. Repeat the above steps.

It seems to work well so far, but I have some small questions:

1. If the screen shows a game that uses graphics APIs to draw content directly on the screen rather than UI components, UI automation tools can't get the element positions and thus can't operate them.
2. LLM responses have length limits. If the operation is complex, it might need to be completed in steps. Can we automatically notify it after each step is completed to trigger the next step, like in [airi-factorio](https://github.com/moeru-ai/airi-factorio)?
3. If some apps have cool animations, taking a screenshot immediately after an operation might not show the effect. Would we need to wait a while after the operation before taking a screenshot, or use screen recording directly?
4. What about the security of letting AI directly operate phones? What risks might there be?

Some reflections.

This is the first time I've felt like coding with a human while working with AI. I'm not sure if it's because my goal was to let AI use my tools, so it became my client—I constantly had to adjust my code based on its feedback. It also became my colleague—I needed to think and solve problems together with it. Look at this screenshot, doesn't it really look like that?

![](./assets/develop-with-cursor.avif)

During development, I also learned some small tricks, like using the command line to start Android emulators so we don't need to open Android Studio, which reduces memory pressure significantly.

```bash
emulator -avd Pixel_6_Pro_API_34
```

Next, I plan to connect the AIRI desktop pet to the MCP server and see what it wants to do. Maybe it will open Telegram and chat with us, just like ReLU does now, but without using Telegram's API.

Thank you for reading this possibly somewhat rambling and not very substantial DevLog. See you next time!
