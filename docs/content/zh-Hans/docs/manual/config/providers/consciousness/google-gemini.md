---
title: Google Gemini
description: 在 AIRI 中配置 Google Gemini 聊天模型
---

Google Gemini 服务商使用 Google Generative Language API 的 OpenAI 兼容端点。完成配置后，在“意识”页面选择 Gemini 模型即可。

::: info 为什么选择 Google Gemini？
如果你已有 Gemini API Key，或希望在 AIRI 中使用 Gemini 模型，可以选择该服务商。
:::

## 第一步：创建 API Key

1. 打开并登录 [Google AI Studio API Keys](https://aistudio.google.com/app/apikey)，创建 Gemini API Key。
2. 确认密钥所属项目已启用 Gemini API，且可使用目标模型。
3. 复制 API Key。

::: warning API Key 安全
密钥泄露后，请立即在 Google AI 的开发者控制台撤销并重新创建；不要把密钥放进代码、截图或公开的配置文件。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → Google Gemini**。
2. 填写 API Key。
3. 保留默认 Base URL：`https://generativelanguage.googleapis.com/v1beta/openai/`。

## 第三步：验证配置

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型**：测试成功后，点击此处选择你想要使用的具体模型。

## 排查

Ping API 会检查网络、模型列表和聊天请求。出现权限或模型不可用错误时，请先检查 API Key 对应项目的 API 启用状态与地区可用性。不要把 Google AI Studio 中展示的模型名称改写为其他格式；在 AIRI 中优先从模型列表选择。
