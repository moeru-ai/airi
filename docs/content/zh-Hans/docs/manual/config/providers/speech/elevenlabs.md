---
title: ElevenLabs（TTS）
description: 在 AIRI 中配置 ElevenLabs 语音合成
---

ElevenLabs 可将 AIRI 的回复合成为语音。

::: info 为什么选择 ElevenLabs？
如果你想使用 ElevenLabs 账户中的音色，并在 AIRI 中直接选择可用声音，可以选择此服务商。
:::

## 第一步：获取 API Key

1. 打开并登录 [ElevenLabs API Key 设置](https://elevenlabs.io/app/settings/api-keys)，创建密钥。
2. 为密钥设置便于识别的名称和适当的使用限制。
3. 复制密钥并妥善保存。

::: warning API Key 安全
不要将 API Key 提交到仓库、截图或发送给他人。若怀疑泄露，请立即在 ElevenLabs 控制台撤销并重新创建。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 语音合成 → ElevenLabs**。
2. 将 API Key 粘贴到基础设置。
3. 保留界面默认 Base URL；只有使用自己的兼容网关时才更改。

### 3. 配置校验

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型和音色**：测试成功后，在 **设置 → 发声** 选择模型与想使用的声音。
3. 输入一段短文本并试听；能正常播放语音即表示配置成功。

## 排查

Ping API 失败时，检查 API Key、账户额度和网络连接。能列出模型但没有声音时，确认“发声”中已选择有效的模型与音色。
