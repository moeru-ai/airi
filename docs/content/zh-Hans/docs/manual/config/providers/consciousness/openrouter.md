---
title: OpenRouter
description: 在 AIRI 中配置 OpenRouter 作为大模型服务商
is_openai_compatible: true
---

OpenRouter 是一个聚合式 API 服务商。完成本页配置后，AIRI 可以在“意识”中使用 OpenRouter 提供的聊天模型。

::: info 为什么选择 OpenRouter？
如果你希望用一个 API Key 在 AIRI 中尝试多个模型，OpenRouter 是一个方便的选择。它将多个模型服务集中到同一套接口和账单中，因此切换模型时通常不必分别配置多个服务商。在中国大陆使用 AIRI 时，可以优先尝试 302.AI；实际可用性仍取决于你的网络环境、支付方式和服务商政策。
:::

## 第一步：获取 API 密钥

1. 打开 [OpenRouter API Keys](https://openrouter.ai/keys)，创建新的 API Key。
2. 为密钥设置适当的名称、有效期和额度限制。
3. 复制密钥并妥善保存。

::: warning API Key 安全
不要将 API Key 提交到仓库、放入截图，或发送给他人。密钥泄露后，请立即在 OpenRouter 控制台撤销它并创建新密钥。
:::


## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → OpenRouter**。
2. 将 API Key 粘贴到基础设置。
3. 保留默认 Base URL：`https://openrouter.ai/api/v1`。

### 3. 配置校验

1. **Ping API**: 点击此按钮测试网络是否连通以及 API 密钥是否填写正确。
2. **选择模型**: 测试成功后，点击此处选择你想要使用的具体模型（如 **google/gemini-pro-1.5**）。

## 排查

如果 Ping API 失败，请检查 API Key、账户额度和网络连接。模型列表无法加载时，可在“意识”页面手动输入 OpenRouter 提供的精确模型 ID。
