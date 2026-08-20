---
title: OpenAI 与兼容 API
description: 在 AIRI 中配置 OpenAI 或 OpenAI 兼容的聊天服务
is_openai_compatible: true
---

使用 OpenAI 官方地址时选择 **OpenAI**；使用第三方兼容地址时选择 **OpenAI 兼容 API**。完成配置后，AIRI 可以在“意识”中使用对应服务商的聊天模型。

::: info 为什么选择 OpenAI 或兼容 API？
如果你已拥有 OpenAI API Key，或服务商明确提供 OpenAI 兼容的聊天接口，可以使用此配置方式。仅 API 地址以 `/v1` 结尾或密钥以 `sk-` 开头，不能保证服务兼容。
:::

## 第一步：获取 API 密钥

1. 使用 OpenAI 官方服务时，打开 [OpenAI API Keys](https://platform.openai.com/api-keys) 创建 API Key；使用兼容服务时，打开对应服务商的管理控制台。
2. 在 API 密钥或开发者设置页面创建 API Key。
3. 复制密钥并妥善保存。

::: warning API Key 安全
不要将 API Key 提交到仓库、放入截图，或发送给他人。密钥泄露后，请立即在服务商控制台撤销它并创建新密钥。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → OpenAI** 或 **OpenAI 兼容 API**。
2. 将 API Key 粘贴到基础设置。
3. 使用 OpenAI 官方服务时，保留默认 Base URL：`https://api.openai.com/v1`；使用兼容服务时，填写服务商文档提供的 API 根地址，不要附加 `/chat/completions` 路径。

## 第三步：验证配置

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型**：测试成功后，点击此处选择你想要使用的具体模型。

## 排查

如果 Ping API 失败，请检查 API Key、账户额度和网络连接。使用兼容服务时，请确认其明确支持 OpenAI Chat Completions API，并检查 Base URL 是否为服务商文档指定的根地址。
