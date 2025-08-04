---
title: DevLog @ 2025.07.18
category: DevLog
date: 2025-07-18
excerpt: |
  We would love to share how we plan to improve our Factorio AI agent project, `airi-factorio`, based on the Factorio Learning Environment paper.
preview-cover:
  light: "@assets('./assets/factorio-belt.gif')"
  dark: "@assets('./assets/factorio-belt.gif')"
---

Hello, I'm [@LemonNeko](https://github.com/LemonNekoGH), one of the maintainers of AIRI.

## Review

Half a year ago, I first tried to write an AI Agent that can play the famous automation production simulation game [Factorio](https://www.factorio.com/) called [`airi-factorio`](https://github.com/moeru-ai/airi-factorio), and I did the following things:

- Writing Factorio Mods in TypeScript: Using [tstl](https://github.com/TypeScriptToLua/TypeScriptToLua) to compile TypeScript code into Lua code.
- Using RCON to interact with Factorio Mods: Using [factorio-rcon-api](https://github.com/nekomeowww/factorio-rcon-api) to communicate with Factorio, calling `/c` commands to execute functions registered by the mod. Many thanks to [@nekomeowww](https://github.com/nekomeowww).
- Using LLM for decision-making and generating Lua code to control the player: Through prompt engineering to tell the LLM how to operate the game, how to plan, and encapsulating the RCON interaction code into tools that the LLM can call.
- Interacting with the LLM through the game's built-in chat system: By reading the game's standard output, using regular expressions to parse player chat content in the game, and sending it to the LLM for processing.
- Hot reloading of Factorio Mods: By writing a plugin for tstl to monitor code changes in real-time and send new mod content to the game via RCON. When receiving new mod code, unload all interfaces and execute the mod code once to achieve hot reloading. However, how to properly handle the existing state of the mod became a major challenge.
- Development in DevContainer: Making the environment more controllable and project startup simpler.
- Using symbolic links to link the `tstl` output directory to the game directory, so we can directly see the compiled Lua code in the game directory, making debugging easier.

This taught me a lot of knowledge ~~(especially that Lua array indices start from 1)~~.

However, I also encountered many problems. Since our main operations were written in the mod, debugging became very troublesome. We needed to exit the map, return to the game's main interface, and re-enter to apply mod changes. If our mod was slightly more complex with `data.lua`, we needed to restart the game.

We let the LLM generate Lua code, then execute it by calling the game command `/c` through RCON. However, Factorio has a length limit for each command. If our code was too long, we needed to execute it multiple times.

The current code has poor robustness and maintainability. If new friends want to participate in development, or even just try it out, starting this project is very difficult.

## Factorio Learning Environment

Fast forward to now, I plan to properly organize this project, but I don't know where to start. Coincidentally, someone mentioned a paper called [Factorio Learning Environment](https://arxiv.org/abs/2503.09617). Let me give you a simple read-through.

In this paper, the authors proposed a framework called Factorio Learning Environment (FLE), where they tested AI's capabilities in long-term planning, program synthesis, resource management, and spatial reasoning.

FLE has two modes:

- Lab-play: Testing in 24 manually designed levels with limited resources, examining whether AI can efficiently build production lines with limited resources.
- Open-play: Unlimited large maps, with the goal of building the largest factory on procedurally generated maps, testing AI's long-term autonomous goal setting, exploration, and expansion capabilities.

They evaluated mainstream LLMs like Claude 3.5 Sonnet, GPT-4o, Deepseek-v3, Gemini-2, etc., but in Lab-play, even the strongest Claude 3.5 at the time only completed 7 levels.

Reading this, I became curious. Their evaluation was so complex, so they must have also ensured technical maintainability. How did they achieve this? Continuing to read, I found that their implementation method was very similar to `airi-factorio`, but had many advantages compared to `airi-factorio`:

- Written in Python, the LLM generates Python code and executes it directly in a Python REPL, and can read results directly from standard output. Since Python has far more datasets than Lua, the generation accuracy is higher and can generate more complex code.
- The Lua mod only contains primitive operations for execution, such as place_entity for placing entities. More complex logic is written in Python, which can reduce the possibility of bugs in the Lua mod, so we don't need to restart the game so frequently.
- Using `/sc` commands instead of `/c` commands to execute Lua code, which doesn't output code to the console, keeping the console clean and only leaving the necessary content, simplifying the difficulty of parsing standard input.

To better evaluate LLM capabilities, they also carefully analyzed all the required recipe production processes and difficulties, summarizing some formulas, such as the cost of producing an item, how to calculate LLM scores, etc.

They also posted their [system prompt](https://arxiv.org/html/2503.09617v1#A8.SS4), which specifies the environment structure, response format, best practices, how to understand game output, etc.

## Back to `airi-factorio`

Compared to FLE, our implementation seems quite naive. So how should we improve `airi-factorio`?

I don't want to write Python, I'm familiar with TypeScript and Golang, only. Coincidentally, we made [mcp-launcher](https://github.com/moeru-ai/mcp-launcher) just a few ago, a builder suitable for all possible MCP servers. We can use it with Golang to implement an MCP server, then let the LLM call it.

With that, the structure diagram has changed:

<div class="flex flex-row gap-4">

![Before](./assets/structure-before.avif)

![After](./assets/structure-after.avif)

</div>

Player chat content will no longer be sent to the LLM, rather stored in the [RconChat](https://gitlab.com/FishBus/rconchat) mod, while LLM reads this content through the MCP server. With the potential MCP server approach, we don't need to let the LLM generate Lua code anymore.

Regarding system prompts, currently our prompts are AI-generated, but they're still not clear enough, with unclear priorities. I plan to improve them by referencing FLE's system prompt.

Alright, we've basically overturned all the previous designs again. Time to start over.

## Conclusion

Thank you for reading. If you're interested, you can read through FLE's paper and [code](https://github.com/JackHopkins/factorio-learning-environment). Maybe my understanding is incorrect; corrections are welcome! This reading might not be deep enough, but when I follow my ideas to improve `airi-factorio` next, I'll need to read repeatedly and update when there's progress.

That's it for this DevLog. Have a great weekend!

> Cover artwork by [@anrew10](https://es.pixilart.com/art/factorio-yellow-belt-132272fb3d727dd)
