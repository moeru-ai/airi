---
title: CometAPI
description: 在 AIRI 中配置 CometAPI 聊天模型
---

CometAPI 在 AIRI 中提供聊天模型，也有独立的 TTS 与 STT 服务商页面。

::: info 为什么选择 CometAPI？
如果你希望在同一 CometAPI 账户下配置聊天、语音合成和语音识别，可以选择它。
:::

## 第一步：获取 API Key

1. 打开并登录 [CometAPI 控制台](https://www.cometapi.com/console/token)，创建 API Key。

::: warning API Key 安全
不要将 API Key 提交到仓库、截图或发送给他人。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → CometAPI**，填写 **API Key**。默认 Base URL 为 `https://api.cometapi.com/v1/`。

## 第三步：验证配置

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型**：测试成功后，选择模型，再到 **设置 → 意识** 启用。

## 排查

Ping API 失败时，检查 API Key、账户额度与网络连接。模型列表无法加载时，确认 Base URL 保持为默认值，或在“意识”页面输入 CometAPI 提供的精确模型 ID。
