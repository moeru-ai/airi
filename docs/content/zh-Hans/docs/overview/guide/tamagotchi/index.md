---
title: 桌面版上手指南
description: 如何使用桌面版的 Project AIRI
---

## 我现在就想聊天！

没问题，跟着我来：

- 完成入门引导教程

1. 选择您想要的 LLM / AI 提供商（在演示视频中，我选择了 OpenRouter）
2. 输入 API 密钥以与 LLM / AI 进行交互（这将作为您角色的“大脑”或“灵魂”）
3. 选择您想要的聊天模型（在演示视频中，我选择了 `DeepSeek V3 0324`）
4. 从系统托盘中禁用 **悬停时淡化** 模式
5. 将鼠标悬停在模型界面上，点击聊天气泡图标，这将调出聊天窗口
6. 输入并开始聊天！

::: tip 在本地使用 Ollama？
您需要设置系统环境变量 `OLLAMA_ORIGINS=*`，
并在设置完成后重启 Ollama 应用程序。
:::

<video controls autoplay loop muted>
 <source src="./assets/tutorial-basic-setup-providers.mp4" type="video/mp4">
</video>

<br />

嗯，确实，这节奏太快了。我们打赌你还没搞明白 **悬停时淡化** 到底是什么，
以及如何自定义所有设置，对吧？

::: 提示 我们仍处于开发的早期阶段，许多功能尚未完全可用。
其中一些功能尚未真正就绪，但我们正努力让它们尽快实现：

- 转录功能
- 本地语音合成（例如 GPT-SoVITS、IndexTTS 等）
- 歌唱功能
- 从用户界面配置 Discord（但该功能已可用，需要一定的编码技能来设置）
- 从用户界面配置 Minecraft 智能体（但该功能已可用，需要一定的编码技能来设置）
:::

但首先。。。

::: tip 谢谢你！

感谢你下载并试用它！
:::

下载完成后，你可以从任何位置启动 AIRI。你将看到用户界面由两部分组成：

- 新手引导 / 设置向导
- 模型（可显示 Live2D 和 VRM 模型）

![](./assets/screenshot-ui.png)

我们还在系统托盘中提供了其他选项/命令，包括：

- 显示 / 隐藏
- 打开设置
- 自动定位窗口
- 等等。

让我们从逐一讲解基本概念和功能开始吧。

## 窗口控制

我们将介绍以下几个内容：

- 如何与模型窗口互动？
- 如何移动模型窗口？
- 如何调整其大小？

### 悬停时淡化

::: info 要点速览 ｜ 内容概要
要切换此功能（即可与模型进行交互），请使用快捷键<kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="I" inline-block>I</kbd> 。

你可以在以下位置自定义按键映射：[设置]-> [常规] -> [快捷键]
:::

你会发现，当鼠标悬停在模型上时，Live2D 模型会逐渐淡出或消失，
此时你无法通过光标与它进行交互。

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-180 translate-x--30 translate-y--2 lg:scale-150 lg:translate-x--40">
      <source src="./assets/tutorial-basic-fade-on-hover.mp4" type="video/mp4">
  </video>
</div>

这是因为默认情况下，**悬停时淡化** 功能是启用的：也就是说，
每当光标悬停在模型窗口的上方时，模型会淡出，并且你的点击会直接穿透该窗口。

这是一个非常强大的功能，在你让这位“伙伴”一直陪伴在身边的过程中，你会越来越发现它的用处。以下是我们想到的两个使用场景：

#### 浏览 CrunchyRoll

<video autoplay loop muted>
  <source src="./assets/tutorial-demo-browsing-crunchy-roll.mp4" type="video/mp4">
</video>

#### 浏览 Steam

<video autoplay loop muted>
  <source src="./assets/tutorial-demo-browsing-steam.mp4" type="video/mp4">
</video>

禁用这一功能其实很简单。

有两种方式可以禁用它：

- 系统托盘
- 快捷键

你可以通过以下步骤来切换该功能：

1. 右键单击系统托盘图标；
2. 点击 **窗口模式**
3. 点击 **悬停时淡化**

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-200 translate-x--35 translate-y--23 lg:scale-180 lg:translate-x--60 lg:translate-y--40">
     <source src="./assets/tutorial-basic-disable-fade-on-hover.mp4" type="video/mp4">
  </video>
</div>

### 移动窗口

::: info 要点速览 ｜ 内容概要
要切换此功能（即可与模型进行交互），请使用快捷键 <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="N" inline-block>N</kbd>。

你可以在 [设置] -> [常规] -> [快捷键] 中自定义按键映射。
:::

<br />

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-225 translate-x--45 translate-y--5 lg:scale-200 lg:translate-x--80 lg:translate-y--5">
    <source src="./assets/tutorial-basic-move.mp4" type="video/mp4">
  </video>
</div>

### 调整窗口大小

::: info 要点速览 ｜ 内容概要
要切换此功能（即可与模型进行交互），请使用快捷键 <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="A" inline-block>A</kbd>。

你可以在 [设置] -> [常规] -> [快捷键] 中自定义按键映射。
:::

<br />

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-160 translate-x--20 lg:scale-150 lg:translate-x--40 lg:translate-y-10">
    <source src="./assets/tutorial-basic-resize.mp4" type="video/mp4">
  </video>
</div>

## 聊天

目前系统托盘中没有直接打开聊天窗口的选项或命令，但我们未来可能会添加这一功能。
目前，要打开聊天窗口，你需要先关闭 **悬停时淡化** 模式。

::: info TL;DR | Cheatsheet
悬停时淡化（Fade on Hover）的快捷键是: <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="I" inline-block>I</kbd>.
:::

<br />

<video autoplay loop muted>
 <source src="./assets/tutorial-basic-open-chat.mp4" type="video/mp4">
</video>

## 设置

你可以在系统托盘中打开设置以进行更多自定义，例如：
更改 AIRI 的主题颜色，或切换到其他模型，比如 Live2D（2D 模型）或 VRM（3D 模型，如 Grok Companion）。

<video autoplay loop muted>
 <source src="./assets/tutorial-basic-open-settings.mp4" type="video/mp4">
</video>

设置中有很多选项，不妨多尝试一下，看看有哪些功能是你感兴趣的。

### 更换模型

你可以将默认模型替换为其他 Live2D（2D）模型或 VRM（3D 模型，与 Grok Companion 类似，前提是你拥有这些模型）。

模型设置位于 [设置] -> [模型] 中。

::: tip 从 VTuber Studio 导入模型？
我们用于渲染 Live2D 模型的库，在读取由 VTuber Studio 打包的 ZIP 文件时可能会遇到问题，这是因为 VTuber Studio 使用了一些 Live2D 引擎无法识别的文件。
因此，在导入之前，将 VTuber Studio 模型压缩为 ZIP 文件时，请确保排除以下文件：

-`items_pinned_to_model.json`
:::

<br />

::: 提示 内含 Bug
目前模型场景重载功能尚未按预期工作。
加载模型后，你需要重启 AIRI 才能生效。
:::
<br />

<video autoplay loop muted>
 <source src="./assets/tutorial-settings-change-model.mp4" type="video/mp4">
</video>