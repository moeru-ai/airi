---
title: Cerebras
description: 在 AIRI 中配置 Cerebras 聊天模型
---

Cerebras 在 AIRI 中通过其兼容 API 提供聊天模型。

::: info 为什么选择 Cerebras？
如果你已使用 Cerebras API，并希望在 AIRI 中调用账户可用模型，可以选择它。
:::

## 第一步：获取 API Key

1. 打开并登录 [Cerebras Cloud](https://cloud.cerebras.ai/)，创建 API Key。

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → Cerebras**，填写 **API Key**。默认 Base URL 为 `https://api.cerebras.ai/v1/`。
2. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
3. **选择模型**：测试成功后，选择模型，再到 **设置 → 意识** 启用。

::: warning API Key 安全
不要将 API Key 提交到仓库、截图或发送给他人。
:::
