---
title: Nano Banana（艺术创作）
description: 在 AIRI 中配置 Nano Banana 图像生成
---

Nano Banana 使用 Google AI Studio API Key 生成图片。完成配置后，可在 **设置 → 艺术** 选择该服务商。

::: info 为什么选择 Nano Banana？
如果你已有 Google AI Studio API Key，并希望直接使用 AIRI 内置的 Gemini 图像模型与分辨率选项，可以选择它。
:::

## 第一步：获取 API Key

1. 打开并登录 [Google AI Studio API Keys](https://aistudio.google.com/app/apikey)，创建 API Key。
2. 确认账户和所在地区可使用所选图像模型。
3. 复制密钥并妥善保存。

::: warning API Key 安全
不要将 API Key 提交到仓库、放入截图或发送给他人。密钥泄露后，请立即在 Google AI Studio 中撤销并创建新密钥。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 艺术 → Nano Banana**，粘贴 API Key。
2. 选择默认模型：`gemini-3.1-flash-image-preview`、`gemini-3-pro-image-preview` 或 `gemini-2.5-flash-image`。
3. 选择默认分辨率：1K、2K 或 4K。

## 第三步：验证配置

1. 打开 **设置 → 艺术**，选择 **Nano Banana**。
2. 使用一条不含敏感信息的提示词生成图片。
3. 成功返回图片即表示 API Key、模型和分辨率配置可用。

## 排查

认证失败时，检查 API Key 是否有效。模型不可用或请求被拒绝时，检查 Google AI Studio 账户、地区可用性与当前模型状态。生成失败时，先切换到 1K 分辨率或另一可用模型后重试。
