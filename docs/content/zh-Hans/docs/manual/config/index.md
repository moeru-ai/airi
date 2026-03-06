---
title: 配置指南
description: 如何使用桌面版的 Project AIRI
---

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
