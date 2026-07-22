---
title: Google Gemini（TTS）
description: 在 AIRI 中配置 Google Gemini 音频语音合成
---

Google Gemini 音频语音合成会使用 Gemini 凭据和支持音频输出的模型。

::: info 为什么选择 Google Gemini？
如果你已经在 AIRI 中配置 Google Gemini，并希望在同一服务商下使用音频输出能力，可以选择此项。
:::

## 第一步：获取 API Key

1. 打开并登录 [Google AI Studio](https://aistudio.google.com/app/apikey)，创建 API Key。
2. 确认账户可使用支持音频输出的 Gemini 模型。
3. 复制密钥并妥善保存。

::: warning API Key 安全
不要将 Gemini API Key 提交到仓库、截图或发送给他人。
:::

## 第二步：在 AIRI 中配置

1. 在 **设置 → 服务商 → 语音合成 → Google Gemini** 中填写 Gemini API Key。
2. 保留界面默认 Base URL，除非你使用企业网关或兼容代理。

## 第三步：验证配置

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型和音色**：测试成功后，选择界面列出的支持语音输出的模型，再到 **设置 → 发声** 启用。
3. 输入短文本试听，确认可正常播放。

## 排查

验证失败时，检查 API Key、账户地区可用性和网络连接。请求成功但无声音时，确认所选模型确实支持音频输出。
