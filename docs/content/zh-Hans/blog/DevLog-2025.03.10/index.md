---
title: 开发日志 @ 2025.03.10
category: DevLog
date: 2025-03-10
---

## 似曾相识

在上周五（3月7日），我一直在尝试设计和构思 AIRI 舞台 UI 和设置 UI 的新风格，这个想法终于在开发直播结束时灵光一现。

## 白天

从3月7日开始，我们开始实现新的设置 UI。在这段时间里我们取得了很大的进展。

包括 [@LemonNekoGH](https://github.com/LemonNekoGH)、[@sumimakito](https://github.com/sumimakito)、[@kwaa](https://github.com/kwaa)、[@luoling8192](https://github.com/luoling8192) 和 [@junkwarrior87](https://github.com/junkwarrior87) 都在为这个项目提供帮助。

是我首先完成了设置设计的基础版本，感觉是这样的：

![](./assets/new-ui-v1.avif)

![](./assets/new-ui-v1-dark.avif)

后来 [@sumimakito](https://github.com/sumimakito) 上线帮助我为按钮实现了这种点状效果：

![](./assets/new-ui-v2.avif)

> 现在我们能从菜单中感受到更多的节奏感，对吧？！

在开发过程中，我们发现目前位于 `packages/` 目录下的一些包实际上是独立的包，甚至不在 Project AIRI 的工作流程中。

这意味着我们现在可以将这些包移动到其他地方，从而简化主仓库 [airi](https://github.com/moeru-ai/airi) 的安装体积和构建流程。

> 我们要去哪里？

好问题！我们已经在 GitHub 上注册了 [`@proj-airi`](https://github.com/proj-airi) 作为一个组织，由于许多包和静态应用程序对 Moeru AI 也没有用处，也许我们可以将这些包移动到 [`@proj-airi`](https://github.com/proj-airi)。

所以，我们将一些包和应用程序移动到了 [`@proj-airi`](https://github.com/proj-airi) 组织！你可以查看它们：

- https://github.com/proj-airi/webai-examples：用于制作 WebGPU 和相关内容的演示。
- https://github.com/proj-airi/lobe-icons：[Lobe Icons](https://github.com/lobehub/lobe-icons) 的移植版本，用于 Iconify JSON 和 UnoCSS 使用。

这两个仓库将保持开源并按照惯例使用 MIT 许可证，不用担心。

后来在3月8日，[@junkwarrior87](https://github.com/junkwarrior87) 上线并帮助我们用纯 CSS 制作了舞台上的波浪动画！

> 这简直太疯狂了，我从来没想到这居然能实现！

你可以通过提交记录向他/她学习：

- https://github.com/moeru-ai/airi/pull/54
- https://github.com/moeru-ai/airi/pull/55
- https://github.com/moeru-ai/airi/pull/65

非常感谢 [@sumimakito](https://github.com/sumimakito) 和 [@junkwarrior87](https://github.com/junkwarrior87) 帮助修复和改进舞台上的波浪动画，真的很感激你们。

在3月8日结束时，[@LemonNekoGH](https://github.com/LemonNekoGH) 和 [@junkwarrior87](https://github.com/junkwarrior87) 居然实现了整个舞台的颜色自定义功能！（我从来没想过这能在短短几个小时内完成...）

<ThemedVideo controls muted src="./assets/customizable-theme-colors.mp4" />

- https://github.com/moeru-ai/airi/pull/53
- https://github.com/moeru-ai/airi/pull/60
- https://github.com/moeru-ai/airi/pull/61
- https://github.com/moeru-ai/airi/pull/63

他们甚至让 logo 也能跟随自定义颜色变化 🤯。

> 在这三天里我们做了更多的改进，也许这些出色的贡献者愿意写一个专门的开发日志来与你分享一些想法，敬请期待！

这是我们得到的最终结果，试试看！

![](./assets/new-ui-v3.avif)

![](./assets/new-ui-v3-dark.avif)

一如既往，欢迎来为我们做贡献！我们绝对对每个人都开放和友好，即使是那些不熟悉编程和编码的人！

哦，我差点忘了... [@junkwarrior87](https://github.com/junkwarrior87) 保留了让颜色色调在整个 RGB 光谱中闪耀的功能，这是之前由 [@LemonNekoGH](https://github.com/LemonNekoGH) 演示的，它被称为"我想要动态的！"（你可以把这想象成一个 **RGB ON** 功能 😂）：

- https://github.com/moeru-ai/airi/pull/64

## 开发直播

这些天我很忙 😭，所以没有进行任何开发直播。

今天的 DevLog 就到这里，感谢所有参加 DevStream 并一直陪伴到最后的大家。明天见。
