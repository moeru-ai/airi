---
title: ModelScope
description: 在 AIRI 中配置 ModelScope 聊天模型
---

ModelScope 在 AIRI 中通过其推理 API 提供聊天模型。

::: info 为什么选择 ModelScope？
如果你已在 ModelScope 中管理模型访问，使用此卡片可以直接填写对应 API Key。
:::

## 第一步：获取 API Key

1. 打开并登录 [ModelScope](https://modelscope.cn/)，在账户控制台创建 API Key。

::: warning API Key 安全
不要将 API Key 提交到仓库、截图或发送给他人。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → ModelScope**，填写 **API Key**。默认 Base URL 为 `https://api-inference.modelscope.cn/v1/`。

## 第三步：验证配置

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型**：测试成功后，选择模型，再到 **设置 → 意识** 启用。

## 排查

Ping API 失败时，检查 API Key、账户状态与网络连接。模型列表无法加载时，确认 Base URL 保持为默认值，或在“意识”页面输入 ModelScope 提供的精确模型 ID。
