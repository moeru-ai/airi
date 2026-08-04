---
title: DevLog @ 2025.07.18
category: DevLog
date: 2025-07-18
excerpt: |
  After reading the paper about a Factorio reinforcement learning environment, we want to share how we plan to improve the Factorio agent project `airi-factorio`.
preview-cover:
  light: "/blog/DevLog-2025.07.18/assets/factorio-belt.gif"
  dark: "/blog/DevLog-2025.07.18/assets/factorio-belt.gif"
---


Hello everyone, I am [@LemonNeko](https://github.com/LemonNekoGH), one of the maintainers of AIRI.


## Retrospective


Half a year ago, I made my first attempt at writing an AI agent [`airi-factorio`](https://github.com/moeru-ai/airi-factorio) that can play the famous automation production/management game [Factorio](https://www.factorio.com/), and I practiced the following along the way:


- Writing a Factorio mod in TypeScript: using [tstl](https://github.com/TypeScriptToLua/TypeScriptToLua) to compile TypeScript code into Lua code.
- Interacting with the Factorio mod via RCON: using [factorio-rcon-api](https://github.com/nekomeowww/factorio-rcon-api) to communicate with Factorio and call the `/c` command to execute functions registered by the mod. Many thanks to [@nekomeowww](https://github.com/nekomeowww).
- Using an LLM to make decisions and generate Lua code to operate the player: using prompt engineering to tell the LLM how to operate the game and how to plan, and wrapping the RCON interaction code into tools that the LLM can call.
- Interacting with the LLM through the in-game chat system: reading the game's standard output and using regex to parse the chat content of players in the game, then sending it to the LLM for processing.
- Hot-reloading the Factorio mod: writing a plugin for tstl to watch code changes in real time and send the new mod content to the game via RCON; when new mod code arrives, unload all interfaces and execute the mod code once to achieve hot reload. However, correctly handling the mod's existing state became a major challenge.
- Developing in a DevContainer: making the environment more controllable and the project startup simpler.
- Symlinking tstl's output directory into the game directory, so the compiled Lua code can be seen directly in the game directory for easier debugging.


This taught me a lot ~~(especially that Lua array indexing starts from 1)~~.


But we also ran into many problems. Since our main operations were written in the mod, debugging was very troublesome: we had to exit the map, return to the game's main menu, and re-enter to apply mod changes. If our mod was a bit more complex and had a `data.lua`, we had to restart the game.


We let the LLM generate Lua code and execute it by calling the game command `/c` via RCON. However, Factorio limits the length of a single command, so if our code was too long, it had to be executed in multiple parts.


The current code is very fragile and hard to maintain. If new friends want to join development, or even just try it, starting this project is very difficult.


## Factorio Learning Environment


Now, I plan to sort out this project properly, but I did not know where to start. Just then, someone mentioned the paper [Factorio Learning Environment](https://arxiv.org/abs/2503.09617). Let me walk you through it briefly.


In this paper, the authors propose a framework called the Factorio Learning Environment (FLE), where they test AI's abilities in long-term planning, program synthesis, resource management, and spatial reasoning.


FLE has two modes:


- Lab-play: tests on 24 hand-designed levels with limited resources, examining whether the AI can build efficient production lines under limited resources.
- Open-play: an unlimited large map where the goal is to build the biggest factory on a procedurally generated map, testing the AI's long-term autonomous goal-setting, exploration, and expansion abilities.


They evaluated several mainstream LLMs including Claude 3.5 Sonnet, GPT-4o, Deepseek-v3, and Gemini-2, but in Lab-play even the then-strongest Claude 3.5 only completed 7 levels.


At this point, I became curious: their evaluation is so complex — how do they ensure maintainability in the technical implementation? Reading on, I found that their implementation is very similar to `airi-factorio`, but has many advantages over it:


- Written in Python: the LLM generates Python code and executes it directly in a Python REPL, and the results can be read directly from standard output. Since Python's dataset is far larger than Lua's, the generated code is more accurate and can generate more complex code.
- The Lua mod only contains primitives for performing operations, such as `place_entity` for placing entities; more complex logic is written in Python, which reduces the chance of bugs in the Lua mod, so the game does not need to be restarted as often.
- Using the `/sc` command instead of `/c` to execute Lua code: the code is not printed to the console, keeping the console clean and leaving only what is needed, which simplifies parsing standard input.


To better evaluate the LLMs' abilities, they also carefully analyzed the production flows and difficulty of all needed recipes and summarized some formulas, such as the cost to produce an item and how to calculate an LLM's score.


They also published the [system prompt](https://arxiv.org/html/2503.09617v1#A8.SS4) they used, which specifies the environment structure, response format, best practices, how to understand the game output, and more.


## Back to `airi-factorio`


Compared with FLE, our implementation looks quite naive. So how should we improve `airi-factorio`?


I do not want to write Python; I am only familiar with TypeScript and Golang. Coincidentally, we recently also wrote [mcp-launcher](https://github.com/moeru-ai/mcp-launcher), a builder for all possible MCP servers. We can use it to implement an MCP server in Golang and let the LLM call it.


So the structure diagram changed:

<div class="flex flex-row gap-4">
![](/blog/DevLog-2025.07.18/assets/structure-before.avif)
![](/blog/DevLog-2025.07.18/assets/structure-after.avif)
</div>


The players' chat content is no longer pushed to the LLM; instead it is stored in the [RconChat](https://gitlab.com/FishBus/rconchat) mod, and the LLM reads it through the MCP server. With the MCP server in place, the LLM no longer needs to generate Lua code.


As for the system prompt, although our current prompt is AI-generated, it is still not clear enough and lacks clear priorities. I plan to reference FLE's system prompt to improve it.


Well, basically all the previous designs have been overturned again. Time to start over.


## Ending


Thanks for reading. If you are interested, you can check out the FLE paper and its [code](https://github.com/JackHopkins/factorio-learning-environment). My understanding may be wrong — corrections are welcome! This reading may not be deep enough, but as I improve `airi-factorio` according to my own ideas, I will need to read it repeatedly and will update you when there is progress.


That's it for this DevLog. Have a nice weekend!


> Cover artwork by [@anrew10](https://es.pixilart.com/art/factorio-yellow-belt-132272fb3d727dd)

