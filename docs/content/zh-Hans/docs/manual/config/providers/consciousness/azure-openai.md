---
title: Azure OpenAI
description: 在 AIRI 中配置 Azure OpenAI 聊天模型
---

Azure OpenAI 通过你的 Azure 资源端点和部署访问模型。

::: info 为什么选择 Azure OpenAI？
如果你的团队已在 Azure OpenAI 中部署模型并管理权限，这是直接的接入方式。
:::

## 第一步：准备 Azure OpenAI 资源

1. 打开并登录 [Azure Portal](https://portal.azure.com/)，创建或打开 Azure OpenAI 资源并取得端点和 API Key。

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → Azure OpenAI**，填写 **API Key** 和 Azure OpenAI 端点。
2. 建议填写控制台提供的完整 Chat Completions 地址；如果地址中包含部署名与 `api-version`，AIRI 会据此识别配置。
3. **Ping API**：点击此按钮测试网络、端点和 API Key 是否正确。
4. **选择模型**：测试成功后，选择对应部署，再到 **设置 → 意识** 启用。

::: warning API Key 安全
不要将 Azure API Key 提交到仓库、截图或发送给他人。
:::
