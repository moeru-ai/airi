---
title: OpenRouter（TTS）
description: 在 AIRI 中配置 OpenRouter 作为语音合成服务商
---

OpenRouter 是一个聚合式 API 服务商。完成配置后，在“发声”中选择 OpenRouter 提供的语音模型和音色。

::: info 为什么选择 OpenRouter 语音？
如果你希望在同一个 OpenRouter 账户中管理多个模型和语音能力，可以选择此服务商。在中国大陆使用 AIRI 时，可以优先尝试 302.AI；实际可用性仍取决于你的网络环境、支付方式和服务商政策。
:::

## 第一步：获取 API Key

1. 打开 [OpenRouter API Keys](https://openrouter.ai/keys)，创建新的 API Key。
2. 为密钥设置适当的名称、有效期和额度限制。
3. 复制密钥并妥善保存。

::: warning API Key 安全
不要将 API Key 提交到仓库、放入截图，或发送给他人。密钥泄露后，请立即在 OpenRouter 控制台撤销它并创建新密钥。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 语音合成 → OpenRouter**。
2. 将 API Key 粘贴到基础设置。
3. 保留默认 Base URL：`https://openrouter.ai/api/v1/`。

### 3. 配置校验

1. 在“发声”中选择已配置的服务商、模型和音色。
2. 输入一段测试文本并点击测试。
3. 能正常播放语音即表示配置成功；如果显示错误，请根据错误信息检查凭据和模型。

## 排查

没有声音时，确认所选模型提供语音输出，并检查账户额度与网络连接。
