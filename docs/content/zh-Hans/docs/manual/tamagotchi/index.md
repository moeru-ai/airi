---
title: 桌面版快速开始
description: 如何开始使用 Project AIRI 桌面版
---

## 先开始聊天

安装并启动 AIRI 后，可以先跟随首次引导完成基础配置：

1. 如果 AIRI 要求选择语言，先选择你想使用的语言。
2. 选择 **配置您自己的 AI 服务来源**；如果你已经在使用 AIRI 账号，也可以选择登录。
3. 选择一个聊天服务来源，例如 OpenRouter、OpenAI 兼容 API、DeepSeek、Ollama、Qwen、Gemini 或 Claude。
4. 填入 API Key，或本地服务地址等必要信息。
5. 选择聊天模型，然后保存并继续。
6. 回到主角色窗口后，点击右下角控制岛里的 **展开** 按钮。
7. 点击 **打开聊天**，输入消息并发送。

::: tip 在本地使用 Ollama？
你需要设置系统环境变量 `OLLAMA_ORIGINS=*`，然后重启 Ollama，再从 AIRI 中选择它。
:::

<br />

<video controls autoplay loop muted>
 <source src="/assets/tutorial-basic-setup-providers.mp4" type="video/mp4">
</video>

## 你会看到什么

桌面版也叫 Stage Tamagotchi，通常由这些界面组成：

- **主角色窗口**：常驻桌面的 Live2D / VRM 舞台。
- **控制岛**：主角色窗口右下角的小按钮组。
- **聊天窗口**：从控制岛打开的对话窗口。
- **设置窗口**：配置服务来源、角色、模型、机体模块、数据、连接和系统选项。
- **系统托盘菜单**：调整大小、对齐位置、打开设置、字幕、小部件和退出。

如果主角色窗口被隐藏了，可以点击 AIRI 的托盘图标，或在托盘菜单里选择 **显示** 把它带回来。

## 控制岛

控制岛是日常操作桌面版时最方便的入口。

- 点击 **展开** 显示更多操作。
- 点击 **打开聊天** 打开聊天窗口。
- 点击 **打开设置** 配置服务来源、模型、机体模块、角色和系统设置。
- 点击 **切换角色** 更换当前角色卡。
- 需要时，可以点击 **刷新** 重新加载舞台。
- 点击亮色 / 暗色图标切换主题。
- 点击图钉图标切换窗口置顶。
- 点击眼睛图标切换 **悬停时隐藏** / **总是显示**。
- 点击麦克风按钮打开听力控制。
- 拖动移动按钮来移动主角色窗口。

## 悬停时隐藏

眼睛图标用于切换 AIRI 的显示方式：保持可点击，或在你工作时尽量减少遮挡和点击干扰。

- **总是显示** 会让角色保持可见、可点击。
- **悬停时隐藏** 会在光标靠近时淡出角色和界面，让点击更容易落到下面的应用上。

首次开启悬停时隐藏时，AIRI 会弹出一个简短说明。若开启后不方便点击 AIRI，把光标移到控制岛附近，再点一次眼睛图标即可切回。

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-180 translate-x--30 translate-y--2 lg:scale-150 lg:translate-x--40">
    <source src="/assets/tutorial-basic-fade-on-hover.mp4" type="video/mp4">
  </video>
</div>

## 移动和调整大小

要移动主角色窗口，拖动控制岛右下角的移动按钮。

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-225 translate-x--45 translate-y--5 lg:scale-200 lg:translate-x--80 lg:translate-y--5">
    <source src="/assets/tutorial-basic-move.mp4" type="video/mp4">
  </video>
</div>

在 Windows 上，你可以拖动窗口边缘或角落来调整大小。托盘菜单里也提供了几个常用尺寸：

1. 右键 AIRI 托盘图标。
2. 打开 **调整大小**。
3. 选择 **推荐**、**全高**、**半高** 或 **全屏**。

同一个托盘菜单里的 **对齐到** 可以把窗口放到屏幕中央或四角。

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-160 translate-x--20 lg:scale-150 lg:translate-x--40 lg:translate-y-10">
    <source src="/assets/tutorial-basic-resize.mp4" type="video/mp4">
  </video>
</div>

## 建议再看看这些设置

完成第一次聊天后，建议再看看这些页面：

- **服务来源**：添加或编辑 Chat、Speech、Transcription、Artistry 服务来源。
- **机体模块**：为意识、发声、听觉、视觉、记忆、Discord、Minecraft、Factorio、MCP 等模块选择服务。
- **角色模型**：切换 Live2D / VRM 模型，或导入自己的模型。
- **AIRI 角色卡**：切换当前角色，或创建一个新的角色卡。
- **系统**：设置语言、主题、数据分析偏好和桌面端专用选项。

部分模块仍处于实验阶段，可能需要本地源码配置或额外的外部服务。更完整的 Windows 使用说明可以参考[桌面版详细说明书](./setup-and-use/)。
