---
title: Azure AI Foundry
description: 在 AIRI 中配置 Azure AI Foundry 聊天模型
---

Azure AI Foundry 需要资源名称、模型部署信息和 API Key。

::: info 为什么选择 Azure AI Foundry？
如果你的模型部署和访问控制已在 Azure AI Foundry 中完成，可用此服务商直接连接部署。
:::

## 第一步：准备 Azure AI Foundry 资源

1. 打开并登录 [Azure AI Foundry](https://ai.azure.com/)，创建或打开目标项目并取得 API Key、资源名称和模型部署信息。

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → Azure AI Foundry**，填写 **API Key**、资源名称和模型 ID。
2. 如控制台要求特定 API 版本，请在界面中填写；不要将普通模型名误作部署名。
3. **Ping API**：点击此按钮测试网络、资源名称和 API Key 是否正确。
4. **选择模型**：测试成功后，选择可用部署，再到 **设置 → 意识** 启用。

::: warning API Key 安全
不要将 Azure API Key 提交到仓库、截图或发送给他人。
:::
