---
title: MiniMax Global
description: 在 AIRI 中配置海外版 MiniMax 作为大模型服务商
is_openai_compatible: true
---

本页适用于在 MiniMax 海外平台创建的 API Key。完成配置后，AIRI 可以在“意识”中使用 MiniMax Global 提供的聊天模型。

::: info 为什么选择 MiniMax Global？
如果你在 MiniMax 海外平台创建 API Key，或使用海外 Token Plan，应选择 MiniMax Global。中国大陆平台创建的 Key 请使用 [MiniMax（中国大陆）](./minimax.md)；两套平台的 API Key、计费和 Base URL 不能混用。
:::

## 第一步：获取 API Key

1. 打开并登录 [MiniMax Global 平台](https://platform.minimax.io/)。
2. 在 **API Keys** 中创建按量付费 API Key；若使用 Token Plan，请在对应订阅页面获取其专用 Key。
3. 复制密钥并妥善保存。

::: warning API Key 安全
不要将 API Key 提交到仓库、放入截图或发送给他人。密钥泄露后，请立即在 MiniMax Global 平台撤销它并创建新密钥。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → MiniMax Global**。
2. 将 API Key 粘贴到基础设置。
3. 保留默认 Base URL：`https://api.minimax.io/v1/`。

### 3. 配置校验

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型**：测试成功后，点击此处选择你想使用的具体模型。
3. 在 **设置 → 意识** 中选择 MiniMax Global 与该模型，并发送一条短消息确认 AIRI 能够回复。

## 排查

Ping API 失败时，确认 API Key 来自海外平台、Base URL 为 `https://api.minimax.io/v1/`，并检查账户额度和网络连接。出现 401 时，常见原因是中国大陆与海外平台的 Key 或地址混用。模型列表无法加载时，可在“意识”页面手动输入 MiniMax Global 提供的精确模型 ID。
