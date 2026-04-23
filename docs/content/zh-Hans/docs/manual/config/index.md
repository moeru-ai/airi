---
title: 配置指南
description: 如何使用桌面版的 Project AIRI
---

## API 与服务商配置 (核心对话功能)

仅仅有模型是不够的，你需要配置“大脑”（大语言模型 LLM）和“感官”（语音识别 ASR 与合成 TTS）才能开始对话。

我们支持多种提供商，你可以根据你的网络环境和预算进行选择：

* **[通用配置指南](./common.md)**：了解如何设置全局代理、断句逻辑以及文本处理。
* **[大语言模型 (LLM)](./llm.md)**：配置 OpenAI, OpenRouter, 302.ai 或 DeepSeek。
* **[语音识别与合成 (ASR/TTS)](./audio.md)**：配置阿里云、OpenAI 语音或其他本地服务。

> [!TIP]
> **新手推荐：** 如果你不想折腾复杂的云平台权限，建议优先尝试 **302.ai** 或 **OpenRouter**，它们通常只需一个 Key 即可跑通所有功能。

## 设置

你可以在系统托盘中打开设置以进行更多自定义，例如：
更改 AIRI 的主题颜色，或切换到其他模型，比如 Live2D（2D 模型）或 VRM（3D 模型，就像是 Grok Companion 那样）。

<video autoplay loop muted>
 <source src="/assets/tutorial-basic-open-settings.mp4" type="video/mp4">
</video>

设置中有很多选项，不妨多尝试一下，看看有哪些功能是你感兴趣的。

### 更换模型

你可以将默认模型替换为其他 Live2D（2D）模型或 VRM（3D 模型，与 Grok Companion 类似，前提是你拥有这些模型）。

模型设置位于 [设置] -> [模型] 中。

::: tip 正在从 VTuber Studio 导入模型？
我们用于渲染 Live2D 模型的库，在读取由 VTuber Studio 打包的 ZIP 文件时可能会遇到问题，这是因为 VTuber Studio 使用了一些 Live2D 引擎无法识别的文件。
因此，在导入之前，将 VTuber Studio 模型压缩为 ZIP 文件时，请确保排除以下文件：

-`items_pinned_to_model.json`
:::

<br />

::: tip 现在还有一些 Bug
目前模型场景重载功能尚未按预期工作。
加载模型后，你需要重启 AIRI 才能生效。
:::
<br />

<video autoplay loop muted>
 <source src="/assets/tutorial-settings-change-model.mp4" type="video/mp4">
</video>


