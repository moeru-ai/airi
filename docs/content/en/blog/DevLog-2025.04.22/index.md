---
title: DevLog @ 2025.04.22
category: DevLog
date: 2025-04-22
---


## Daytime


Hello everyone, I am [@LemonNeko](https://github.com/LemonNekoGH), and this time I am writing the DevLog to share development stories with you.


Two months ago, we ported AIRI's web client to Electron [#7](https://github.com/moeru-ai/airi/pull/7) (which has since been rebuilt with Tauri 🤣 [#90](https://github.com/moeru-ai/airi/pull/90)). It can appear on our screen as a desktop pet. Around the same time, the idea of letting AIRI use a phone came to me, but I kept putting it off.


Last weekend (2025.04.20), I spent some time building an MCP server demo that can interact with ADB — [airi-android](https://github.com/LemonNekoGH/airi-android) — giving AIRI the most basic ability to interact with a phone (in fact, most LLMs can use it to interact with a phone). Here is the demo video:


<ThemedVideo controls muted src="/blog/DevLog-2025.04.22/assets/cursor-open-settings.mp4" />


I also packaged it into a Docker image and submitted it to the [MCP server list](https://mcp.so/server/airi-android/lemonnekogh). If you are interested, feel free to try it.


Actually, my initial idea was to write some Tool Calling code, tweak the prompt, and tell the LLM we can use these tools to interact with the phone — and that would be it. ~~But MCP has become so popular recently that I had some FOMO, so I chose MCP to implement it.~~


To write an MCP server, you first have to understand what MCP is (although I am never the type to study theory properly before practicing; I chose to jump right in and let Cursor try to use it). MCP (Model Context Protocol) is a protocol that attempts to standardize how applications provide context to LLMs. It introduces a few core concepts:


1. Resources: the server can provide data and content as context to the LLM.
2. Prompts: create reusable prompt templates and workflows.
3. Tools: allow the LLM to perform actions through your server.


Ah, resources — I know about those! In Ruby on Rails, a user is a resource. So are ADB devices also resources? Letting the LLM view the connected device list could be written as:

```python
from mcp.server.fastmcp import FastMCP

from ppadb.client import Client

mcp = FastMCP("airi-android")

adb_client = Client()

@mcp.resource("adb://devices")

def get_devices():

    return adb_client.devices()
```


Wrong. When I asked Cursor to get the device list, it did not know how to operate; it said it wanted to actively check which devices were connected — so it is a tool. Well, it seems I did not fully understand it.


I have not decided yet how exactly to let the LLM operate the phone, and I would like to discuss it with you. But this is how Cursor does it:


1. Use the screenshot feature to roughly understand what is on the phone screen.
2. Use UI automation tools to get the precise position of the element to operate.
3. Tap or swipe it.
4. Repeat the above steps.


It seems to work well so far, but I have a few small questions:


1. If the screen contains a game that draws content directly with a graphics API instead of using UI components, the UI automation tools cannot get element positions, so they cannot operate on it.
2. An LLM response has a length limit. If the operation is complex, it may need to be completed in steps. Can we automatically tell the LLM to trigger the next step after a step is completed, like we do in [airi-factorio](https://github.com/moeru-ai/airi-factorio)?
3. If some apps have flashy animations, taking a screenshot immediately after an operation may not show the effect. Do we need to wait a while after the operation before screenshotting, or just use screen recording?
4. How safe is it to let the AI operate the phone directly, and what are the risks?


Some thoughts.


This is the first time I felt like I was writing code with an AI the same way humans write code together. Maybe it is because my goal was to let the AI use my tool, so it became my customer — I need to keep adjusting my code based on its feedback — and it also became my colleague — I need to think and solve problems together with it. Looking at this screenshot, doesn't it really look like that?


![](/blog/DevLog-2025.04.22/assets/develop-with-cursor.avif)


I also learned some tricks during development, such as starting the Android emulator from the command line, so you do not need to open Android Studio, and memory pressure is much lower too.

```bash
emulator -avd Pixel_6_Pro_API_34
```


Next, I plan to connect the AIRI desktop pet to an MCP server and see what it wants to do. Maybe it will open Telegram and chat with us, just like ReLU does now — except not using the Telegram API.


Thank you for reading this DevLog that might be a bit verbose and light on substance. See you next time!

