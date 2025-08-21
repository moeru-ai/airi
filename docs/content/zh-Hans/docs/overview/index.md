---
title: 这是什么项目？
description: 了解 Project AIRI 的用户界面
---

### 太长不看

请将我们视为

- [Neuro-sama](https://www.youtube.com/@Neurosama) 的开源重建
- [Grok Companion](https://news.ycombinator.com/item?id=44566355) 的开源替代方案
- 一个支持 Live2D，VRM，并且一起玩游戏，或者感知其他应用的 [SillyTavern](https://github.com/SillyTavern/SillyTavern)（酒馆）替代方案

你是否梦想过拥有一个赛博生命（赛博 waifu /husbando），
或者可以陪你玩耍、聊天的数字伙伴？

借助现代 LLM 的强大功能，
像 [Character.ai (又名 c.ai)](https://character.ai) 和 [JanitorAI](https://janitorai.com/) 这样的平台，
或者像 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 这样的应用已经可以为基于聊天或视觉 ADV 游戏的体验提供足够完善的解决方案。

> 但是玩游戏呢？或者看看你正在编写什么？
> 一边玩游戏一边聊天、看视频，还能做很多其他事情。

或许你已经认识 [Neuro-sama](https://www.youtube.com/@Neurosama) 了，她是目前最好的数字伙伴，可以玩游戏、聊天，还能和你以及（在 VTuber 社区）的参与者互动，有些人也把这种生物称为“数字人”。**可惜的是，它目前尚未开源，直播下线后你就无法与她互动了**。

因此 Project AIRI 提供了另一种可能性：
**让你随时随地轻松拥有自己的数字生命、赛博生命。**。

## 开始使用

我们同时支持网页和客户端。

<div flex gap-2 w-full justify-center text-xl>
  <div w-full flex flex-col items-center gap-2 border="2 solid gray-500/10" rounded-lg px-2 pt-6 pb-4>
    <div flex items-center gap-2 text-5xl>
      <div i-lucide:app-window />
    </div>
    <span>网页</span>
    <a href="https://airi.moeru.ai/" target="_blank" decoration-none class="text-primary-900 dark:text-primary-400 text-base not-prose bg-primary-400/10 dark:bg-primary-600/10 block px-4 py-2 rounded-lg active:scale-95 transition-all duration-200 ease-in-out">
      打开
    </a>
  </div>
  <div w-full flex flex-col items-center gap-2 border="2 solid gray-500/10" rounded-lg px-2 pt-6 pb-4>
    <div flex items-center gap-2 text-5xl>
      <div i-lucide:laptop />
      /
      <div i-lucide:computer />
    </div>
    <span>客户端</span>
    <a href="https://github.com/moeru-ai/airi/releases/latest" target="_blank" decoration-none class="text-primary-900 dark:text-primary-400 text-base not-prose bg-primary-400/10 dark:bg-primary-600/10 block px-4 py-2 rounded-lg active:scale-95 transition-all duration-200 ease-in-out">
      下载
    </a>
  </div>
</div>

网页版功能较为基础，适用于在任何设备（包括移动设备）上访问。

客户端则更适合进行高级操作，例如 VTuber 直播、computer-use 以及访问本地 LLM 模型，此时无需为运行 AIRI 支付大量 token 费用。

<div flex gap-2 w-full flex-col justify-center text-base>
  <a href="../overview/guide/tamagotchi/" w-full flex items-center gap-2 border="2 solid gray-500/10" rounded-lg px-4 py-2>
    <div w-full flex items-center gap-2>
      <div flex items-center gap-2 text-2xl>
        <div i-lucide:laptop />
      </div>
      <span>客户端</span>
    </div>
    <div decoration-none class="text-gray-900 dark:text-gray-200 text-base not-prose rounded-lg active:scale-95 transition-all duration-200 ease-in-out text-nowrap">
      如何使用？
    </div>
  </a>
  <a href="../overview/guide/web/" w-full flex items-center gap-2 border="2 solid gray-500/10" rounded-lg px-4 py-2>
    <div w-full flex items-center gap-2>
      <div flex items-center gap-2 text-2xl>
        <div i-lucide:app-window />
      </div>
      <span>网页</span>
    </div>
    <div class="text-gray-900 dark:text-gray-200 text-base not-prose rounded-lg active:scale-95 transition-all duration-200 ease-in-out text-nowrap">
      如何使用？
    </div>
  </a>
</div>

## 贡献

有关如何为本项目做出贡献的指南，请参阅 [贡献](../overview/contributing/) 页面。

有关如何设计和改进 Project AIRI 用户界面的参考资料，请参阅 [设计指南](../overview/contributing/design-guidelines/resources) 页面。
