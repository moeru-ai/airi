---
title: DevLog @ 2025.07.18
category: DevLog
date: 2025-07-18
excerpt: |
  在阅读完有关 Factorio 强化学习环境的论文后，我们想和大家分享我们如何计划改进 Factorio agent 项目 `airi-factorio`。
preview-cover:
  light: "@assets('../../../en/blog/DevLog-2025.07.18/assets/factorio-belt.gif')"
  dark: "@assets('../../../en/blog/DevLog-2025.07.18/assets/factorio-belt.gif')"
---

大家好，我是 [@LemonNeko](https://github.com/LemonNekoGH)，AIRI 的维护者之一。

## 回顾

半年前，我第一次尝试写一个可以游玩知名自动化生产模拟经营游戏 [Factorio](https://www.factorio.com/) 的 AI Agent [`airi-factorio`](https://github.com/moeru-ai/airi-factorio)，并在其中进行了这些实践：

- 使用 TypeScript 编写 Factorio Mod：使用 [tstl](https://github.com/TypeScriptToLua/TypeScriptToLua) 来将 TypeScript 代码编译成 Lua 代码。
- 使用 RCON 与 Factorio Mod 进行交互：使用 [factorio-rcon-api](https://github.com/nekomeowww/factorio-rcon-api) 来与 Factorio 通信，调用 `/c` 命令来执行 Mod 注册的函数。很感谢 [@nekomeowww](https://github.com/nekomeowww)。
- 使用 LLM 进行决策并生成 Lua 代码来操作玩家：通过提示词工程来告诉 LLM 如何操作游戏、如何进行规划，并把与 RCON 交互的代码封装成工具（tool），让 LLM 可以调用。
- 在游戏内置的聊天系统中与 LLM 进行交互：通过读取游戏的标准输出，使用正则表达式来解析游戏中玩家的聊天内容，发送给 LLM 来处理。
- Factorio Mod 的热重载：通过为 tstl 写插件的形式来实时监测代码变化，并把新的 Mod 内容通过 RCON 发送给游戏，在收到新的 Mod 代码时卸载所有的接口并且执行一遍 Mod 的代码来实现热重载。但是，如何正确处理 Mod 已经有的状态成了大难题。
- 在 DevContainer 中进行开发：使环境变得更可控，项目启动也会变得更简单。
- 通过符号链接的方式把 `tstl` 的输出目录链接到游戏目录，这样我们就可以在游戏目录中直接看到编译后的 Lua 代码，方便调试。

这让我学到了很多的知识 ~~（尤其是 Lua 的数组索引从 1 开始）~~。

但是，也遇到了非常多的问题，由于我们的主要操作写在 Mod 中，调试起来会非常麻烦，我们需要退出地图回到游戏主界面再重新进入才能应用上 Mod 的改动，如果我们的 Mod 稍微复杂一点，有 `data.lua`，则需要重启游戏。

我们让 LLM 来生成 Lua 代码，然后通过 RCON 调用游戏命令 `/c` 来执行，而 Factorio 一条命令的长度是有限制的，如果我们的代码过长，则需要分多次执行。

目前的代码健壮性很差，可维护性很差，如果有新朋友想来参与开发，甚至只是尝试一下，启动这个项目都是非常困难的。

## Factorio Learning Environment

时间回到现在，我打算好好理一理这个项目，但是我不知道从哪里开始，刚好有人提到了一篇论文 [Factorio Learning Environment](https://arxiv.org/abs/2503.09617)，我来带你简单读一读它。

在这篇论文中，作者提出了一个名为 Factorio Learning Environment (FLE) 的框架，他们在这个环境中测试 AI 在长期规划、程序合成、资源管理与空间推理方面的能力。

FLE 分为两种模式：

- Lab-play：在 24 个人为设计的关卡中进行测试，资源有限，考察 AI 能否在有限资源下高效搭建流水线。
- Open-play：无限制大地图，目标是在程序生成的地图上建造最大的工厂，考查 AI 的长期自主目标制定、探索和扩展能力。

他们评测了 Claude 3.5 Sonnet、GPT-4o、Deepseek-v3、Gemini-2 等多款主流 LLM，但是在 Lab-play 中当时最强的 Claude 3.5 也只完成了 7 个关卡。

读到这里，我开始好奇，他们的评测如此复杂，那么在技术实现上是如何保证可维护性的呢？继续阅读发现，他们的实现方式与 `airi-factorio` 非常相似，但是相对 `airi-factorio` 来说有很多优点：

- 使用 Python 编写，LLM 生成 Python 代码并直接在 Python REPL 中执行，可以直接在标准输出中读取结果。由于 Python 的数据集远远多于 Lua，所以生成的准确性更高，也能生成更复杂的代码。
- Lua mod 中只包含执行操作的原语，比如 place_entity 放置实体，更复杂的逻辑放到 Python 中写，可以减少 Lua mod 出现 bug 的可能，就不用那么频繁的重启游戏。
- 使用 `/sc` 命令而不是 `/c` 命令来执行 Lua 代码，不会把代码输出在控制台里，保持控制台干净，只留下需要的内容，简化解析标准输入的难度。

为了能更好的评测 LLM 的能力，他们还认真分析了所有需要的配方的生产流程和难度，总结了一些公式，比如一个物品生产所需的成本，如何计算 LLM 得分等等。

他们还贴出了他们使用的 [系统提示词](https://arxiv.org/html/2503.09617v1#A8.SS4)，规定了环境结构、响应格式、最佳实践、如何理解游戏输出等等。

## 回到 `airi-factorio`

和 FLE 比起来，我们的实现显得相当幼稚，那我们要怎么改进 `airi-factorio` 呢？

我不想写 Python，我只熟悉 TypeScript 和 Golang，很巧，我们最近也写了 [mcp-launcher](https://github.com/moeru-ai/mcp-launcher)，一个适用于所有可能的 MCP 服务器的构建器，我们可以配合它来使用 Golang 来实现一个 MCP 服务器，然后让 LLM 来调用它。

那么结构图就发生了变化：

<div class="flex flex-row gap-4">

![之前](./assets/structure-before.avif)

![之后](./assets/structure-after.avif)

</div>

玩家的聊天内容不再被推送给 LLM，而是储存在 [RconChat](https://gitlab.com/FishBus/rconchat) mod 中，LLM 通过 MCP 服务器来读取这些内容。用上了 MCP 服务器，就不需要让 LLM 来生成 Lua 代码了。

系统提示词方面，目前我们的提示词虽然是 AI 生成的，但依然不够清晰，主次不明确，我打算参考 FLE 的系统提示词来改进一下。

好的，又基本推翻了之前的所有设计，该重新开始了。

## 结束

感谢阅读，如果感兴趣，可以翻阅 FLE 的论文和 [代码](https://github.com/JackHopkins/factorio-learning-environment)，也许我的理解有误，欢迎指正！这次的阅读也许不够深入，但是接下来我在按照我的思路来改进 `airi-factorio` 的时候，会需要反复阅读，在有进展时再更新。

这篇 DevLog 就到这里，祝大家周末愉快！

> 封面取自 [@anrew10](https://es.pixilart.com/art/factorio-yellow-belt-132272fb3d727dd) 的作品
