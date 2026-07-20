---
title: 服务商配置指南
description: 为 Project AIRI 配置聊天、视觉、语音合成和语音识别服务
---

要让 AIRI 与你对话，至少需要配置一个聊天服务商和一个聊天模型。语音合成（TTS）让 AIRI 能够说话；语音识别（ASR/STT）让它能够听懂麦克风输入。这两项是可选的，但要获得完整的语音交互体验，建议一并配置。

## 先完成最小可用配置

1. 打开 AIRI 的 **设置 → 服务商**。
2. 在 **聊天** 分类中选择服务商，填写凭据并完成验证。
3. 打开 **设置 → 意识**，选择刚才配置的服务商和模型。
4. 发送一条消息，确认 AIRI 可以回复。

完成聊天配置后，再按需要配置语音：

* **[通用说明](./common.md)**：了解配置流程、字段含义、验证结果与常见问题。
* **[配置聊天模型](./llm.md)**：配置 LLM，并在“意识”中选择模型。
* **[配置语音输入与输出](./audio.md)**：配置 TTS 和 ASR/STT，并在“发声”和“听觉”中启用它们。
* **[配置视觉理解](./vision.md)**：让 AIRI 使用已配置聊天服务商中支持图像输入的模型。
* **[配置艺术创作](./providers/artistry/index.md)**：选择本地 ComfyUI 或云端图像生成服务商。
* **[支持的服务商目录](./providers/catalog.md)**：查看当前版本已注册的聊天、视觉、语音合成和语音识别服务商。

> [!TIP]
> 如果你只想先验证 AIRI 能否工作，请先配置聊天服务商。TTS 和 ASR 可以在聊天正常后再添加，这样更容易定位问题。

## 设置

服务商配置完成后，你还可以在设置中更改 AIRI 的主题颜色，或切换 Live2D（2D）与 VRM（3D）模型。

<video autoplay loop muted>
 <source src="/assets/tutorial-basic-open-settings.mp4" type="video/mp4">
</video>

配置服务商时，优先使用服务商文档提供的默认地址和模型名称。不要猜测 Base URL、模型 ID 或区域参数；它们因服务商而异。

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
