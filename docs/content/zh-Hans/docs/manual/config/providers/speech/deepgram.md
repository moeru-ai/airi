---
title: Deepgram（TTS）
description: 在 AIRI 中配置 Deepgram 语音合成
---

Deepgram 在 AIRI 中提供 Aura 系列语音合成模型。

::: info 为什么选择 Deepgram？
如果你已经使用 Deepgram，或希望在 Aura 系列语音中挑选音色，可以使用此集成。
:::

## 第一步：获取 API Key

1. 打开并登录 [Deepgram Console](https://console.deepgram.com/)，在项目的 API Key 页面创建密钥。
2. 确认该项目具备语音合成使用权限。
3. 复制密钥并妥善保存。

::: warning API Key 安全
不要将 API Key 提交到仓库、截图或发送给他人。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 语音合成 → Deepgram**，将 API Key 粘贴到基础设置。
2. 保留界面默认 Base URL；仅在自行部署兼容网关时修改。

## 第三步：验证配置

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型和音色**：测试成功后，选择 Aura 模型与声音，再到 **设置 → 发声** 启用。
3. 输入短文本试听，确认可正常播放。

## 排查

Ping API 失败时，检查项目 API Key、账户权限和网络连接。音色列表为空时，重新测试凭据后再选择模型。
