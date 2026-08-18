---
title: NVIDIA NIM
description: 在 AIRI 中配置 NVIDIA NIM 作为大模型服务商
is_openai_compatible: true
---

NVIDIA NIM 提供兼容 OpenAI 格式的聊天 API。完成本页配置后，AIRI 可以在“意识”中使用 NVIDIA NIM 提供的模型。

::: info 为什么选择 NVIDIA NIM？
如果你已经在 NVIDIA NIM 平台使用模型服务，可以将同一套凭据接入 AIRI。
:::

## 第一步：获取 API 密钥

1. 打开 [NVIDIA NIM 控制台](https://build.nvidia.com/)。
2. 在 API 密钥页面创建新的 API Key。
3. 复制密钥并妥善保存。

::: warning API Key 安全
不要将 API Key 提交到仓库、放入截图，或发送给他人。密钥泄露后，请立即在 NVIDIA 控制台撤销它并创建新密钥。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → NVIDIA NIM**。
2. 将 API Key 粘贴到基础设置。
3. 保留默认 Base URL：`https://integrate.api.nvidia.com/v1`。

## 第三步：验证配置

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型**：测试成功后，点击此处选择你想要使用的具体模型。

## 排查

如果 Ping API 失败，请检查 API Key、账户额度和网络连接。模型列表无法加载时，可在“意识”页面手动输入 NVIDIA NIM 提供的精确模型 ID。
