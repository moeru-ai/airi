---
title: MiniMax Speech（TTS）
description: 在 AIRI 中配置 MiniMax 语音合成
---

MiniMax Speech 可在 AIRI 中提供语音合成模型和预设声音。

::: info 为什么选择 MiniMax Speech？
如果你已经使用 MiniMax，并希望直接使用其中文或英文预设声音，可以选择它。
:::

## 第一步：获取 API Key

1. 打开并登录 [MiniMax 开放平台](https://platform.minimaxi.com/)，开通 API 使用权限。
2. 在 API Key 管理页面创建密钥。
3. 复制密钥并妥善保存。

::: warning API Key 安全
不要将 API Key 提交到仓库、截图或发送给他人。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 语音合成 → MiniMax Speech**，粘贴 API Key。
2. 保留默认服务地址 `https://api.minimax.io`，除非服务商明确提供了其他地址。

### 3. 配置校验

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型和音色**：测试成功后，选择如 `speech-2.8-hd` 或 `speech-2.8-turbo` 的可用模型与声音，再到 **设置 → 发声** 启用。
3. 输入短文本试听，确认可正常播放。

## 排查

Ping API 失败时，检查 API Key、账户额度和网络连接。模型或声音不可用时，以 MiniMax 账户当前开放的列表为准。
