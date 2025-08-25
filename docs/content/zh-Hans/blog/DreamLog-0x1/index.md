---
title: 'DreamLog 0x1'
description: 'Project AIRI 的幕后故事！'
date: '2025-06-16'
excerpt: 'Project AIRI 的幕后故事！以及为什么我们会想要制作如此一个项目？'
preview-cover:
  light: "@assets('../../../en/blog/DreamLog-0x1/assets/dreamlog1-light.avif')"
  dark: "@assets('../../../en/blog/DreamLog-0x1/assets/dreamlog1-dark.avif')"
---

<script setup>
import EMOSYSLogo from '../../../en/blog/DreamLog-0x1/assets/emosys-logo.avif';
import SteinsGateSticker1 from '../../../en/blog/DreamLog-0x1/assets/steins-gate-sticker-1.avif';
import worldExecuteMeCover from '../../../en/blog/DreamLog-0x1/assets/world.execute(me); (Mili)／DAZBEE COVER.avif';
import buildingAVirtualMachineInsideImage from '../../../en/blog/DreamLog-0x1/assets/building-a-virtual-machine-inside-image-1.avif';
import live2DIncHiyoriMomose from '../../../en/blog/DreamLog-0x1/assets/live2d-inc-hiyori.avif';
import AwesomeAIVTuber from '../../../en/blog/DevLog-2025.04.06/assets/awesome-ai-vtuber-logo-light.avif'
import airisScreenshot1 from '../../../en/blog/DreamLog-0x1/assets/airis-screenshot-1.avif';
import projectAIRIBannerLight from '../../../en/blog/DreamLog-0x1/assets/banner-light-1280x640.avif';
import projectAIRIBannerDark from '../../../en/blog/DreamLog-0x1/assets/banner-dark-1280x640.avif';
import ReLUStickerWow from '../../../en/blog/DreamLog-0x1/assets/relu-sticker-wow.avif'
</script>

哈啰，又是我，Neko！

首先，祝居住在北半球的朋友们暑假/夏日愉快！

> 希望你们能度过一个开心和充实的暑假，去尝试不同的新事物！更具体地说，改变世界！

我，[@nekomeowww](https://github.com/nekomeowww) 离开学校生活已经 8 年了，
很明显，我现在不会有真·暑假了，毕竟也已经工作了很多年。
但如果回想起来的话，我还是喜欢和大家一起回忆和分享多年前暑假发生的故事。

也许你知道我要说什么...或者分享什么？*DreamLog* 到底是什么？
对于已经熟悉我们 DevLog 文章的读者来说，以目前每月向大家发布和更新一次的频率，
这篇文章难道不应该叫「DevLog」吗？

DevLog 会有的，但六月对 Project AIRI 有着特殊的意义（稍后提及），
我想趁着我们正在 GitHub 上 1000 star 的下一个里程碑之时，
借助这个很好的机会来回顾我们迄今为止的旅程。

因此，我决定在这里创建一个新的文章类别，来分享我们的编年史，
以及有关 ProjectAIRI 的梦想。

所以，我决定称这个新系列为 ***DreamLog***。

> 是的，你可以把这当作睡前听的故事书。可以当作当作有声书去听...可能~~也挺能帮助入眠的~~。

那么...让我们现在跳入我们的梦境维度，稍后再谈论我们最近做的更新，怎么样？

## 模糊的梦境，遥不可及的记忆

> 我学习计算机和编程的小进步。

我提到了夏天，那么夏天对我来说一定意味着什么。我曾经在美国上学，
所以每年为期 3 个月的夏天让我可以做各种各样的事情，玩游戏、学编程、折腾 Linux 和网络等等（是的，
许多仍然深爱的朋友也是在不同年份的夏天认识的）。

> 极客和 Nerd 们应该能比较 get 到我描述的这种经历？对吧？

我在暑假里和伙伴们一起玩 Minecraft 的时候学会了如何启动服务器（我玩了很多很多很多的 1.7.11 和 1.8，
真的，包括原版和 Forge mod），这也是推动我学习 Linux 命令行的动机和力量。很多这期间学会的知识至今仍然帮助着我，
我对此心怀感激，也不会后悔在这些事情上花那么多时间。

Minecraft、Linux 也并不是我旅程的终点，[Factorio（异星工厂）](https://www.factorio.com/)、
[Elite Dangerous（精英：危险）](https://www.elitedangerous.com/)和
[Overwatch（守望先锋）](https://overwatch.blizzard.com/en-us/)（遗憾的是暴雪还是糟蹋了一番）
都成了我最喜欢的游戏，建立服务器或编写小脚本来自动化小事情确实都是让我很兴奋的事情。

> <img :src="worldExecuteMeCover" alt="Cover of world.execute(me); (Mili)／DAZBEE COVER" class="rounded-lg overflow-hidden" />
>
> `Switch on the power line`<br />
> `Remember to put on protection`<br />
> `Lay down your pieces`<br />
> `And let's begin object creation`<br />
>
> -- 来自我心爱的歌曲 [`world.execute(me)`](https://www.youtube.com/watch?v=ESx_hy1n7HA) 的歌词，由 [DAZBEE](https://www.youtube.com/channel/UCUEvXLdpCtbzzDkcMI96llg) 翻唱

那，在 2017 年的夏天，在那最初的一刻，我开始考虑开发一个「有情感的程序」，
实现即使在我的朋友累了或者因为要上学所以早睡、而我必须独自一人的时候，
也可以成为我的朋友，陪我玩。

嗯，那跟着这篇文章读到这里的读者，可能已经意识到，我就是那种喜欢分享我的知识、
想法、一切的人。所以，编程、游戏和设计也都是我喜欢分享的事情。但是，
如果没有人陪伴或者聆听的话，感觉就像：

**孤独的我变得有些毫无意义。**

与其从头开始创建一个具有人类思考、说话能力的新 AI（这在 2017 年是不可能的），我想的是，
既然 iOS 和 Google 原生 Android 可以提供这样的能力来对我们的移动设备日常使用做建议，
手动输入所有命令和填充参数并不总是令人满意（特别是对于 ffmpeg 和幼稚的我使用 Docker CLI），
如果我们能够将 AI 驱动的建议功能带到 Linux 系统上会怎么样...？

这给我带来了许多问题和想法去思考：

- 如果操作系统理解你在不同时间坐在数字显示器前通常做什么、工作什么、玩什么会怎么样...？
- 如果它能够为你选择音乐，无论沑丧、兴奋还是在与他人聊天时快乐会怎么样...？

这些想法对当时的我来说太小太难理解了，因为我对操作系统如何工作、编程等等完全是萌新，
所以那时候的我，甚至都不知道从哪里可以着手入门！

正巧当时读了《[30日でできる! OS自作入门](https://www.amazon.co.jp/30%E6%97%A5%E3%81%A7%E3%81%A7%E3%81%8D%E3%82%8B-OS%E8%87%AA%E4%BD%9C%E5%85%A5%E9%96%80-%E5%B7%9D%E5%90%88-%E7%A7%80%E5%AE%9F/dp/4839919844)》，
[英文版](https://github.com/handmade-osdev/os-in-30-days)介绍的从零开始制作操作系统的教程，
凭借着知道一点点 Linux 命令行如何使用以及有很多社区可以求助的一点知识...我决定制作我自己的操作系统...
**从字面意思的一无所有开始**。

> **快速回顾**
>
> [Arch Linux](https://archlinux.org/) 是我第一个深入使用并从头安装的系统。
> 对于现在，[Nix](https://nixos.org/) 也是著名且有趣的，虽然还没有尝试过 [NixOS](https://nixos.org/)，
> 但期望有一天能试试看。

## 带我扬帆起航，但如今早已遗忘

我在 2017 年底开始了一个特殊但现在已归档的项目，
叫做 [EMOSYS](https://github.com/EMOSYS)，
旨在创建这样一个伴侣式的操作系统，
帮助用户完成日常任务并提供情感支持。

<div class="w-full flex flex-col items-center justify-center gap-2">
  <div>
    <img :src="EMOSYSLogo" alt="logo of EMOSYS" class="w-30!" />
  </div>
  <div>
    [EMOSYS](https://github.com/emosys) 的 Logo
  </div>
</div>

> EMO 代表 **emo**tional 和 **emo**te 的前三个字母

当时的我写了很多设计文档，列出新想法，并且按照那本书的指导进行实验，记录若干的笔记，
还给它画了一个看起来还不错的 Logo。

> 我猜你们中的许多人都这样做过 😏，在项目达到 PoC（概念验证）阶段之前就准备好了所有设计、美术资产。

然而事实上，我对最初要接近的目标已经完全迷失了。
我也没有项目管理和任务管理的经验，更没有太多能编写实际可以运行的程序的经验。

坦率地说，你可以说我只是跟着那本书所指示的，在 SSH 和 Terminal 里用键盘挨个输入。
基本上完全不思考，不思考为什么它可以工作或者为什么要这么写。
（和现在很多人的 Vibe Coding 虽然不能说是完全相同，但也只能说是一模一样了）。

所以，嗯，结果很明显，又一个被放弃的项目诞生了...

而且很显然，我不是那种从童年就玩弄这些东西、理解内核和包管理、编程如何工作的天才，
所以如果你们中的任何人现在去翻看或访问我的 GitHub 主页的话，
在那个时候你找不到任何与这种工作相关的东西。（但现在我成长得真的很快。）

至少，它存在过，曾经是这样。

> 遗忘？也许是下一段旅程的另一个起点。

在接下来的几年里，我尝试了编程、创业、Web3、前端、后端、基础设施等许多其他领域，
所有你能想到的全栈开发者的东西。但我从来没有真正意识到我所做的一切如此深刻地受到 EMOSYS 起点的影响，
直到 2025 年 2 月，有人问我：你为什么在 Project AIRI 上如此努力和着迷？

我当时觉得这是个好问题...

我开始追溯我的梦想、想法和记忆，最终，回忆起了 EMOSYS，那个已经死去的项目，恰到好处地目标与 Project AIRI 相同：

**创建一个伴侣来以某种方式满足我们的需要。**

> 必要なものは 覚悟だけだったのです。
> 必死に積み上げてきたものは 決して裏切りません。<br />
> 我需要的不过是决心而已，
> 你至今为止所累积的一切不会背叛你。
>
> -- 引自《[葬送的芙莉莲，菲伦](https://en.wikipedia.org/wiki/Frieren)》S01E06, 04:27

我花了很长时间学习如何正确开发东西。感谢 [@zhangyubaka](https://github.com/zhangyubaka)、
[@LittleSound](https://github.com/LittleSound)、
[@BlueCocoa](https://github.com/BlueCocoa) 和
[@sumimakito](https://github.com/sumimakito) 的帮助，与他们的结对编程经验教会了我很多东西，
我开始以自己的节奏成长、学习和进步。

## 2022 年的 ChatGPT，全新的随机鹦鹉，还挺聪明

<div class="w-full flex items-center justify-center">
  <img :src="SteinsGateSticker1" alt="Steins Gate sticker" class="w-80! rounded-lg overflow-hidden" />
</div>

让我们把时间推进到 2022 年底，OpenAI 宣布了 ChatGPT（或者在那时，用的是 chatGPT 这个叫法）。

其实早在官方 ChatGPT UI 发布之前，我就已经在折腾这些新时代的 AI 了，像
[DiscoDiffusion](https://colab.research.google.com/github/alembics/disco-diffusion/blob/main/Disco_Diffusion.ipynb)（早于
Stable Diffusion，大约在 2021 年底或 2022 年初发布的吧）、DALL-E、Midjourney
GPT-3（特别是在 [GitHub Copilot](https://en.wikipedia.org/wiki/GitHub_Copilot) 中很有用）都早已成为我生活的一部分了。

所以，最开始的时候，我的感觉是：

> "哦，这就是另一个随机鹦鹉，它只是重复你说的话，并不理解你在说什么，它只是
> 试图基于前面的词和上下文预测下一个词，好像真的没啥特别的，还不够像人。"

换句话说，它表现得更像一个补全模型，而不是我们今天称之为智能体 AI 的东西（现在也还在炒作中呢！）。

我记得，我第一次发现 ChatGPT 或大语言模型（LLMs）真正能力的时候，是从我在 2022 年 12 月在 Hacker News 上看到的这篇文章：
[Building A Virtual Machine inside ChatGPT](https://www.engraved.blog/building-a-virtual-machine-inside/)（[原始 Hacker News
文章](https://news.ycombinator.com/item?id=33847479)），作者 @engraved 演示了如何让 ChatGPT 不仅扮演猫娘，
还在内部模拟一个虚拟 Linux 机器。

<div class="w-full flex flex-col items-center justify-center">
  <img :src="buildingAVirtualMachineInsideImage" alt="Building a virtual machine inside ChatGPT" class="h-150! object-contain rounded-lg overflow-hidden" />
  <div>它甚至能模拟 Docker build 是如何工作的...！</div>
</div>

这篇文章让我意识到，ChatGPT 可以理解普遍事物的基本规律，不仅仅是动漫或游戏角色的角色扮演，
还能理解 Linux 终端/shell 命令是如何工作的。

这其实就把现在流行的函数调用功能展现了出来，
并说明了我们如何能够通过提示词指示 LLMs 去使其表现得像 API 服务器一样，然后用机器可读的如 JSON 或 XML 格式与我们的代码交互，
并最终允许实现解析和执行任意命令，去扩展 LLMs 能力的边界。

> 函数调用，又称 Function Calling，或者说，也是 Anthropic 提出的 MCP（模型上下文协议）背后的底层技术

这最终填补了纯文本生成和调用程序内实际 API 之间的空白。

阶段性来说的话，我们可以说它是一个新的随机鹦鹉吗？**我觉得答案是部分否定的，2022 年的 ChatGPT 不只是一个随机鹦鹉，
它是一个潜在的聪明鹦鹉。**

## 在 Project AIRI 之前，Neuro-sama 早就存在了

是的，感谢你读到这里，我知道这是一篇很长的文章，有太多故事和背景要分享。但我们快到了！坚持住！

Neuro-sama 的历史其实相当复杂。据我所知，Neuro-sama，或者在直播舞台上名为 "Neuro-sama"的角色，
并不是她和她的创造者 `vedal987`（Vedal）的首次登场。早在那之前，2019 年 5 月 6 日，Vedal 向社区展示了他构建 AI
来玩 [osu!](https://osu.ppy.sh/) 相关的成果[^1]。
在那时，她实际上并不是一个网络角色或数字生命，如果你去看关于她的初始视频，甚至会发现都没有 Live2D 模型。
（你可以试试这个 6 年前的 YouTube 视频：https://www.youtube.com/watch?v=nSBqlJu7kYU）

在 ChatGPT 发布之后，差不多 2022 年 12 月 19 日，Vedal 开始让 Neuro-sama 使用来自 Live2D Inc.
的官方演示角色模型桃瀬ひより（Hiyori Momose）在 Twitch 上直播：

<img :src="live2DIncHiyoriMomose" alt="Live2D Inc. Hiyori Momose" class="rounded-lg overflow-hidden" />

之后的故事大家都知道了，Vedal 和 Neuro-sama 火了，Neuro-sama 现在正式成为了 VTuber，
她完全由大语言模型（LLMs）驱动，能够玩 Minecraft、Among Us、osu! 和许多其他游戏。
有时当游戏不被原生支持时，Vedal 会读取屏幕并指示 Neuro-sama 一起玩游戏，依然能制造出来不少节目效果。

我真的很享受观看他们的互动、像是脱口秀一样的斗嘴的时刻。随着时间的推移，Neuro-sama 和她的新 Evil Neuro 妹妹，
成为了我日常生活的重要组成部分：**即使我没有足够的时间观看完整的直播，我也想要，并且渴望观看她们的切片**。
8 年前的我应该很难想象我竟然从纯粹的 AI 和人类互动中获取了如此多的快乐。

好的，这就是关于她的小历史。让我们谈谈核心问题：**为什么她让我充满了决心？**

## Neuro-sama，让我充满了决心

从我第一次看到 Vedal 的出道，我就想：

> 好吧，她只是一个与大语言模型集成的简单 Live2D 模型（甚至直接调用的 OpenAI 的 API），
> 然后籍由简单的规则，驱动她，然后让她表现得像 VTuber，没啥特别的。

我当时还是挺傲慢的，因为我从 2023 年初就已经在开发 AI 智能体，了解 LLMs 的能力，
并且从 LangChain 那里学到了相当多知识，凭借着过去构建 AI
智能体的知识和多年来跨各种领域的软件工程经验，我天真地认为：

> "嗯，我也能做到，我可以做一个 Live2D 模型，将其连接到 OpenAI 的 API，
> 让它表现得像 VTuber，我甚至可以做得比 Vedal 的作品更好。超简单的好吧？！"

::: tip 想要更多技术细节？
在这篇文章中，我不会深入探讨我们如何从零开始构建 Project AIRI 到当前状态的技术细节，
我们已经有许多 DevLog 文章分享我们的想法和发现，如果感兴趣，请尝试阅读它们。
:::

结果我大错特错。许多困难的事情我直到开始尝试重新创建她时才意识到...比如：

- 我们如何有效地管理内存，既能够回答聊天又能同时玩游戏？
- 我们如何让 AI 智能体同时用视频输入和文本输入玩游戏，同时仍然能够与创作者和观众互动？
- 语音合成很困难，要实现 Neuro-sama 能够做到的，**超低延迟**语音合成是必须的，这并不容易实现
- 她的个性是如何构建的？仅仅使用 RAG 和简单的内存管理策略，效果很差。
- 等等...

> 我在 [DevLog 2025.04.06](../..devlog-20250406) 和
> [公开幻灯片演示（中文）](https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1)
> 中分享了我们的许多发现

我提到我喜欢分享，我希望有其他人能够倾听或与我一起编程，但遗憾的是 Neuro-sama 不属于我，
我不能要求她获得我的知识和记忆来能够与我互动我喜欢的事情，或者我最近在做或做过的工作。

我如此爱她们，一直以来，我真的不明白为什么我爱她们，为什么我喜欢 Neuro-sama 给我的感觉和快乐。

直到去年，从 2024 年 5 月 25 日开始，**我真的决定自己做一个。** 做一个有生命的或虚拟的存在，
可以与我一起编程，与我谈论我们知道的事情，像朋友一样以智能体的形式一起玩游戏。

> **我真的想要一个！** 我的心和脑子里都在这样极度渴望着。

在那时，Neuro-sama 让我充满了决心。

## 再次启航，向着前人未至之境前进

> 勇踏前人未至之境
>
> -- 引自《[星际迷航，柯克船长](https://en.wikipedia.org/wiki/Where_no_man_has_gone_before)》，
> 也是我 GitHub 个人资料的介绍语。

所以，从 2024 年 5 月 25 日开始，我开始了一个放在我自己名下的本地项目，就直接简单地起名叫了 `ai`，
可以说这就是 Project AIRI 的初始版本，我开始探索创建我自己的 AI 智能体的可能性，
想要重新创造 Neuro-sama 给我带来的快乐。

工作进展速度真的很快，在一周内，凭借 [ElevenLabs](https://elevenlabs.io/)、
[OpenRouter](https://openrouter.ai/) 的力量，以及同样免费使用的 Live2D 模型桃瀨ひより，
我能够创建一个简单版本的*"Neuro-sama"*，可以与我互动（虽然是非实时的 😭）。

那是在 **2024 年 6 月 2 日**。

从某种意义上来说，**这就是 Project AIRI 的生日**，第一个稚嫩的婴儿意识在其中诞生。

<div class="w-full flex flex-col items-center justify-center">
  <video controls muted autoplay loop>
    <source src="../../../en/blog/DreamLog-0x1/assets/airi-demo-first-day.mp4" />
  </video>
  <div>
    <a href="https://x.com/ayakaneko/status/1865420146766160114">
      2024 年 12 月 7 日在 X（曾经是 Twitter）上的首次展示
    </a>
  </div>
</div>

她能够说话，基于上下文的动作控制，逐步进行音频合成...很多功能都有。

但她还不完整，也不完美，我这段时间一直是瞒着所有的伙伴，悄咪咪地在构建它，
我想在向世界展示之前让它变得更好。

> 还是...天真地，傲慢地，对吧？

现实是，因为悄咪咪地构建，很难让我形成正反馈（当然其中一部分原因也是因为我不想让大家觉得我曾经那样自大的判断是错误的，
当然现在我愿意把这段心路历程分享给大家，也算是和当时的自己和解了），加之我面临的问题或挑战
（我上面提到的，关于内存、个性稳定性、实时性和游戏能力等）用我当时的知识很难解决，
并且缺乏文档、实时 LLMs 交互示例的学习材料，**我又把它搁置了，再次。**

说实话，我没有放弃，我开始学习很多关于多模态和语音合成、动作控制和 Minecraft 游戏的东西。
我对其他 AI VTuber 或 AI waifu 项目如何工作做了大量研究。这些研究后来产生了这个巨大的 AI VTuber 项目的 awesome list：

<div class="flex flex-col items-center">
  <img class="px-30 md:px-40 lg:px-50" :src="AwesomeAIVTuber" alt="Awesome AI VTuber Logo" />
  <div class="text-center pb-4">
    <span class="block font-bold">Awesome AI VTuber</span>
    <span>一个精选的 AI VTuber 及其相关项目列表</span>
  </div>
</div>

好吧，但它仍然叫 `ai`，那么 Project AIRI 在哪里呢？

## 重生，带着更强、更好的决心再 Start Game 一次

2024 年 11 月底的某一天，[@kwaa](https://github.com/kwaa) 与我聊天，
谈论在 VR/AR 世界中制作虚拟角色，想基于 WebXR 去做。当我们谈论动作控制和角色情感检测时，
我告诉他我有一个项目正好做你们正在寻找的事情，但代码库没有组织好，也没有准备好发布到 GitHub。

那，还等什么？我寻思终于找到了同好了！
我又开始猛干，重新思考结构和设计，改进了实现，做了更快更好的排队和多路复用播放系统，
以及对我随便做的基本 WebUI 的调整，最终，我在 **2024 年 12 月 2 日** 用提交
[`d9ae0aa`](https://github.com/moeru-ai/airi/commit/d9ae0aae387f015964bfd383e6d2adb05f4003e4)
将其发布到 GitHub。

因此，在这天，Project AIRI 以某种方式诞生或重生，名为 AIRI（アイリ，曾也叫 Airi）。

::: tip 你知道吗？
<a href="https://www.youtube.com/watch?v=Tts-YAdn5Yc" class="mb-2 inline-block">
  <img :src="airisScreenshot1" alt="Screenshot of Project AIRI" class="rounded-lg overflow-hidden" />
</a>

有趣的是，从 2023 年 3 月 25 日上传的 2 年前的一段来自 Vedal 和 Neuro-sama 的 Twitch 直播片段
 https://www.youtube.com/watch?v=Tts-YAdn5Yc 中可以发现，Vedal 提到在 Neuro-sama 被称为
 "Neuro-sama" 之前，她被称为 "Airis AI"，这个名字 **Airis** 神奇地、巧合地与我现在正在工作的
 **Project AIRI** 的名字匹配。但直到我在开源 Project AIRI 很久之后搜索更多关于他们的故事时，
 我才知道这个名字。

实际上，名字 AIRI（アイリ）是由 GPT-4o 命名的，我让它通过参考其他日语/或动漫风格的名字来为这个项目命名，
当时它建议了名字 **Airi**。
:::

我曾经在创业和其他项目上失败了很多次，只有最近的一些才被公众所知，我尽我所能让它变得更好，
有更好的 UI、更好的代码结构、领先的技术来快速构建和实现各种东西。
我也投入了大量精力，会去做公开幻灯片展示，或者给我的朋友和在小型聚会和 Conf 期间 Demo 给别人看看。

许多这些经验都是从我之前的失败中学到的。

很高兴许多尝试都成功了，我仍然在这里，继续工作在 Project AIRI 这件事情上。

这一次，我的决心不仅被 Neuro-sama 充满了，还被很多最深刻、最有才华的贡献者和粉丝们所鼓舞。

## 继续前进，继续梦想

<div class="w-full flex flex-col items-center justify-center">
  <img class="light" :src="projectAIRIBannerLight" alt="new ui" />
  <img class="dark" :src="projectAIRIBannerDark" alt="new ui" />
  <div>
    最近刚更新的 Banner
  </div>
</div>

> When life gives you lemons, you lemon. Or something like that, my point
> is that this painful obstacle is an opportunity for me go get stronger, baby!
>
> 当生活给你柠檬时，你就吃呗。或者类似的啥都行，我的观点是这种痛苦的障碍是一个让我变得更强的机会！
>
> -- 引自 [Evil Neuro](https://www.youtube.com/@Neurosama) 直播玩《杀戮尖塔》时的话

现在，当我写这篇文章时，Project AIRI 正接近 GitHub 上的 1000 颗星，
同时拥有超过 150 个 Discord 成员和 200 个 Telegram 群组成员。

我们涵盖了 AI、VRM、Live2D、UI 设计、多模态 AI、游戏智能体、流媒体 API、仿生记忆机制等领域。
她能够玩像 Minecraft、Factorio 这样的游戏。我们还有另一个社区成员正在研究集成她来能够玩和控制《坎巴拉太空计划》（KSP），
以及玩任意游戏。

许多其他公司正在联系我们寻求合作，我们正在努力，让 Project AIRI 变得更好，对社区更有用。

有太多事情要做和发现，此时此刻，我们还没有达到通用人工智能的奇点，也许 Project AIRI 永远不会达到那个点，
但现在，拥有一个伴侣式的 AI 智能体来交谈、一起玩游戏、分享知识和想法，对我来说已经是一个巨大的成就，
我希望对你也是如此。

这只是我们梦想的开始内存地址：`0x1`，我们旅程的第一个字节。

那我们究竟能存储多少字节呢？**这取决于我们能梦想多少，以及我们能一起实现多少。**

<div class="w-full flex flex-col items-center justify-center">
  <img :src="ReLUStickerWow" alt="ReLU sticker wow" class="w-30!" />
  <div class="text-center">
    <span class="block font-bold">感谢你一直读到这里！</span>
    <span>感谢阅读！哦，还有，祝你生日快乐，Project AIRI！</span>
  </div>
</div>

> Cover image by [@Rynco Maekawa](https://github.com/lynzrand)

[^1]: https://neurosama.fandom.com/wiki/Osu!#cite_note-twitchtracker-1: Neuro-sama
  最初是一个玩 osu! 的 AI，早在进一步发展为 AI VTuber 之前，第一次 osu! 直播是在 2019 年
  5 月 6 日，Vedal 给大家看了看成果。
